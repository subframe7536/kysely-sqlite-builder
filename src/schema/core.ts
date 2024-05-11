import { sql } from 'kysely'
import type { Kysely, Transaction } from 'kysely'
import type { Promisable, StringKeys } from '@subframe7536/type-utils'
import { getOrSetDBVersion } from '../pragma'
import type { DBLogger, StatusResult } from '../types'
import type { Columns, InferDatabase, Schema, Table } from './types'
import {
  parseColumnType,
  runCreateTable,
  runCreateTableIndex,
  runCreateTableWithIndexAndTrigger,
  runCreateTimeTrigger,
  runDropTable,
  runRenameTable,
} from './run'
import { type ParsedCreateTableSQL, type ParsedSchema, parseExistDB } from './parse-exist'

export type SyncOptions<T extends Schema> = {
  /**
   * whether to enable debug logger
   */
  log?: boolean
  /**
   * version control
   */
  version?: {
    /**
     * current version
     */
    current: number
    /**
     * whether to skip sync when the db's `user_version` is same with `version.current`
     */
    skipSyncWhenSame: boolean
  }
  /**
   * exclude table prefix list, append with `%`
   *
   * `sqlite_%` by default
   */
  excludeTablePrefix?: string[]
  /**
   * do not restore data from old table to new table
   */
  truncateIfExists?: boolean | Array<StringKeys<T> | string & {}>
  /**
   * trigger on sync success
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
   * trigger on sync fail
   */
  onSyncFail?: (err: unknown) => Promisable<void>
}

export async function syncTables<T extends Schema>(
  db: Kysely<any>,
  targetTables: T,
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

  const debug = (e: string) => log && logger?.debug('[ schema sync ] ' + e)
  debug('======== update tables start ========')
  const existDB = await parseExistDB(db, excludeTablePrefix)

  const truncateTableSet = new Set(
    Array.isArray(truncateIfExists)
      ? truncateIfExists
      : truncateIfExists
        ? Object.keys(existDB.existTables)
        : [],
  )

  return await db.transaction()
    .execute(async (trx) => {
      for (const idx of existDB.indexList) {
        await trx.schema.dropIndex(idx).ifExists().execute()
        debug('drop index: ' + idx)
      }

      for (const tgr of existDB.triggerList) {
        await sql`drop trigger if exists ${sql.ref(tgr)}`.execute(trx)
        debug('drop trigger: ' + tgr)
      }

      for (const [existTableName, existColumns] of Object.entries(existDB.existTables)) {
        if (existTableName in targetTables) {
          debug('diff table: ' + existTableName)
          try {
            await diffTable(trx, existTableName, existColumns, targetTables[existTableName])
          } catch (e) {
            logger?.error('fail to sync ' + existTableName, e as any)
            throw e
          }
        } else {
          debug('drop table: ' + existTableName)
          await runDropTable(trx, existTableName)
        }
      }

      for (const [targetTableName, targetTable] of Object.entries(targetTables)) {
        if (!(targetTableName in existDB.existTables)) {
          debug('create table with index and trigger: ' + targetTableName)
          await runCreateTableWithIndexAndTrigger(trx, targetTableName, targetTable)
        }
      }
    })
    .then(() => {
      onSyncSuccess?.(db, existDB, oldVersion)
      debug('======= update tables success =======')
      return { ready: true as const }
    })
    .catch((e) => {
      onSyncFail?.(e)
      debug('======== update tables fail =========')
      return { ready: false, error: e }
    })

  async function diffTable(
    trx: Transaction<any>,
    tableName: string,
    existColumns: ParsedCreateTableSQL,
    targetColumns: Table,
  ): Promise<void> {
    if (truncateTableSet.has(tableName)) {
      await runDropTable(trx, tableName)
      await runCreateTableWithIndexAndTrigger(trx, tableName, targetColumns)
      debug('clear and sync structure for table "' + tableName + '"')
      return
    }
    const { index, ...props } = targetColumns

    const restoreColumnList = getRestoreColumnList(existColumns.columns, targetColumns.columns)

    // if all columns are in same table structure, skip
    if (restoreColumnList.length === Object.keys(existColumns.columns).length) {
      debug('same table structure, skip table "' + tableName + '"')
      return
    }
    //
    // migrate table data
    // see https://sqlite.org/lang_altertable.html 7. Making Other Kinds Of Table Schema Changes
    //
    debug('different table structure, update table "' + tableName + '" with index and trigger, restore columns: ' + restoreColumnList)
    const tempTableName = '_temp_' + tableName

    // 1. create target table with temp name
    const triggerOptions = await runCreateTable(trx, tempTableName, props)

    // 2. diff and restore data from source table to target table
    if (restoreColumnList.length) {
      const cols = sql.raw(restoreColumnList.map(c => '"' + c + '"').join(', '))
      sql`insert into ${sql.table(tempTableName)} (${cols}) select ${cols} from ${sql.table(tableName)}`.execute(trx)
    }
    // 3. remove old table
    await runDropTable(trx, tableName)

    // 4. rename temp table to target table name
    await runRenameTable(trx, tempTableName, tableName)

    // 5. add indexes and triggers
    await runCreateTableIndex(trx, tableName, index)
    await runCreateTimeTrigger(trx, tableName, triggerOptions)
  }
}

function getRestoreColumnList(
  existColumns: ParsedCreateTableSQL['columns'],
  targetColumns: Table['columns'],
): string[] {
  const list: string[] = []
  for (const [col, targetColumn] of Object.entries(targetColumns as Columns)) {
    if (
      col in existColumns
      && parseColumnType(targetColumn.type)[0] === existColumns[col].type
      && (targetColumn.notNull || false) === (existColumns[col].notNull || false)
    ) {
      list.push(col)
    }
  }
  return list
}
