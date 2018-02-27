import {NextFunction, Request, Response, Router} from "express";
import graphqlHTTP from "express-graphql";
import FBAdapter, {IBlobID, ISchemaDetailOptions} from "./FBAdapter";
import FBDatabase, {DBOptions, FBConnectionPool} from "./FBDatabase";
import FBGraphQLContext from "./FBGraphQLContext";
import Schema from "../../Schema";
import BaseRouter from "../../BaseRouter";

export interface FBExpressOptions extends ISchemaDetailOptions, DBOptions {
    graphiql?: boolean;
    maxConnectionPool?: number;
}

export default class FBExpress extends BaseRouter<FBExpressOptions> {

    public static BLOBS_PATH = "/blobs";

    protected _routerUrl: string = "";
    protected _connectionPool: FBConnectionPool;
    protected _schema: Schema<FBGraphQLContext>;

    constructor(options: FBExpressOptions) {
        super(options);

        this._connectionPool = new FBConnectionPool();
        this._connectionPool.createConnectionPool(options, options.maxConnectionPool);
        this._schema = this._createSchema(options);
    }

    protected _createSchema(options: FBExpressOptions): Schema<FBGraphQLContext> {
        const schema = new Schema({
            adapter: new FBAdapter({
                ...(options as DBOptions),
                blobLinkCreator: this._createBlobUrl.bind(this),
            })
        });
        schema.createSchema().catch(console.error);
        return schema;
    }

    protected _createBlobUrl(id: IBlobID) {
        const idParam = new Buffer(`${JSON.stringify(id)}`).toString("base64");
        return `${this._routerUrl}${FBExpress.BLOBS_PATH}?id=${idParam}`;
    }

    protected routes(router: Router, options: FBExpressOptions) {
        router.use("/", (req: Request, res: Response, next: NextFunction) => {
            this._routerUrl = req.protocol + "://" + req.get("host") + req.baseUrl;
            next();
        });

        router.use(FBExpress.BLOBS_PATH, (req: Request, res: Response, next: NextFunction): void => {
            req.query = JSON.parse(new Buffer(req.query.id, "base64").toString());
            next();
        });
        router.use(FBExpress.BLOBS_PATH, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
            let database;
            try {
                database = await this._connectionPool.attach();

                const result = await database.query(`
                    SELECT ${req.query.field} AS "binaryField"
                    FROM ${req.query.table}
                    WHERE ${req.query.primaryField} = ${req.query.primaryKey} 
                `);
                const blobStream = await FBDatabase.blobToStream(result[0].binaryField);
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
            if (!this._schema || !this._schema.schema) throw new Error("Temporarily unavailable");

            const startTime = Date.now();
            const database = await this._connectionPool.attach();

            return {
                schema: this._schema.schema,
                graphiql: options.graphiql,
                context: new FBGraphQLContext(database),
                async extensions() {
                    await database.detach();
                    return {runTime: (Date.now() - startTime) + " мсек"};
                }
            };
        }));
    }
}