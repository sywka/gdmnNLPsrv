import {
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLInt,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString
} from 'graphql'
import GraphQLDate from 'graphql-date'

export default class NLPSchema {

  static TYPE_STRING = 'TYPE_STRING'
  static TYPE_BOOLEAN = 'TYPE_BOOLEAN'
  static TYPE_INT = 'TYPE_INT'
  static TYPE_FLOAT = 'TYPE_FLOAT'
  static TYPE_DATE = 'TYPE_DATE'

  constructor (adapter) {
    this._adapter = adapter
    this.getSchema().catch(console.log) //tmp
  }

  static _convertToGraphQLType (type) {
    switch (type) {
      case NLPSchema.TYPE_INT:
        return GraphQLInt
      case NLPSchema.TYPE_FLOAT:
        return GraphQLFloat
      case NLPSchema.TYPE_DATE:
        return GraphQLDate
      case NLPSchema.TYPE_BOOLEAN:
        return GraphQLBoolean
      case NLPSchema.TYPE_STRING:
      default:
        return GraphQLString
    }
  }

  static _indicesToStr (indices) {
    return indices.reduce((prev, cur, index) => {
      if (index) prev += ','
      prev += cur.key
      return prev
    }, '')
  }

  static _escape (str) {
    return str.replace(/\$/g, '__')
  }

  async recreateSchema () {
    this._schema = null
    return await this.getSchema()
  }

  async getSchema () {
    if (this._schema) return this._schema

    const context = {db: null, tables: [], types: [], links: []}
    try {
      context.db = await this._adapter.connectToDB()
      context.tables = await this._adapter.getTables(context)

      let queryFields = {}
      for (let i = 0; i < context.tables.length; i++) {
        const table = context.tables[i]
        queryFields[NLPSchema._escape(table.name)] = {
          type: await this._createType(context, table),
          description: NLPSchema._indicesToStr(table.indices)
        }
      }

      return this._schema = new GraphQLSchema({
        query: new GraphQLObjectType({
          name: 'Tables',
          fields: () => queryFields
        })
      })
    } finally {
      try {
        if (context.db) {
          await
            this._adapter.disconnectFromDB(context)
        }
      } catch (error) {
        console.log(error)
      }
    }
  }

  async _createType (context, table) {
    const duplicate = context.types.find(type => type.name === NLPSchema._escape(table.name))
    if (duplicate) return duplicate

    let tableFieldsTypes = {}
    const type = new GraphQLObjectType({
      name: NLPSchema._escape(table.name),
      description: NLPSchema._indicesToStr(table.indices),
      fields: tableFieldsTypes
    })
    context.types.push(type)

    for (let i = 0; i < table.fields.length; i++) {
      const field = table.fields[i]
      console.log(`${table.name}(${field.name}) to ${field.nameRef}`)

      let fieldType
      if (field.nameRef) {
        const tableRef = context.tables.find((table) => table.name === field.nameRef)
        fieldType = this._createLinkType(context, await this._createType(context, tableRef))
      } else {
        fieldType = NLPSchema._convertToGraphQLType(field.type)
      }

      if (field.nullable) fieldType = new GraphQLNonNull(fieldType)
      tableFieldsTypes[NLPSchema._escape(field.name)] = {
        type: fieldType,
        description: NLPSchema._indicesToStr(field.indices)
      }
    }

    return type
  }

  _createLinkType (context, type) {
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
}