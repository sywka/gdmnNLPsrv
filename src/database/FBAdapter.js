"use strict";
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
var NestHydrationJS = require("nesthydrationjs");
var dbHelper = require("./dbHelper");
var NLPSchema_1 = require("../graphql/NLPSchema");
var FBAdapter = /** @class */ (function () {
    function FBAdapter() {
    }
    FBAdapter._convertType = function (type) {
        switch (type) {
            case 7:
            case 8:
            case 16:
                return NLPSchema_1.NLPSchemaTypes.TYPE_INT;
            case 10:
            case 11:
            case 27:
                return NLPSchema_1.NLPSchemaTypes.TYPE_FLOAT;
            case 12:
            case 13:
            case 35:
                return NLPSchema_1.NLPSchemaTypes.TYPE_DATE;
            case 14:
            case 37:
            case 40:
            default:
                return NLPSchema_1.NLPSchemaTypes.TYPE_STRING;
        }
    };
    FBAdapter.prototype.connectToDB = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, dbHelper.attach()];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    FBAdapter.prototype.disconnectFromDB = function (context) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, dbHelper.detach(context.db)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    FBAdapter.prototype.getTables = function (context) {
        return __awaiter(this, void 0, void 0, function () {
            var result, definition;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, dbHelper.query(context.db, "\n          SELECT\n            TRIM(r.rdb$relation_name)                          AS \"tableName\",\n            CAST(TRIM(rlf.rdb$relation_name) \n              || '_' || TRIM(rlf.rdb$field_name) \n              AS VARCHAR(62))                                  AS \"fieldKey\",\n            TRIM(rlf.rdb$field_name)                           AS \"fieldName\",\n            f.rdb$field_type                                   AS \"fieldType\",\n            f.rdb$null_flag                                    AS \"nullFlag\",\n            TRIM(ref_rel_const.rdb$relation_name)              AS \"relationName\",\n            \n            TRIM(REPLACE(entities.usr$name,  ',', ''))         AS \"tableIndexName\",\n            TRIM(REPLACE(attr.usr$name,  ',', ''))             AS \"fieldIndexName\",\n            ref_type.id                                        AS \"refKey\",\n            ref_type.usr$description                           AS \"refDescription\",\n            TRIM(REPLACE(ref_type_detail.usr$name,  ',', ''))  AS \"refTypeIndexName\"\n            \n          FROM rdb$relations r\n          \n            LEFT JOIN rdb$relation_fields rlf ON rlf.rdb$relation_name = r.rdb$relation_name\n              LEFT JOIN rdb$fields f ON f.rdb$field_name = rlf.rdb$field_source\n              LEFT JOIN rdb$relation_constraints const\n                ON const.rdb$relation_name = rlf.rdb$relation_name\n                AND const.rdb$constraint_type = 'FOREIGN KEY'\n                AND EXISTS(\n                  SELECT *\n                  FROM rdb$index_segments i\n                  WHERE i.rdb$field_name = rlf.rdb$field_name\n                    AND i.rdb$index_name = const.rdb$index_name\n                )\n                LEFT JOIN rdb$ref_constraints ref_ref_const\n                  ON ref_ref_const.rdb$constraint_name = const.rdb$constraint_name\n                  LEFT JOIN rdb$relation_constraints ref_rel_const\n                    ON ref_rel_const.rdb$constraint_name = ref_ref_const.rdb$const_name_uq\n                    \n            LEFT JOIN usr$nlp_table tables ON tables.usr$relation_name = r.rdb$relation_name\n              LEFT JOIN usr$nlp_tentities entities\n                ON entities.usr$table_key = tables.id\n                AND TRIM(REPLACE(entities.usr$name,  ',', '')) > ''\n              LEFT JOIN usr$nlp_field fields\n                ON fields.usr$table_key = tables.id\n                AND fields.usr$field_name = rlf.rdb$field_name\n                LEFT JOIN usr$nlp_tentities_attr attr\n                  ON attr.usr$field_key = fields.id\n                  AND TRIM(REPLACE(attr.usr$name,  ',', '')) > ''\n                LEFT JOIN usr$nlp_field_ref field_ref ON field_ref.USR$FIELD_KEY = fields.ID\n                  LEFT JOIN usr$nlp_ref_type ref_type ON ref_type.id = field_ref.usr$ref_type_key\n                    LEFT JOIN usr$nlp_ref_type_detail ref_type_detail\n                      ON ref_type_detail.usr$ref_type_key = ref_type.id\n                      AND TRIM(REPLACE(ref_type_detail.usr$name,  ',', '')) > ''\n                      \n          WHERE r.rdb$view_blr IS NULL\n            AND (r.rdb$system_flag IS NULL OR r.rdb$system_flag = 0)\n            \n            AND (\n              r.rdb$relation_name = 'GD_PEOPLE'\n              OR r.rdb$relation_name = 'GD_CONTACT'\n--              OR r.rdb$relation_name = 'GD_PLACE'\n--              OR r.rdb$relation_name = 'WG_POSITION'\n            )\n              \n          ORDER BY r.rdb$relation_name\n        ")];
                    case 1:
                        result = _a.sent();
                        definition = [{
                                name: { column: 'tableName', id: true },
                                indices: [{
                                        key: 'tableIndexName'
                                    }],
                                fields: [{
                                        id: { column: 'fieldKey', id: true },
                                        name: 'fieldName',
                                        indices: [{
                                                key: 'fieldIndexName'
                                            }],
                                        type: { column: 'fieldType', type: FBAdapter._convertType },
                                        nonNull: { column: 'nullFlag', type: 'BOOLEAN', default: false },
                                        nameRef: 'relationName',
                                        refs: [{
                                                id: { column: 'refKey', type: 'NUMBER' },
                                                description: 'refDescription',
                                                indices: [{
                                                        key: 'refTypeIndexName'
                                                    }]
                                            }]
                                    }]
                            }];
                        return [2 /*return*/, NestHydrationJS().nest(result, definition)];
                }
            });
        });
    };
    return FBAdapter;
}());
exports.FBAdapter = FBAdapter;
//# sourceMappingURL=FBAdapter.js.map