import {GraphQLResolveInfo} from "graphql";
import Queue from "promise-queue";
import DBManager, {Options, Transaction} from "./DBManager";

export type Context = {
    database: DBManager,
    queue: Queue
};
export type TransactionContext = {
    database: Transaction,
    queue: Queue
};
export type MutationFn<Context> = (source: any, context: Context, resolveInfo: GraphQLResolveInfo) => Promise<any> | any;

/**
 * Создать контекст с базой и очередью, после завершения нужно уничтожить контект
 */
export async function createQueueDBContext(options: Options): Promise<Context> {
    const dbManager = new DBManager(options);
    await dbManager.attach();
    return {
        database: dbManager,
        queue: new Queue(1)
    };
}

/**
 * Уничтожить контекст с базой и очередью
 */
export async function destroyQueueDBContext(context: Context): Promise<void> {
    if (context.database) {
        await addToQueue(context, (database) => database.detach());
    }
}

/**
 * Поместить sql запрос в контекстную очередь promise-ов
 * (на одном соединении с базой запросы могут выполняться только по очереди)
 */
export async function query(context: Context, query: string, params?: any[]): Promise<any[]> {
    return await addToQueue(context, (database) => database.query(query, params));
}

/**
 * Поместить прочтение blob поля в контекстную очередь promise-ов
 * (на одном соединении с базой запросы могут выполняться только по очереди)
 */
export async function readBlob(context: Context, blobFieldResult: any): Promise<string> {
    return await addToQueue(context, () => DBManager.readBlob(blobFieldResult));
}

/**
 * Поместить функцию в контекстную очередь promise-ов
 */
async function addToQueue(context: Context, fn: (database: DBManager) => Promise<void | any>) {
    return await context.queue.add(() => fn(context.database));
}

export function wrapContextToTransaction(fn: MutationFn<TransactionContext>): MutationFn<Context> {
    return async (args: any, context: Context, resolveInfo: GraphQLResolveInfo) => {
        let transaction: Transaction;
        try {
            transaction = await context.database.transaction();
            let result = await fn(args, {...context, database: transaction}, resolveInfo);
            await transaction.commit();
            return result;
        } catch (error) {
            if (transaction) {
                await transaction.rollback();
            }
            throw error;
        }
    };
}