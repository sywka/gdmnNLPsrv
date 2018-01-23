"use strict";
var __assign = (this && this.__assign) || Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
    }
    return t;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = y[op[0] & 2 ? "return" : op[0] ? "throw" : "next"]) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [0, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var graphql_1 = require("graphql");
var GraphQLDate = require("graphql-date");
var NLPSchema = /** @class */ (function () {
    function NLPSchema(options) {
        this.adapter = options.adapter;
        this.emulatedLinkCoder = options.emulatedLinkCoder || (function (table, field, ref) { return "EMULATED_LINK_" + ref.id; });
        this.emulatedEntityCoder = options.emulatedEntityCoder || (function (table, field, ref) { return "EMULATED_" + table.name + "_" + ref.id; });
        this.getSchema().catch(console.log); //tmp
    }
    NLPSchema._convertToGraphQLType = function (type) {
        switch (type) {
            case NLPSchemaTypes.TYPE_INT:
                return graphql_1.GraphQLInt;
            case NLPSchemaTypes.TYPE_FLOAT:
                return graphql_1.GraphQLFloat;
            case NLPSchemaTypes.TYPE_DATE:
                return GraphQLDate;
            case NLPSchemaTypes.TYPE_BOOLEAN:
                return graphql_1.GraphQLBoolean;
            case NLPSchemaTypes.TYPE_STRING:
            default:
                return graphql_1.GraphQLString;
        }
    };
    NLPSchema._indicesToStr = function (indices) {
        return indices.reduce(function (strOfIndices, index, i) {
            if (i)
                strOfIndices += ',';
            strOfIndices += index.key;
            return strOfIndices;
        }, '');
    };
    NLPSchema._escape = function (str) {
        return str.replace(/\$/g, '__');
    };
    NLPSchema.prototype.recreateSchema = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.schema = null;
                        return [4 /*yield*/, this.getSchema()];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    NLPSchema.prototype.getSchema = function () {
        return __awaiter(this, void 0, void 0, function () {
            var context, _a, _b, error_1;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (this.schema)
                            return [2 /*return*/, this.schema];
                        context = { db: null, tables: [], types: [] };
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, , 4, 9]);
                        _a = context;
                        return [4 /*yield*/, this.adapter.connectToDB()];
                    case 2:
                        _a.db = _c.sent();
                        _b = context;
                        return [4 /*yield*/, this.adapter.getTables(context)];
                    case 3:
                        _b.tables = _c.sent();
                        return [2 /*return*/, this.schema = this._createSchema(context)];
                    case 4:
                        _c.trys.push([4, 7, , 8]);
                        if (!context.db) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.adapter.disconnectFromDB(context)];
                    case 5:
                        _c.sent();
                        _c.label = 6;
                    case 6: return [3 /*break*/, 8];
                    case 7:
                        error_1 = _c.sent();
                        console.log(error_1);
                        return [3 /*break*/, 8];
                    case 8: return [7 /*endfinally*/];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    NLPSchema.prototype._createSchema = function (context) {
        var _this = this;
        return new graphql_1.GraphQLSchema({
            query: new graphql_1.GraphQLObjectType({
                name: 'Tables',
                fields: function () { return context.tables.reduce(function (fields, table) {
                    fields[NLPSchema._escape(table.name)] = {
                        type: new graphql_1.GraphQLNonNull(new graphql_1.GraphQLList(_this._createType(context, table))),
                        description: NLPSchema._indicesToStr(table.indices)
                    };
                    return fields;
                }, {}); }
            })
        });
    };
    NLPSchema.prototype._createType = function (context, table) {
        var _this = this;
        var duplicate = context.types.find(function (type) { return type.name === NLPSchema._escape(table.name); });
        if (duplicate)
            return duplicate;
        var type = new graphql_1.GraphQLObjectType({
            name: NLPSchema._escape(table.name),
            description: NLPSchema._indicesToStr(table.indices),
            fields: function () { return table.fields.reduce(function (fields, tableField) {
                console.log(table.name + "(" + tableField.name + ") to " + tableField.nameRef);
                var fieldType;
                if (tableField.nameRef) {
                    var tableRef = context.tables.find(function (table) { return table.name === tableField.nameRef; });
                    if (!tableRef)
                        return fields;
                    fieldType = new graphql_1.GraphQLList(_this._createType(context, tableRef));
                }
                else {
                    fieldType = NLPSchema._convertToGraphQLType(tableField.type);
                    fields = __assign({}, fields, _this._createEmulatedLinkFields(context, table, tableField));
                }
                if (tableField.nonNull)
                    fieldType = new graphql_1.GraphQLNonNull(fieldType);
                fields[NLPSchema._escape(tableField.name)] = {
                    type: fieldType,
                    description: NLPSchema._indicesToStr(tableField.indices)
                };
                return fields;
            }, {}); }
        });
        context.types.push(type);
        return type;
    };
    //TODO optimize (cache)
    NLPSchema.prototype._createEmulatedLinkFields = function (context, table, field) {
        var _this = this;
        return field.refs.reduce(function (fields, ref) {
            fields[_this.emulatedLinkCoder(table, field, ref)] = {
                type: new graphql_1.GraphQLObjectType({
                    name: _this.emulatedEntityCoder(table, field, ref),
                    description: ref.description,
                    fields: function () { return table.fields.reduce(function (fields, tableField) {
                        if (tableField.refs.find(function (item) { return item.id === ref.id; })) {
                            fields[NLPSchema._escape(tableField.name)] = {
                                type: NLPSchema._convertToGraphQLType(tableField.type),
                                description: NLPSchema._indicesToStr(tableField.indices)
                            };
                        }
                        return fields;
                    }, {}); }
                }),
                description: NLPSchema._indicesToStr(ref.indices)
            };
            return fields;
        }, {});
    };
    return NLPSchema;
}());
exports.NLPSchema = NLPSchema;
var NLPSchemaTypes;
(function (NLPSchemaTypes) {
    NLPSchemaTypes[NLPSchemaTypes["TYPE_BOOLEAN"] = 0] = "TYPE_BOOLEAN";
    NLPSchemaTypes[NLPSchemaTypes["TYPE_STRING"] = 1] = "TYPE_STRING";
    NLPSchemaTypes[NLPSchemaTypes["TYPE_INT"] = 2] = "TYPE_INT";
    NLPSchemaTypes[NLPSchemaTypes["TYPE_FLOAT"] = 3] = "TYPE_FLOAT";
    NLPSchemaTypes[NLPSchemaTypes["TYPE_DATE"] = 4] = "TYPE_DATE";
})(NLPSchemaTypes = exports.NLPSchemaTypes || (exports.NLPSchemaTypes = {}));
//# sourceMappingURL=NLPSchema.js.map