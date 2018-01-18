import { GraphQLFloat, GraphQLInt, GraphQLNonNull, GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql'
import GraphQLDate from 'graphql-date'
import * as dbHelper from '../../database/dbHelper'
import { getTablesTest } from '../../database/queries'

let schema

async function createSchema () {
  if (schema) return schema

  let db
  try {
    db = await dbHelper.attach()

    const context = {db, tables: [], types: [], links: []}
    context.tables = await getTablesTest(context)

    let queryFields = {}
    for (let i = 0; i < context.tables.length; i++) {
      const table = context.tables[i]
      queryFields[escape(table.name)] = {
        type: await createType(context, table),
        description: indicesToStr(table.indices)
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
    try {
      await dbHelper.detach(db)
    } catch (error) {
      console.log(error)
    }
  }
}

async function createType (context, table) {
  const duplicate = context.types.find(type => type.name === escape(table.name))
  if (duplicate) return duplicate

  let tableFieldsTypes = {}
  const type = new GraphQLObjectType({
    name: escape(table.name),
    description: indicesToStr(table.indices),
    fields: tableFieldsTypes
  })
  context.types.push(type)

  for (let i = 0; i < table.fields.length; i++) {
    const tableField = table.fields[i]
    console.log(`${table.name}(${tableField.name}) to ${tableField.tableNameRef}`)

    let fieldType
    if (tableField.tableNameRef) {
      const tableRef = context.tables.find((table) => table.name === tableField.tableNameRef)
      fieldType = createLinkType(context, await createType(context, tableRef))
    } else {
      fieldType = convertToGraphQLType(tableField.type)
    }

    if (tableField.nullFlag) fieldType = new GraphQLNonNull(fieldType)
    tableFieldsTypes[escape(tableField.name)] = {
      type: fieldType,
      description: indicesToStr(tableField.indices)
    }
  }

  return type
}

function createLinkType (context, type) {
  return type
  console.log(type.name)
  const name = `link_to_${type.name}`
  let link = context.links.find((link) => link.name === name)
  if (!link) {
    link = new GraphQLObjectType({
      name: name,
      fields: () => ({
        link: {type}
      })
    })
    context.links.push(link)
  }
  return link
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

function indicesToStr (indices) {
  return indices.reduce((prev, cur, index) => {
    if (index) prev += ','
    prev += cur.key
    return prev
  }, '')
}

function escape (str) {
  return str.replace(/\$/g, '__')
}

createSchema()

export default createSchema