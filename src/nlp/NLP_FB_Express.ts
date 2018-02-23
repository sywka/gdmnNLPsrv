import {NextFunction, Request, Response, Router} from "express";
import graphqlHTTP from "express-graphql";
import Database, {ConnectionPool, DBOptions} from "./adapter/fb/Database";
import GraphQLContext from "./adapter/fb/GraphQLContext";
import {GraphQLAdapter, IBlobID} from "./adapter/fb/GraphQLAdapter";
import {NLPSchema} from "./NLPSchema";
import BaseRouter from "./BaseRouter";

export interface NLPExpressOptions extends DBOptions {
    graphiql?: boolean;
    maxConnectionPool?: number;
}

export default class NLP_FB_Express extends BaseRouter<NLPExpressOptions> {

    public static BLOBS_PATH = "/blobs";

    protected _routerUrl: string = "";
    protected _connectionPool: ConnectionPool;
    protected _nlpSchema: NLPSchema<GraphQLContext>;

    constructor(options: NLPExpressOptions) {
        super(options);

        this._connectionPool = new ConnectionPool();
        this._connectionPool.createConnectionPool(options, options.maxConnectionPool);

        this._nlpSchema = new NLPSchema({
            adapter: new GraphQLAdapter({
                ...(options as DBOptions),
                blobLinkCreator: (id: IBlobID) => {
                    const idParam = new Buffer(`${JSON.stringify(id)}`).toString("base64");
                    return `${this._routerUrl}${NLP_FB_Express.BLOBS_PATH}?id=${idParam}`;
                }
            })
        });
        this._nlpSchema.createSchema().catch(console.error);
    }

    protected routes(router: Router, options: NLPExpressOptions) {
        router.use("/", (req: Request, res: Response, next: NextFunction) => {
            this._routerUrl = req.protocol + "://" + req.get("host") + req.baseUrl;
            next();
        });

        router.use(NLP_FB_Express.BLOBS_PATH, (req: Request, res: Response, next: NextFunction): void => {
            req.query = JSON.parse(new Buffer(req.query.id, "base64").toString());
            next();
        });
        router.use(NLP_FB_Express.BLOBS_PATH, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
            let database;
            try {
                database = await this._connectionPool.attach();

                const result = await database.query(`
                    SELECT ${req.query.field} AS "binaryField"
                    FROM ${req.query.table}
                    WHERE ${req.query.primaryField} = ${req.query.primaryKey} 
                `);
                const blobStream = await Database.blobToStream(result[0].binaryField);
                blobStream.pipe(res);

            } catch (error) {
                next(error);
            } finally {
                try {
                    await database.detach();
                } catch (error) {
                    console.log(error);
                }
            }
        });

        router.use("/", graphqlHTTP(async () => {
            if (!this._nlpSchema || !this._nlpSchema.schema) throw new Error("Temporarily unavailable");

            const startTime = Date.now();
            const database = await this._connectionPool.attach();

            return {
                schema: this._nlpSchema.schema,
                graphiql: options.graphiql,
                context: new GraphQLContext(database),
                async extensions() {
                    await database.detach();
                    return {runTime: (Date.now() - startTime) + " мсек"};
                }
            };
        }));
    }
}