import type { LoggerOptions } from '../logger'
import type { DBLogger, SchemaUpdater, StatusResult } from '../types'
import type { Promisable } from '@subframe7536/type-utils'
import type {
  CompiledQuery,
  ControlledTransaction,
  Dialect,
  JoinType,
  KyselyPlugin,
  QueryResult,
  RawBuilder,
  Transaction,
} from 'kysely'

import { Kysely } from 'kysely'
import { BaseSerializePlugin } from 'kysely-plugin-serialize'

import { createKyselyLogger } from '../logger'
import { checkIntegrity as runCheckIntegrity } from '../pragma'
import { defaultDeserializer, defaultSerializer } from '../serialize'
import { IntegrityError } from '../types'
import { executeSQL } from '../utils'

export interface SqliteBuilderOptions {
  /**
   * Kysely dialect
   */
  dialect: Dialect
  /**
   * Like `KyselyConfig.log`, use {@link createKyselyLogger} to better render log, options: {@link LoggerOptions}
   *
   * If value is `true`, it will only `error` level result sql and and other {@link LoggerParams} in console
   */
  onQuery?: boolean | LoggerOptions
  /**
   * Additional plugins
   *
   * **DO NOT** use camelCase plugin with `db.syncDB(useSchema(...))`,
   * this will lead to sync fail if you set `create` / `update` / `softDelete` to `boolean`
   */
  plugins?: KyselyPlugin[]
  /**
   * DB logger
   */
  logger?: DBLogger
}

interface TransactionOptions<T> {
  errorMsg?: string
  /**
   * On commit hook
   */
  onCommit?: (result: T) => Promisable<void>
  /**
   * On rollback hook
   */
  onRollback?: (err: unknown) => Promisable<void>
}

type CamelCase<S extends string> = S extends `${infer First}${infer Rest}`
  ? First extends Uppercase<First>
    ? `${Lowercase<First>}${Rest}`
    : S
  : S
export type JoinFnName = CamelCase<JoinType>

export class BaseSqliteBuilder<DB extends Record<string, any>> {
  public trxCount = 0
  private ky: Kysely<DB>
  private trx?: ControlledTransaction<DB>
  private log?: DBLogger

  /**
   * Current kysely / transaction instance
   */
  public get kysely(): Kysely<DB> {
    return this.trx || this.ky
  }

  public constructor(options: SqliteBuilderOptions) {
    const {
      dialect,
      logger,
      onQuery,
      plugins = [],
    } = options
    this.log = logger
    plugins.push(new BaseSerializePlugin(defaultSerializer, defaultDeserializer, []))

    let log
    if (onQuery === true) {
      log = createKyselyLogger({
        logger: this.log?.debug || console.log,
        merge: true,
      })
    } else if (onQuery) {
      log = createKyselyLogger(onQuery)
    }

    this.ky = new Kysely<DB>({ dialect, log, plugins })
  }

  /**
   * sync db schema
   * @param updater sync table function, built-in: {@link useSchema}, {@link useMigrator}
   * @param checkIntegrity whether to check integrity
   * @example
   * import { useSchema } from 'kysely-sqlite-builder/schema'
   * import { useMigrator } from 'kysely-sqlite-builder/migrator'
   * import { createCodeProvider } from 'kysely-sqlite-builder/migrator'
   *
   * // update tables using schema
   * await db.syncDB(useSchema(Schema, { logger: false }))
   *
   * // update tables using MigrationProvider and migrate to latest
   * await db.syncDB(useMigrator(createCodeProvider(...)))
   */
  public async syncDB(updater: SchemaUpdater, checkIntegrity?: boolean): Promise<StatusResult> {
    try {
      if (checkIntegrity && !(await runCheckIntegrity(this.ky))) {
        this.log?.error('Integrity check fail')
        return { ready: false, error: new IntegrityError() }
      }
      const result = await updater(this.ky, this.log)
      this.log?.info('Sync completed')
      return result
    } catch (error) {
      this.logError(error, 'Unknown error while syncing')
      return {
        ready: false,
        error,
      }
    }
  }

  private logError(e: unknown, errorMsg?: string): void {
    if (errorMsg) {
      this.log?.error(errorMsg, e instanceof Error ? e : new Error(String(e)))
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
   *     // nest transaction, using savepoint
   *     await db.selectFrom('test').where('gender', '=', true).execute()
   *   })
   * })
   */
  public async transaction<O>(
    fn: (trx: Transaction<DB>) => Promise<O>,
    options: TransactionOptions<O> = {},
  ): Promise<O | undefined> {
    if (!this.trx) {
      const trx = await this.ky.startTransaction().execute()

      this.log?.debug('Run in transaction')
      this.trx = trx
      try {
        const result = await fn(trx)
        await trx.commit().execute()
        await options.onCommit?.(result)
        return result
      } catch (e) {
        await trx.rollback().execute()
        this.logError(e, options.errorMsg)
        await options.onRollback?.(e)
        return undefined
      } finally {
        this.trx = undefined
      }
    }

    this.trxCount++
    const spName = `SP_${this.trxCount}`
    this.log?.debug(`Run in savepoint: ${spName}`)
    const sp = await this.trx.savepoint(spName).execute()
    try {
      const result = await fn(this.kysely as Transaction<DB>)
      await sp.releaseSavepoint(spName).execute()
      await options.onCommit?.(result)
      return result
    } catch (e) {
      await sp.rollbackToSavepoint(spName).execute()
      await options.onRollback?.(e)
      this.logError(e, options.errorMsg)
      return undefined
    } finally {
      this.trxCount--
    }
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
    if ((data as RawBuilder<O>).as) {
      return await (data as RawBuilder<O>).execute(this.kysely)
    }
    return await executeSQL(this.kysely, data as any, parameters)
  }

  /**
   * Destroy db connection
   */
  public async destroy(): Promise<void> {
    this.log?.info('Destroyed')
    await this.ky.destroy()
    this.trx = undefined
  }
}
