"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
    }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
var http = require("http");
exports.JSON = 1;
exports.HTML = 2;
exports.UNKNOWN_ERROR_CODE = 1;
exports.CUSTOM_ERROR_CODE = 2;
exports.INVALID_ERROR_CODE = 3;
exports.NOT_FOUND_ERROR_CODE = 4;
exports.ACCESS_DENIED_ERROR_CODE = 5;
function getErrorMiddleware() {
    return function (err, req, res, next) {
        if (!(err instanceof HttpError)) {
            err = new HttpError(exports.HTML, 500, err);
            console.log(err);
        }
        if (!(err.cause instanceof CodeError)) {
            var nErr = new CodeError(exports.UNKNOWN_ERROR_CODE, 'Unknown error');
            nErr.stack = err.cause.stack;
            err.cause = nErr;
        }
        res.status(err.code);
        res.statusMessage = err.message;
        if (process.env.NODE_ENV) {
            delete err.cause.stack;
        }
        switch (err.responseFormat) {
            case exports.JSON: {
                return res.send(__assign({ errorCode: err.cause.code, errorMessage: err.cause.message }, err.cause.data, { stack: err.cause.stack }));
            }
            case exports.HTML:
            default: {
                return res.render('error', {
                    status: err.code,
                    statusMessage: err.message,
                    error: err.cause
                });
            }
        }
    };
}
exports.getErrorMiddleware = getErrorMiddleware;
var CodeError = /** @class */ (function (_super) {
    __extends(CodeError, _super);
    function CodeError(code, message, data) {
        var _this = _super.call(this, message) || this;
        _this.code = code;
        _this.message = message;
        _this.data = data;
        Object.setPrototypeOf(_this, CodeError.prototype);
        return _this;
    }
    return CodeError;
}(Error));
exports.CodeError = CodeError;
var HttpError = /** @class */ (function (_super) {
    __extends(HttpError, _super);
    function HttpError(responseFormat, code, cause, data) {
        var _this = _super.call(this, code, http.STATUS_CODES[code] || http.STATUS_CODES[500], data) || this;
        _this.responseFormat = responseFormat;
        _this.cause = cause;
        Object.setPrototypeOf(_this, HttpError.prototype);
        return _this;
    }
    return HttpError;
}(CodeError));
exports.HttpError = HttpError;
//# sourceMappingURL=errorMiddleware.js.map