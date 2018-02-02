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
import {GraphQLFieldConfigMap, GraphQLType} from "graphql/type/definition";
import {Adapter, Context, Field, Index, Options, Ref, Table} from "./types";

export class NLPSchema<Database> {

    protected schema: GraphQLSchema;
    protected adapter: Adapter<Database>;

    constructor(options: Options<Database>) {
        this.adapter = options.adapter;

        this.getSchema().catch(console.log); //tmp
    }

    private static _convertToGraphQLType(type: NLPSchemaTypes): GraphQLScalarType {
        switch (type) {
            case NLPSchemaTypes.TYPE_INT:
                return GraphQLInt;
            case NLPSchemaTypes.TYPE_FLOAT:
                return GraphQLFloat;
            case NLPSchemaTypes.TYPE_DATE:
                return GraphQLDate;
            case NLPSchemaTypes.TYPE_BOOLEAN:
                return GraphQLBoolean;
            case NLPSchemaTypes.TYPE_STRING:
            default:
                return GraphQLString;
        }
    }

    private static _indicesToStr(indices: Index[]): string {
        return indices.reduce((strOfIndices, index, i) => {
            if (i) strOfIndices += ",";
            strOfIndices += index.key;
            return strOfIndices;
        }, "");
    }

    private static _escapeName(objectsWithName: (Table | Field)[], name: string, prefix?: string): string {
        let replaceValue = "__";
        while (true) {
            let nameWithPrefix = prefix ? `${prefix}$${name}` : name;
            const escapedName = nameWithPrefix.replace(/\$/g, replaceValue);
            if (escapedName === name) return escapedName;
            if (!objectsWithName.find((object) => object.name === escapedName)) {
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

        const context: Context<Database> = {db: null, tables: [], types: [], inputTypes: []};
        try {
            context.db = await this.adapter.connectToDB();
            context.tables = await this.adapter.getTables(context);
            return this.schema = this._createSchema(context);
        } finally {
            try {
                if (context.db) {
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

    private _createSchema(context: Context<Database>): GraphQLSchema {
        return new GraphQLSchema({
            query: new GraphQLObjectType({
                name: "Tables",
                fields: () => context.tables.reduce((fields, table) => {
                    fields[NLPSchema._escapeName(context.tables, table.name)] = {
                        type: new GraphQLNonNull(new GraphQLList(this._createType(context, table))),
                        description: NLPSchema._indicesToStr(table.indices),
                        args: {
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

    private _createSortingInputType(context: Context<Database>, table: Table) {
        const duplicate: GraphQLInputObjectType = context.inputTypes.find(type => (
            type.name === `SORTING_${NLPSchema._escapeName(context.tables, table.name)}`
        ));
        if (duplicate) return duplicate;

        const sortingFieldsEnumType = new GraphQLEnumType({
            name: `SORTING_FIELDS_${NLPSchema._escapeName(context.tables, table.name)}`,
            values: table.fields.reduce((values, field) => {
                values[NLPSchema._escapeName(table.fields, field.name)] = {
                    value: field.name,
                    description: NLPSchema._indicesToStr(field.indices)
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

    private _createFilterInputType(context: Context<Database>, table: Table): GraphQLInputObjectType {
        const duplicate: GraphQLInputObjectType = context.inputTypes.find(type => (
            type.name === `FILTER_${NLPSchema._escapeName(context.tables, table.name)}`
        ));
        if (duplicate) return duplicate;

        const nullableFieldsEnumType = new GraphQLEnumType({
            name: `IS_NULL_FIELDS_${NLPSchema._escapeName(context.tables, table.name)}`,
            values: table.fields.reduce((values, field) => {
                if (!field.nonNull) {
                    values[NLPSchema._escapeName(table.fields, field.name)] = {
                        value: field.name,
                        description: NLPSchema._indicesToStr(field.indices)
                    };
                }
                return values;
            }, {})
        });

        const beginsOrEndsType = new GraphQLInputObjectType({
            name: `BEGINS_OR_ENDS_${NLPSchema._escapeName(context.tables, table.name)}`,
            fields: () => table.fields.reduce((fields, field) => {
                switch (field.type) {
                    case NLPSchemaTypes.TYPE_STRING:
                        fields[NLPSchema._escapeName(table.fields, field.name)] = {
                            type: NLPSchema._convertToGraphQLType(field.type),
                            description: NLPSchema._indicesToStr(field.indices)
                        };
                        break;
                }
                return fields;
            }, {})
        });

        const greaterOrLessType = new GraphQLInputObjectType({
            name: `GREATER_OR_LESS_${NLPSchema._escapeName(context.tables, table.name)}`,
            fields: () => table.fields.reduce((fields, field) => {
                switch (field.type) {
                    case NLPSchemaTypes.TYPE_DATE:
                    case NLPSchemaTypes.TYPE_INT:
                    case NLPSchemaTypes.TYPE_FLOAT:
                        fields[NLPSchema._escapeName(table.fields, field.name)] = {
                            type: NLPSchema._convertToGraphQLType(field.type),
                            description: NLPSchema._indicesToStr(field.indices)
                        };
                        break;
                }
                return fields;
            }, {})
        });

        const inputType = new GraphQLInputObjectType({
            name: `FILTER_${NLPSchema._escapeName(context.tables, table.name)}`,
            fields: () => ({
                [FilterTypes.TYPE_EQUALS]: {
                    type: new GraphQLInputObjectType({
                        name: `EQUALS_${NLPSchema._escapeName(context.tables, table.name)}`,
                        fields: () => table.fields.reduce((fields, field) => {
                            fields[NLPSchema._escapeName(table.fields, field.name)] = {
                                type: NLPSchema._convertToGraphQLType(field.type),
                                description: NLPSchema._indicesToStr(field.indices)
                            };
                            return fields;
                        }, {})
                    })
                },
                [FilterTypes.TYPE_CONTAINS]: {
                    type: new GraphQLInputObjectType({
                        name: `CONTAINS_${NLPSchema._escapeName(context.tables, table.name)}`,
                        fields: () => table.fields.reduce((fields, field) => {
                            switch (field.type) {
                                case NLPSchemaTypes.TYPE_STRING:
                                    fields[NLPSchema._escapeName(table.fields, field.name)] = {
                                        type: NLPSchema._convertToGraphQLType(field.type),
                                        description: NLPSchema._indicesToStr(field.indices)
                                    };
                                    break;
                            }
                            return fields;
                        }, {})
                    })
                },
                [FilterTypes.TYPE_BEGINS]: {type: beginsOrEndsType},
                [FilterTypes.TYPE_ENDS]: {type: beginsOrEndsType},
                [FilterTypes.TYPE_GREATER]: {type: greaterOrLessType},
                [FilterTypes.TYPE_LESS]: {type: greaterOrLessType},
                isNull: {type: nullableFieldsEnumType},
                or: {type: new GraphQLList(inputType)},
                and: {type: new GraphQLList(inputType)},
                not: {type: new GraphQLList(inputType)}
            })
        });
        context.inputTypes.push(inputType);
        return inputType;
    }

    private _createType(context: Context<Database>, table: Table): GraphQLObjectType {
        const duplicate: GraphQLObjectType = context.types.find(type => (
            type.name === NLPSchema._escapeName(context.tables, table.name)
        ));
        if (duplicate) return duplicate;

        const type: GraphQLObjectType = new GraphQLObjectType({
            name: NLPSchema._escapeName(context.tables, table.name),
            sqlTable: table.name,
            uniqueKey: NLPSchema._findPrimaryFieldName(table),
            description: NLPSchema._indicesToStr(table.indices),
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
    private _createEmulatedFields(context: Context<Database>, table: Table): GraphQLFieldConfigMap<void, void> {
        return table.fields.reduce((fields, field) => {
            let tmp = field.refs.reduce((fields, ref) => {
                fields[NLPSchema._escapeName(table.fields, ref.id as string, "link")] = {
                    type: new GraphQLNonNull(
                        new GraphQLObjectType({
                            name: NLPSchema._escapeName(context.tables, `${table.name}_${ref.id}`, "EMULATED"),
                            sqlTable: table.name,
                            uniqueKey: NLPSchema._findPrimaryFieldName(table),
                            description: ref.description,
                            fields: () => {
                                const refFields = table.fields.reduce((fields, field) => {
                                    if (field.refs.find((item) => item.id === ref.id)) {
                                        fields.push(field);
                                    }
                                    return fields;
                                }, []);
                                return this._createFields(context, table, refFields);
                            }
                        })
                    ),
                    description: NLPSchema._indicesToStr(ref.indices),
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

    private _createFields(context: Context<Database>, table: Table, fields: Field[]): GraphQLFieldConfigMap<void, void> {
        return fields.reduce((resultFields, field) => {
            console.log(`${table.name}(${field.name}) to ${field.tableNameRef}`);

            let fieldName: string;
            let fieldType: GraphQLType;
            let fieldDescription: string;
            let sqlJoin;
            let args;
            if (field.tableNameRef) {
                const tableRef: Table = context.tables.find((table) => (
                    table.name === NLPSchema._escapeName(context.tables, field.tableNameRef)
                ));
                if (!tableRef) return resultFields;

                fieldName = NLPSchema._escapeName(fields, field.name, "link");
                fieldType = new GraphQLList(this._createType(context, tableRef));
                fieldDescription = field.refs.length ? NLPSchema._indicesToStr(field.refs[0].indices) : "";
                sqlJoin = (parentTable, joinTable, args) => (
                    `${parentTable}.${this.adapter.quote(field.name)} = ${joinTable}.${this.adapter.quote(field.fieldNameRef)}`
                );
                args = {
                    where: {type: this._createFilterInputType(context, tableRef)},
                    order: {type: new GraphQLList(this._createSortingInputType(context, tableRef))}
                };
            } else {
                fieldName = NLPSchema._escapeName(fields, field.name);
                fieldType = NLPSchema._convertToGraphQLType(field.type);
                fieldDescription = NLPSchema._indicesToStr(field.indices);
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
    TYPE_BOOLEAN, TYPE_STRING, TYPE_INT, TYPE_FLOAT, TYPE_DATE, TYPE_BLOB
}

export enum FilterTypes {
    TYPE_EQUALS = "equals",

    TYPE_CONTAINS = "contains",
    TYPE_BEGINS = "begins",
    TYPE_ENDS = "ends",

    TYPE_GREATER = "greater",
    TYPE_LESS = "less"
}