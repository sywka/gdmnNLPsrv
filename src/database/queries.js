import NestHydrationJS from 'nesthydrationjs'
import * as dbHelper from './dbHelper'

export async function getTablesTest (context) {
  const result = await dbHelper.query(context.db, `
    SELECT
      TRIM(r.rdb$relation_name)                          AS "tableName",
      TRIM(rlf.rdb$field_name)                           AS "fieldName",
      f.rdb$field_type                                   AS "fieldType",
      f.rdb$null_flag                                    AS "nullFlag",
      TRIM(ref_rel_const.rdb$relation_name)              AS "relationName",
      
      TRIM(REPLACE(entities.usr$name,  ',', ''))         AS "tableIndexName",
      TRIM(REPLACE(attr.usr$name,  ',', ''))             AS "fieldIndexName",
      ref_type.id                                        AS "refKey",
      ref_type.usr$description                           AS "refDescription",
      TRIM(REPLACE(ref_type_detail.usr$name,  ',', ''))  AS "refTypeIndexName"
      
    FROM rdb$relations r

      LEFT JOIN rdb$relation_fields rlf ON rlf.rdb$relation_name = r.rdb$relation_name
        LEFT JOIN rdb$fields f ON f.rdb$field_name = rlf.rdb$field_source
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
      
      AND (r.rdb$relation_name = 'GD_PEOPLE'
        OR r.rdb$relation_name = 'GD_CONTACT'
        OR r.rdb$relation_name = 'GD_PLACE'
        OR r.rdb$relation_name = 'WG_POSITION')

    ORDER BY r.rdb$relation_name
  `)

  const definition = [{
    name: {column: 'tableName', type: 'STRING', id: true},
    indices: [{
      key: 'tableIndexName'
    }],
    fields: [{
      name: {column: 'fieldName', type: 'STRING', id: true},
      indices: [{
        key: 'fieldIndexName'
      }],
      type: 'fieldType',
      nullFlag: 'nullFlag',
      tableNameRef: 'relationName',
      refs: [{
        id: 'refKey',
        description: 'refDescription',
        indices: [{
          key: 'refTypeIndexName'
        }]
      }]
    }]
  }]

  return NestHydrationJS().nest(result, definition)
}

export async function getTables (context) {
  return [
    {name: 'GD_PEOPLE'},
    {name: 'GD_CONTACT'},
    {name: 'GD_PLACE'},
    {name: 'WG_POSITION'}
  ]
  return await dbHelper.query(context.db, `
    SELECT TRIM(rdb$relation_name)      AS "name"
    FROM rdb$relations
    WHERE rdb$view_blr IS NULL
      AND (rdb$system_flag IS NULL OR rdb$system_flag = 0)
    ORDER BY 1
  `)
}

export async function getTableFields (context, tableName) {
  return await dbHelper.query(context.db, `
        SELECT
          TRIM(rlf.rdb$field_name)                AS "fieldName",
          f.rdb$field_type                        AS "fieldType",
          f.rdb$null_flag                         AS "nullFlag",
          TRIM(ref_rel_const.rdb$relation_name)   AS "toTableName"
        FROM RDB$RELATION_FIELDS rlf
          LEFT JOIN rdb$fields f ON f.rdb$field_name = rlf.rdb$field_source
          LEFT JOIN rdb$relation_constraints const
            ON const.rdb$relation_name = rlf.rdb$relation_name
            AND const.rdb$constraint_type = 'FOREIGN KEY'
            AND EXISTS(
              SELECT *
              FROM rdb$index_segments i
              WHERE i.RDB$FIELD_NAME = rlf.rdb$field_name
                AND i.RDB$INDEX_NAME = const.RDB$INDEX_NAME
            )
            LEFT JOIN rdb$ref_constraints ref_ref_const
              ON ref_ref_const.rdb$constraint_name = const.rdb$constraint_name
                LEFT JOIN rdb$relation_constraints ref_rel_const
                  ON ref_rel_const.rdb$constraint_name = ref_ref_const.rdb$const_name_uq
        WHERE rlf.RDB$RELATION_NAME = ?
        ORDER BY 1
      `, [tableName])
}

export async function getTableFieldsRefTypes (context, table) {  //FIXME BLOB
  let result = await dbHelper.query(context.db, `
      SELECT
        TRIM(fields.usr$field_name)     AS "fieldName",
        ref_type.id                     AS "refKey",
        ref_type.usr$description        AS "refDescription",
        CAST(LIST(TRIM(REPLACE(ref_type_detail.usr$name,  ',', ''))) AS VARCHAR(8000)) AS "names"   --FIXME BLOB
      FROM usr$nlp_table tables
        LEFT JOIN usr$nlp_field fields ON fields.usr$table_key = tables.id
          LEFT JOIN usr$nlp_field_ref field_ref ON field_ref.USR$FIELD_KEY = fields.ID
            LEFT JOIN usr$nlp_ref_type ref_type ON ref_type.id = field_ref.usr$ref_type_key
              LEFT JOIN usr$nlp_ref_type_detail ref_type_detail ON ref_type_detail.usr$ref_type_key = ref_type.id
      WHERE
        tables.usr$relation_name = ?
        AND TRIM(REPLACE(ref_type_detail.usr$name,  ',', '')) > ''
      GROUP BY
        fields.usr$field_name, ref_type.id, ref_type.usr$description
      ORDER BY TRIM(fields.usr$field_name)
    `, [table])

  const definition = [{
    fieldName: 'fieldName',
    refs: [{
      id: {column: 'refKey', type: 'NUMBER'},
      description: 'refDescription',
      names: 'names'
    }]
  }]

  return NestHydrationJS().nest(result, definition)
}

export async function getTableEntityNames (context, tableName) { //FIXME BLOB
  let table = await dbHelper.query(context.db, `
      SELECT
        CAST(LIST(TRIM(REPLACE(entities.usr$name,  ',', ''))) AS VARCHAR(8000))    AS "names"   --FIXME BLOB
      FROM usr$nlp_table tables
        LEFT JOIN usr$nlp_tentities entities ON entities.usr$table_key = tables.id
      WHERE tables.usr$relation_name = ?
        AND TRIM(REPLACE(entities.usr$name,  ',', '')) > ''
    `, [tableName])
  return table[0].names
}

export async function getTableAttrNames (context, tableName, fieldName) {  //FIXME BLOB
  let attr = await dbHelper.query(context.db, `
      SELECT
        CAST(LIST(TRIM(REPLACE(attr.usr$name,  ',', ''))) AS VARCHAR(8000))    AS "names"   --FIXME BLOB
      FROM usr$nlp_table tables
        LEFT JOIN usr$nlp_field fields ON fields.usr$table_key = tables.id
          LEFT JOIN usr$nlp_tentities_attr attr ON attr.usr$field_key = fields.id
      WHERE tables.usr$relation_name = ?
        AND fields.usr$field_name = ?
        AND TRIM(REPLACE(attr.usr$name,  ',', '')) > ''
    `, [tableName, fieldName])
  return attr[0].names
}