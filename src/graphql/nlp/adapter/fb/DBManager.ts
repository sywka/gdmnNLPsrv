import firebird from "node-firebird";
import * as path from "path";

export type Options = firebird.Options;

export abstract class Base<DB extends (firebird.Database | firebird.Transaction)> {

    protected db: DB;

    constructor(db: DB) {
        this.db = db;
    }

    public static async readBlob(blobFieldResult: (callback: (err, name, event) => void) => void): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            blobFieldResult((err, name, event) => {
                if (err) return reject(err);

                let chunks = [], length = 0;
                event.on("data", (chunk) => {
                    chunks.push(chunk);
                    length += chunk.length;
                });
                event.on("end", () => {
                    resolve(Buffer.concat(chunks, length).toString());
                });
            });
        });
    }

    public async query(query: string, params?: any[]): Promise<any[]> {
        if (!this.db) throw new Error("Database need created");
        return new Promise<any[]>((resolve, reject) => {
            this.db.query(query, params, (err, result) => {
                err ? reject(err) : resolve(result);
            });
        });
    }

    public async execute(query: string, params?: any[]): Promise<any[]> {
        if (!this.db) throw new Error("Database need created");
        return new Promise<any[]>((resolve, reject) => {
            this.db.execute(query, params, (err, result) => {
                err ? reject(err) : resolve(result);
            });
        });
    }
}

export class Transaction extends Base<firebird.Transaction> {

    public isInTransaction(): boolean {
        return Boolean(this.db);
    }

    public async commit(): Promise<void> {
        if (!this.db) throw new Error("Transaction need created");
        return new Promise<void>((resolve, reject) => {
            this.db.commit((err) => {
                if (err) return reject(err);
                this.db = null;
                resolve();
            });
        });
    }

    public async rollback(): Promise<void> {
        if (!this.db) throw new Error("Transaction need created");
        return new Promise<void>((resolve, reject) => {
            this.db.rollback((err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }
}

export default class DBManager extends Base<firebird.Database> {

    protected _options: Options;

    constructor(options: Options) {
        super(null);

        this._options = {
            ...options,
            database: path.resolve(process.cwd(), options.database)
        };
    }

    public static escape(value: any): string {
        return firebird.escape(value);
    }

    public isAttached(): boolean {
        return Boolean(this.db);
    }

    public async attachOrCreate(): Promise<void> {
        if (this.db) throw new Error("Database already created");
        return new Promise<void>((resolve, reject) => {
            firebird.attachOrCreate(this._options, (err, db) => {
                if (err) return reject(err);
                this.db = db;
                resolve();
            });
        });
    }

    public async attach(): Promise<void> {
        if (this.db) throw new Error("Database already created");
        return new Promise<void>((resolve, reject) => {
            firebird.attach(this._options, (err, db) => {
                if (err) return reject(err);
                this.db = db;
                resolve();
            });
        });
    }

    public async detach(): Promise<void> {
        if (!this.db) throw new Error("Database need created");
        return new Promise<void>((resolve, reject) => {
            this.db.detach((err) => {
                if (err) return reject(err);
                this.db = null;
                resolve();
            });
        });
    }

    public async transaction(isolation?: firebird.Isolation): Promise<Transaction> {
        if (!this.db) throw new Error("Database need created");
        return new Promise<Transaction>((resolve, reject) => {
            this.db.transaction(isolation, (err, transaction) => {
                err ? reject(err) : resolve(new Transaction(transaction));
            });
        });
    }
}