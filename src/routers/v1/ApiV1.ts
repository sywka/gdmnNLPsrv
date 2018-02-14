import {NextFunction, Request, Response, Router} from "express";
import config from "config";
import {express} from "graphql-voyager/middleware";
import BaseRouter from "../../BaseRouter";
import NLPExpress from "../../nlp/NLPExpress";
import {GraphQLAdapter} from "../../nlp/adapter/fb/GraphQLAdapter";
import GraphQLContext from "../../nlp/adapter/fb/GraphQLContext";
import {Options} from "../../nlp/adapter/fb/DBManager";

export default class ApiV1 extends BaseRouter {

    static readonly VIEWER_PATH = "/schema/viewer";

    protected routes(router: Router) {
        router.use(ApiV1.VIEWER_PATH, (req: Request, res: Response, next: NextFunction) => {
            express({
                endpointUrl: req.baseUrl.replace(ApiV1.VIEWER_PATH, ""),
                displayOptions: req.query
            })(req, res, next);
        });

        const options: Options = {
            host: config.get("db.host"),
            port: config.get("db.port"),
            user: config.get("db.user"),
            password: config.get("db.password"),
            database: config.get("db.path")
        };
        router.use("/", new NLPExpress({
            adapter: new GraphQLAdapter(options, () => new GraphQLContext(options, 1000)),
            graphiql: true
        }).middleware);
    }
}