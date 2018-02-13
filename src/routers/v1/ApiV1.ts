import express, {NextFunction, Request, Response} from "express";
import config from "config";
import graphqlHTTP from "express-graphql";
import {express as expressMiddleware} from "graphql-voyager/middleware";
import {NLPSchema} from "../../graphql/nlp/NLPSchema";
import {FBAdapter} from "../../graphql/nlp/adapter/fb/FBAdapter";
import {Options} from "../../graphql/nlp/adapter/fb/DBManager";
import Context from "../../graphql/nlp/adapter/fb/Context";
import BaseRouter from "../../BaseRouter";

export default class ApiV1 extends BaseRouter {

    private _options: Options;
    private _nlpSchema: NLPSchema<Context>;

    constructor() {
        super();
        this._options = {
            host: config.get("db.host"),
            port: config.get("db.port"),
            user: config.get("db.user"),
            password: config.get("db.password"),
            database: config.get("db.path")
        };

        this._nlpSchema = new NLPSchema({
            adapter: new FBAdapter(this._options)
        });
        this._nlpSchema.createSchema().catch(console.error);
    }

    protected routes(router: express.Router) {
        let viewerPath = "/schema/viewer";
        router.use(viewerPath, (req: Request, res: Response, next: NextFunction) => {
            expressMiddleware({
                endpointUrl: req.baseUrl.replace(viewerPath, ""),
                displayOptions: req.query
            })(req, res, next);
        });

        router.use("/", graphqlHTTP(async (req) => {
            const startTime = Date.now();

            await Context.createPoolIfNotExist(this._options, 1000);
            const context = await new Context().attachFromPool();

            if (!this._nlpSchema.schema) throw new Error("Temporarily unavailable");
            return {
                schema: this._nlpSchema.schema,
                graphiql: true,
                context: context,
                async extensions({document, variables, operationName, result}) {
                    await context.detach();
                    return {runTime: (Date.now() - startTime) + " мсек"};
                }
            };
        }));
    }
}