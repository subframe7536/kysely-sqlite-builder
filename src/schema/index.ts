import type { Kysely } from 'kysely'
import type { DBLogger, SchemaUpdater } from '../types'
import type { SchemaSyncOptions } from './core'
import type { Schema } from './types'
import { generateSyncTableSQL, syncTables } from './core'
import { parseExistSchema } from './parse-exist'

export { DataType } from './column'
export { defaultFallbackFunction, generateSyncTableSQL } from './core'
export type { ColumnFallbackInfo, SchemaSyncOptions } from './core'
export { column, defineTable } from './define'
export { parseExistSchema } from './parse-exist'
export { migrateWholeTable, parseColumnType, type RestoreColumnList } from './run'
export type { ColumnProperty, Columns, InferDatabase, InferTable, Schema, Table, TableProperty } from './types'

/**
 * Auto sync table using schema, only sync table/index/trigger
 * @param schema table schema, see {@link defineTable}
 * @param options sync options
 */
export function useSchema<T extends Schema>(
  schema: T,
  options: SchemaSyncOptions<T> = {},
): SchemaUpdater {
  return async (db: Kysely<any>, logger?: DBLogger) => await syncTables(
    db,
    schema,
    options,
    options.log ? logger : undefined,
  )
}

export async function generateMigrateSQL<T extends Schema>(
  db: Kysely<any>,
  schema: T,
  options: Pick<SchemaSyncOptions<T>, 'excludeTablePrefix' | 'truncateIfExists' | 'fallback'> = {},
): Promise<string[]> {
  return generateSyncTableSQL(
    db,
    await parseExistSchema(db, options.excludeTablePrefix),
    schema,
    options.truncateIfExists,
    undefined,
    options.fallback,
  )
}
