import config from "config";
import firebird from "node-firebird";
import path from "path";

export let ISOLATION_READ_UNCOMMITTED = firebird.ISOLATION_READ_UNCOMMITTED;
export let ISOLATION_READ_COMMITED = firebird.ISOLATION_READ_COMMITED;
export let ISOLATION_READ_COMMITED_READ_ONLY = firebird.ISOLATION_READ_COMMITED_READ_ONLY;
export let ISOLATION_REPEATABLE_READ = firebird.ISOLATION_REPEATABLE_READ;
export let ISOLATION_SERIALIZABLE = firebird.ISOLATION_SERIALIZABLE;

export const options: firebird.Options = {
    host: config.get("db.host"),
    port: config.get("db.port"),
    user: config.get("db.user"),
    password: config.get("db.password"),
    database: path.resolve(process.cwd(), config.get("db.path"))
};

export function escape(value: any): string {
    return firebird.escape(value);
}

export function formatDate(date: Date): string {
    if (typeof(date) === "string") {
        date = new Date(date);
    }
    if (!(date instanceof Date)) throw new Error("unsupported type");

    return "'" + date.getDate() + "." + (date.getMonth() + 1) + "." + date.getFullYear() + "'";
}

export function formatDateTime(date: Date): string {
    if (typeof(date) === "string") {
        date = new Date(date);
    }
    if (!(date instanceof Date)) throw new Error("unsupported type");

    return "'" + date.getDate() + "." + (date.getMonth() + 1) + "." + date.getFullYear() + " " +
        date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds() + "." + date.getMilliseconds() + "'";
}

export async function attachOrCreate(): Promise<firebird.Database> {
    return new Promise<firebird.Database>((resolve, reject) => {
        firebird.attachOrCreate(options, (err, db) => {
            err ? reject(err) : resolve(db);
        });
    });
}

export async function attach(): Promise<firebird.Database> {
    return new Promise<firebird.Database>((resolve, reject) => {
        firebird.attach(options, (err, db) => {
            err ? reject(err) : resolve(db);
        });
    });
}

export async function create(): Promise<firebird.Database> {
    return new Promise<firebird.Database>((resolve, reject) => {
        firebird.create(options, (err, db) => {
            err ? reject(err) : resolve(db);
        });
    });
}

export async function detach(db: firebird.Database): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        db.detach((err) => {
            err ? reject(err) : resolve();
        });
    });
}

export async function query(db: firebird.Database | firebird.Transaction, query, params?): Promise<any[]> {
    return new Promise<any[]>((resolve, reject) => {
        db.query(query, params, (err, result) => {
            err ? reject(err) : resolve(result);
        });
    });
}

export async function execute(db: firebird.Database | firebird.Transaction, query, params?) {
    return new Promise((resolve, reject) => {
        db.execute(query, params, (err, result) => {
            err ? reject(err) : resolve(result);
        });
    });
}

export async function readBlob(blobFieldResult: (callback: (err, name, event) => void) => void): Promise<string> {
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

export async function transaction(db: firebird.Database, isolation?: firebird.Isolation): Promise<firebird.Transaction> {
    return new Promise<firebird.Transaction>((resolve, reject) => {
        db.transaction(isolation, (err, transaction) => {
            err ? reject(err) : resolve(transaction);
        });
    });
}

export async function commit(transaction: firebird.Transaction): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        transaction.commit((err) => {
            err ? reject(err) : resolve();
        });
    });
}

export async function rollback(transaction): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        transaction.rollback((err) => {
            err ? reject(err) : resolve();
        });
    });
}