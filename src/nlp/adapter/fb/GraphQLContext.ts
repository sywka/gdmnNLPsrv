import Queue from "promise-queue";
import Database from "./Database";
import {IFBGraphQLContext} from "./GraphQLAdapter";

export default class GraphQLContext implements IFBGraphQLContext {

    private readonly _database: Database;
    private readonly _queue: Queue = new Queue(1);

    constructor(database: Database) {
        this._database = database;
    }

    public async query(query: string, params?: any[]): Promise<any[]> {
        return await this._queue.add(() => this._database.query(query, params));
    }

    public async execute(query: string, params?: any[]): Promise<any[]> {
        return await this._queue.add(() => this._database.execute(query, params));
    }
}