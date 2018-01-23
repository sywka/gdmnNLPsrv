import {
    GraphQLBoolean,
    GraphQLFieldMap,
    GraphQLFloat,
    GraphQLInt,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLScalarType,
    GraphQLSchema,
    GraphQLString
} from 'graphql';
import * as GraphQLDate from 'graphql-date';
import {GraphQLType} from "graphql/type/definition";

export class NLPSchema<Database> {

    protected schema: GraphQLSchema;
    protected adapter: Adapter<Database>;
    protected emulatedLinkCoder: (table: Table, field: Field, ref: Ref) => string;
    protected emulatedEntityCoder: (table: Table, field: Field, ref: Ref) => string;

    constructor(options: Options<Database>) {
        this.adapter = options.adapter;
        this.emulatedLinkCoder = options.emulatedLinkCoder || ((table, field, ref) => `EMULATED_LINK_${ref.id}`);
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
                        description: NLPSchema._indicesToStr(table.indices)
                    };
                    return fields;
                }, {})
            })
        });
    }

    private _createType(context: Context<Database>, table: Table): GraphQLObjectType {
        const duplicate: GraphQLObjectType = context.types.find(type => type.name === NLPSchema._escape(table.name));
        if (duplicate) return duplicate;

        const type: GraphQLObjectType = new GraphQLObjectType({
            name: NLPSchema._escape(table.name),
            description: NLPSchema._indicesToStr(table.indices),
            fields: () => table.fields.reduce((fields, tableField) => {
                console.log(`${table.name}(${tableField.name}) to ${tableField.nameRef}`);

                let fieldType: GraphQLType;
                let fieldDescription: string;
                if (tableField.nameRef) {
                    const tableRef: Table = context.tables.find((table) => table.name === tableField.nameRef);
                    if (!tableRef) return fields;

                    fieldType = new GraphQLList(this._createType(context, tableRef));
                    fieldDescription = tableField.refs.length ? NLPSchema._indicesToStr(tableField.refs[0].indices) : '';
                } else {
                    fieldType = NLPSchema._convertToGraphQLType(tableField.type);
                    fieldDescription = NLPSchema._indicesToStr(tableField.indices);
                    fields = {...fields, ...this._createEmulatedLinkFields(context, table, tableField)};
                }

                if (tableField.nonNull) fieldType = new GraphQLNonNull(fieldType);
                fields[NLPSchema._escape(tableField.name)] = {
                    type: fieldType,
                    description: fieldDescription
                };
                return fields;
            }, {})
        });
        context.types.push(type);
        return type;
    }

    //TODO optimize (cache)
    private _createEmulatedLinkFields(context: Context<Database>, table: Table, field: Field): GraphQLFieldMap<void, void> {
        return field.refs.reduce((fields, ref) => {
            fields[this.emulatedLinkCoder(table, field, ref)] = {
                type: new GraphQLObjectType({
                    name: this.emulatedEntityCoder(table, field, ref),
                    description: ref.description,
                    fields: () => table.fields.reduce((fields, tableField) => {
                        if (tableField.refs.find((item) => item.id === ref.id)) {
                            fields[NLPSchema._escape(tableField.name)] = {
                                type: NLPSchema._convertToGraphQLType(tableField.type),
                                description: NLPSchema._indicesToStr(tableField.indices)
                            }
                        }
                        return fields;
                    }, {})
                }),
                description: NLPSchema._indicesToStr(ref.indices)
            };
            return fields;
        }, {});
    }
}

type ID = number | string | void;

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
    readonly indices: Index[];
    readonly type: NLPSchemaTypes;
    readonly nonNull: boolean;
    readonly nameRef: string;
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
}

export interface Options<Database> {
    adapter: Adapter<Database>;
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