import type { Arrayable } from '@subframe7536/type-utils'
import type { Kysely, RawBuilder, Transaction } from 'kysely'
import type { ColumnProperty, ParsedColumnType, Table } from './types'
import { defaultSerializer } from '../serialize'
import { DataType, type DataTypeValue } from './column'
import { TGRC, TGRU } from './define'

export function parseColumnType(type: DataTypeValue): [type: ParsedColumnType, isAutoIncrement: boolean] {
  let dataType: ParsedColumnType
  let isIncrements = false
  switch (type) {
    case DataType.float:
      dataType = 'REAL'
      break
    case DataType.increments:
      isIncrements = true
    // eslint-disable-next-line no-fallthrough
    case DataType.boolean:
    case DataType.int:
      dataType = 'INTEGER'
      break
    case DataType.blob:
      dataType = 'BLOB'
      break
    // date, object, string or other
    default:
      dataType = 'TEXT'
  }
  return [dataType, isIncrements]
}

export function asArray<T>(arr: Arrayable<T>): T[] {
  return Array.isArray(arr) ? arr : [arr]
}

/**
 * Merge array with `_` and prepend `_`
 *
 * Return merged string and parsed array
 */
function parseArray(arr: Arrayable<any>): [columnListStr: string, key: string, first: string] {
  const columns = asArray(arr)
  let key = ''
  let columnList = ''
  for (const c of columns) {
    key += `_${c}`
    columnList += `"${c}",`
  }
  return [columnList.slice(0, -1), key, columns[0]]
}

/**
 * Parse default value
 */
export function parseDefaultValue(trx: Kysely<any> | Transaction<any>, defaultTo: any): string {
  if (defaultTo === undefined || defaultTo === null) {
    return ''
  }
  if (defaultTo === TGRC || defaultTo === TGRU) {
    return 'CURRENT_TIMESTAMP'
  }
  let _defaultTo = (defaultTo as RawBuilder<unknown>).isRawBuilder
    ? (defaultTo as RawBuilder<unknown>).compile(trx).sql
    : defaultSerializer(defaultTo)
  _defaultTo = typeof _defaultTo === 'string' ? `'${_defaultTo}'` : _defaultTo

  return _defaultTo !== undefined ? String(_defaultTo) : ''
}

function parseDefaultValueWithPrefix(trx: Kysely<any> | Transaction<any>, defaultTo: any): string {
  const result = parseDefaultValue(trx, defaultTo)
  return result ? ` DEFAULT ${result}` : ''
}

export function dropTable(tableName: string): string {
  return `DROP TABLE IF EXISTS "${tableName}";`
}

export function createTableWithIndexAndTrigger(
  trx: Kysely<any> | Transaction<any>,
  tableName: string,
  table: Table<any>,
): string[] {
  const { index, ...props } = table
  const result: string[] = []
  const [sql, updateColumn, triggerColumn] = createTable(trx, tableName, props)
  result.push(sql, ...createTableIndex(tableName, index))
  const triggerSql = createTimeTrigger(tableName, updateColumn, triggerColumn)
  if (triggerSql) {
    result.push(triggerSql)
  }
  return result
}

export function createTableIndex(
  tableName: string,
  index: Arrayable<string>[] = [],
): string[] {
  return index.map((i) => {
    const [columnListStr, key] = parseArray(i)
    return `CREATE INDEX IF NOT EXISTS idx_${tableName + key} on "${tableName}" (${columnListStr});`
  })
}

export function createTable(
  trx: Kysely<any> | Transaction<any>,
  tableName: string,
  { columns, primary, unique, withoutRowId }: Omit<Table, 'index'>,
): [sql: string, updateColumn?: string, triggerColumn?: string] {
  let updateColumn
  let triggerColumn

  const columnList: string[] = []

  for (const [columnName, columnProperty] of Object.entries(columns)) {
    const { type, notNull, defaultTo } = columnProperty as ColumnProperty

    const [dataType, isIncrements] = parseColumnType(type)

    if (isIncrements) {
      if (withoutRowId) {
        throw new Error(`Cannot setup AUTOINCREMENT column "${columnName}" in table "${tableName}" without rowid `)
      }
      if (triggerColumn) {
        throw new Error(`Multiple AUTOINCREMENT columns (${triggerColumn}, ${columnName}) in table ${tableName}`)
      }
      triggerColumn = columnName
      columnList.push(`"${columnName}" ${dataType} PRIMARY KEY AUTOINCREMENT`)
    } else {
      // update trigger column is not null
      // #hack to detect update column
      if (defaultTo === TGRU) {
        updateColumn = columnName
      }
      columnList.push(`"${columnName}" ${dataType}${notNull ? ' NOT NULL' : ''}${parseDefaultValueWithPrefix(trx, defaultTo)}`)
    }
  }

  // primary/unique key is jointable, so can not be set as trigger key
  if (primary) {
    const [targetColumns, key, first] = parseArray(primary)
    if (!triggerColumn) {
      columnList.push(`PRIMARY KEY (${targetColumns})`)
      triggerColumn = first
    } else if (triggerColumn !== key.substring(1)) {
      throw new Error(`Exists AUTOINCREMENT column "${triggerColumn}" in table "${tableName}", cannot setup extra primary key (${targetColumns})`)
    }
  } else if (withoutRowId) {
    throw new Error(`No primary key in table "${tableName}" and "withoutRowId" setup`)
  }

  if (unique) {
    for (const uk of unique) {
      columnList.push(`UNIQUE (${parseArray(uk)[0]})`)
    }
  }

  const rowIdClause = withoutRowId ? ' WITHOUT ROWID' : ''

  return [
    `CREATE TABLE IF NOT EXISTS "${tableName}" (${columnList})${rowIdClause};`,
    updateColumn,
    triggerColumn || 'rowid',
  ]
}

export function createTimeTrigger(tableName: string, updateColumn: string | undefined, triggerColumn: string | undefined): string | undefined {
  if (!updateColumn || !triggerColumn) {
    return
  }
  const triggerName = `tgr_${tableName}_${updateColumn}`
  return `CREATE TRIGGER IF NOT EXISTS "${triggerName}" AFTER UPDATE ON "${tableName}" BEGIN UPDATE "${tableName}" SET "${updateColumn}" = CURRENT_TIMESTAMP WHERE "${triggerColumn}" = NEW."${triggerColumn}"; END;`
}

export function renameTable(tableName: string, newTableName: string): string {
  return `ALTER TABLE "${tableName}" RENAME TO "${newTableName}";`
}

export function addColumn(
  trx: Kysely<any> | Transaction<any>,
  tableName: string,
  columnName: string,
  columnProperty: ColumnProperty,
): string {
  const { type, notNull, defaultTo } = columnProperty
  const [dataType] = parseColumnType(type)
  return `ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${dataType}${notNull ? ' NOT NULL' : ''}${parseDefaultValueWithPrefix(trx, defaultTo)};`
}

export function dropColumn(tableName: string, columnName: string): string {
  return `ALTER TABLE "${tableName}" DROP COLUMN "${columnName}";`
}

export function createIndex(tableName: string, columns: string[]): string {
  const [columnListStr, indexSuffix] = parseArray(columns)
  return `CREATE INDEX IF NOT EXISTS "idx_${tableName}${indexSuffix}" on "${tableName}"(${columnListStr});`
}
export function dropIndex(tableName: string, columns: string[]): string {
  const [, indexSuffix] = parseArray(columns)
  return `DROP INDEX IF EXISTS "idx_${tableName}${indexSuffix}";`
}

export function dropTrigger(triggerName: string): string {
  return `DROP TRIGGER IF EXISTS "${triggerName}";`
}

/**
 * Restore column list with default value (sql string) for {@link migrateWholeTable}
 *
 * `INSERT INTO tempTableName (${names}) SELECT ${selectSQL} FROM tableName;`
 */
export type RestoreColumnList = [name: string, selectSQL: string][]

/**
 * Migrate table data see https://sqlite.org/lang_altertable.html 7. Making Other Kinds Of Table Schema Changes
 */
export function migrateWholeTable(
  trx: Kysely<any>,
  tableName: string,
  restoreColumnList: RestoreColumnList,
  targetTable: Table,
): string[] {
  const result: string[] = []
  const tempTableName = `_temp_${tableName}`

  // 1. create target table with temp name
  const [sql, updateColumn, triggerColumn] = createTable(trx, tempTableName, targetTable)
  result.push(sql)

  // 2. diff and restore data from source table to target table
  if (restoreColumnList.length) {
    let cols = ''
    let values = ''
    for (const [name, selectSQL] of restoreColumnList) {
      cols += `,"${name}"`
      values += `,${selectSQL}`
    }
    result.push(`INSERT INTO "${tempTableName}" (${cols.substring(1)}) SELECT ${values.substring(1)} FROM "${tableName}";`)
  }

  // 3. remove old table
  result.push(dropTable(tableName))

  // 4. rename temp table to target table name
  result.push(renameTable(tempTableName, tableName))

  // 5. restore indexes and triggers
  result.push(...createTableIndex(tableName, targetTable.index))
  const triggerSql = createTimeTrigger(tableName, updateColumn, triggerColumn)
  if (triggerSql) {
    result.push(triggerSql)
  }

  return result
}
