import type { Kysely } from 'kysely'
import type { DBLogger, SchemaUpdater } from '../types'
import type { SyncOptions } from './core'
import type { Schema } from './types'
import { syncTables } from './core'

export { generateSyncTableSQL } from './core'
export { column, defineTable } from './define'
export { parseExistSchema } from './parse-exist'
export * from './types'

/**
 * Auto sync table using schema, only sync table/index/trigger
 * @param schema table schema, see {@link defineTable}
 * @param options sync options
 */
export function useSchema<T extends Schema>(
  schema: T,
  options: SyncOptions<T> = {},
): SchemaUpdater {
  return async (db: Kysely<any>, logger?: DBLogger) => await syncTables(
    db,
    schema,
    options,
    options.log ? logger : undefined,
  )
}
