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
    protected emulatedLinkCoder: (table: Table, field: Field, ref: Ref) => string;
    protected emulatedEntityCoder: (table: Table, field: Field, ref: Ref) => string;

    constructor(options: Options<Database>) {
        this.adapter = options.adapter;
        this.linkCoder = options.linkCoder || ((table, field) => `link_${field.name}`);
        this.emulatedLinkCoder = options.emulatedLinkCoder || ((table, field, ref) => `link_${ref.id}`);
        this.emulatedEntityCoder = options.emulatedEntityCoder || ((table, field, ref) => `EMULATED_${table.name}_${ref.id}`);

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

    private static _createSQLWhere(tableAlias: string, where: any) {
        if (!where) return '';

        let sqlCondition: string = '';
        if (where.equals) {
            let equals: string = '';
            for (let propName in where.equals) {
                const value: string = where.equals[propName];
                equals += `${sqlCondition ? ' AND ' : ''}${tableAlias}."${propName}" = '${value}'`;
            }
            if (equals) sqlCondition += `(${equals})`
        }
        if (where.or) {
            const or = where.or.reduce((condition, item, index, array) => {
                if (index) condition += ' OR ';
                condition += NLPSchema._createSQLWhere(tableAlias, item);
                return condition;
            }, '');
            if (or) {
                if (sqlCondition) sqlCondition += ' AND ';
                sqlCondition += `(${or})`;
            }
        }
        return sqlCondition;
    }

    public async recreateSchema(): Promise<GraphQLSchema> {
        this.schema = null;
        return await this.getSchema()
    }

    public async getSchema(): Promise<GraphQLSchema> {
        if (this.schema) return this.schema;

        const context: Context<Database> = {db: null, tables: [], types: []};
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

    private _createSchema(context: Context<Database>): GraphQLSchema {
        return new GraphQLSchema({
            query: new GraphQLObjectType({
                name: 'Tables',
                fields: () => context.tables.reduce((fields, table) => {
                    fields[NLPSchema._escape(table.name)] = {
                        type: new GraphQLNonNull(new GraphQLList(this._createType(context, table))),
                        args: {
                            where: {type: this._createFilterInputType(context, table)}
                        },
                        description: NLPSchema._indicesToStr(table.indices),
                        where: (tableAlias, args, context, sqlASTNode) => NLPSchema._createSQLWhere(tableAlias, args.where),
                        resolve: this.adapter.resolve
                    };
                    return fields;
                }, {})
            })
        });
    }

    private _createFilterInputType(context: Context<Database>, table: Table): GraphQLInputObjectType {
        const filterType = new GraphQLInputObjectType({
            name: `FILTER_${table.name}`,
            fields: () => ({
                equals: {
                    type: new GraphQLInputObjectType({
                        name: `EQUALS_${table.name}`,
                        fields: () => table.fields.reduce((fields, field) => {
                            if (!field.tableNameRef) {
                                fields[field.name] = {
                                    type: NLPSchema._convertToGraphQLType(field.type)
                                };
                            }
                            return fields;
                        }, {})
                    })
                },
                or: {type: new GraphQLList(filterType)}
            })
        });
        return filterType;
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
                const emulatedFields = this._createEmulatedFields(context, table, table.fields);
                return {...fields, ...emulatedFields};
            }
        });
        context.types.push(type);
        return type;
    }

    //TODO optimize (cache)
    private _createEmulatedFields(context: Context<Database>, table: Table, fields: Field[]): GraphQLFieldMap<void, void> {
        return fields.reduce((fields, field) => {
            let tmp = field.refs.reduce((fields, ref) => {
                fields[this.emulatedLinkCoder(table, field, ref)] = {
                    type: new GraphQLNonNull(
                        new GraphQLObjectType({
                            name: this.emulatedEntityCoder(table, field, ref),
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
                    sqlColumn: NLPSchema._findPrimaryFieldName(table),
                    sqlJoin: (parentTable, joinTable, args) => (
                        `${parentTable}."${NLPSchema._findPrimaryFieldName(table)}"` +
                        ` = ${joinTable}."${NLPSchema._findPrimaryFieldName(table)}"`
                    )
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
            if (field.tableNameRef) {
                const tableRef: Table = context.tables.find((table) => table.name === field.tableNameRef);
                if (!tableRef) return fields;

                fieldName = NLPSchema._escape(this.linkCoder(table, field));
                fieldType = new GraphQLList(this._createType(context, tableRef));
                fieldDescription = field.refs.length ? NLPSchema._indicesToStr(field.refs[0].indices) : '';
                sqlJoin = (parentTable, joinTable, args) => (
                    `${parentTable}."${field.name}" = ${joinTable}."${field.fieldNameRef}"`
                )
            } else {
                fieldName = NLPSchema._escape(field.name);
                fieldType = NLPSchema._convertToGraphQLType(field.type);
                fieldDescription = NLPSchema._indicesToStr(field.indices);
            }

            if (field.nonNull) fieldType = new GraphQLNonNull(fieldType);
            fields[fieldName] = {
                type: fieldType,
                description: fieldDescription,
                sqlColumn: field.name,
                sqlJoin
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
}

export interface Options<Database> {
    adapter: Adapter<Database>;
    linkCoder?: (table: Table, field: Field) => string;
    emulatedLinkCoder?: (table: Table, field: Field, ref: Ref) => string;
    emulatedEntityCoder?: (table: Table, field: Field, ref: Ref) => string;
}

export interface Context<DB> {
    db: DB;
    tables: Table[];
    types: GraphQLObjectType[];
}

export enum NLPSchemaTypes {
    TYPE_BOOLEAN, TYPE_STRING, TYPE_INT, TYPE_FLOAT, TYPE_DATE
}