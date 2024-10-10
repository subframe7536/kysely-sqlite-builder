import type { Arrayable, Promisable, StringKeys } from '@subframe7536/type-utils'
import type { Kysely, Transaction } from 'kysely'
import type { DBLogger, StatusResult } from '../types'
import type { ColumnProperty, Columns, InferDatabase, Schema, Table } from './types'
import { getOrSetDBVersion } from '../pragma'
import { executeSQL } from '../utils'
import { type ParsedColumnProperty, type ParsedSchema, type ParsedTableInfo, parseExistSchema } from './parse-exist'
import {
  addColumn,
  createTable,
  createTableIndex,
  createTableWithIndexAndTrigger,
  createTimeTrigger,
  dropColumn,
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
  const existTableMap = new Map(Object.entries(existSchema.table))
  const targetSchemaMap = new Map(Object.entries(targetSchema))

  const truncateTableSet = new Set(
    Array.isArray(truncateIfExists)
      ? truncateIfExists
      : truncateIfExists
        ? existTableMap.keys()
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

  for (const [existTableName, existTable] of existTableMap) {
    if (targetSchemaMap.has(existTableName)) {
      const targetTable = targetSchemaMap.get(existTableName)!
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

  for (const [targetTableName, targetTable] of targetSchemaMap) {
    if (!existTableMap.has(targetTableName)) {
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
export function updateTableColumns(
  trx: Kysely<any> | Transaction<any>,
  tableName: string,
  targetTable: Table,
  existTable: ParsedTableInfo,
): any {
  const targetColumnMap = new Map(Object.entries(targetTable.columns as Columns))
  const existColumnMap = new Map(Object.entries(existTable.columns))
  const insertColumnList: string[] = []
  const updateColumnList: RestoreColumnList = []
  const deleteColumnList: string[] = []
  for (const [name, { type, defaultTo, notNull }] of targetColumnMap) {
    if (!existColumnMap.has(name)) {
      insertColumnList.push(name)
      continue
    }
    const existColumnInfo = existColumnMap.get(name)!
    const parsedTargetColumnType = parseColumnType(type)[0]
    if (existColumnInfo) {
      if (
        existColumnInfo.type === parsedTargetColumnType
        && existColumnInfo.notNull === notNull
        && existColumnInfo.defaultTo === defaultTo
      ) {
        updateColumnList.push([name, undefined])
      } else {
        updateColumnList.push([
          name,
          (existColumnInfo.notNull || !notNull)
          // exist column already not null,
          // or new table column is nullable,
          // so no need to set fallback value
            ? undefined
            : parsedTargetColumnType === 'TEXT' ? '0' : 0,
        ])
      }
    } else if (notNull && !defaultTo) {
      updateColumnList.push([name, parsedTargetColumnType === 'TEXT' ? '1' : 1])
    }
  }
  for (const [name] of existColumnMap) {
    if (!targetColumnMap.has(name)) {
      deleteColumnList.push(name)
    }
  }
  if (isPKOrUKChanged(existTable.primary, targetTable.primary) || updateColumnList.length > 0) {
    return updateTableSchemaSQL(trx, tableName, updateColumnList, targetTable)
  }
  if (insertColumnList.length > 0 || deleteColumnList.length > 0) {
    return [
      ...insertColumnList.map(name => addColumn(trx, tableName, name, targetColumnMap.get(name)!)),
      ...deleteColumnList.map(name => dropColumn(tableName, name)),
    ]
  }
}

function parseRestoreColumnList(targetTable: Table, existTable: ParsedTableInfo): [isChanged: boolean, list: RestoreColumnList] {
  const restoreColumnList: RestoreColumnList = []
  // if primary key changed, all columns need to rebuild
  let isChanged = isPKOrUKChanged(existTable.primary, targetTable.primary)

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

function isPKOrUKChanged(existPK: string[], targetPK: Arrayable<string> | undefined): boolean {
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
