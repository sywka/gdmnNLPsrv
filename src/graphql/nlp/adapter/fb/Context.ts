import Queue from "promise-queue";
import DBManager, {Options} from "./DBManager";
import {GraphQLContext} from "./FBAdapter";

export default class Context implements GraphQLContext {

    private _database: DBManager;
    private _queue: Queue;

    constructor() {
        this._database = new DBManager();
        this._queue = new Queue(1);
    }

    public static async createPoolIfNotExist(options: Options, max: number): Promise<void> {
        if (!DBManager.isConnectionPoolCreated()) {
            await DBManager.createConnectionPool(options, max);
        }
    }

    public static async destroyPool(): Promise<void> {
        await DBManager.destroyConnectionPool();
    }

    public async attachFromPool(): Promise<Context> {
        await this._queue.add(() => this._database.attachFromPool());
        return this;
    }

    public async attach(options: Options): Promise<Context> {
        await this._queue.add(() => this._database.attach(options));
        return this;
    }

    public async detach(): Promise<Context> {
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