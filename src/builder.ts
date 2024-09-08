import { CompiledQuery, Kysely } from 'kysely'
import { BaseSerializePlugin } from 'kysely-plugin-serialize'
import type { Promisable } from '@subframe7536/type-utils'
import type {
  DeleteQueryBuilder,
  DeleteResult,
  Dialect,
  KyselyPlugin,
  QueryResult,
  RawBuilder,
  Transaction,
} from 'kysely'
import type { ExtractTableAlias, From, FromTables, TableReference } from 'kysely/dist/cjs/parser/table-parser'
import { baseExecutor, type Executor, type JoinFnName } from './executor'
import { createKyselyLogger, type LoggerOptions } from './logger'
import { checkIntegrity as runCheckIntegrity } from './pragma'
import { savePoint } from './savepoint'
import { defaultDeserializer, defaultSerializer } from './serialize'
import {
  type DBLogger,
  IntegrityError,
  type SchemaUpdater,
  type StatusResult,
} from './types'

export type SqliteBuilderOptions = {
  /**
   * kysely dialect
   */
  dialect: Dialect
  /**
   * like `KyselyConfig.log`, use {@link createKyselyLogger} to better render log, options: {@link LoggerOptions}
   *
   * if value is `true`, it will log result sql and and other {@link LoggerParams} in console
   */
  onQuery?: boolean | LoggerOptions
  /**
   * additional plugins
   *
   * **do NOT use camelCase plugin with syncDB(useSchema(...)), this will lead to sync fail
   */
  plugins?: KyselyPlugin[]
  /**
   * db logger
   */
  logger?: DBLogger
  /**
   * custom executor
   * @example
   * import { SqliteBuilder, createSoftDeleteExecutor } from 'kysely-sqlite-builder'
   *
   * const { executor, withNoDelete } = createSoftDeleteExecutor()
   *
   * const db = new SqliteBuilder<DB>({
   *   dialect: new SqliteDialect({
   *     database: new Database(':memory:'),
   *   }),
   *   // use soft delete executor
   *   executor,
   * })
   */
  executor?: Executor
}

interface TransactionOptions<T> {
  errorMsg?: string
  /**
   * after commit hook
   */
  onCommit?: (result: T) => Promisable<void>
  /**
   * after rollback hook
   */
  onRollback?: (err: unknown) => Promisable<void>
}

export class SqliteBuilder<DB extends Record<string, any>> {
  private _kysely: Kysely<DB>
  public trxCount = 0
  private trx?: Transaction<DB>
  private logger?: DBLogger
  private executor: Executor

  /**
   * Current kysely / transaction instance
   */
  public get kysely(): Kysely<DB> {
    return this.trx || this._kysely
  }

  public insertInto: Kysely<DB>['insertInto'] = tb => this.executor.insertInto(this.kysely, tb)
  public selectFrom: Kysely<DB>['selectFrom'] = (tb: any) => this.executor.selectFrom(this.kysely, tb)
  public updateTable: Kysely<DB>['updateTable'] = (tb: any) => this.executor.updateTable(this.kysely, tb)
  public deleteFrom: {
    <TR extends keyof DB & string>(from: TR): Omit<
      DeleteQueryBuilder<DB, ExtractTableAlias<DB, TR>, DeleteResult>,
      JoinFnName
    >
    <TR extends TableReference<DB>>(table: TR): Omit<
      DeleteQueryBuilder<From<DB, TR>, FromTables<DB, never, TR>, DeleteResult>,
      JoinFnName
    >
  } = (tb: any) => this.executor.deleteFrom(this.kysely, tb) as any

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
   *     buffer: column.blob(),
   *   },
   *   primary: 'id',
   *   index: ['person', ['id', 'gender']],
   *   timeTrigger: { create: true, update: true },
   * })
   *
   * const DBSchema = {
   *   test: testTable,
   * }
   *
   * // create soft delete executor
   * const { executor, withNoDelete } = createSoftDeleteExecutor()
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
  public constructor(options: SqliteBuilderOptions) {
    const {
      dialect,
      logger,
      onQuery,
      plugins = [],
      executor = baseExecutor,
    } = options
    this.logger = logger
    plugins.push(new BaseSerializePlugin({
      deserializer: defaultDeserializer,
      serializer: defaultSerializer,
      skipNodeKind: [],
    }))

    let log
    if (onQuery === true) {
      log = createKyselyLogger({
        logger: this.logger?.debug || console.log,
        merge: true,
      })
    } else if (onQuery) {
      log = createKyselyLogger(onQuery)
    }

    this._kysely = new Kysely<DB>({ dialect, log, plugins })
    this.executor = executor
  }

  /**
   * sync db schema
   * @param updater sync table function, built-in: {@link useSchema}, {@link useMigrator}
   * @param checkIntegrity whether to check integrity
   * @example
   * import { useSchema } from 'kysely-sqlite-builder/schema'
   * import { useMigrator } from 'kysely-sqlite-builder/migrator'
   * import { FileMigrationProvider } from 'kysely'
   *
   * // update tables using schema
   * await builder.syncDB(useSchema(Schema, { logger: false }))
   *
   * // update tables using MigrationProvider and migrate to latest
   * await builder.syncDB(useMigrator(new FileMigrationProvider(...)))
   */
  public async syncDB(updater: SchemaUpdater, checkIntegrity?: boolean): Promise<StatusResult> {
    try {
      if (checkIntegrity && !(await runCheckIntegrity(this._kysely))) {
        this.logger?.error('integrity check fail')
        return { ready: false, error: new IntegrityError() }
      }
      const result = await updater(this._kysely, this.logger)
      this.logger?.info('table updated')
      return result
    } catch (error) {
      this.logError(error, 'sync table fail')
      return {
        ready: false,
        error,
      }
    }
  }

  private logError(e: unknown, errorMsg?: string): void {
    if (errorMsg) {
      this.logger?.error(errorMsg, e instanceof Error ? e : undefined)
    }
  }

  /**
   * Run in transaction, support nest call (using `savepoint`)
   * @example
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
   */
  public async transaction<O>(
    fn: (trx: Transaction<DB>) => Promise<O>,
    options: TransactionOptions<O> = {},
  ): Promise<O | undefined> {
    if (!this.trx) {
      return await this._kysely.transaction().execute(async (trx) => {
        this.trx = trx
        this.logger?.debug('run in transaction')
        return await fn(trx)
      }).then(async (result) => {
        await options.onCommit?.(result)
        return result
      }).catch(async (e) => {
        await options.onRollback?.(e)
        this.logError(e, options.errorMsg)
        return undefined
      }).finally(() => this.trx = undefined)
    }

    this.trxCount++
    this.logger?.debug('run in savepoint: sp_' + this.trxCount)
    const { release, rollback } = await savePoint(this.kysely, 'sp_' + this.trxCount)

    return await fn(this.kysely as Transaction<DB>)
      .then(async (result) => {
        await release()
        await options.onCommit?.(result)
        return result
      })
      .catch(async (e) => {
        await rollback()
        await options.onRollback?.(e)
        this.logError(e, options.errorMsg)
        return undefined
      })
      .finally(() => this.trxCount--)
  }

  /**
   * Execute raw sql
   */
  public async execute<O>(rawSql: RawBuilder<O>): Promise<QueryResult<O>>
  /**
   * Execute sql string
   */
  public async execute<O>(rawSql: string, parameters?: unknown[]): Promise<QueryResult<O>>
  /**
   * Execute compiled query and return result list
   */
  public async execute<O>(query: CompiledQuery<O>): Promise<QueryResult<O>>
  public async execute<O>(
    data: CompiledQuery<O> | RawBuilder<O> | string,
    parameters?: unknown[],
  ): Promise<QueryResult<O>> {
    if (typeof data === 'string') {
      return await this.kysely.executeQuery<O>(CompiledQuery.raw(data, parameters))
    } else if ('sql' in data) {
      return await this.kysely.executeQuery<O>(data)
    } else {
      return await data.execute(this.kysely)
    }
  }

  /**
   * Destroy db connection
   */
  public async destroy(): Promise<void> {
    this.logger?.info('destroyed')
    await this._kysely.destroy()
    this.trx = undefined
  }
}
