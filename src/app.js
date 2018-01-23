"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var bodyParser = require("body-parser");
var config = require("config");
var cookieParser = require("cookie-parser");
var cors = require("cors");
var express = require("express");
var morgan = require("morgan");
var errorMiddleware_1 = require("./middlewares/errorMiddleware");
var api_1 = require("./routers/api");
var app = express();
app.set('views', './src/views');
app.set('view engine', 'pug');
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(config.get('server.publicDir')));
app.use(cookieParser());
if (!process.env.NODE_ENV)
    app.use(cors());
app.use('/api', api_1.default);
app.use(function (req, res, next) {
    next(new errorMiddleware_1.HttpError(errorMiddleware_1.HTML, 404, new errorMiddleware_1.CodeError(errorMiddleware_1.NOT_FOUND_ERROR_CODE, req.originalUrl + " not found")));
});
app.use(errorMiddleware_1.getErrorMiddleware());
exports.default = app;
//# sourceMappingURL=app.js.map