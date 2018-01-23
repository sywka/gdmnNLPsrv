"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var express = require("express");
var errorMiddleware_1 = require("../middlewares/errorMiddleware");
var api_1 = require("./v1/api");
var router = express.Router();
router.use('/v1', api_1.default);
router.use('/*', function (req, res, next) {
    next(new errorMiddleware_1.HttpError(errorMiddleware_1.JSON, 501, new errorMiddleware_1.CodeError(errorMiddleware_1.NOT_FOUND_ERROR_CODE, 'Not implemented yet')));
});
exports.default = router;
//# sourceMappingURL=api.js.map