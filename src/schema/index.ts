import type { Kysely } from 'kysely'
import type { DBLogger, TableUpdater } from '../types'
import type { Schema } from './types'
import type { SyncOptions } from './core'
import { syncTables } from './core'

export * from './types'

export { defineTable, column } from './define'

/**
 * auto sync table using schema, only sync table/index/trigger
 * @param schema table schema, see {@link defineTable}
 * @param options sync options
 */
export function useSchema<T extends Schema>(
  schema: T,
  options: SyncOptions<T> = {},
): TableUpdater {
  const { log } = options
  return (db: Kysely<any>, logger?: DBLogger) => syncTables(db, schema, options, log ? logger : undefined)
}
