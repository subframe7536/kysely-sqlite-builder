import type { Arrayable, Promisable, StringKeys } from '@subframe7536/type-utils'
import type { DBLogger, StatusResult } from '../types'
import { type Kysely, type RawBuilder, sql, type Transaction } from 'kysely'
import { getOrSetDBVersion } from '../pragma'
import { executeSQL } from '../utils'
import { TGRU } from './define'
import { type ParsedColumnProperty, type ParsedSchema, type ParsedTableInfo, parseExistSchema } from './parse-exist'
import {
  addColumn,
  createIndex,
  createTable,
  createTableIndex,
  createTableWithIndexAndTrigger,
  createTimeTrigger,
  dropColumn,
  dropIndex,
  dropTable,
  dropTrigger,
  migrateColumnsFromTemp,
  parseColumnType,
  parseDefaultValue,
  renameTable,
} from './run'
import {
  type Columns,
  DataType,
  type DataTypeValue,
  type InferDatabase,
  type ParsedColumnType,
  type Schema,
  type Table,
  type TableProperty,
} from './types'

export type ColumnFallbackInfo = {
  /**
   * Table name
   */
  table: string
  /**
   * Column name
   */
  column: string
  /**
   * Exist column info, `undefined` if there is no exising column with same target name
   */
  exist: ParsedColumnProperty | undefined
  /**
   * Target column info
   */
  target: Omit<ParsedColumnProperty, 'type'> & {
    /**
     * {@link DataType} in schema
     */
    type: DataTypeValue
    /**
     * DataType in SQLite
     */
    parsedType: ParsedColumnType
  }
}

type ColumnFallbackFn = (data: ColumnFallbackInfo) => RawBuilder<unknown>

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
   * Function to determine default values for migrated columns,
   * default is {@link defaultFallbackFunction}
   */
  fallback?: ColumnFallbackFn
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
   * @param sql failed sql, if `undefined`, there exists some errors in schema
   * @param existSchema old database schema
   * @param targetSchema new database schema
   */
  onSyncFail?: (err: unknown, sql: string | undefined, existSchema: ParsedSchema, targetSchema: T) => Promisable<void>
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
    fallback: fallbackColumnValue,
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
  let sqls: string[] = []
  try {
    sqls = generateSyncTableSQL<T>(
      db,
      existSchema,
      targetSchema,
      truncateIfExists,
      debug,
      fallbackColumnValue,
    )
  } catch (e) {
    await onSyncFail?.(e, undefined, existSchema, targetSchema)
    debug(`Sync tables fail, ${e}`)
    return { ready: false, error: e }
  }

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

/**
 * Restore column list with default value (sql string)
 */
export type RestoreColumnList = [name: string, select: string][]

export const defaultFallbackFunction: ColumnFallbackFn = ({ target }) => target.parsedType === 'TEXT' ? sql`'0'` : sql`0`

/**
 * Generates SQL statements for synchronizing a database schema.
 *
 * @param db - The Kysely database instance.
 * @param existSchema - The existing database schema.
 * @param targetSchema - The target schema to synchronize to.
 * @param truncateIfExists - Tables to truncate if they exist, default is `[]`.
 * @param debug - Optional debug function for logging SQL generation steps.
 * @param fallback - Function to determine default values for migrated columns, default is {@link defaultFallbackFunction}
 */
export function generateSyncTableSQL<T extends Schema>(
  db: Kysely<any>,
  existSchema: ParsedSchema,
  targetSchema: T,
  truncateIfExists: SyncOptions<T>['truncateIfExists'] = [],
  debug: (msg: string) => void = () => { },
  fallback: ColumnFallbackFn = defaultFallbackFunction,
): string[] {
  const existTableMap = new Map(Object.entries(existSchema))
  const targetSchemaMap = new Map(Object.entries(targetSchema))

  const truncateTableSet = new Set(
    Array.isArray(truncateIfExists)
      ? truncateIfExists
      : truncateIfExists
        ? existTableMap.keys()
        : [],
  )

  const sqls: string[] = []

  for (const [existTableName, existTable] of existTableMap) {
    if (targetSchemaMap.has(existTableName)) {
      const targetTable = targetSchemaMap.get(existTableName)!
      if (truncateTableSet.has(existTableName)) {
        debug(`Update table "${existTableName}" and truncate`)
        sqls.push(dropTable(existTableName))
        sqls.push(...createTableWithIndexAndTrigger(db, existTableName, targetTable))
      } else {
        debug(`Update table "${existTableName}"`)
        sqls.push(...updateTable(db, existTableName, existTable, targetTable, fallback))
      }
    } else {
      debug(`Delete table "${existTableName}"`)
      sqls.push(dropTable(existTableName))
    }
  }

  for (const [targetTableName, targetTable] of targetSchemaMap) {
    if (!existTableMap.has(targetTableName)) {
      debug(`Create table "${targetTableName}"`)
      sqls.push(...createTableWithIndexAndTrigger(db, targetTableName, targetTable))
    }
  }
  return sqls
}

function updateTable(
  trx: Kysely<any> | Transaction<any>,
  tableName: string,
  existTable: ParsedTableInfo,
  targetTable: Table,
  migrateColumn: Exclude<SyncOptions<any>['fallback'], undefined>,
): string[] {
  const targetColumnMap = new Map(Object.entries(targetTable.columns as Columns))
  const existColumnMap = new Map(Object.entries(existTable.columns))
  const insertColumnList: string[] = []
  const updateColumnList: RestoreColumnList = []
  const deleteColumnList: string[] = []

  let updateTimeColumn
  let autoIncrementColumn
  let isChanged = isPrimaryKeyChanged(existTable.primary, targetTable.primary)
    || isUniqueChanged(existTable.unique, targetTable.unique)

  for (const [name, { type, defaultTo, notNull }] of targetColumnMap) {
    const existColumnInfo = existColumnMap.get(name)
    const parsedTargetColumn: ColumnFallbackInfo['target'] = {
      type,
      parsedType: parseColumnType(type)[0],
      defaultTo: parseDefaultValue(trx, defaultTo) || null,
      notNull: !!notNull,
    }
    const getFallbackValue = (): string => migrateColumn({
      column: name,
      exist: existColumnInfo,
      target: parsedTargetColumn,
      table: tableName,
    }).compile(trx).sql

    if (defaultTo === TGRU) {
      updateTimeColumn = name
    }

    if (type === DataType.increments) {
      if (autoIncrementColumn) {
        throw new Error(`Multiple AUTOINCREMENT columns (${autoIncrementColumn}, ${name}) in table ${tableName}`)
      }
      autoIncrementColumn = name
    }

    if (existColumnInfo) {
      if (
        existColumnInfo.type === parsedTargetColumn.parsedType
        && existColumnInfo.notNull === parsedTargetColumn.notNull
        && existColumnInfo.defaultTo === parsedTargetColumn.defaultTo
      ) {
        updateColumnList.push([name, `"${name}"`])
      } else {
        isChanged = true
        updateColumnList.push([
          name,
          // exist column already not null,
          // or new table column is nullable,
          // so no need to set fallback value
          (existColumnInfo.notNull || !notNull)
            ? `"${name}"`
            : `IFNULL(CAST("${name}" AS ${parsedTargetColumn.parsedType}),${getFallbackValue()})`,
        ])
      }
    } else {
      insertColumnList.push(name)

      // if new column is not null and have no default value, set fallback value
      if (notNull && !defaultTo) {
        isChanged = true
        updateColumnList.push([name, getFallbackValue()])
      }
    }
  }

  for (const [name] of existColumnMap) {
    if (!targetColumnMap.has(name)) {
      deleteColumnList.push(name)
    }
  }

  if (isChanged) {
    return migrateWholeTable(trx, tableName, updateColumnList, targetTable)
  }

  const result = [
    ...insertColumnList.map(col => addColumn(trx, tableName, col, targetColumnMap.get(col)!)),
    // no need to handle drop column on unique / primary key
    // because in this case, `isChanged` will be true
    ...deleteColumnList.map(col => dropColumn(tableName, col)),
  ]

  const [insertIndexList, deleteIndexList] = parseChangedList(existTable.index, targetTable.index || [])

  result.push(
    ...insertIndexList.map(colList => createIndex(tableName, colList)),
    ...deleteIndexList.map(colList => dropIndex(tableName, colList)),
  )

  const existTrigger = existTable.trigger[0]
  if (existTrigger !== `tgr_${tableName}_${updateTimeColumn}`) {
    if (existTrigger) {
      result.splice(0, 0, dropTrigger(existTrigger))
    }
    if (updateTimeColumn) {
      result.push(createTimeTrigger(tableName, updateTimeColumn)!)
    }
  }

  return result
}

function isPrimaryKeyChanged(existPK: string[], targetPK: TableProperty<any>['primary']): boolean {
  if (!targetPK) {
    return existPK.length > 0
  }
  if (!Array.isArray(targetPK)) {
    targetPK = [targetPK]
  }
  if (existPK.length !== targetPK.length) {
    return true
  }
  return existPK.some((v, i) => v !== targetPK[i])
}

function isUniqueChanged(existUnique: string[][], targetUnique: TableProperty<any>['unique']): boolean {
  if (!targetUnique) {
    return existUnique.length > 0
  }
  const [insertUniqueList, deleteUniqueList] = parseChangedList(existUnique, targetUnique)
  return insertUniqueList.length > 0 || deleteUniqueList.length > 0
}

export function parseChangedList(
  existIndexList: string[][],
  targetIndexList: Arrayable<string>[],
): [add: string[][], del: string[][]] {
  const existSet = new Set(existIndexList.map(arr => arr.join('|')))
  const targetSet = new Set()
  const addList: string[][] = []

  for (const index of targetIndexList) {
    const hash = Array.isArray(index) ? index.join('|') : index
    targetSet.add(hash)
    if (!existSet.has(hash)) {
      addList.push(Array.isArray(index) ? index : [index])
    }
  }

  const delList = existIndexList.filter(index => !targetSet.has(index.join('|')))

  return [addList, delList]
}

/**
 * Migrate table data see https://sqlite.org/lang_altertable.html 7. Making Other Kinds Of Table Schema Changes
 */
function migrateWholeTable(
  trx: Kysely<any>,
  tableName: string,
  restoreColumnList: RestoreColumnList,
  targetTable: Table,
): string[] {
  const result: string[] = []
  const tempTableName = `_temp_${tableName}`

  // 1. create target table with temp name
  const { updateColumn, sql } = createTable(trx, tempTableName, targetTable)
  result.push(sql)

  // 2. diff and restore data from source table to target table
  if (restoreColumnList.length) {
    result.push(migrateColumnsFromTemp(tableName, tempTableName, restoreColumnList))
  }

  // 3. remove old table
  result.push(dropTable(tableName))

  // 4. rename temp table to target table name
  result.push(renameTable(tempTableName, tableName))

  // 5. restore indexes and triggers
  result.push(...createTableIndex(tableName, targetTable.index))
  const triggerSql = createTimeTrigger(tableName, updateColumn)
  if (triggerSql) {
    result.push(triggerSql)
  }

  return result
}
