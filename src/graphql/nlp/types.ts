import {GraphQLInputObjectType, GraphQLObjectType} from "graphql";
import {GraphQLResolveInfo} from "graphql/type/definition";
import {FilterTypes, NLPSchemaTypes} from "./NLPSchema";

type ID = number | string;

export interface Index {
    readonly key: string;
}

export interface BaseIndexing {
    readonly id: ID;
    readonly name: string;
    readonly indices: Index[];
}

export interface Ref extends BaseIndexing {
}

export interface Field extends BaseIndexing {
    readonly primary: boolean;
    readonly type: NLPSchemaTypes;
    readonly nonNull: boolean;
    readonly tableNameRef: string;
    readonly fieldNameRef: string;
    readonly refs: Ref[];
}

export interface Table extends BaseIndexing {
    readonly fields: Field[];
}

export type Value = string | number | boolean | Date

export interface Adapter<DB> {
    connectToDB(): Promise<DB>;

    disconnectFromDB(context: Context<DB>): Promise<void>;

    getTables(context: Context<DB>): Promise<Table[]>;

    resolve(source: any, args: any, context: any, info: GraphQLResolveInfo): any;

    createSQLCondition(type: FilterTypes, field: string, value: Value): string;

    quote(str: string): string;
}

export interface Options<Database> {
    adapter: Adapter<Database>;
}

export interface Context<DB> {
    db: DB;
    tables: Table[];
    types: GraphQLObjectType[];
    inputTypes: GraphQLInputObjectType[];
}