import path from "path";
import firebird from "node-firebird";

type BlobField = (callback: (err, name, event) => void) => void;

export type DBOptions = firebird.Options;

abstract class Base<DB extends (firebird.Database | firebird.Transaction)> {

    protected _db: DB;

    protected constructor(db: DB) {
        this._db = db;
    }

    public static async readBlob(blobFieldResult: BlobField): Promise<Buffer>;
    public static async readBlob(blobFieldResult: BlobField, stream: NodeJS.WritableStream): Promise<void>;
    public static async readBlob(blobFieldResult: BlobField, stream?: NodeJS.WritableStream): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            blobFieldResult((err, name, event) => {
                if (err) return reject(err);

                if (stream) {
                    event.pipe(stream);
                    return stream.on("finish", () => resolve());

                } else {
                    let chunks = [], length = 0;
                    event.on("data", (chunk: Buffer) => {
                        chunks.push(chunk);
                        length += chunk.length;
                    });
                    event.on("end", () => {
                        return resolve(Buffer.concat(chunks, length));
                    });
                }
            });
        });
    }

    public async query(query: string, params?: any[]): Promise<any[]> {
        if (!this._db) throw new Error("Database need created");
        return new Promise<any[]>((resolve, reject) => {
            this._db.query(query, params, (err, result) => {
                err ? reject(err) : resolve(result);
            });
        });
    }

    public async execute(query: string, params?: any[]): Promise<any[]> {
        if (!this._db) throw new Error("Database need created");
        return new Promise<any[]>((resolve, reject) => {
            this._db.execute(query, params, (err, result) => {
                err ? reject(err) : resolve(result);
            });
        });
    }
}

export class Transaction extends Base<firebird.Transaction> {

    public isInTransaction(): boolean {
        return Boolean(this._db);
    }

    public async commit(): Promise<void> {
        if (!this._db) throw new Error("Transaction need created");
        return new Promise<void>((resolve, reject) => {
            this._db.commit((err) => {
                if (err) return reject(err);
                this._db = null;
                resolve();
            });
        });
    }

    public async rollback(): Promise<void> {
        if (!this._db) throw new Error("Transaction need created");
        return new Promise<void>((resolve, reject) => {
            this._db.rollback((err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }
}

export class Database extends Base<firebird.Database> {

    constructor() {
        super(null);
    }

    public static escape(value: any): string {
        return firebird.escape(value);
    }

    protected static bindOptions(options: DBOptions): DBOptions {
        return {
            ...options,
            database: path.resolve(process.cwd(), options.database)
        };
    }

    public isAttached(): boolean {
        return Boolean(this._db);
    }

    public async attachOrCreate(options: DBOptions): Promise<void> {
        if (this._db) throw new Error("Database already created");
        return new Promise<void>((resolve, reject) => {
            firebird.attachOrCreate(Database.bindOptions(options), (err, db) => {
                if (err) return reject(err);
                this._db = db;
                resolve();
            });
        });
    }

    public async attach(options: DBOptions): Promise<void> {
        if (this._db) throw new Error("Database already created");
        return new Promise<void>((resolve, reject) => {
            firebird.attach(Database.bindOptions(options), (err, db) => {
                if (err) return reject(err);
                this._db = db;
                resolve();
            });
        });
    }

    public async detach(): Promise<void> {
        if (!this._db) throw new Error("Database need created");
        return new Promise<void>((resolve, reject) => {
            this._db.detach((err) => {
                if (err) return reject(err);
                this._db = null;
                resolve();
            });
        });
    }

    public async transaction(isolation?: firebird.Isolation): Promise<Transaction> {
        if (!this._db) throw new Error("Database need created");
        return new Promise<Transaction>((resolve, reject) => {
            this._db.transaction(isolation, (err, transaction) => {
                err ? reject(err) : resolve(new Transaction(transaction));
            });
        });
    }

    public async sequentially(query: string, params: any[], rowCallback: firebird.SequentialCallback): Promise<void> {
        if (!this._db) throw new Error("Database need created");
        return new Promise<void>((resolve, reject) => {
            this._db.sequentially(query, params, rowCallback, (err) => {
                err ? reject(err) : resolve();
            });
        });
    }
}

export default class DBManager extends Database {

    public static DEFAULT_MAX_POOL = 10;

    protected static _connectionPool: firebird.ConnectionPool;

    public static isConnectionPoolCreated(): boolean {
        return Boolean(this._connectionPool);
    }

    public static async createConnectionPool(options: DBOptions, max: number = DBManager.DEFAULT_MAX_POOL): Promise<void> {
        if (DBManager._connectionPool) throw new Error("Connection pool already created");
        return new Promise<void>((resolve) => {
            DBManager._connectionPool = firebird.pool(max, Database.bindOptions(options), null);
            resolve();
        });
    }

    public static async destroyConnectionPool(): Promise<void> {
        if (!DBManager._connectionPool) throw new Error("Connection pool need created");
        return new Promise<void>((resolve) => {
            DBManager._connectionPool.destroy();
            DBManager._connectionPool = null;
            resolve();
        });
    }

    public async attachFromPool(): Promise<void> {
        if (!DBManager._connectionPool) throw new Error("Connection pool need created");
        if (this._db) throw new Error("Database already created");
        return new Promise<void>((resolve, reject) => {
            DBManager._connectionPool.get((err, db) => {
                if (err) return reject(err);
                this._db = db;
                resolve();
            });
        });
    }
}