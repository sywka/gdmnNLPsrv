import Queue from "promise-queue";
import FBDatabase from "./FBDatabase";
import {IFBGraphQLContext} from "./FBAdapter";

export default class FBGraphQLContext implements IFBGraphQLContext {

    private readonly _database: FBDatabase;
    private readonly _queue: Queue = new Queue(1);

    constructor(database: FBDatabase) {
        this._database = database;
    }

    public async query(query: string, params?: any[]): Promise<any[]> {
        return await this._queue.add(() => this._database.query(query, params));
    }

    public async execute(query: string, params?: any[]): Promise<any[]> {
        return await this._queue.add(() => this._database.execute(query, params));
    }
}