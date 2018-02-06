import Queue from "promise-queue";
import DBManager, {Options} from "./DBManager";
import {GraphQLContext} from "./FBAdapter";

export default class Context implements GraphQLContext {

    private _database: DBManager;
    private _queue: Queue;

    constructor(options: Options) {
        this._database = new DBManager(options);
        this._queue = new Queue(1);
    }

    public async attach(): Promise<Context> {
        await this._queue.add(() => this._database.attach());
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