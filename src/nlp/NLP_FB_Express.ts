import {NextFunction, Request, Response, Router} from "express";
import graphqlHTTP from "express-graphql";
import {NLPSchema} from "./NLPSchema";
import BaseRouter from "./BaseRouter";
import GraphQLContext, {IContextOptions} from "./adapter/fb/GraphQLContext";
import {GraphQLAdapter, IBlobID} from "./adapter/fb/GraphQLAdapter";
import DBManager, {DBOptions} from "./adapter/fb/DBManager";

export interface NLPExpressOptions extends IContextOptions {
    graphiql?: boolean;
}

export default class NLP_FB_Express extends BaseRouter<NLPExpressOptions> {

    public static BLOBS_PATH = "/blobs";

    protected curRouteUrl: string = "";
    protected _nlpSchema: NLPSchema<GraphQLContext>;

    constructor(options: NLPExpressOptions) {
        super(options);

        this._nlpSchema = new NLPSchema({
            adapter: new GraphQLAdapter({
                ...(options as DBOptions),
                blobLinkCreator: (id: IBlobID) => (
                    `${this.curRouteUrl}${NLP_FB_Express.BLOBS_PATH}?id=${new Buffer(`${JSON.stringify(id)}`).toString("base64")}`
                )
            })
        });
        this._nlpSchema.createSchema().catch(console.error);
    }

    protected routes(router: Router, options: NLPExpressOptions) {
        router.use("/", (req: Request, res: Response, next: NextFunction) => {
            this.curRouteUrl = req.protocol + "://" + req.get("host") + req.baseUrl;
            next();
        });

        router.use(NLP_FB_Express.BLOBS_PATH, (req: Request, res: Response, next: NextFunction): void => {
            req.query = JSON.parse(new Buffer(req.query.id, "base64").toString());
            next();
        });
        router.use(NLP_FB_Express.BLOBS_PATH, async (req: Request, res: Response): Promise<void> => {
            const dbManager = new DBManager();
            try {
                await dbManager.attach(options);

                const result = await dbManager.query(`
                    SELECT ${req.query.field} AS "binaryField"
                    FROM ${req.query.table}
                    WHERE ${req.query.primaryField} = ${req.query.primaryKey} 
                `);
                await DBManager.readBlob(result[0].binaryField, res);

            } catch (error) {
                res.end();
                console.error(error);
            } finally {
                try {
                    await dbManager.detach();
                } catch (error) {
                    console.log(error);
                }
            }
        });

        router.use("/", graphqlHTTP(async () => {
            if (!this._nlpSchema || !this._nlpSchema.schema) throw new Error("Temporarily unavailable");

            const startTime = Date.now();

            const context = new GraphQLContext(options);
            await context.attach();
            return {
                schema: this._nlpSchema.schema,
                graphiql: options.graphiql,
                context: context,
                async extensions() {
                    await context.detach();
                    return {runTime: (Date.now() - startTime) + " мсек"};
                }
            };
        }));
    }
}