import {NextFunction, Request, Response, Router} from "express";
import config from "config";
import {express} from "graphql-voyager/middleware";
import BaseRouter from "../../nlp/BaseRouter";
import NLP_FB_Express from "../../nlp/NLP_FB_Express";

export default class ApiV1 extends BaseRouter<void> {

    static readonly VIEWER_PATH = "/schema/viewer";

    protected routes(router: Router) {
        router.use(ApiV1.VIEWER_PATH, (req: Request, res: Response, next: NextFunction) => {
            express({
                endpointUrl: req.baseUrl.replace(ApiV1.VIEWER_PATH, ""),
                displayOptions: req.query
            })(req, res, next);
        });

        router.use("/", new NLP_FB_Express({
            host: config.get("db.host"),
            port: config.get("db.port"),
            user: config.get("db.user"),
            password: config.get("db.password"),
            database: config.get("db.path"),

            graphiql: true,
            maxConnectionPool: 100
        }).router);
    }
}