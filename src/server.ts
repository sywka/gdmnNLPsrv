import bodyParser from "body-parser";
import config from "config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import serveStatic from "serve-static";
import morgan from "morgan";
import {CodeError, ErrorCode, getErrorMiddleware, HttpError, ResponseType} from "./middlewares/errorMiddleware";
import Api from "./routers/Api";
import BaseRouter from "./BaseRouter";

export default class Server extends BaseRouter {

    constructor() {
        super();

        this._app = express();
        Server.config(this._app);
        this._app.use(this.router);
        this.errorHandler(this._app);
    }

    private _app: express.Application;

    get app(): express.Application {
        return this._app;
    }

    private static config(app: express.Application): void {
        app.set("views", "./src/views");
        app.set("view engine", "pug");

        app.use(morgan("dev"));
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({extended: false}));
        app.use(serveStatic(config.get("server.publicDir")));
        app.use(cookieParser());

        if (!process.env.NODE_ENV) app.use(cors());
    }

    protected routes(router: express.Router) {
        router.use("/api", new Api().router);
    }

    private errorHandler(app: express.Application) {
        app.use((req, res, next) => {
            const error = new HttpError(ResponseType.HTML, 404, new CodeError(ErrorCode.NOT_FOUND_ERROR_CODE,
                `${req.originalUrl} not found`));
            next(error);
        });
        app.use(getErrorMiddleware());
    }
}