import {
    GraphQLBoolean,
    GraphQLFieldMap,
    GraphQLFloat,
    GraphQLInputObjectType,
    GraphQLInt,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLScalarType,
    GraphQLSchema,
    GraphQLString
} from 'graphql';
import * as GraphQLDate from 'graphql-date';
import {GraphQLFieldResolver, GraphQLType} from "graphql/type/definition";

export class NLPSchema<Database> {

    protected schema: GraphQLSchema;
    protected adapter: Adapter<Database>;
    protected linkCoder: (table: Table, field: Field) => string;
    protected emulatedLinkCoder: (table: Table, ref: Ref) => string;
    protected emulatedEntityCoder: (table: Table, ref: Ref) => string;

    constructor(options: Options<Database>) {
        this.adapter = options.adapter;
        this.linkCoder = options.linkCoder || ((table, field) => `link_${field.name}`);
        this.emulatedLinkCoder = options.emulatedLinkCoder || ((table, ref) => `link_${ref.id}`);
        this.emulatedEntityCoder = options.emulatedEntityCoder || ((table, ref) => `EMULATED_${table.name}_${ref.id}`);

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
            if (i) strOfIndices += ',';
            strOfIndices += index.key;
            return strOfIndices;
        }, '');
    }

    private static _escape(str: string): string {
        return str.replace(/\$/g, '__');
    }

    private static _findPrimaryFieldName(table: Table): string {
        const field = table.fields.find((field) => field.primary);
        if (field) return field.name;
        return '';
    }

    public async recreateSchema(): Promise<GraphQLSchema> {
        this.schema = null;
        return await this.getSchema()
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
                    await this.adapter.disconnectFromDB(context)
                }
            } catch (error) {
                console.log(error)
            }
        }
    }

    private _createSQLWhere(tableAlias: string, where: any): string {
        if (!where) return '';

        let groupsConditions = Object.keys(where).reduce((groupsConditions, filterName) => {
            if (filterName === 'or') return groupsConditions;

            const filter: any = where[filterName];
            let conditions = Object.keys(filter).reduce((conditions, fieldName) => {
                const value: any = filter[fieldName];
                const condition = this.adapter.createSQLCondition(
                    filterName as FilterTypes,
                    `${tableAlias}."${fieldName}"`,
                    value
                );
                if (condition) conditions.push(condition);
                return conditions;
            }, []);
            if (conditions.length) groupsConditions.push(`(${conditions.join(' AND ')})`);
            return groupsConditions;
        }, []);

        if (where.or) {
            const or = where.or.reduce((conditions, item) => {
                conditions.push(this._createSQLWhere(tableAlias, item));
                return conditions;
            }, []);
            if (or.length) groupsConditions.push(`(${or.join(' OR ')})`);
        }
        if (where.and) {
            const and = where.and.reduce((conditions, item) => {
                conditions.push(this._createSQLWhere(tableAlias, item));
                return conditions;
            }, []);
            if (and.length) groupsConditions.push(`(${and.join(' AND ')})`);
        }
        return groupsConditions.join(' AND ');
    }

    private _createSchema(context: Context<Database>): GraphQLSchema {
        return new GraphQLSchema({
            query: new GraphQLObjectType({
                name: 'Tables',
                fields: () => context.tables.reduce((fields, table) => {
                    fields[NLPSchema._escape(table.name)] = {
                        type: new GraphQLNonNull(new GraphQLList(this._createType(context, table))),
                        description: NLPSchema._indicesToStr(table.indices),
                        args: {
                            where: {type: this._createFilterInputType(context, table)}
                        },
                        where: (tableAlias, args, context, sqlASTNode) => this._createSQLWhere(tableAlias, args.where),
                        resolve: this.adapter.resolve
                    };
                    return fields;
                }, {})
            })
        });
    }

    private _createFilterInputType(context: Context<Database>, table: Table): GraphQLInputObjectType {
        const duplicate: GraphQLInputObjectType = context.inputTypes.find(type => (
            type.name === `FILTER_${NLPSchema._escape(table.name)}`
        ));
        if (duplicate) return duplicate;

        const inputType = new GraphQLInputObjectType({
            name: `FILTER_${NLPSchema._escape(table.name)}`,
            fields: () => ({
                [FilterTypes.TYPE_EQUALS]: {
                    type: new GraphQLInputObjectType({
                        name: `EQUALS_${table.name}`,
                        fields: () => table.fields.reduce((fields, field) => {
                            if (!field.tableNameRef) {
                                fields[field.name] = {type: NLPSchema._convertToGraphQLType(field.type)};
                            }
                            return fields;
                        }, {})
                    })
                },
                [FilterTypes.TYPE_NOT_EQUALS]: {
                    type: new GraphQLInputObjectType({
                        name: `NOT_EQUALS_${table.name}`,
                        fields: () => table.fields.reduce((fields, field) => {
                            if (!field.tableNameRef) {
                                fields[field.name] = {type: NLPSchema._convertToGraphQLType(field.type)};
                            }
                            return fields;
                        }, {})
                    })
                },
                [FilterTypes.TYPE_CONTAINS]: {
                    type: new GraphQLInputObjectType({
                        name: `CONTAINS_${table.name}`,
                        fields: () => table.fields.reduce((fields, field) => {
                            if (!field.tableNameRef && field.type === NLPSchemaTypes.TYPE_STRING) {
                                fields[field.name] = {type: NLPSchema._convertToGraphQLType(field.type)};
                            }
                            return fields;
                        }, {})
                    })
                },
                [FilterTypes.TYPE_NOT_CONTAINS]: {
                    type: new GraphQLInputObjectType({
                        name: `NOT_CONTAINS_${table.name}`,
                        fields: () => table.fields.reduce((fields, field) => {
                            if (!field.tableNameRef && field.type === NLPSchemaTypes.TYPE_STRING) {
                                fields[field.name] = {type: NLPSchema._convertToGraphQLType(field.type)};
                            }
                            return fields;
                        }, {})
                    })
                },
                or: {type: new GraphQLList(inputType)},
                and: {type: new GraphQLList(inputType)}
            })
        });
        context.inputTypes.push(inputType);
        return inputType;
    }

    private _createType(context: Context<Database>, table: Table): GraphQLObjectType {
        const duplicate: GraphQLObjectType = context.types.find(type => type.name === NLPSchema._escape(table.name));
        if (duplicate) return duplicate;

        const type: GraphQLObjectType = new GraphQLObjectType({
            name: NLPSchema._escape(table.name),
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
    private _createEmulatedFields(context: Context<Database>, table: Table): GraphQLFieldMap<void, void> {
        return table.fields.reduce((fields, field) => {
            let tmp = field.refs.reduce((fields, ref) => {
                fields[this.emulatedLinkCoder(table, ref)] = {
                    type: new GraphQLNonNull(
                        new GraphQLObjectType({
                            name: this.emulatedEntityCoder(table, ref),
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
                        where: {type: this._createFilterInputType(context, table)}
                    },
                    sqlColumn: NLPSchema._findPrimaryFieldName(table),
                    sqlJoin: (parentTable, joinTable, args) => (
                        `${parentTable}."${NLPSchema._findPrimaryFieldName(table)}"` +
                        ` = ${joinTable}."${NLPSchema._findPrimaryFieldName(table)}"`
                    ),
                    where: (tableAlias, args, context, sqlASTNode) => this._createSQLWhere(tableAlias, args.where)
                };
                return fields;
            }, {});

            return {...fields, ...tmp};
        }, {});
    }

    private _createFields(context: Context<Database>, table: Table, fields: Field[]) {
        return fields.reduce((fields, field) => {
            console.log(`${table.name}(${field.name}) to ${field.tableNameRef}`);

            let fieldName: string;
            let fieldType: GraphQLType;
            let fieldDescription: string;
            let sqlJoin;
            let args;
            if (field.tableNameRef) {
                const tableRef: Table = context.tables.find((table) => table.name === field.tableNameRef);
                if (!tableRef) return fields;

                fieldName = NLPSchema._escape(this.linkCoder(table, field));
                fieldType = new GraphQLList(this._createType(context, tableRef));
                fieldDescription = field.refs.length ? NLPSchema._indicesToStr(field.refs[0].indices) : '';
                sqlJoin = (parentTable, joinTable, args) => (
                    `${parentTable}."${field.name}" = ${joinTable}."${field.fieldNameRef}"`
                );
                args = {
                    where: {type: this._createFilterInputType(context, tableRef)}
                };
            } else {
                fieldName = NLPSchema._escape(field.name);
                fieldType = NLPSchema._convertToGraphQLType(field.type);
                fieldDescription = NLPSchema._indicesToStr(field.indices);
            }

            if (field.nonNull) fieldType = new GraphQLNonNull(fieldType);
            fields[fieldName] = {
                type: fieldType,
                description: fieldDescription,
                args,
                sqlColumn: field.name,
                sqlJoin,
                where: (tableAlias, args, context, sqlASTNode) => this._createSQLWhere(tableAlias, args.where)
            };
            return fields;
        }, {});
    }
}

type ID = number | string;

export interface Index {
    readonly key: string;
}

export interface Ref {
    readonly id: ID;
    readonly description: string;
    readonly indices: Index[];
}

export interface Field {
    readonly id: ID;
    readonly name: string;
    readonly primary: boolean;
    readonly indices: Index[];
    readonly type: NLPSchemaTypes;
    readonly nonNull: boolean;
    readonly tableNameRef: string;
    readonly fieldNameRef: string;
    readonly refs: Ref[];
}

export interface Table {
    readonly id: ID;
    readonly name: string;
    readonly indices: Index[];
    readonly fields: Field[];
}

export interface Adapter<DB> {
    connectToDB: () => Promise<DB>;
    disconnectFromDB: (context: Context<DB>) => Promise<void>;
    getTables: (context: Context<DB>) => Promise<Table[]>;
    resolve: GraphQLFieldResolver<any, any, any>;
    createSQLCondition: (type: FilterTypes, field: string, value: any) => string;
}

export interface Options<Database> {
    adapter: Adapter<Database>;
    linkCoder?: (table: Table, field: Field) => string;
    emulatedLinkCoder?: (table: Table, ref: Ref) => string;
    emulatedEntityCoder?: (table: Table, ref: Ref) => string;
}

export interface Context<DB> {
    db: DB;
    tables: Table[];
    types: GraphQLObjectType[];
    inputTypes: GraphQLInputObjectType[];
}

export enum NLPSchemaTypes {
    TYPE_BOOLEAN, TYPE_STRING, TYPE_INT, TYPE_FLOAT, TYPE_DATE
}

export enum FilterTypes {
    TYPE_EQUALS = 'equals',
    TYPE_NOT_EQUALS = 'notEquals',
    TYPE_CONTAINS = 'contains',
    TYPE_NOT_CONTAINS = 'notContains'
}