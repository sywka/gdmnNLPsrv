import NestHydrationJS from "nesthydrationjs";
import joinMonster from "join-monster";
import {GraphQLResolveInfo} from "graphql/type/definition";
import {connectionFromArray} from "graphql-relay";
import {GraphQLUrl} from "graphql-url";
import {Args, FilterTypes, IField, ISchemaAdapter, ITable, SchemaFieldTypes, Value} from "../../Schema";
import FBDatabase, {DBOptions} from "./FBDatabase";

export type BlobLinkCreator = (id: IBlobID) => string;

export interface IFBGraphQLContext {
    query(query: string, params?: any[]): Promise<any[]>;

    execute(query: string, params?: any[]): Promise<any[]>;
}

export interface ISchemaDetailOptions {
    include?: string[];
    exclude?: string[];
    includePattern?: string;
    excludePattern?: string;
}

export interface IAdapterOptions extends DBOptions, ISchemaDetailOptions {
    blobLinkCreator: BlobLinkCreator;
}

export interface IBlobID {
    table: string;
    field: string;
    primaryField: string;
    primaryKey: string;
}

export default class FirebirdAdapter implements ISchemaAdapter<IFBGraphQLContext> {

    protected _options: IAdapterOptions;

    constructor(options: IAdapterOptions) {
        this._options = options;
    }

    private static _convertType(type: number): SchemaFieldTypes {
        switch (type) {
            case 261:
                return SchemaFieldTypes.BLOB;
            case 7:
            case 8:
            case 16:
                return SchemaFieldTypes.INT;
            case 10:
            case 11:
            case 27:
                return SchemaFieldTypes.FLOAT;
            case 12:
            case 13:
            case 35:
                return SchemaFieldTypes.DATE;
            case 14:
            case 37:
            case 40:
            default:
                return SchemaFieldTypes.STRING;
        }
    }

    public quote(str: string): string {
        return `"${str}"`;
    }

    public async getTables(): Promise<ITable[]> {
        const database = new FBDatabase();
        try {
            await database.attach(this._options);
            return await this._queryToDatabase(database);
        } finally {
            try {
                await database.detach();
            } catch (error) {
                console.log(error);
            }
        }
    }

    public async resolve(source: any, args: Args, context: IFBGraphQLContext, info: GraphQLResolveInfo) {
        if (source) {
            //resolve fields
            const field = source[info.fieldName];

            //resolve BLOB fields
            if (info.returnType === GraphQLUrl && typeof field === "function") {
                const {sqlTable, uniqueKey} = (info.parentType as any)._typeConfig;
                const id: IBlobID = {
                    table: sqlTable,
                    field: info.fieldName,
                    primaryField: uniqueKey,
                    primaryKey: source[uniqueKey]
                };
                return this._options.blobLinkCreator(id);
            }

            // resolve connections
            if (Array.isArray(field)) {
                return {
                    total: field.length,
                    ...connectionFromArray(field, args)
                };
            }
            return field;
        }

        // resolve root query
        const result = await joinMonster(info, {}, (sql: string) => {
            console.log(sql);
            return context.query(sql);
        });
        return {
            total: result.length,
            ...connectionFromArray(result, args)
        };
    }

    public createSQLCondition(filterType: FilterTypes, tableAlias: string, field: IField, value?: Value): string {
        let tableField = `${tableAlias}.${this.quote(field.name)}`;
        if (field.type === SchemaFieldTypes.DATE) {
            tableField = `CAST(${tableField} AS TIMESTAMP)`;
        }
        if (value) {
            value = FBDatabase.escape(value);
        }
        switch (filterType) {
            case FilterTypes.IS_EMPTY:
                return `${tableField} = ''`;
            case FilterTypes.EQUALS:
                return `${tableField} = ${value}`;

            case FilterTypes.CONTAINS:
                return `${tableField} CONTAINING ${value}`;
            case FilterTypes.BEGINS:
                return `${tableField} STARTING WITH ${value}`;
            case FilterTypes.ENDS:
                return `REVERSE(${tableField}) STARTING WITH ${value}`;

            case FilterTypes.GREATER:
                return `${tableField} > ${value}`;
            case FilterTypes.LESS:
                return `${tableField} < ${value}`;
            default:
                return "";
        }
    }

    protected async _queryToDatabase(database: FBDatabase): Promise<ITable[]> {
        const {include, exclude, includePattern, excludePattern} = this._options;

        const includeEscaped = include ? include.map((item) => `'${item}'`) : [];
        const excludeEscaped = exclude ? exclude.map((item) => `'${item}'`) : [];

        const result: any[] = await database.query(`
          SELECT
            TRIM(r.rdb$relation_name)                                   AS "tableName",
            TRIM(rlf.rdb$relation_name) 
              || '_' || TRIM(rlf.rdb$field_name)                        AS "fieldKey",
            TRIM(rlf.rdb$field_name)                                    AS "fieldName",
            f.rdb$field_type                                            AS "fieldType",
            IIF(constPrim.rdb$constraint_type = 'PRIMARY KEY', 1, null) AS "primaryFlag",
            f.rdb$null_flag                                             AS "nullFlag",
            TRIM(ref_rel_const.rdb$relation_name)                       AS "relationName",
            TRIM(seg.rdb$field_name)                                    AS "relationFieldName"
            
          FROM rdb$relations r
          
            LEFT JOIN rdb$relation_fields rlf ON rlf.rdb$relation_name = r.rdb$relation_name
              LEFT JOIN rdb$fields f ON f.rdb$field_name = rlf.rdb$field_source
              LEFT JOIN rdb$relation_constraints constPrim
                ON constPrim.rdb$relation_name = rlf.rdb$relation_name
                AND constPrim.rdb$constraint_type = 'PRIMARY KEY'
                AND EXISTS(
                  SELECT *
                  FROM rdb$index_segments i
                  WHERE i.rdb$field_name = rlf.rdb$field_name
                    AND i.rdb$index_name = constPrim.rdb$index_name
                )
              LEFT JOIN rdb$relation_constraints const
                ON const.rdb$relation_name = rlf.rdb$relation_name
                AND const.rdb$constraint_type = 'FOREIGN KEY'
                AND EXISTS(
                  SELECT *
                  FROM rdb$index_segments i
                  WHERE i.rdb$field_name = rlf.rdb$field_name
                    AND i.rdb$index_name = const.rdb$index_name
                )
                LEFT JOIN rdb$ref_constraints ref_ref_const
                  ON ref_ref_const.rdb$constraint_name = const.rdb$constraint_name
                  LEFT JOIN rdb$relation_constraints ref_rel_const
                    ON ref_rel_const.rdb$constraint_name = ref_ref_const.rdb$const_name_uq
                    LEFT JOIN rdb$index_segments seg ON seg.rdb$index_name = ref_rel_const.rdb$index_name  
                         
          WHERE r.rdb$view_blr IS NULL
            AND (r.rdb$system_flag IS NULL OR r.rdb$system_flag = 0)
            ${includeEscaped.length ? `AND r.rdb$relation_name IN (${includeEscaped.join(", ")})` : ""}
            ${excludeEscaped.length ? `AND r.rdb$relation_name NOT IN (${excludeEscaped.join(", ")})` : ""}
            ${includePattern ? `AND r.rdb$relation_name SIMILAR TO '${includePattern}'` : ""}
            ${excludePattern ? `AND r.rdb$relation_name NOT SIMILAR TO '${excludePattern}'` : ""}
            
          ORDER BY r.rdb$relation_name
        `);

        const definition: any = [{
            id: {column: "tableName", id: true},
            name: {column: "tableName"},
            description: {column: "tableName"},
            fields: [{
                id: {column: "fieldKey", id: true},
                name: "fieldName",
                description: {column: "fieldName"},
                primary: {column: "primaryFlag", type: "BOOLEAN", default: false},
                type: {column: "fieldType", type: FirebirdAdapter._convertType},
                nonNull: {column: "nullFlag", type: "BOOLEAN", default: false},
                tableNameRef: "relationName",
                fieldNameRef: "relationFieldName"
            }]
        }];

        return NestHydrationJS().nest(result, definition);
    }
}