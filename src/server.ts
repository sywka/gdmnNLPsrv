import bodyParser from "body-parser";
import config from "config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, {Application, Router} from "express";
import serveStatic from "serve-static";
import morgan from "morgan";
import {CodeError, ErrorCode, getErrorMiddleware, HttpError, ResponseType} from "./middlewares/errorMiddleware";
import {BaseRouter} from "./graphql-bridge";
import Api from "./routers/Api";

export default class Server extends BaseRouter<void> {

    private readonly _app: Application;

    constructor() {
        super();

        this._app = express();
        Server.config(this._app);
        this._app.use(this.router);
        this.errorHandler(this._app);
    }

    get app(): Application {
        return this._app;
    }

    private static config(app: Application): void {
        app.set("views", "./src/views");
        app.set("view engine", "pug");

        app.use(morgan("dev"));
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({extended: false}));
        app.use(serveStatic(config.get("server.publicDir")));
        app.use(cookieParser());

        if (!process.env.NODE_ENV) app.use(cors());
    }

    protected routes(router: Router) {
        router.use("/api", new Api().router);
    }

    private errorHandler(app: Application) {
        app.use((req, res, next) => {
            const error = new HttpError(ResponseType.HTML, 404, new CodeError(ErrorCode.NOT_FOUND_ERROR_CODE,
                `${req.originalUrl} not found`));
            next(error);
        });
        app.use(getErrorMiddleware());
    }
}