import Queue from "promise-queue";
import DBManager, {Options} from "./DBManager";
import {IFBGraphQLContext} from "./GraphQLAdapter";

export default class GraphQLContext implements IFBGraphQLContext {

    private _database: DBManager = new DBManager();
    private _queue: Queue = new Queue(1);

    private _options: Options;
    private _maxPool: number;

    constructor(options: Options, maxPool: number) {
        this._options = options;
        this._maxPool = maxPool;
    }

    public async attach(): Promise<GraphQLContext> {
        if (!DBManager.isConnectionPoolCreated()) {
            await DBManager.createConnectionPool(this._options, this._maxPool);
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