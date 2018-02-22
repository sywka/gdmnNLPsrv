import NestHydrationJS from "nesthydrationjs";
import joinMonster from "join-monster";
import {GraphQLResolveInfo} from "graphql/type/definition";
import {connectionFromArray} from "graphql-relay";
import {GraphQLUrl} from "graphql-url";
import {Args, FilterTypes, IField, IGraphQLSchemaAdapter, ITable, NLPSchemaTypes, Value} from "../../NLPSchema";
import DBManager, {DBOptions} from "./DBManager";

export type BlobLinkCreator = (id: IBlobID) => string;

export interface IFBGraphQLContext {
    query(query: string, params?: any[]): Promise<any[]>;

    execute(query: string, params?: any[]): Promise<any[]>;
}

export interface IAdapterOptions extends DBOptions {
    blobLinkCreator: BlobLinkCreator;
}

export interface IBlobID {
    table: string;
    field: string;
    primaryField: string;
    primaryKey: string;
}

export class GraphQLAdapter implements IGraphQLSchemaAdapter<IFBGraphQLContext> {

    protected _options: IAdapterOptions;

    constructor(options: IAdapterOptions) {
        this._options = options;
    }

    private static _convertType(type: number): NLPSchemaTypes {
        switch (type) {
            case 261:
                return NLPSchemaTypes.BLOB;
            case 7:
            case 8:
            case 16:
                return NLPSchemaTypes.INT;
            case 10:
            case 11:
            case 27:
                return NLPSchemaTypes.FLOAT;
            case 12:
            case 13:
            case 35:
                return NLPSchemaTypes.DATE;
            case 14:
            case 37:
            case 40:
            default:
                return NLPSchemaTypes.STRING;
        }
    }

    private static async _getDBTables(dbManager: DBManager): Promise<ITable[]> {
        const result: any[] = await dbManager.query(`
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
              
            AND (
              r.rdb$relation_name = 'GD_PEOPLE'
              OR r.rdb$relation_name = 'GD_CONTACT'
--              OR r.rdb$relation_name = 'GD_PLACE'
--              OR r.rdb$relation_name = 'WG_POSITION'
            )
            
          ORDER BY r.rdb$relation_name
        `);

        const definition: any = [{
            name: {column: "tableName", id: true},
            fields: [{
                id: {column: "fieldKey", id: true},
                name: "fieldName",
                primary: {column: "primaryFlag", type: "BOOLEAN", default: false},
                type: {column: "fieldType", type: GraphQLAdapter._convertType},
                nonNull: {column: "nullFlag", type: "BOOLEAN", default: false},
                tableNameRef: "relationName",
                fieldNameRef: "relationFieldName"
            }]
        }];

        return NestHydrationJS().nest(result, definition);
    }

    private static async _getNLPTables(dbManager: DBManager): Promise<ITable[]> {
        const result: any[] = await dbManager.query(`
          SELECT
            TRIM(tables.usr$relation_name)                              AS "tableName",
            TRIM(tables.usr$relation_name) 
              || '_' || TRIM(fields.usr$field_name)                     AS "fieldKey",
            
            TRIM(REPLACE(entities.usr$name,  ',', ''))                  AS "tableIndexName",
            TRIM(REPLACE(attr.usr$name,  ',', ''))                      AS "fieldIndexName",
            ref_type.id                                                 AS "refKey",
            ref_type.usr$description                                    AS "refDescription",
            TRIM(REPLACE(ref_type_detail.usr$name,  ',', ''))           AS "refTypeIndexName"
                
          FROM usr$nlp_table tables
          
            LEFT JOIN usr$nlp_tentities entities
              ON entities.usr$table_key = tables.id
              AND TRIM(REPLACE(entities.usr$name,  ',', '')) > ''
            LEFT JOIN usr$nlp_field fields
              ON fields.usr$table_key = tables.id
              LEFT JOIN usr$nlp_tentities_attr attr
                ON attr.usr$field_key = fields.id
                AND TRIM(REPLACE(attr.usr$name,  ',', '')) > ''
              LEFT JOIN usr$nlp_field_ref field_ref ON field_ref.USR$FIELD_KEY = fields.ID
                LEFT JOIN usr$nlp_ref_type ref_type ON ref_type.id = field_ref.usr$ref_type_key
                  LEFT JOIN usr$nlp_ref_type_detail ref_type_detail
                    ON ref_type_detail.usr$ref_type_key = ref_type.id
                    AND TRIM(REPLACE(ref_type_detail.usr$name,  ',', '')) > ''
        `);

        const definition: any = [{
            name: {column: "tableName", id: true},
            indices: [{
                key: "tableIndexName"
            }],
            fields: [{
                id: {column: "fieldKey", id: true},
                indices: [{
                    key: "fieldIndexName"
                }],
                refs: [{
                    id: {column: "refKey", type: "NUMBER"},
                    name: "refDescription",
                    indices: [{
                        key: "refTypeIndexName"
                    }]
                }]
            }]
        }];

        return NestHydrationJS().nest(result, definition);
    }

    quote(str: string): string {
        return `"${str}"`;
    }

    public async getTables(): Promise<ITable[]> {
        const dbManager = new DBManager();
        try {
            await dbManager.attach(this._options);
            const dbTables = await GraphQLAdapter._getDBTables(dbManager);

            try {
                const nlpTables = await GraphQLAdapter._getNLPTables(dbManager);

                nlpTables.forEach((nlpTable) => {
                    const table = dbTables.find((dbTable) => dbTable.name === nlpTable.name);
                    if (table) {
                        table.indices = nlpTable.indices;
                        nlpTable.fields.forEach((nlpField) => {
                            const field = table.fields.find((tableField) => tableField.id === nlpField.id);
                            if (field) {
                                field.indices = nlpField.indices;
                                field.refs = nlpField.refs;
                            }
                        });
                    }
                });
            } catch (error) {
                console.error(`An error occurred while reading the nlp schema: ${error.message}`);
            }

            return dbTables;
        } finally {
            try {
                await dbManager.detach();
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
        if (field.type === NLPSchemaTypes.DATE) {
            tableField = `CAST(${tableField} AS TIMESTAMP)`;
        }
        if (value) {
            value = DBManager.escape(value);
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
}