import * as NestHydrationJS from 'nesthydrationjs';
import joinMonster from 'join-monster'
import {Database} from "node-firebird";
import {GraphQLResolveInfo} from "graphql/type/definition";
import * as dbHelper from './dbHelper';
import {Adapter, Context, FilterTypes, NLPSchemaTypes, Table} from "../graphql/NLPSchema";

export class FBAdapter implements Adapter<Database> {

    private static _convertType(type: number): NLPSchemaTypes {
        switch (type) {
            case 7:
            case 8:
            case 16:
                return NLPSchemaTypes.TYPE_INT;
            case 10:
            case 11:
            case 27:
                return NLPSchemaTypes.TYPE_FLOAT;
            case 12:
            case 13:
            case 35:
                return NLPSchemaTypes.TYPE_DATE;
            case 14:
            case 37:
            case 40:
            default:
                return NLPSchemaTypes.TYPE_STRING;
        }
    }

    public async connectToDB(): Promise<Database> {
        return await dbHelper.attach()
    }

    public async disconnectFromDB(context: Context<Database>): Promise<void> {
        await dbHelper.detach(context.db)
    }

    public async getTables(context: Context<Database>): Promise<Table[]> {
        const result: any[] = await dbHelper.query(context.db, `
          SELECT
            TRIM(r.rdb$relation_name)                                   AS "tableName",
            TRIM(rlf.rdb$relation_name) 
              || '_' || TRIM(rlf.rdb$field_name)                        AS "fieldKey",
            TRIM(rlf.rdb$field_name)                                    AS "fieldName",
            f.rdb$field_type                                            AS "fieldType",
            IIF(constPrim.rdb$constraint_type = 'PRIMARY KEY', 1, null) AS "primaryFlag",
            f.rdb$null_flag                                             AS "nullFlag",
            TRIM(ref_rel_const.rdb$relation_name)                       AS "relationName",
            TRIM(seg.rdb$field_name)                                    AS "relationFieldName",
            
            TRIM(REPLACE(entities.usr$name,  ',', ''))                  AS "tableIndexName",
            TRIM(REPLACE(attr.usr$name,  ',', ''))                      AS "fieldIndexName",
            ref_type.id                                                 AS "refKey",
            ref_type.usr$description                                    AS "refDescription",
            TRIM(REPLACE(ref_type_detail.usr$name,  ',', ''))           AS "refTypeIndexName"
            
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
                    
            LEFT JOIN usr$nlp_table tables ON tables.usr$relation_name = r.rdb$relation_name
              LEFT JOIN usr$nlp_tentities entities
                ON entities.usr$table_key = tables.id
                AND TRIM(REPLACE(entities.usr$name,  ',', '')) > ''
              LEFT JOIN usr$nlp_field fields
                ON fields.usr$table_key = tables.id
                AND fields.usr$field_name = rlf.rdb$field_name
                LEFT JOIN usr$nlp_tentities_attr attr
                  ON attr.usr$field_key = fields.id
                  AND TRIM(REPLACE(attr.usr$name,  ',', '')) > ''
                LEFT JOIN usr$nlp_field_ref field_ref ON field_ref.USR$FIELD_KEY = fields.ID
                  LEFT JOIN usr$nlp_ref_type ref_type ON ref_type.id = field_ref.usr$ref_type_key
                    LEFT JOIN usr$nlp_ref_type_detail ref_type_detail
                      ON ref_type_detail.usr$ref_type_key = ref_type.id
                      AND TRIM(REPLACE(ref_type_detail.usr$name,  ',', '')) > ''
                      
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
            name: {column: 'tableName', id: true},
            indices: [{
                key: 'tableIndexName'
            }],
            fields: [{
                id: {column: 'fieldKey', id: true},
                name: 'fieldName',
                primary: {column: 'primaryFlag', type: 'BOOLEAN', default: false},
                indices: [{
                    key: 'fieldIndexName'
                }],
                type: {column: 'fieldType', type: FBAdapter._convertType},
                nonNull: {column: 'nullFlag', type: 'BOOLEAN', default: false},
                tableNameRef: 'relationName',
                fieldNameRef: 'relationFieldName',
                refs: [{
                    id: {column: 'refKey', type: 'NUMBER'},
                    description: 'refDescription',
                    indices: [{
                        key: 'refTypeIndexName'
                    }]
                }]
            }]
        }];

        return NestHydrationJS().nest(result, definition);
    }

    async resolve(source: any, args: any, context: any, info: GraphQLResolveInfo) {
        return joinMonster(info, {}, sql => {
            console.log(sql);
            return dbHelper.query(context.db, sql)
        })
    }

    public createSQLCondition(type: FilterTypes, field: string, value: any): string {
        switch (type) {
            case FilterTypes.TYPE_EQUALS:
                if (value instanceof Date) return `CAST (${field} AS TIMESTAMP) = ${dbHelper.escape(value)}`;
                return `${field} = ${dbHelper.escape(value)}`;
            case FilterTypes.TYPE_NOT_EQUALS:
                if (value instanceof Date) return `CAST (${field} AS TIMESTAMP) != ${dbHelper.escape(value)}`;
                return `${field} = ${dbHelper.escape(value)}`;
            case FilterTypes.TYPE_CONTAINS:
                return `${field} CONTAINING ${dbHelper.escape(value)}`;
            case FilterTypes.TYPE_NOT_CONTAINS:
                return `${field} NOT CONTAINING ${dbHelper.escape(value)}`;
            default:
                return ''
        }
    }
}