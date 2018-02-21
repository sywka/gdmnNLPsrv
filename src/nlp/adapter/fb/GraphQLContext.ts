import Queue from "promise-queue";
import DBManager, {DBOptions} from "./DBManager";
import {IFBGraphQLContext} from "./GraphQLAdapter";

export interface IContextOptions extends DBOptions {
    maxPool: number;
}

export default class GraphQLContext implements IFBGraphQLContext {

    public static DEFAULT_MAX_POOL = 10;

    private readonly _database: DBManager = new DBManager();
    private readonly _queue: Queue = new Queue(1);

    private readonly _options: IContextOptions;

    constructor(options: IContextOptions) {
        this._options = options;
    }

    public async attach(): Promise<GraphQLContext> {
        if (!DBManager.isConnectionPoolCreated()) {
            await DBManager.createConnectionPool(this._options, this._options.maxPool);
        }
        await this._queue.add(() => this._database.attachFromPool());
        return this;
    }

    public async detach(): Promise<GraphQLContext> {
        await this._queue.add(() => this._database.detach());
        return this;
    }

    public async query(query: string, params?: any[]): Promise<any[]> {
        return await this._queue.add(() => this._database.query(query, params));
    }

    public async execute(query: string, params?: any[]): Promise<any[]> {
        return await this._queue.add(() => this._database.execute(query, params));
    }
}