import { CompiledQuery } from 'kysely'
import type { DatabaseConnection, Kysely, QueryResult, Transaction } from 'kysely'

type KyselyInstance = DatabaseConnection | Kysely<any> | Transaction<any>

/**
 * Check integrity_check pragma
 */
export async function checkIntegrity(db: KyselyInstance): Promise<boolean> {
  const { rows } = await db.executeQuery(CompiledQuery.raw('PRAGMA integrity_check'))
  if (!rows.length) {
    throw new Error('fail to check integrity')
  }
  // @ts-expect-error result
  return rows[0].integrity_check === 'ok'
}

/**
 * Control whether to enable foreign keys, **no param check**
 */
export async function foreignKeys(db: KyselyInstance, enable: boolean): Promise<void> {
  await db.executeQuery(CompiledQuery.raw('PRAGMA foreign_keys = ' + enable))
}

/**
 * Get or set user_version pragma, **no param check**
 */
export async function getOrSetDBVersion(db: KyselyInstance, version?: number): Promise<number> {
  if (version) {
    await db.executeQuery(CompiledQuery.raw('PRAGMA user_version = ' + version))
    return version
  }
  const { rows } = await db.executeQuery(CompiledQuery.raw('PRAGMA user_version'))
  if (!rows.length) {
    throw new Error('fail to get DBVersion')
  }
  // @ts-expect-error get user version
  return rows[0].user_version
}

export type PragmaJournalMode = 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF'

export type PragmaTempStore = 0 | 'DEFAULT' | 1 | 'FILE' | 2 | 'MEMORY'

export type PragmaSynchronous = 0 | 'OFF' | 1 | 'NORMAL' | 2 | 'FULL' | 3 | 'EXTRA'

export type OptimizePragmaOptions = {
  /**
   * @default 4096
   * @see https://sqlite.org/pragma.html#pragma_cache_size
   */
  cache_size?: number
  /**
   * @default 32768
   * @see https://sqlite.org/pragma.html#pragma_page_size
   */
  page_size?: number
  /**
   * @default -1 (default value)
   * @see https://sqlite.org/pragma.html#pragma_mmap_size
   */
  mmap_size?: number
  /**
   * @default 'WAL'
   * @see https://sqlite.org/pragma.html#pragma_journal_mode
   */
  journal_mode?: PragmaJournalMode
  /**
   * @default 'MEMORY'
   * @see https://sqlite.org/pragma.html#pragma_temp_store
   */
  temp_store?: PragmaTempStore
  /**
   * @default 'NORMAL'
   * @see https://sqlite.org/pragma.html#pragma_synchronous
   */
  synchronous?: PragmaSynchronous
}

/**
 * Call optimize pragma, **no param check**
 * @param db database connection
 * @param options pragma options, {@link OptimizePragmaOptions details}
 */
export async function optimizePragma(
  db: KyselyInstance,
  options: OptimizePragmaOptions = {},
): Promise<void> {
  const entries = Object.entries({
    mmap_size: -1,
    cache_size: 4096,
    page_size: 32768,
    journal_mode: 'WAL',
    temp_store: 'MEMORY',
    synchronous: 'NORMAL',
    ...options,
  })
  for (const [pragma, value] of entries) {
    await db.executeQuery(CompiledQuery.raw('PRAGMA ' + pragma + ' = ' + value))
  }
}
/**
 * Optimize db file
 * @param db database connection
 * @param rebuild if is true, run `vacuum` instead of `pragma optimize`
 * @see https://sqlite.org/pragma.html#pragma_optimize
 * @see https://www.sqlite.org/lang_vacuum.html
 */

export async function optimizeSize(db: KyselyInstance, rebuild = false): Promise<QueryResult<unknown>> {
  return await db.executeQuery(CompiledQuery.raw(rebuild ? 'vacuum' : 'pragma optimize'))
}
