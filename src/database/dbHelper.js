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
var config = require("config");
var firebird = require("node-firebird");
var path = require("path");
exports.ISOLATION_READ_UNCOMMITTED = firebird.ISOLATION_READ_UNCOMMITTED;
exports.ISOLATION_READ_COMMITED = firebird.ISOLATION_READ_COMMITED;
exports.ISOLATION_READ_COMMITED_READ_ONLY = firebird.ISOLATION_READ_COMMITED_READ_ONLY;
exports.ISOLATION_REPEATABLE_READ = firebird.ISOLATION_REPEATABLE_READ;
exports.ISOLATION_SERIALIZABLE = firebird.ISOLATION_SERIALIZABLE;
exports.options = {
    host: config.get('db.host'),
    port: config.get('db.port'),
    user: config.get('db.user'),
    password: config.get('db.password'),
    database: path.resolve(process.cwd(), config.get('db.path'))
};
function escape(value) {
    return firebird.escape(value);
}
exports.escape = escape;
function formatDate(date) {
    if (typeof (date) === 'string') {
        date = new Date(date);
    }
    if (!(date instanceof Date))
        throw new Error('unsupported type');
    return '\'' + date.getDate() + '.' + (date.getMonth() + 1) + '.' + date.getFullYear() + '\'';
}
exports.formatDate = formatDate;
function formatDateTime(date) {
    if (typeof (date) === 'string') {
        date = new Date(date);
    }
    if (!(date instanceof Date))
        throw new Error('unsupported type');
    return '\'' + date.getDate() + '.' + (date.getMonth() + 1) + '.' + date.getFullYear() + ' ' +
        date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds() + '.' + date.getMilliseconds() + '\'';
}
exports.formatDateTime = formatDateTime;
function attachOrCreate() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    firebird.attachOrCreate(exports.options, function (err, db) {
                        err ? reject(err) : resolve(db);
                    });
                })];
        });
    });
}
exports.attachOrCreate = attachOrCreate;
function attach() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    firebird.attach(exports.options, function (err, db) {
                        err ? reject(err) : resolve(db);
                    });
                })];
        });
    });
}
exports.attach = attach;
function create() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    firebird.create(exports.options, function (err, db) {
                        err ? reject(err) : resolve(db);
                    });
                })];
        });
    });
}
exports.create = create;
function detach(db) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    db.detach(function (err) {
                        err ? reject(err) : resolve();
                    });
                })];
        });
    });
}
exports.detach = detach;
function query(db, query, params) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    db.query(query, params, function (err, result) {
                        err ? reject(err) : resolve(result);
                    });
                })];
        });
    });
}
exports.query = query;
function execute(db, query, params) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    db.execute(query, params, function (err, result) {
                        err ? reject(err) : resolve(result);
                    });
                })];
        });
    });
}
exports.execute = execute;
function readBlob(blobFieldResult) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    blobFieldResult(function (err, name, event) {
                        if (err)
                            return reject(err);
                        var chunks = [], length = 0;
                        event.on('data', function (chunk) {
                            chunks.push(chunk);
                            length += chunk.length;
                        });
                        event.on('end', function () {
                            resolve(Buffer.concat(chunks, length).toString());
                        });
                    });
                })];
        });
    });
}
exports.readBlob = readBlob;
function transaction(db, isolation) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    db.transaction(isolation, function (err, transaction) {
                        err ? reject(err) : resolve(transaction);
                    });
                })];
        });
    });
}
exports.transaction = transaction;
function commit(transaction) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    transaction.commit(function (err) {
                        err ? reject(err) : resolve();
                    });
                })];
        });
    });
}
exports.commit = commit;
function rollback(transaction) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    transaction.rollback(function (err) {
                        err ? reject(err) : resolve();
                    });
                })];
        });
    });
}
exports.rollback = rollback;
//# sourceMappingURL=dbHelper.js.map