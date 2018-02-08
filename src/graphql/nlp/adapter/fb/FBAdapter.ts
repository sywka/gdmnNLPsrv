import NestHydrationJS from "nesthydrationjs";
import joinMonster from "join-monster";
import {GraphQLResolveInfo} from "graphql/type/definition";
import {connectionFromArray} from "graphql-relay";
import {Adapter, Args, FilterTypes, NLPSchemaTypes, Table, Value} from "../../NLPSchema";
import DBManager, {Options} from "./DBManager";

export interface GraphQLContext {
    query(query: string, params?: any[]): Promise<any[]>;

    execute(query: string, params?: any[]): Promise<any[]>;
}

export class FBAdapter implements Adapter<GraphQLContext> {

    protected options: Options;

    constructor(options: Options) {
        this.options = options;
    }

    private static _convertType(type: number): NLPSchemaTypes {
        switch (type) {
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

    private static async _getDBTables(dbManager: DBManager): Promise<Table[]> {
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
            AND f.rdb$field_type != 45 AND f.rdb$field_type != 261
              
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
                type: {column: "fieldType", type: FBAdapter._convertType},
                nonNull: {column: "nullFlag", type: "BOOLEAN", default: false},
                tableNameRef: "relationName",
                fieldNameRef: "relationFieldName"
            }]
        }];

        return NestHydrationJS().nest(result, definition);
    }

    private static async _getNLPTables(dbManager: DBManager): Promise<Table[]> {
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

    public async getTables(): Promise<Table[]> {
        const dbManager = new DBManager(this.options);
        try {
            await dbManager.attach();
            const dbTables = await FBAdapter._getDBTables(dbManager);

            try {
                const nlpTables = await FBAdapter._getNLPTables(dbManager);

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
                return dbTables;
            } catch (error) {
                console.error(`An error occurred while reading the nlp schema: ${error.message}`);
            }
        } finally {
            try {
                await dbManager.detach();
            } catch (error) {
                console.log(error);
            }
        }
    }

    public async resolve(source: any, args: Args, context: GraphQLContext, info: GraphQLResolveInfo) {
        if (source) {
            const field = source[info.fieldName];
            if (Array.isArray(field)) return connectionFromArray(field, args);
            return field;
        }

        const result = await joinMonster(info, {}, (sql: string) => context.query(sql));
        return connectionFromArray(result, args);
    }

    public createSQLCondition(type: FilterTypes, field: string, value: Value): string {
        switch (type) {
            case FilterTypes.EQUALS:
                return `${value instanceof Date ? `CAST(${field} AS TIMESTAMP)` : field} = ${DBManager.escape(value)}`;

            case FilterTypes.CONTAINS:
                return `${field} CONTAINING ${DBManager.escape(value)}`;
            case FilterTypes.BEGINS:
                return `${field} STARTING WITH ${DBManager.escape(value)}`;
            case FilterTypes.ENDS:
                return `REVERSE(${field}) STARTING WITH ${DBManager.escape(value)}`;

            case FilterTypes.GREATER:
                return `${value instanceof Date ? `CAST(${field} AS TIMESTAMP)` : field} > ${DBManager.escape(value)}`;
            case FilterTypes.LESS:
                return `${value instanceof Date ? `CAST(${field} AS TIMESTAMP)` : field} < ${DBManager.escape(value)}`;
            default:
                return "";
        }
    }
}