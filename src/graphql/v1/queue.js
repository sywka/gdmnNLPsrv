import Queue from 'promise-queue'
import * as dbHelper from '../../database/dbHelper'

export { dbHelper }

/**
 * Создать контекст с базой и очередью, после завершения нужно уничтожить контект
 */
export async function createQueueDBContext () {
  return {
    db: await dbHelper.attach(),
    queue: new Queue(1)
  }
}

/**
 * Уничтожить контекст с базой и очередью
 */
export async function destroyQueueDBContext (context) {
  if (context.db) {
    await addToQueue(context, (db) => dbHelper.detach(db))
  }
}

/**
 * Поместить sql запрос в контекстную очередь promise-ов
 * (на одном соединении с базой запросы могут выполняться только по очереди)
 */
export async function query (context, query, params) {
  return await addToQueue(context, (db) => dbHelper.query(db, query, params))
}

/**
 * Поместить прочтение blob поля в контекстную очередь promise-ов
 * (на одном соединении с базой запросы могут выполняться только по очереди)
 */
export async function readBlob (context, blobFieldResult) {
  return await addToQueue(context, (db) => dbHelper.readBlob(blobFieldResult))
}

/**
 * Поместить функцию в контекстную очередь promise-ов
 */
async function addToQueue (context, fn) {
  return await context.queue.add(() => fn(context.db))
}

export function wrapContextToTransaction (fn) {
  return async (args, context, resolveInfo) => {
    let db = context.db
    let transaction
    try {
      transaction = await dbHelper.transaction(db)
      context.db = transaction
      let result = await fn(args, context, resolveInfo)
      await dbHelper.commit(transaction)
      return result
    } catch (error) {
      if (transaction) {
        await dbHelper.rollback(transaction)
      }
      throw error
    } finally {
      context.db = db
    }
  }
}