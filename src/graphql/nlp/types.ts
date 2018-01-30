import {GraphQLInputObjectType, GraphQLObjectType} from "graphql";
import {GraphQLFieldResolver} from "graphql/type/definition";
import {FilterTypes, NLPSchemaTypes} from "./NLPSchema";

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