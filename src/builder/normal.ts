import type { JoinFnName } from './base'
import type { DeleteQueryBuilder, DeleteResult, Kysely } from 'kysely'
import type { ExtractTableAlias, From, FromTables, TableReference } from 'kysely/dist/cjs/parser/table-parser'

import { BaseSqliteBuilder } from './base'

/**
 * SQLite builder. All methods will run in current transaction
 * @param options options
 * @example
 * ### Definition
 *
 * ```ts
 * import { FileMigrationProvider, SqliteDialect, createSoftDeleteExecutor } from 'kysely'
 * import { SqliteBuilder } from 'kysely-sqlite-builder'
 * import { useMigrator } from 'kysely-sqlite-builder/migrator'
 * import Database from 'better-sqlite3'
 * import type { InferDatabase } from 'kysely-sqlite-builder/schema'
 * import { DataType, column, defineTable } from 'kysely-sqlite-builder/schema'
 *
 * const testTable = defineTable({
 *   columns: {
 *     id: column.increments(),
 *     person: column.object({ defaultTo: { name: 'test' } }),
 *     gender: column.boolean({ notNull: true }),
 *     // or just object
 *     manual: { type: DataType.boolean },
 *     array: column.object().$cast<string[]>(),
 *     literal: column.string().$cast<'l1' | 'l2'>(),
 *     score: column.float(),
 *     birth: column.date(),
 *     buffer: column.blob(),
 *   },
 *   primary: 'id', // optional
 *   index: ['person', ['id', 'gender']],
 *   timeTrigger: { create: true, update: true },
 * })
 *
 * const DBSchema = {
 *   test: testTable,
 * }
 *
 * const db = new SqliteBuilder<InferDatabase<typeof DBSchema>>({
 *   dialect: new SqliteDialect({
 *     database: new Database(':memory:'),
 *   }),
 *   logger: console,
 *   onQuery: true,
 *   executor, // use soft delete executor
 * })
 *
 * // update table using schema
 * await db.syncDB(useSchema(DBSchema, { logger: false }))
 *
 * // update table using migrator
 * await db.syncDB(useMigrator(new FileMigrationProvider('./migrations'), { options}))
 *
 * // usage: insertInto / selectFrom / updateTable / deleteFrom
 * await db.insertInto('test').values({ person: { name: 'test' }, gender: true }).execute()
 *
 * db.transaction(async (trx) => {
 *   // auto load transaction
 *   await db.insertInto('test').values({ gender: true }).execute()
 *   // or
 *   await trx.insertInto('test').values({ person: { name: 'test' }, gender: true }).execute()
 *   db.transaction(async () => {
 *     // nest transaction, use savepoint
 *     await db.selectFrom('test').where('gender', '=', true).execute()
 *   })
 * })
 *
 * // use origin instance: Kysely or Transaction
 * await db.kysely.insertInto('test').values({ gender: false }).execute()
 *
 * // run raw sql
 * await db.execute(sql`PRAGMA user_version = ${2}`)
 * await db.execute('PRAGMA user_version = ?', [2])
 *
 * // destroy
 * await db.destroy()
 * ```
 */
export class SqliteBuilder<DB extends Record<string, any>> extends BaseSqliteBuilder<DB> {
  public insertInto: Kysely<DB>['insertInto'] = tb => this.kysely.insertInto(tb)
  public replaceInto: Kysely<DB>['replaceInto'] = tb => this.kysely.replaceInto(tb)
  public selectFrom: Kysely<DB>['selectFrom'] = (tb: any) => this.kysely.selectFrom(tb) as any
  public updateTable: Kysely<DB>['updateTable'] = (tb: any) => this.kysely.updateTable(tb) as any
  /**
   * Creates a delete query.
   *
   * See the {@link DeleteQueryBuilder.where} method for examples on how to specify
   * a where clause for the delete operation.
   *
   * The return value of the query is an instance of {@link DeleteResult}.
   *
   * ### Examples
   *
   * <!-- siteExample("delete", "Single row", 10) -->
   *
   * Delete a single row:
   *
   * ```ts
   * const result = await db
   *   .deleteFrom('person')
   *   .where('person.id', '=', '1')
   *   .executeTakeFirst()
   *
   * console.log(result.numDeletedRows)
   * ```
   *
   * The generated SQL (SQLite):
   *
   * ```sql
   * delete from "person" where "person"."id" = $1
   * ```
   */
  public deleteFrom: {
    <TR extends keyof DB & string>(from: TR): Omit<
      DeleteQueryBuilder<DB, ExtractTableAlias<DB, TR>, DeleteResult>,
      JoinFnName
    >
    <TR extends TableReference<DB>>(table: TR): Omit<
      DeleteQueryBuilder<From<DB, TR>, FromTables<DB, never, TR>, DeleteResult>,
      JoinFnName
    >
  } = (tb: any) => this.kysely.deleteFrom(tb) as any
}
