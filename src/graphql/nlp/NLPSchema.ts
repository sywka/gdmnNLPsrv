import {
    GraphQLBoolean,
    GraphQLEnumType,
    GraphQLFloat,
    GraphQLInputObjectType,
    GraphQLInt,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLScalarType,
    GraphQLSchema,
    GraphQLString
} from "graphql";
import GraphQLDate from "graphql-date";
import {GraphQLFieldConfigMap, GraphQLResolveInfo, GraphQLType} from "graphql/type/definition";
import {connectionArgs, connectionDefinitions, GraphQLConnectionDefinitions} from "graphql-relay";

type ID = number | string;

export interface Index {
    readonly key: string;
}

export interface BaseIndexing {
    readonly id: ID;
    readonly name: string;
    indices?: Index[];
}

export interface Ref extends BaseIndexing {
}

export interface Field extends BaseIndexing {
    readonly primary: boolean;
    readonly type: NLPSchemaTypes;
    readonly nonNull: boolean;
    readonly tableNameRef: string;
    readonly fieldNameRef: string;
    refs?: Ref[];
}

export interface Table extends BaseIndexing {
    readonly fields: Field[];
}

export type Value = string | number | boolean | Date

export interface Adapter<DB, Context> {
    connectToDB(): Promise<DB>;

    disconnectFromDB(context: NLPContext<DB>): Promise<void>;

    getTables(context: NLPContext<DB>): Promise<Table[]>;

    resolve(source: any, args: any, context: Context, info: GraphQLResolveInfo): any;

    createSQLCondition(type: FilterTypes, field: string, value: Value): string;

    quote(str: string): string;
}

export interface Options<Database, Context> {
    adapter: Adapter<Database, Context>;
}

export interface NLPContext<DB> {
    database: DB;
    tables: Table[];
    types: GraphQLObjectType[];
    inputTypes: GraphQLInputObjectType[];
    connections: GraphQLConnectionDefinitions[];
}

export class NLPSchema<Database, Context> {

    protected schema: GraphQLSchema;
    protected adapter: Adapter<Database, Context>;

    constructor(options: Options<Database, Context>) {
        this.adapter = options.adapter;

        this.getSchema().catch(console.log); //tmp
    }

    private static _convertToGraphQLType(type: NLPSchemaTypes): GraphQLScalarType {
        switch (type) {
            case NLPSchemaTypes.INT:
                return GraphQLInt;
            case NLPSchemaTypes.FLOAT:
                return GraphQLFloat;
            case NLPSchemaTypes.DATE:
                return GraphQLDate;
            case NLPSchemaTypes.BOOLEAN:
                return GraphQLBoolean;
            case NLPSchemaTypes.STRING:
            default:
                return GraphQLString;
        }
    }

    private static _escapeName(bases: BaseIndexing[], name: string, prefix?: string): string {
        let replaceValue = "__";
        while (true) {
            let nameWithPrefix = prefix ? `${prefix}$${name}` : name;
            const escapedName = nameWithPrefix.replace(/\$/g, replaceValue);
            if (escapedName === name) return escapedName;
            if (!bases.find((base) => base.name === escapedName)) {
                return escapedName;
            }
            replaceValue += "_";
        }
    }

    private static _findPrimaryFieldName(table: Table): string {
        const field = table.fields.find((field) => field.primary);
        if (field) return field.name;
        return "";
    }

    private static _findOriginalFieldName(table: Table, fieldName): string {
        return table.fields.find((field) => NLPSchema._escapeName(table.fields, field.name) === fieldName).name;
    }

    private static _createDescription(base: BaseIndexing): string {
        const description = base.name ? base.name : "";
        if (!base.indices) return description;

        return base.indices.reduce((strOfIndices, index) => {
            if (strOfIndices) strOfIndices += ",";
            strOfIndices += index.key;
            return strOfIndices;
        }, description);
    }

    private static _createObjectOrderBy(order: any[]): { [fieldName: string]: string } {
        if (!order) return null;
        return order.reduce((object, order) => {
            const tmp = Object.keys(order).reduce((object, key) => {
                object[order[key]] = key;
                return object;
            }, {});
            return {...object, ...tmp};
        }, {});
    }

    public async recreateSchema(): Promise<GraphQLSchema> {
        this.schema = null;
        return await this.getSchema();
    }

    public async getSchema(): Promise<GraphQLSchema> {
        if (this.schema) return this.schema;

        const context: NLPContext<Database> = {database: null, tables: [], types: [], inputTypes: [], connections: []};
        try {
            context.database = await this.adapter.connectToDB();
            context.tables = await this.adapter.getTables(context);
            return this.schema = this._createSchema(context);
        } finally {
            try {
                if (context.database) {
                    await this.adapter.disconnectFromDB(context);
                }
            } catch (error) {
                console.log(error);
            }
        }
    }

    private _createSQLWhere(table: Table, tableAlias: string, where: any): string {
        if (!where) return "";

        let groupsConditions = Object.keys(where).reduce((groupsConditions, filterName) => {
            switch (filterName) {
                case "not":
                case "or":
                case "and":
                case "isNull":
                    return groupsConditions;
            }

            const filter: any = where[filterName];
            let conditions = Object.keys(filter).reduce((conditions, fieldName) => {
                const value: any = filter[fieldName];
                const condition = this.adapter.createSQLCondition(
                    filterName as FilterTypes,
                    `${tableAlias}.${this.adapter.quote(NLPSchema._findOriginalFieldName(table, fieldName))}`,
                    value
                );
                if (condition) conditions.push(condition);
                return conditions;
            }, []);
            if (conditions.length) groupsConditions.push(`(${conditions.join(" AND ")})`);
            return groupsConditions;
        }, []);

        if (where.isNull) {
            groupsConditions.push(`${tableAlias}.${this.adapter.quote(where.isNull)} IS NULL`);
        }
        if (where.not) {
            const not = where.not.reduce((conditions, item) => {
                conditions.push(this._createSQLWhere(table, tableAlias, item));
                return conditions;
            }, []);
            if (not.length) groupsConditions.push(`NOT (${not.join(" AND ")})`);
        }
        if (where.or) {
            const or = where.or.reduce((conditions, item) => {
                conditions.push(this._createSQLWhere(table, tableAlias, item));
                return conditions;
            }, []);
            if (or.length) groupsConditions.push(`(${or.join(" OR ")})`);
        }
        if (where.and) {
            const and = where.and.reduce((conditions, item) => {
                conditions.push(this._createSQLWhere(table, tableAlias, item));
                return conditions;
            }, []);
            if (and.length) groupsConditions.push(`(${and.join(" AND ")})`);
        }
        return groupsConditions.join(" AND ");
    }

    private _createSchema(context: NLPContext<Database>): GraphQLSchema {
        return new GraphQLSchema({
            query: new GraphQLObjectType({
                name: "Tables",
                fields: () => context.tables.reduce((fields, table) => {
                    fields[NLPSchema._escapeName(context.tables, table.name)] = {
                        type: this._createConnectionType(context, this._createType(context, table)),
                        description: NLPSchema._createDescription(table),
                        args: {
                            ...connectionArgs,
                            where: {type: this._createFilterInputType(context, table)},
                            order: {type: new GraphQLList(this._createSortingInputType(context, table))}
                        },
                        where: (tableAlias, args, context, sqlASTNode) => this._createSQLWhere(table, tableAlias, args.where),
                        orderBy: (args) => NLPSchema._createObjectOrderBy(args.order),
                        resolve: this.adapter.resolve
                    };
                    return fields;
                }, {})
            })
        });
    }

    private _createSortingInputType(context: NLPContext<Database>, table: Table) {
        const duplicate: GraphQLInputObjectType = context.inputTypes.find(type => (
            type.name === `SORTING_${NLPSchema._escapeName(context.tables, table.name)}`
        ));
        if (duplicate) return duplicate;

        const sortingFieldsEnumType = new GraphQLEnumType({
            name: `SORTING_FIELDS_${NLPSchema._escapeName(context.tables, table.name)}`,
            values: table.fields.reduce((values, field) => {
                values[NLPSchema._escapeName(table.fields, field.name)] = {
                    value: field.name,
                    description: NLPSchema._createDescription(field)
                };
                return values;
            }, {})
        });

        const inputType = new GraphQLInputObjectType({
            name: `SORTING_${NLPSchema._escapeName(context.tables, table.name)}`,
            fields: () => ({
                asc: {type: sortingFieldsEnumType},
                desc: {type: sortingFieldsEnumType}
            })
        });
        context.inputTypes.push(inputType);
        return inputType;
    }

    private _createFilterInputType(context: NLPContext<Database>, table: Table): GraphQLInputObjectType {
        const duplicate: GraphQLInputObjectType = context.inputTypes.find(type => (
            type.name === `FILTER_${NLPSchema._escapeName(context.tables, table.name)}`
        ));
        if (duplicate) return duplicate;

        const equalsType = new GraphQLInputObjectType({
            name: `EQUALS_${NLPSchema._escapeName(context.tables, table.name)}`,
            fields: table.fields.reduce((fields, field) => {
                fields[NLPSchema._escapeName(table.fields, field.name)] = {
                    type: NLPSchema._convertToGraphQLType(field.type),
                    description: NLPSchema._createDescription(field)
                };
                return fields;
            }, {})
        });

        const containsType = new GraphQLInputObjectType({
            name: `CONTAINS_${NLPSchema._escapeName(context.tables, table.name)}`,
            fields: table.fields.reduce((fields, field) => {
                switch (field.type) {
                    case NLPSchemaTypes.STRING:
                        fields[NLPSchema._escapeName(table.fields, field.name)] = {
                            type: NLPSchema._convertToGraphQLType(field.type),
                            description: NLPSchema._createDescription(field)
                        };
                        break;
                }
                return fields;
            }, {})
        });

        const nullableFieldsEnumType = new GraphQLEnumType({
            name: `IS_NULL_FIELDS_${NLPSchema._escapeName(context.tables, table.name)}`,
            values: table.fields.reduce((values, field) => {
                if (!field.nonNull) {
                    values[NLPSchema._escapeName(table.fields, field.name)] = {
                        value: field.name,
                        description: NLPSchema._createDescription(field)
                    };
                }
                return values;
            }, {})
        });

        const beginsOrEndsType = new GraphQLInputObjectType({
            name: `BEGINS_OR_ENDS_${NLPSchema._escapeName(context.tables, table.name)}`,
            fields: table.fields.reduce((fields, field) => {
                switch (field.type) {
                    case NLPSchemaTypes.STRING:
                        fields[NLPSchema._escapeName(table.fields, field.name)] = {
                            type: NLPSchema._convertToGraphQLType(field.type),
                            description: NLPSchema._createDescription(field)
                        };
                        break;
                }
                return fields;
            }, {})
        });

        const greaterOrLessType = new GraphQLInputObjectType({
            name: `GREATER_OR_LESS_${NLPSchema._escapeName(context.tables, table.name)}`,
            fields: table.fields.reduce((fields, field) => {
                switch (field.type) {
                    case NLPSchemaTypes.DATE:
                    case NLPSchemaTypes.INT:
                    case NLPSchemaTypes.FLOAT:
                        fields[NLPSchema._escapeName(table.fields, field.name)] = {
                            type: NLPSchema._convertToGraphQLType(field.type),
                            description: NLPSchema._createDescription(field)
                        };
                        break;
                }
                return fields;
            }, {})
        });

        const inputType = new GraphQLInputObjectType({
            name: `FILTER_${NLPSchema._escapeName(context.tables, table.name)}`,
            fields: () => ({
                ...Object.keys(equalsType.getFields()).length ? {
                    [FilterTypes.EQUALS]: {type: equalsType}
                } : {},
                ...Object.keys(containsType.getFields()).length ? {
                    [FilterTypes.CONTAINS]: {type: containsType}
                } : {},
                ...Object.keys(beginsOrEndsType.getFields()).length ? {
                    [FilterTypes.BEGINS]: {type: beginsOrEndsType},
                    [FilterTypes.ENDS]: {type: beginsOrEndsType}
                } : {},
                ...Object.keys(greaterOrLessType.getFields()).length ? {
                    [FilterTypes.GREATER]: {type: greaterOrLessType},
                    [FilterTypes.LESS]: {type: greaterOrLessType}
                } : {},
                ...nullableFieldsEnumType.getValues().length ? {
                    isNull: {type: nullableFieldsEnumType}
                } : {},
                or: {type: new GraphQLList(inputType)},
                and: {type: new GraphQLList(inputType)},
                not: {type: new GraphQLList(inputType)}
            })
        });
        context.inputTypes.push(inputType);
        return inputType;
    }

    private _createConnectionType(context: NLPContext<Database>, type: GraphQLObjectType): GraphQLObjectType {
        const name = NLPSchema._escapeName(context.tables, type.name);
        let connection = context.connections.find((connection) => (
            connection.connectionType.name === name + "Connection"
        ));
        if (connection) return connection.connectionType;
        connection = connectionDefinitions({name, nodeType: type});
        context.connections.push(connection);
        return connection.connectionType;
    }

    private _createType(context: NLPContext<Database>, table: Table): GraphQLObjectType {
        const duplicate: GraphQLObjectType = context.types.find(type => (
            type.name === NLPSchema._escapeName(context.tables, table.name)
        ));
        if (duplicate) return duplicate;

        const type: GraphQLObjectType = new GraphQLObjectType({
            name: NLPSchema._escapeName(context.tables, table.name),
            sqlTable: table.name,
            uniqueKey: NLPSchema._findPrimaryFieldName(table),
            description: NLPSchema._createDescription(table),
            fields: () => {
                const fields = this._createFields(context, table, table.fields);
                const emulatedFields = this._createEmulatedFields(context, table);
                return {...fields, ...emulatedFields};
            }
        });
        context.types.push(type);
        return type;
    }

    //TODO optimize (cache)
    private _createEmulatedFields(context: NLPContext<Database>, table: Table): GraphQLFieldConfigMap<void, void> {
        return table.fields.reduce((fields, field) => {
            if (!field.refs) return fields;
            let tmp = field.refs.reduce((fields, ref) => {
                const emulatedType = new GraphQLObjectType({
                    name: NLPSchema._escapeName(context.tables, `${table.name}_${ref.id}`, "EMULATED"),
                    sqlTable: table.name,
                    uniqueKey: NLPSchema._findPrimaryFieldName(table),
                    description: ref.name,
                    fields: () => {
                        const refFields = table.fields.reduce((fields, field) => {
                            if (field.refs && field.refs.find((item) => item.id === ref.id)) {
                                fields.push(field);
                            }
                            return fields;
                        }, []);
                        return this._createFields(context, table, refFields);
                    }
                });
                if (!Object.keys(emulatedType.getFields()).length) return fields;

                fields[NLPSchema._escapeName(table.fields, ref.id as string, "link")] = {
                    type: new GraphQLNonNull(emulatedType),
                    description: NLPSchema._createDescription({
                        id: ref.id,
                        name: null,
                        indices: ref.indices
                    }),
                    args: {
                        where: {type: this._createFilterInputType(context, table)},
                        order: {type: new GraphQLList(this._createSortingInputType(context, table))}
                    },
                    sqlColumn: NLPSchema._findPrimaryFieldName(table),
                    sqlJoin: (parentTable, joinTable, args) => (
                        `${parentTable}.${this.adapter.quote(NLPSchema._findPrimaryFieldName(table))}` +
                        ` = ${joinTable}.${this.adapter.quote(NLPSchema._findPrimaryFieldName(table))}`
                    ),
                    where: (tableAlias, args, context, sqlASTNode) => this._createSQLWhere(table, tableAlias, args.where),
                    orderBy: (args) => NLPSchema._createObjectOrderBy(args.order)
                };
                return fields;
            }, {});

            return {...fields, ...tmp};
        }, {});
    }

    private _createFields(context: NLPContext<Database>, table: Table, fields: Field[]): GraphQLFieldConfigMap<void, void> {
        return fields.reduce((resultFields, field) => {
            console.log(`${table.name}(${field.name}) to ${field.tableNameRef}`);

            let fieldName: string;
            let fieldType: GraphQLType;
            let fieldDescription: string;
            let sqlJoin: (parentTable: string, joinTable: string, args: any) => string;
            let args: any;
            let tableRef: Table;
            if (field.tableNameRef && (tableRef = context.tables.find((table) => (
                    table.name === NLPSchema._escapeName(context.tables, field.tableNameRef)
                )))
            ) {
                fieldName = NLPSchema._escapeName(fields, field.name, "link");
                fieldType = this._createConnectionType(context, this._createType(context, tableRef));
                fieldDescription = NLPSchema._createDescription({
                    id: field.id,
                    name: field.name,
                    indices: field.refs && field.refs.length ? field.refs[0].indices : null
                });
                sqlJoin = (parentTable, joinTable, args) => (
                    `${parentTable}.${this.adapter.quote(field.name)} = ${joinTable}.${this.adapter.quote(field.fieldNameRef)}`
                );
                args = {
                    ...connectionArgs,
                    where: {type: this._createFilterInputType(context, tableRef)},
                    order: {type: new GraphQLList(this._createSortingInputType(context, tableRef))}
                };
            } else {
                fieldName = NLPSchema._escapeName(fields, field.name);
                fieldType = NLPSchema._convertToGraphQLType(field.type);
                fieldDescription = NLPSchema._createDescription(field);
            }

            resultFields[fieldName] = {
                type: field.nonNull ? new GraphQLNonNull(fieldType) : fieldType,
                description: fieldDescription,
                args,
                resolve: this.adapter.resolve,
                sqlColumn: field.name,
                sqlJoin,
                where: (tableAlias, args, context, sqlASTNode) => this._createSQLWhere(table, tableAlias, args.where),
                orderBy: (args) => NLPSchema._createObjectOrderBy(args.order)
            };
            return resultFields;
        }, {});
    }
}

export enum NLPSchemaTypes {
    BOOLEAN, STRING, INT, FLOAT, DATE, BLOB
}

export enum FilterTypes {
    EQUALS = "equals",

    CONTAINS = "contains",
    BEGINS = "begins",
    ENDS = "ends",

    GREATER = "greater",
    LESS = "less"
}