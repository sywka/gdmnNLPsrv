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
import {GraphQLUrl} from "graphql-url";
import {GraphQLFieldConfigMap, GraphQLResolveInfo, GraphQLType} from "graphql/type/definition";
import {connectionArgs, connectionDefinitions, GraphQLConnectionDefinitions} from "graphql-relay";
import Progress from "./adapter/fb/Progress";

type ID = number | string;

export interface IIndex {
    readonly key: string;
}

export interface IBaseIndexing {
    readonly id: ID;
    readonly name: string;
    indices?: IIndex[];
}

export interface IField extends IBaseIndexing {
    readonly primary: boolean;
    readonly type: NLPSchemaTypes;
    readonly nonNull: boolean;
    readonly tableNameRef: string;
    readonly fieldNameRef: string;
    refs?: IBaseIndexing[];
}

export interface ITable extends IBaseIndexing {
    readonly fields: IField[];
}

export type Value = string | number | boolean | Date | DateConstructor

export type Args = { [argName: string]: any }

export interface IGraphQLSchemaAdapter<GraphQLContext> {
    quote(str: string): string;

    getTables(): Promise<ITable[]>;

    resolve(source: any, args: Args, context: GraphQLContext, info: GraphQLResolveInfo): any;

    createSQLCondition(filterType: FilterTypes, tableAlias: string, field: IField, value?: Value): string;
}

export interface ISchemaOptions<GraphQLContext> {
    adapter: IGraphQLSchemaAdapter<GraphQLContext>;
}

export interface INLPContext {
    tables: ITable[];
    types: GraphQLObjectType[];
    inputTypes: GraphQLInputObjectType[];
    connections: GraphQLConnectionDefinitions[];
    progress: {
        tableTick: (table: ITable) => void;
    }
}

export class NLPSchema<GraphQLContext> {

    constructor(options: ISchemaOptions<GraphQLContext>) {
        this._options = options;
    }

    protected _options: ISchemaOptions<GraphQLContext>;

    get options(): ISchemaOptions<GraphQLContext> {
        return this._options;
    }

    protected _schema: GraphQLSchema;

    get schema(): GraphQLSchema {
        return this._schema;
    }

    private static _convertPrimitiveFieldType(field: IField): GraphQLScalarType {
        switch (field.type) {
            case NLPSchemaTypes.BLOB:
                return GraphQLUrl;
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

    private static _escapeName(bases: IBaseIndexing[], name: string): string {
        let replaceValue = "__";
        while (true) {
            const escapedName = name.replace(/\$/g, replaceValue);
            if (escapedName === name) return escapedName;
            if (!bases.find((base) => base.name === escapedName)) {
                return escapedName;
            }
            replaceValue += "_";
        }
    }

    private static _findPrimaryFieldName(table: ITable): string {
        const field = table.fields.find((field) => field.primary);
        if (field) return field.name;
        return "";
    }

    private static _findOriginalField(table: ITable, escapedFieldName): IField {
        return table.fields.find((field) => NLPSchema._escapeName(table.fields, field.name) === escapedFieldName);
    }

    private static _createDescription(base: IBaseIndexing): string {
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

    public async createSchema(hiddenProgress?: boolean): Promise<GraphQLSchema> {
        const total = 100;
        const progress = new Progress(total + 10, hiddenProgress);
        const context: INLPContext = {
            tables: [],
            types: [],
            inputTypes: [],
            connections: [],
            progress: {
                tableTick: (table: ITable) => {
                    progress.tick(`Creating GraphQL type: ${table.name}`, total / context.tables.length);
                }
            }
        };
        try {
            console.log("Creating NLP GraphQL schema...");

            progress.tick("Reading database schema...");
            context.tables = await this._options.adapter.getTables();

            progress.tick("Creating GraphQL schema...", 8);
            this._schema = this._createSchema(context);
            progress.tick("Done.");

            console.log("NLP GraphQL schema created.");

            return this._schema;
        } catch (error) {
            progress.terminate(error.message);
            throw error;
        }
    }

    private _createSQLWhere(table: ITable, tableAlias: string, where: any, context: GraphQLContext): string {
        if (!where) return "";

        let groupsConditions = Object.keys(where).reduce((groupsConditions, filterName: FilterTypes) => {
            switch (filterName as any) {
                case "not":
                case "or":
                case "and":
                case "isNull":
                    return groupsConditions;
            }

            const filter: any = where[filterName];
            let conditions = [];
            if (Array.isArray(filter)) {
                filter.forEach((item) => {
                    const condition = this._options.adapter.createSQLCondition(
                        filterName,
                        tableAlias,
                        NLPSchema._findOriginalField(table, item)
                    );
                    if (condition) conditions.push(condition);
                });
            } else if (typeof filter === "string") {
                const condition = this._options.adapter.createSQLCondition(
                    filterName,
                    tableAlias,
                    NLPSchema._findOriginalField(table, filter)
                );
                if (condition) conditions.push(condition);
            } else if (typeof filter === "object") {
                conditions = Object.keys(filter).reduce((conditions, fieldName) => {
                    const value: any = filter[fieldName];
                    const condition = this._options.adapter.createSQLCondition(
                        filterName,
                        tableAlias,
                        NLPSchema._findOriginalField(table, fieldName),
                        value
                    );
                    if (condition) conditions.push(condition);
                    return conditions;
                }, conditions);
            }
            if (conditions.length) groupsConditions.push(`(${conditions.join(" AND ")})`);
            return groupsConditions;
        }, []);

        if (where.isNull) {
            groupsConditions.push(`${tableAlias}.${this._options.adapter.quote(where.isNull)} IS NULL`);
        }
        if (where.not) {
            const not = where.not.reduce((conditions, item) => {
                conditions.push(this._createSQLWhere(table, tableAlias, item, context));
                return conditions;
            }, []);
            if (not.length) groupsConditions.push(`NOT (${not.join(" AND ")})`);
        }
        if (where.or) {
            const or = where.or.reduce((conditions, item) => {
                conditions.push(this._createSQLWhere(table, tableAlias, item, context));
                return conditions;
            }, []);
            if (or.length) groupsConditions.push(`(${or.join(" OR ")})`);
        }
        if (where.and) {
            const and = where.and.reduce((conditions, item) => {
                conditions.push(this._createSQLWhere(table, tableAlias, item, context));
                return conditions;
            }, []);
            if (and.length) groupsConditions.push(`(${and.join(" AND ")})`);
        }
        return groupsConditions.join(" AND ");
    }

    private _createSchema(context: INLPContext): GraphQLSchema {
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
                        where: (tableAlias, args, context) => (
                            this._createSQLWhere(table, tableAlias, args.where, context)
                        ),
                        orderBy: (args) => NLPSchema._createObjectOrderBy(args.order),
                        resolve: this._options.adapter.resolve.bind(this._options.adapter)
                    };
                    return fields;
                }, {})
            })
        });
    }

    private _createSortingInputType(context: INLPContext, table: ITable) {
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

    private _createFilterInputType(context: INLPContext, table: ITable): GraphQLInputObjectType {
        const duplicate: GraphQLInputObjectType = context.inputTypes.find(type => (
            type.name === `FILTER_${NLPSchema._escapeName(context.tables, table.name)}`
        ));
        if (duplicate) return duplicate;

        const equalsType = new GraphQLInputObjectType({
            name: `EQUALS_${NLPSchema._escapeName(context.tables, table.name)}`,
            fields: table.fields.reduce((fields, field) => {
                switch (field.type) {
                    case NLPSchemaTypes.BLOB:
                        break;
                    default:
                        fields[NLPSchema._escapeName(table.fields, field.name)] = {
                            type: NLPSchema._convertPrimitiveFieldType(field),
                            description: NLPSchema._createDescription(field)
                        };
                }
                return fields;
            }, {})
        });

        const containsType = new GraphQLInputObjectType({
            name: `CONTAINS_${NLPSchema._escapeName(context.tables, table.name)}`,
            fields: table.fields.reduce((fields, field) => {
                switch (field.type) {
                    case NLPSchemaTypes.STRING:
                        fields[NLPSchema._escapeName(table.fields, field.name)] = {
                            type: NLPSchema._convertPrimitiveFieldType(field),
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

        const emptyFieldsEnumType = new GraphQLEnumType({
            name: `IS_EMPTY_FIELDS_${NLPSchema._escapeName(context.tables, table.name)}`,
            values: table.fields.reduce((values, field) => {
                switch (field.type) {
                    case NLPSchemaTypes.BLOB:
                    case NLPSchemaTypes.STRING:
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
                            type: NLPSchema._convertPrimitiveFieldType(field),
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
                            type: NLPSchema._convertPrimitiveFieldType(field),
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
                ...emptyFieldsEnumType.getValues().length ? {
                    isEmpty: {type: emptyFieldsEnumType}
                } : {},
                or: {type: new GraphQLList(inputType)},
                and: {type: new GraphQLList(inputType)},
                not: {type: new GraphQLList(inputType)}
            })
        });
        context.inputTypes.push(inputType);
        return inputType;
    }

    private _createConnectionType(context: INLPContext, type: GraphQLObjectType): GraphQLObjectType {
        const name = NLPSchema._escapeName(context.tables, type.name);
        let connection = context.connections.find((connection) => (
            connection.connectionType.name === name + "Connection"
        ));
        if (connection) return connection.connectionType;
        connection = connectionDefinitions({
            name,
            nodeType: type,
            connectionFields: {
                total: {type: GraphQLInt}
            }
        });
        context.connections.push(connection);
        return connection.connectionType;
    }

    private _createType(context: INLPContext, table: ITable): GraphQLObjectType {
        const duplicate: GraphQLObjectType = context.types.find(type => (
            type.name === NLPSchema._escapeName(context.tables, table.name)
        ));
        if (duplicate) return duplicate;

        context.progress.tableTick(table);
        //TODO not create if fields empty
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
    private _createEmulatedFields(context: INLPContext, table: ITable): GraphQLFieldConfigMap<void, void> {
        return table.fields.reduce((fields, field) => {
            if (!field.refs) return fields;
            let tmp = field.refs.reduce((fields, ref) => {
                const emulatedType = new GraphQLObjectType({
                    name: NLPSchema._escapeName(context.tables, `EMULATED_${table.name}_${ref.id}`),
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

                fields[NLPSchema._escapeName(table.fields, `link_${ref.id as string}`)] = {
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
                    sqlJoin: (parentTable, joinTable) => (
                        `${parentTable}.${this._options.adapter.quote(NLPSchema._findPrimaryFieldName(table))}` +
                        ` = ${joinTable}.${this._options.adapter.quote(NLPSchema._findPrimaryFieldName(table))}`
                    ),
                    where: (tableAlias, args, context) => (
                        this._createSQLWhere(table, tableAlias, args.where, context)
                    ),
                    orderBy: (args) => NLPSchema._createObjectOrderBy(args.order)
                };
                return fields;
            }, {});

            return {...fields, ...tmp};
        }, {});
    }

    private _createFields(context: INLPContext, table: ITable, fields: IField[]): GraphQLFieldConfigMap<void, void> {
        return fields.reduce((resultFields, field) => {
            let fieldName: string;
            let fieldType: GraphQLType;
            let fieldDescription: string;
            let sqlJoin: (parentTable: string, joinTable: string, args: any) => string;
            let args: any;
            let tableRef: ITable;
            if (field.tableNameRef &&
                (tableRef = context.tables.find((table) => (
                    table.name === NLPSchema._escapeName(context.tables, field.tableNameRef)
                )))
            ) {
                fieldName = NLPSchema._escapeName(fields, `link_${field.name}`);
                fieldType = this._createConnectionType(context, this._createType(context, tableRef));
                fieldDescription = NLPSchema._createDescription({
                    id: field.id,
                    name: field.name,
                    indices: field.refs && field.refs.length ? field.refs[0].indices : null
                });
                sqlJoin = (parentTable, joinTable) => (
                    `${parentTable}.${this._options.adapter.quote(field.name)}` +
                    ` = ${joinTable}.${this._options.adapter.quote(field.fieldNameRef)}`
                );
                args = {
                    ...connectionArgs,
                    where: {type: this._createFilterInputType(context, tableRef)},
                    order: {type: new GraphQLList(this._createSortingInputType(context, tableRef))}
                };
            } else {
                fieldName = NLPSchema._escapeName(fields, field.name);
                fieldType = NLPSchema._convertPrimitiveFieldType(field);
                fieldDescription = NLPSchema._createDescription(field);
            }

            resultFields[fieldName] = {
                type: field.nonNull ? new GraphQLNonNull(fieldType) : fieldType,
                description: fieldDescription,
                args,
                resolve: this._options.adapter.resolve.bind(this._options.adapter),
                sqlColumn: field.name,
                sqlJoin,
                where: (tableAlias, args, context) => (
                    this._createSQLWhere(table, tableAlias, args.where, context)
                ),
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

    IS_EMPTY = "isEmpty",
    CONTAINS = "contains",
    BEGINS = "begins",
    ENDS = "ends",

    GREATER = "greater",
    LESS = "less"
}