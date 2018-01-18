import {
  GraphQLFloat,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString
} from 'graphql'
import GraphQLDate from 'graphql-date'
import * as dbHelper from '../../database/dbHelper'

let schema

async function createSchema () {
  if (schema) return schema

  let db
  try {
    db = await dbHelper.attach()

    // let result = await dbHelper.query(db, `
    //   SELECT FIRST(20) TRIM(rdb$relation_name)      AS "name"
    //   FROM rdb$relations
    //   WHERE rdb$view_blr IS NULL
    //     AND (rdb$system_flag IS NULL OR rdb$system_flag = 0)
    //   ORDER BY 1
    // `)
    let result = [
      {name: 'GD_PEOPLE'},
      {name: 'GD_CONTACT'},
      {name: 'GD_PLACE'},
      {name: 'WG_POSITION'}
    ]

    let queryFields = {}
    const context = {db, types: []}

    for (let i = 0; i < result.length; i++) {
      const table = result[i]
      queryFields[escape(table.name)] = {
        type: new GraphQLList(await createType(context, table.name))
      }
    }

    return schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Tables',
        fields: () => queryFields
      })
    })
  } catch (error) {
    console.log(error)
  } finally {
    if (db) {
      await dbHelper.detach(db)
    }
  }
}

// async function initICommunicationTypes (db) {
//   let result = await dbHelper.query(db, `
//     SELECT FIRST(20) TRIM(rdb$relation_name)      AS "name"
//     FROM rdb$relations
//     WHERE rdb$view_blr IS NULL
//       AND (rdb$system_flag IS NULL OR rdb$system_flag = 0)
//     ORDER BY 1
//   `)
// }

async function createType (context, toTableName) {
  const duplicate = context.types.find(type => type.name === escape(toTableName))
  if (duplicate) return duplicate

  let tableFieldsTypes = {}
  const type = new GraphQLObjectType({
    name: escape(toTableName),
    description: await getEntityNames(context.db, toTableName),
    interfaces: () => [],
    fields: () => tableFieldsTypes
  })
  context.types.push(type)

  const tableFields = await dbHelper.query(context.db, `
        SELECT
          TRIM(rlf.rdb$field_name)                AS "fieldName",
          nlp_f.usr$name                          AS "name",
          f.rdb$field_type                        AS "fieldType",
          f.rdb$null_flag                         AS "nullFlag",
          TRIM(ref_rel_const.rdb$relation_name)   AS "referenceTable"
        FROM RDB$RELATION_FIELDS rlf
          LEFT JOIN rdb$fields f ON f.rdb$field_name = rlf.rdb$field_source
          LEFT JOIN usr$nlp_fields nlp_f 
            ON nlp_f.usr$relation_name = rlf.rdb$relation_name
            AND nlp_f.usr$field_name = rlf.rdb$field_name
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
      `, [toTableName])

  for (let y = 0; y < tableFields.length; y++) {
    const tableField = tableFields[y]
    console.log(`${toTableName}(${tableField.fieldName}) to ${tableField.referenceTable}`)

    let fieldType
    if (tableField.referenceTable) {
      const duplicate = context.types.find(type => type.name === escape(tableField.referenceTable))
      if (duplicate) {
        fieldType = new GraphQLList(duplicate)
      } else {
        fieldType = new GraphQLList(await createType(context, tableField.referenceTable))
      }
    } else {
      fieldType = convertToGraphQLType(tableField.fieldType)
    }
    if (tableField.nullFlag) fieldType = new GraphQLNonNull(fieldType)

    tableFieldsTypes[escape(tableField.fieldName)] = {
      type: fieldType
    }
  }

  return type
}

async function getEntityNames (db, tableName) {
  let table = await dbHelper.query(db, `
      SELECT
        TRIM(REPLACE(entities.usr$name,  ',', ''))                AS "entityName"
      FROM usr$nlp_tables tables
        LEFT JOIN usr$nlp_entities entities ON entities.usr$table_key = tables.id
      WHERE tables.usr$relation_name = ?
        AND TRIM(REPLACE(entities.usr$name,  ',', '')) > ''
      ORDER BY entities.usr$name
    `, [tableName])

  return table.reduce((prev, cur, index, array) => {
    prev += cur.entityName
    if (index !== array.length - 1) prev += ','
    return prev
  }, '')
}

function convertToGraphQLType (firebirdType) {
  switch (firebirdType) {
    case 7:
    case 8:
    case 16:
      return GraphQLInt
    case 10:
    case 27:
      return GraphQLFloat
    case 12:
    case 13:
    case 35:
      return GraphQLDate
    case 14:
    default:
      return GraphQLString
  }
}

function escape (str) {
  return str.replace(/\$/g, '__')
}

createSchema()

export default createSchema