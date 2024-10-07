import type { Arrayable, Promisable, StringKeys } from '@subframe7536/type-utils'
import type { Kysely } from 'kysely'
import type { DBLogger, StatusResult } from '../types'
import type { ColumnProperty, InferDatabase, Schema, Table } from './types'
import { getOrSetDBVersion } from '../pragma'
import { executeSQL } from '../utils'
import { type ParsedSchema, type ParsedTableInfo, parseExistSchema } from './parse-exist'
import {
  createTable,
  createTableIndex,
  createTableWithIndexAndTrigger,
  createTimeTrigger,
  dropIndex,
  dropTable,
  dropTrigger,
  parseColumnType,
  renameTable,
  restoreColumns,
} from './run'

export type SyncOptions<T extends Schema> = {
  /**
   * Whether to enable debug logger
   */
  log?: boolean
  /**
   * Version control
   */
  version?: {
    /**
     * Current version
     */
    current: number
    /**
     * Whether to skip sync when the db's `user_version` is same with `version.current`
     */
    skipSyncWhenSame: boolean
  }
  /**
   * Exclude table prefix list, append with `%`
   *
   * `sqlite_%` by default
   */
  excludeTablePrefix?: string[]
  /**
   * Do not restore data from old table to new table
   */
  truncateIfExists?: boolean | Array<StringKeys<T> | string & {}>
  /**
   * Trigger on sync success
   * @param db kysely instance
   * @param oldSchema old database schema
   * @param oldVersion old database version
   */
  onSyncSuccess?: (
    db: Kysely<InferDatabase<T>>,
    oldSchema: ParsedSchema,
    oldVersion: number | undefined
  ) => Promisable<void>
  /**
   * Trigger on sync fail
   * @param err error
   * @param sql failed sql
   * @param existSchema old database schema
   * @param targetSchema new database schema
   */
  onSyncFail?: (err: unknown, sql: string, existSchema: ParsedSchema, targetSchema: T) => Promisable<void>
}

export function generateSyncTableSQL<T extends Schema>(
  db: Kysely<any>,
  existSchema: ParsedSchema,
  targetSchema: T,
  truncateIfExists: SyncOptions<T>['truncateIfExists'] = [],
  debug: (e: string) => void = () => {},
): string[] {
  const truncateTableSet = new Set(
    Array.isArray(truncateIfExists)
      ? truncateIfExists
      : truncateIfExists
        ? Object.keys(existSchema.table)
        : [],
  )

  const result: string[] = []

  // todo)) drop index later
  for (const idx of existSchema.index) {
    result.push(dropIndex(idx))
  }

  // todo)) drop trigger later
  for (const tgr of existSchema.trigger) {
    result.push(dropTrigger(tgr))
  }

  for (const [existTableName, existTable] of Object.entries(existSchema.table)) {
    if (existTableName in targetSchema) {
      const targetTable = targetSchema[existTableName]
      if (truncateTableSet.has(existTableName)) {
        debug(`Update table "${existTableName}" and truncate`)
        result.push(dropTable(existTableName))
        result.push(...createTableWithIndexAndTrigger(db, existTableName, targetTable))
      } else {
        debug(`Update table "${existTableName}"`)
        const [isChanged, restoreColumnList] = parseRestoreColumnList(targetTable, existTable)

        if (isChanged) {
          result.push(...updateTableSchemaSQL(db, existTableName, restoreColumnList, targetTable))
        }
      }
    } else {
      debug(`Delete table "${existTableName}"`)
      result.push(dropTable(existTableName))
    }
  }

  for (const [targetTableName, targetTable] of Object.entries(targetSchema)) {
    if (!(targetTableName in existSchema.table)) {
      debug(`Create table "${targetTableName}"`)
      result.push(...createTableWithIndexAndTrigger(db, targetTableName, targetTable))
    }
  }

  return result
}

/**
 * Restore column list with default value
 * - If value is `0` or `'0'`, the column is exists in old table
 * - If value is `1` or `'1'`, the column is not exists in old table
 * - If value is `undefined`, the column is no need to fix value in old table
 */
export type RestoreColumnList = [name: string, notNullFallbackValue: 0 | 1 | '0' | '1' | undefined][]

// todo)) parse createList, updateList, deleteList and generate sql
// cases:
// - change primary key
// - add new column: alter table add column type...
// - remove old column: alter table drop column
// - no changed column
// - change column
//    - type changed / default changed / notnull changed
//    - nullable -> not null
//    - not null -> nullable
function updateColumnTable(targetTable: Table, existTable: ParsedTableInfo) {
  for (const [name, prop] of Object.entries(targetTable.columns)) {
    const { type, defaultTo, notNull } = prop as ColumnProperty
    const existColumnInfo = existTable.columns[name]
    const parsedTargetColumnType = parseColumnType(type)[0]
  }
}

function parseRestoreColumnList(targetTable: Table, existTable: ParsedTableInfo): [isChanged: boolean, list: RestoreColumnList] {
  const restoreColumnList: RestoreColumnList = []
  // if primary key changed, all columns need to rebuild
  let isChanged = isPKChanged(existTable.primary, targetTable.primary)

  for (const [name, prop] of Object.entries(targetTable.columns)) {
    const { type, defaultTo, notNull } = prop as ColumnProperty
    const existColumnInfo = existTable.columns[name]
    const parsedTargetColumnType = parseColumnType(type)[0]

    let item
    if (existColumnInfo) {
      if (
        existColumnInfo.type === parsedTargetColumnType
        && existColumnInfo.notNull === notNull
        && existColumnInfo.defaultTo === defaultTo
      ) {
        item = [name, undefined]
      } else {
        // column exists in old table and have same type
        item = [
          name,
          (existColumnInfo.notNull || !notNull)
            ? undefined // exist column already not null, or new table column is nullable, so no need to set fallback value
            : parsedTargetColumnType ? '0' : 0,
        ]
      }
    } else if (!existColumnInfo && notNull && !defaultTo) {
      // column not exists in old table, and new table column is not null and have no default value
      item = [name, parsedTargetColumnType === 'TEXT' ? '1' : 1]
    }

    // fixme))
    if (!item?.[1]) {
      isChanged = true
    }
    restoreColumnList.push(item as RestoreColumnList[number])
  }

  return [isChanged, restoreColumnList]
}

function isPKChanged(existPK: string[], targetPK: Arrayable<string> | undefined): boolean {
  if (!Array.isArray(targetPK)) {
    targetPK = targetPK ? [] : [targetPK!]
  }
  if (existPK.length !== targetPK.length) {
    return true
  }
  existPK = existPK.sort()
  targetPK = targetPK.sort()
  for (let i = 0; i < existPK.length; i++) {
    if (existPK[i] !== targetPK[i]) {
      return true
    }
  }
  return false
}

/**
 * Migrate table data see https://sqlite.org/lang_altertable.html 7. Making Other Kinds Of Table Schema Changes
 */
export function updateTableSchemaSQL(
  trx: Kysely<any>,
  tableName: string,
  restoreColumnList: RestoreColumnList,
  targetTable: Table,
): string[] {
  const result: string[] = []
  const tempTableName = `_temp_${tableName}`

  // 1. create target table with temp name
  const { triggerOptions, sql } = createTable(trx, tempTableName, targetTable)
  result.push(sql)

  // 2. diff and restore data from source table to target table
  if (restoreColumnList.length) {
    result.push(restoreColumns(tableName, tempTableName, restoreColumnList))
  }

  // 3. remove old table
  result.push(dropTable(tableName))

  // 4. rename temp table to target table name
  result.push(renameTable(tempTableName, tableName))

  // 5. restore indexes and triggers
  result.push(...createTableIndex(tableName, targetTable.index))
  const triggerSql = createTimeTrigger(tableName, triggerOptions)
  if (triggerSql) {
    result.push(triggerSql)
  }

  return result
}

export async function syncTables<T extends Schema>(
  db: Kysely<any>,
  targetSchema: T,
  options: SyncOptions<T> = {},
  logger?: DBLogger,
): Promise<StatusResult> {
  const {
    truncateIfExists = [],
    log,
    version: { current, skipSyncWhenSame } = {},
    excludeTablePrefix,
    onSyncSuccess,
    onSyncFail,
  } = options

  let oldVersion: number

  if (current) {
    oldVersion = await getOrSetDBVersion(db)
    if (skipSyncWhenSame && current === oldVersion) {
      return { ready: true }
    }
    await getOrSetDBVersion(db, current)
  }

  const debug = (e: string): any => log && logger?.debug(e)
  debug('Sync tables start:')
  const existSchema = await parseExistSchema(db, excludeTablePrefix)
  let i = 0
  const sqls = generateSyncTableSQL(
    db,
    existSchema,
    targetSchema,
    truncateIfExists,
    (e: string): any => log && logger?.debug(`- ${e}`),
  )

  return await db.transaction()
    .execute(async (trx) => {
      for (; i < sqls.length; i++) {
        await executeSQL(trx, sqls[i])
      }
    })
    .then(async () => {
      await onSyncSuccess?.(db, existSchema, oldVersion)
      debug('Sync tables success')
      return { ready: true as const }
    })
    .catch(async (e) => {
      await onSyncFail?.(e, sqls[i], existSchema, targetSchema)
      debug(`Sync tables fail, ${e}`)
      return { ready: false, error: e }
    })
}
