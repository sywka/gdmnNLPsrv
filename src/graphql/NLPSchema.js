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

  static TYPE_BOOLEAN = 'TYPE_BOOLEAN'
  static TYPE_STRING = 'TYPE_STRING'
  static TYPE_INT = 'TYPE_INT'
  static TYPE_FLOAT = 'TYPE_FLOAT'
  static TYPE_DATE = 'TYPE_DATE'

  constructor (options) {
    this._adapter = options.adapter
    this._emulatedLinkCoder = options.emulatedLinkCoder || ((table, field, ref) => `EMULATED_LINK_${ref.id}`)
    this._emulatedEntityCoder = options.emulatedEntityCoder || ((table, field, ref) => `EMULATED_${table.name}_${ref.id}`)

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
    return indices.reduce((strOfIndices, index, i) => {
      if (i) strOfIndices += ','
      strOfIndices += index.key
      return strOfIndices
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
      return this._schema = this._createSchema(context)
    } finally {
      try {
        if (context.db) {
          await this._adapter.disconnectFromDB(context)
        }
      } catch (error) {
        console.log(error)
      }
    }
  }

  _createSchema (context) {
    return new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Tables',
        fields: () => context.tables.reduce((fields, table) => {
          fields[NLPSchema._escape(table.name)] = {
            type: this._createType(context, table),
            description: NLPSchema._indicesToStr(table.indices)
          }
          return fields
        }, {})
      })
    })
  }

  _createType (context, table) {
    const duplicate = context.types.find(type => type.name === NLPSchema._escape(table.name))
    if (duplicate) return duplicate

    const type = new GraphQLObjectType({
      name: NLPSchema._escape(table.name),
      description: NLPSchema._indicesToStr(table.indices),
      fields: () => table.fields.reduce((fields, tableField) => {
        console.log(`${table.name}(${tableField.name}) to ${tableField.nameRef}`)

        let fieldType
        if (tableField.nameRef) {
          const tableRef = context.tables.find((table) => table.name === tableField.nameRef)
          if (!tableRef) return fields

          fieldType = this._createLinkType(context, this._createType(context, tableRef))
        } else {
          fieldType = NLPSchema._convertToGraphQLType(tableField.type)
          fields = {...fields, ...this._createEmulatedLinkFields(context, table, tableField)}
        }

        if (tableField.nonNull) fieldType = new GraphQLNonNull(fieldType)
        fields[NLPSchema._escape(tableField.name)] = {
          type: fieldType,
          description: NLPSchema._indicesToStr(tableField.indices)
        }
        return fields
      }, {})
    })
    context.types.push(type)
    return type
  }

  _createEmulatedLinkFields (context, table, field) {   //TODO optimize (cache)
    return field.refs.reduce((fields, ref) => {
      fields[this._emulatedLinkCoder(table, field, ref)] = {
        type: new GraphQLObjectType({
          name: this._emulatedEntityCoder(table, field, ref),
          description: ref.description,
          fields: () => table.fields.reduce((fields, tableField) => {
            if (tableField.refs.find((item) => item.id === ref.id)) {
              fields[NLPSchema._escape(tableField.name)] = {
                type: NLPSchema._convertToGraphQLType(tableField.type),
                description: NLPSchema._indicesToStr(tableField.indices)
              }
            }
            return fields
          }, {})
        }),
        description: NLPSchema._indicesToStr(ref.indices)
      }
      return fields
    }, {})
  }

  _createLinkType (context, type) {
    return type
    console.log(type.name)
    const name = `LINK_TO_${type.name}`
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