import {
    GraphQLBoolean,
    GraphQLEnumType,
    GraphQLFloat,
    GraphQLID,
    GraphQLInputObjectType,
    GraphQLInt,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLScalarType,
    GraphQLSchema,
    GraphQLString
} from "graphql";
import GraphQLDate from "graphql-date";
import {GraphQLUrl} from "graphql-url";
import {GraphQLFieldConfigMap, GraphQLInputFieldConfigMap, GraphQLResolveInfo} from "graphql/type/definition";
import {connectionArgs, connectionDefinitions, GraphQLConnectionDefinitions} from "graphql-relay";
import Progress from "./Progress";

type ID = number | string;

export interface IBase {
    readonly id: ID;
    readonly name: string;
    description: string;
}

export interface IField extends IBase {
    readonly primary: boolean;
    readonly type: SchemaFieldTypes;
    readonly nonNull: boolean;
    readonly tableNameRef: string;
    readonly fieldNameRef: string;
}

export interface ITable extends IBase {
    readonly fields: IField[];
}

export type Value = string | number | boolean | Date | DateConstructor

export type Args = { [argName: string]: any }

export interface ISchemaAdapter<GraphQLContext> {
    quote(str: string): string;

    getTables(): Promise<ITable[]>;

    resolve(source: any, args: Args, context: GraphQLContext, info: GraphQLResolveInfo): any;

    createSQLCondition(filterType: FilterTypes, tableAlias: string, field: IField, value?: Value): string;
}

export interface ISchemaOptions<GraphQLContext> {
    adapter: ISchemaAdapter<GraphQLContext>;
}

export interface IContext {
    tables: ITable[];
    types: GraphQLObjectType[];
    inputTypes: GraphQLInputObjectType[];
    connections: GraphQLConnectionDefinitions[];
    progress: {
        tableTick: (table: ITable) => void;
    }
}

export default class Schema<GraphQLContext> {

    constructor(options: ISchemaOptions<GraphQLContext>) {
        this._options = options;
    }

    protected _options: ISchemaOptions<GraphQLContext>;

    get options(): ISchemaOptions<GraphQLContext> {
        return this._options;
    }

    protected _schema: GraphQLSchema;

    get schema(): GraphQLSchema {
        return this._schema;
    }

    protected static _convertPrimitiveFieldType(field: IField): GraphQLScalarType {
        if (field.primary) return GraphQLID;
        switch (field.type) {
            case SchemaFieldTypes.BLOB:
                return GraphQLUrl;
            case SchemaFieldTypes.INT:
                return GraphQLInt;
            case SchemaFieldTypes.FLOAT:
                return GraphQLFloat;
            case SchemaFieldTypes.DATE:
                return GraphQLDate;
            case SchemaFieldTypes.BOOLEAN:
                return GraphQLBoolean;
            case SchemaFieldTypes.STRING:
            default:
                return GraphQLString;
        }
    }

    protected static _escapeName(bases: IBase[], name: string): string {
        let replaceValue = "__";
        while (true) {
            const escapedName = name.replace(/\$/g, replaceValue);
            if (escapedName === name) return escapedName;
            if (!bases.find((base) => base.name === escapedName)) {
                return escapedName;
            }
            replaceValue += "_";
        }
    }

    protected static _findPrimaryFieldName(table: ITable): string {
        const field = table.fields.find((field) => field.primary);
        if (field) return field.name;
        return "";
    }

    protected static _findOriginalField(table: ITable, escapedFieldName): IField {
        return table.fields.find((field) => Schema._escapeName(table.fields, field.name) === escapedFieldName);
    }

    protected static _createObjectOrderBy(order: any[]): { [fieldName: string]: string } | null {
        if (!order) return null;
        return order.reduce((object, order) => {
            const tmp = Object.keys(order).reduce((object, key) => {
                object[order[key]] = key;
                return object;
            }, {});
            return {...object, ...tmp};
        }, {});
    }

    protected static _joinConditions(array: any[], separator: string): string {
        if (!array.length) return "";
        if (array.length > 1) return `(${array.join(separator)})`;
        return array.join(separator);
    }

    public async createSchema(hiddenProgress?: boolean): Promise<GraphQLSchema> {
        const total = 100;
        const progress = new Progress(total + 10, hiddenProgress);
        const context: IContext = {
            tables: [],
            types: [],
            inputTypes: [],
            connections: [],
            progress: {
                tableTick: (table: ITable) => {
                    progress.tick(`Creating GraphQL type: ${table.name}`, total / context.tables.length);
                }
            }
        };
        try {
            console.log("Creating GraphQL schema...");

            progress.tick("Reading database _schema...");
            context.tables = await this._options.adapter.getTables();

            progress.tick("Creating GraphQL _schema...", 8);
            this._schema = new GraphQLSchema({
                query: this._createQueryType(context)
            });
            progress.tick("Done.");

            console.log("GraphQL schema created.");

            return this._schema;
        } catch (error) {
            progress.terminate(error.message);
            throw error;
        }
    }

    protected _createSQLWhere(table: ITable, tableAlias: string, where: any, context: GraphQLContext): string {
        if (!where) return "";

        let groupsConditions = Object.keys(where).reduce((groupsConditions, filterName: FilterTypes) => {
            switch (filterName as any) {
                case "not":
                case "or":
                case "and":
                case "isNull":
                    return groupsConditions;
            }

            const filter: any = where[filterName];
            let conditions = [];
            if (Array.isArray(filter)) {
                filter.forEach((item) => {
                    const condition = this._options.adapter.createSQLCondition(
                        filterName,
                        tableAlias,
                        Schema._findOriginalField(table, item)
                    );
                    if (condition) conditions.push(condition);
                });

            } else if (typeof filter === "string") {
                const condition = this._options.adapter.createSQLCondition(
                    filterName,
                    tableAlias,
                    Schema._findOriginalField(table, filter)
                );
                if (condition) conditions.push(condition);

            } else if (typeof filter === "object") {
                conditions = Object.keys(filter).reduce((conditions, fieldName) => {
                    const value: any = filter[fieldName];
                    const condition = this._options.adapter.createSQLCondition(
                        filterName,
                        tableAlias,
                        Schema._findOriginalField(table, fieldName),
                        value
                    );
                    if (condition) conditions.push(condition);
                    return conditions;
                }, conditions);
            }

            if (conditions.length) groupsConditions.push(Schema._joinConditions(conditions, " AND "));
            return groupsConditions;
        }, []);

        if (where.isNull) {
            groupsConditions.push(`${tableAlias}.${this._options.adapter.quote(where.isNull)} IS NULL`);
        }
        if (where.not) {
            const not = where.not.reduce((conditions, item) => {
                conditions.push(this._createSQLWhere(table, tableAlias, item, context));
                return conditions;
            }, []);
            if (not.length) groupsConditions.push(`NOT ${Schema._joinConditions(not, " AND ")}`);
        }
        if (where.or) {
            const or = where.or.reduce((conditions, item) => {
                conditions.push(this._createSQLWhere(table, tableAlias, item, context));
                return conditions;
            }, []);
            if (or.length) groupsConditions.push(Schema._joinConditions(or, " OR "));
        }
        if (where.and) {
            const and = where.and.reduce((conditions, item) => {
                conditions.push(this._createSQLWhere(table, tableAlias, item, context));
                return conditions;
            }, []);
            if (and.length) groupsConditions.push(Schema._joinConditions(and, " AND "));
        }
        return Schema._joinConditions(groupsConditions, " AND ");
    }

    protected _createQueryType(context: IContext): GraphQLObjectType | null {
        const queryType = new GraphQLObjectType({
            name: "Tables",
            fields: () => this._createQueryTypeFields(context)
        });
        if (!Object.keys(queryType.getFields()).length) return null;
        return queryType;
    }

    protected _createQueryTypeFields(context: IContext): GraphQLFieldConfigMap<void, void> {
        return context.tables.reduce((fields, table) => {
            const fieldType = this._createType(context, table);
            if (fieldType) {
                fields[Schema._escapeName(context.tables, table.name)] = {
                    type: this._createConnectionType(context, fieldType),
                    description: table.description,
                    args: {
                        ...connectionArgs,
                        where: {type: this._createFilterInputType(context, table)},
                        order: {type: new GraphQLList(this._createSortingInputType(context, table))}
                    },
                    where: (tableAlias, args, context) => (
                        this._createSQLWhere(table, tableAlias, args.where, context)
                    ),
                    orderBy: (args) => Schema._createObjectOrderBy(args.order),
                    resolve: this._options.adapter.resolve.bind(this._options.adapter)
                };
            }
            return fields;
        }, {});
    }

    protected _createSortingInputType(context: IContext, table: ITable) {
        const duplicate: GraphQLInputObjectType = context.inputTypes.find(type => (
            type.name === `SORTING_${Schema._escapeName(context.tables, table.name)}`
        ));
        if (duplicate) return duplicate;

        const sortingFieldsEnumType = new GraphQLEnumType({
            name: `SORTING_FIELDS_${Schema._escapeName(context.tables, table.name)}`,
            values: table.fields.reduce((values, field) => {
                values[Schema._escapeName(table.fields, field.name)] = {
                    value: field.name,
                    description: field.description
                };
                return values;
            }, {})
        });

        const inputType = new GraphQLInputObjectType({
            name: `SORTING_${Schema._escapeName(context.tables, table.name)}`,
            fields: () => ({
                asc: {type: sortingFieldsEnumType},
                desc: {type: sortingFieldsEnumType}
            })
        });
        context.inputTypes.push(inputType);
        return inputType;
    }

    protected _createFilterInputType(context: IContext, table: ITable): GraphQLInputObjectType {
        const duplicate: GraphQLInputObjectType = context.inputTypes.find(type => (
            type.name === `FILTER_${Schema._escapeName(context.tables, table.name)}`
        ));
        if (duplicate) return duplicate;

        const inputType = new GraphQLInputObjectType({
            name: `FILTER_${Schema._escapeName(context.tables, table.name)}`,
            fields: () => this._createFilterInputTypeFields(context, table, inputType)
        });
        context.inputTypes.push(inputType);
        return inputType;
    }

    protected _createFilterInputTypeFields(context: IContext, table: ITable, inputType: GraphQLInputObjectType): GraphQLInputFieldConfigMap {
        const equalsType = new GraphQLInputObjectType({
            name: `EQUALS_${Schema._escapeName(context.tables, table.name)}`,
            fields: table.fields.reduce((fields, field) => {
                switch (field.type) {
                    case SchemaFieldTypes.BLOB:
                        break;
                    default:
                        fields[Schema._escapeName(table.fields, field.name)] = {
                            type: Schema._convertPrimitiveFieldType(field),
                            description: field.description
                        };
                }
                return fields;
            }, {})
        });

        const containsType = new GraphQLInputObjectType({
            name: `CONTAINS_${Schema._escapeName(context.tables, table.name)}`,
            fields: table.fields.reduce((fields, field) => {
                switch (field.type) {
                    case SchemaFieldTypes.STRING:
                        fields[Schema._escapeName(table.fields, field.name)] = {
                            type: Schema._convertPrimitiveFieldType(field),
                            description: field.description
                        };
                        break;
                }
                return fields;
            }, {})
        });

        const nullableFieldsEnumType = new GraphQLEnumType({
            name: `IS_NULL_FIELDS_${Schema._escapeName(context.tables, table.name)}`,
            values: table.fields.reduce((values, field) => {
                if (!field.nonNull) {
                    values[Schema._escapeName(table.fields, field.name)] = {
                        value: field.name,
                        description: field.description
                    };
                }
                return values;
            }, {})
        });

        const emptyFieldsEnumType = new GraphQLEnumType({
            name: `IS_EMPTY_FIELDS_${Schema._escapeName(context.tables, table.name)}`,
            values: table.fields.reduce((values, field) => {
                switch (field.type) {
                    case SchemaFieldTypes.BLOB:
                    case SchemaFieldTypes.STRING:
                        values[Schema._escapeName(table.fields, field.name)] = {
                            value: field.name,
                            description: field.description
                        };
                }
                return values;
            }, {})
        });

        const beginsOrEndsType = new GraphQLInputObjectType({
            name: `BEGINS_OR_ENDS_${Schema._escapeName(context.tables, table.name)}`,
            fields: table.fields.reduce((fields, field) => {
                switch (field.type) {
                    case SchemaFieldTypes.STRING:
                        fields[Schema._escapeName(table.fields, field.name)] = {
                            type: Schema._convertPrimitiveFieldType(field),
                            description: field.description
                        };
                        break;
                }
                return fields;
            }, {})
        });

        const greaterOrLessType = new GraphQLInputObjectType({
            name: `GREATER_OR_LESS_${Schema._escapeName(context.tables, table.name)}`,
            fields: table.fields.reduce((fields, field) => {
                switch (field.type) {
                    case SchemaFieldTypes.DATE:
                    case SchemaFieldTypes.INT:
                    case SchemaFieldTypes.FLOAT:
                        fields[Schema._escapeName(table.fields, field.name)] = {
                            type: Schema._convertPrimitiveFieldType(field),
                            description: field.description
                        };
                        break;
                }
                return fields;
            }, {})
        });

        return {
            ...Object.keys(equalsType.getFields()).length ? {
                [FilterTypes.EQUALS]: {type: equalsType}
            } : {},
            ...Object.keys(containsType.getFields()).length ? {
                [FilterTypes.CONTAINS]: {type: containsType}
            } : {},
            ...Object.keys(beginsOrEndsType.getFields()).length ? {
                [FilterTypes.BEGINS]: {type: beginsOrEndsType},
                [FilterTypes.ENDS]: {type: beginsOrEndsType}
            } : {},
            ...Object.keys(greaterOrLessType.getFields()).length ? {
                [FilterTypes.GREATER]: {type: greaterOrLessType},
                [FilterTypes.LESS]: {type: greaterOrLessType}
            } : {},
            ...nullableFieldsEnumType.getValues().length ? {
                isNull: {type: nullableFieldsEnumType}
            } : {},
            ...emptyFieldsEnumType.getValues().length ? {
                isEmpty: {type: emptyFieldsEnumType}
            } : {},
            or: {type: new GraphQLList(inputType)},
            and: {type: new GraphQLList(inputType)},
            not: {type: new GraphQLList(inputType)}
        };
    }

    protected _createConnectionType(context: IContext, type: GraphQLObjectType): GraphQLObjectType {
        const name = Schema._escapeName(context.tables, type.name);
        let connection = context.connections.find((connection) => (
            connection.connectionType.name === name + "Connection"
        ));
        if (connection) return connection.connectionType;

        connection = connectionDefinitions({
            name,
            nodeType: type,
            connectionFields: {
                total: {type: GraphQLInt}
            }
        });
        context.connections.push(connection);

        return connection.connectionType;
    }

    protected _createType(context: IContext, table: ITable): GraphQLObjectType | null {
        const duplicate: GraphQLObjectType = context.types.find(type => (
            type.name === Schema._escapeName(context.tables, table.name)
        ));
        if (duplicate) return duplicate;

        context.progress.tableTick(table);
        const type: GraphQLObjectType = new GraphQLObjectType({
            name: Schema._escapeName(context.tables, table.name),
            sqlTable: table.name,
            uniqueKey: Schema._findPrimaryFieldName(table),
            description: table.description,
            fields: () => this._createTypeFields(context, table)
        });
        context.types.push(type);

        if (!Object.keys(type.getFields()).length) return null;
        return type;
    }

    protected _createTypeFields(context: IContext, table: ITable): GraphQLFieldConfigMap<void, void> {
        const fields = this._createTypePrimitiveFields(table.fields);
        const linkFields = this._createTypeLinkFields(context, table, table.fields);

        return {
            ...fields,
            ...linkFields
        };
    }

    protected _createTypeLinkFields(context: IContext, table: ITable, fields: IField[]): GraphQLFieldConfigMap<void, void> {
        return fields.reduce((resultFields, field) => {
            if (field.tableNameRef) {
                const tableRef = context.tables.find((table) => (
                    table.name === Schema._escapeName(context.tables, field.tableNameRef)
                ));
                if (tableRef) {
                    const fieldName = Schema._escapeName(fields, `link_${field.name}`);
                    const fieldType = this._createType(context, tableRef);
                    const connectFieldType = this._createConnectionType(context, fieldType);

                    if (fieldType) {
                        resultFields[fieldName] = {
                            type: field.nonNull ? new GraphQLNonNull(connectFieldType) : connectFieldType,
                            description: field.description,
                            args: {
                                ...connectionArgs,
                                where: {type: this._createFilterInputType(context, tableRef)},
                                order: {type: new GraphQLList(this._createSortingInputType(context, tableRef))}
                            },
                            resolve: this._options.adapter.resolve.bind(this._options.adapter),
                            sqlColumn: field.name,
                            sqlJoin: (parentTable, joinTable) => (
                                `${parentTable}.${this._options.adapter.quote(field.name)}` +
                                ` = ${joinTable}.${this._options.adapter.quote(field.fieldNameRef)}`
                            ),
                            where: (tableAlias, args, context) => (
                                this._createSQLWhere(table, tableAlias, args.where, context)
                            ),
                            orderBy: (args) => Schema._createObjectOrderBy(args.order)
                        };
                    }
                }
            }
            return resultFields;
        }, {});
    }

    protected _createTypePrimitiveFields(fields: IField[]): GraphQLFieldConfigMap<void, void> {
        return fields.reduce((resultFields, field) => {
            const fieldName = Schema._escapeName(fields, field.name);
            const fieldType = Schema._convertPrimitiveFieldType(field);

            resultFields[fieldName] = {
                type: field.nonNull ? new GraphQLNonNull(fieldType) : fieldType,
                description: field.description,
                resolve: this._options.adapter.resolve.bind(this._options.adapter),
                sqlColumn: field.name
            };
            return resultFields;
        }, {});
    }
}

export enum SchemaFieldTypes {
    BOOLEAN, STRING, INT, FLOAT, DATE, BLOB
}

export enum FilterTypes {
    EQUALS = "equals",

    IS_EMPTY = "isEmpty",
    CONTAINS = "contains",
    BEGINS = "begins",
    ENDS = "ends",

    GREATER = "greater",
    LESS = "less"
}