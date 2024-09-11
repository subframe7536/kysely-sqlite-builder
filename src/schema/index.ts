import type { Kysely } from 'kysely'
import { syncTables } from './core'
import type { DBLogger, SchemaUpdater } from '../types'
import type { SyncOptions } from './core'
import type { Schema } from './types'

export { column, defineTable } from './define'

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
  const { log } = options
  return async (db: Kysely<any>, logger?: DBLogger) => await syncTables(
    db,
    schema,
    options,
    log ? logger : undefined,
  )
}
