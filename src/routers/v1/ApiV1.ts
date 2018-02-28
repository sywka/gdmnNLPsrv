import {NextFunction, Request, Response, Router} from "express";
import config from "config";
import {express} from "graphql-voyager/middleware";
import {BaseRouter} from "graphql-sql-bridge";
import {HttpError, ResponseType} from "../../middlewares/errorMiddleware";
import NLPFBExpress from "../../nlp/NLPFBExpress";

export default class ApiV1 extends BaseRouter<void> {

    static readonly VIEWER_PATH = "/schema/viewer";

    protected routes(router: Router) {
        router.use(ApiV1.VIEWER_PATH, (req: Request, res: Response, next: NextFunction) => {
            express({
                endpointUrl: req.baseUrl.replace(ApiV1.VIEWER_PATH, ""),
                displayOptions: req.query
            })(req, res, next);
        });

        router.use("/", new NLPFBExpress({
            host: config.get("db.host"),
            port: config.get("db.port"),
            user: config.get("db.user"),
            password: config.get("db.password"),
            database: config.get("db.path"),

            graphiql: true,
            maxConnectionPool: 100,
            // excludePattern: "AT_+",
            include: [
                "GD_CONTACT",
                "GD_PEOPLE",
                // "GD_PLACE",
                // "WG_POSITION"
            ]
        }).router);
        router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            next(new HttpError(ResponseType.JSON, 500, err));
        });
    }
}