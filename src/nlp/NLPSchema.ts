import {GraphQLFieldConfigMap, GraphQLList, GraphQLNonNull, GraphQLObjectType} from "graphql";
import {IBase, IContext, IField, ITable, Schema} from "../graphql-bridge";

export interface INLPTable extends ITable {
    fields: INLPField[];
}

export interface INLPField extends IField {
    refs?: IBase[];
}

export default class NLPSchema<GraphQLContext> extends Schema<GraphQLContext> {

    protected _createTypeFields(context: IContext, table: INLPTable): GraphQLFieldConfigMap<void, void> {
        const typeFields = super._createTypeFields(context, table);
        const typeVirtualFields = this._createTypeVirtualFields(context, table);

        return {
            ...typeFields,
            ...typeVirtualFields
        };
    }

    //TODO optimize (cache)
    protected _createTypeVirtualFields(context: IContext, table: INLPTable): GraphQLFieldConfigMap<void, void> {
        return table.fields.reduce((fields, field) => {
            if (!field.refs) return fields;
            let tmp = field.refs.reduce((fields, ref) => {
                const virtualType = new GraphQLObjectType({
                    name: NLPSchema._escapeName(context.tables, `VIRTUAL_${table.name}_${ref.id}`),
                    sqlTable: table.name,
                    uniqueKey: NLPSchema._findPrimaryFieldName(table),
                    description: ref.name,
                    fields: () => {
                        const refFields = table.fields.reduce((fields, field) => {
                            if (field.refs && field.refs.find((item) => item.id === ref.id)) {
                                fields.push(field);
                            }
                            return fields;
                        }, []);
                        const fields = this._createTypePrimitiveFields(refFields);
                        const linkFields = this._createTypeLinkFields(context, table, refFields);
                        return {...fields, ...linkFields};
                    }
                });
                if (!Object.keys(virtualType.getFields()).length) return fields;

                fields[NLPSchema._escapeName(table.fields, `link_${ref.id}`)] = {
                    type: new GraphQLNonNull(virtualType),
                    description: ref.description,
                    args: {
                        where: {type: this._createFilterInputType(context, table)},
                        order: {type: new GraphQLList(this._createSortingInputType(context, table))}
                    },
                    sqlColumn: NLPSchema._findPrimaryFieldName(table),
                    sqlJoin: (parentTable, joinTable) => (
                        `${parentTable}.${this._options.adapter.quote(NLPSchema._findPrimaryFieldName(table))}` +
                        ` = ${joinTable}.${this._options.adapter.quote(NLPSchema._findPrimaryFieldName(table))}`
                    ),
                    where: (tableAlias, args, context) => (
                        this._createSQLWhere(table, tableAlias, args.where, context)
                    ),
                    orderBy: (args) => NLPSchema._createObjectOrderBy(args.order)
                };
                return fields;
            }, {});

            return {
                ...fields,
                ...tmp
            };
        }, {});
    }
}