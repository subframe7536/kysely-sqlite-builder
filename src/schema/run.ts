import type { Arrayable } from '@subframe7536/type-utils'
import type { Kysely, RawBuilder, Transaction } from 'kysely'
import type { RestoreColumnList } from './core'
import { defaultSerializer } from '../serialize'
import { TGRC, TGRU } from './define'
import {
  type ColumnProperty,
  DataType,
  type DataTypeValue,
  type ParsedColumnType,
  type Table,
} from './types'

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

/**
 * Merge array with `_` and prepend `_`
 *
 * Return merged string and parsed array
 */
function parseArray(arr: Arrayable<any>): [columnListStr: string, key: string] {
  const columns = Array.isArray(arr) ? arr : [arr]
  let key = ''
  let columnList = ''
  for (const c of columns) {
    key += `_${c}`
    columnList += `"${c}",`
  }
  return [columnList.slice(0, -1), key]
}

/**
 * Parse default value sql with prefix space
 */
function parseDefaultValue(trx: Kysely<any> | Transaction<any>, defaultTo: any): string {
  if (defaultTo === undefined || defaultTo === null) {
    return ''
  }
  const _defaultTo = (defaultTo as RawBuilder<unknown>).isRawBuilder
    ? (defaultTo as RawBuilder<unknown>).compile(trx).sql
    : defaultSerializer(defaultTo)
  return _defaultTo !== undefined ? ` DEFAULT ${_defaultTo}` : ''
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
  const { triggerOptions, sql } = createTable(trx, tableName, props)
  result.push(sql, ...createTableIndex(tableName, index))
  const triggerSql = createTimeTrigger(tableName, triggerOptions)
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
  { columns, primary, timeTrigger, unique }: Omit<Table, 'index'>,
): {
    triggerOptions: RunTriggerOptions | undefined
    sql: string
  } {
  const _triggerOptions: RunTriggerOptions | undefined = timeTrigger
    ? {
        triggerKey: 'rowid',
        update: undefined,
      }
    : undefined

  let autoIncrementColumn

  const columnList: string[] = []

  for (const [columnName, columnProperty] of Object.entries(columns)) {
    const { type, notNull, defaultTo } = columnProperty as ColumnProperty

    const [dataType, isIncrements] = parseColumnType(type)

    if (isIncrements) {
      if (autoIncrementColumn) {
        throw new Error(`Multiple AUTOINCREMENT columns (${autoIncrementColumn}, ${columnName}) in table ${tableName}`)
      }
      autoIncrementColumn = columnName
      if (_triggerOptions) {
        _triggerOptions.triggerKey = columnName
      }
      columnList.push(`"${columnName}" ${dataType} PRIMARY KEY AUTOINCREMENT`)
    } else if (
      // see hacks in `./define.ts`
      // time trigger column is default with TGR
      defaultTo === TGRC || defaultTo === TGRU
    ) {
      // update trigger column is not null
      // #hack to detect update column
      if (_triggerOptions && defaultTo === TGRU) {
        _triggerOptions.update = columnName
      }
      // default with current_timestamp
      columnList.push(`"${columnName}" ${dataType} DEFAULT CURRENT_TIMESTAMP`)
    } else {
      columnList.push(`"${columnName}" ${dataType}${notNull ? ' NOT NULL' : ''}${parseDefaultValue(trx, defaultTo)}`)
    }
  }

  // primary/unique key is jointable, so can not be set as trigger key
  if (!autoIncrementColumn && primary) {
    const [columnListStr] = parseArray(primary)
    columnList.push(`PRIMARY KEY (${columnListStr})`)
  }

  if (unique) {
    for (const uk of unique) {
      const [columnListStr] = parseArray(uk)
      columnList.push(`UNIQUE (${columnListStr})`)
    }
  }

  return {
    sql: `CREATE TABLE IF NOT EXISTS "${tableName}" (${columnList});`,
    triggerOptions: _triggerOptions,
  }
}

/**
 * if absent, do not create trigger
 */
type RunTriggerOptions = {
  triggerKey: string
  update?: string
}

export function createTimeTrigger(tableName: string, options?: RunTriggerOptions): string | undefined {
  if (!options?.update) {
    return
  }
  const triggerName = `tgr_${tableName}_${options.update}`
  return `CREATE TRIGGER IF NOT EXISTS "${triggerName}" AFTER UPDATE ON "${tableName}" BEGIN UPDATE "${tableName}" SET "${options.update}" = CURRENT_TIMESTAMP WHERE "${options.triggerKey}" = NEW."${options.triggerKey}"; END;`
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
  return `ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${dataType}${notNull ? ' NOT NULL' : ''}${parseDefaultValue(trx, defaultTo)};`
}

export function dropColumn(tableName: string, columnName: string): string {
  return `ALTER TABLE "${tableName}" DROP COLUMN "${columnName}";`
}

export function dropIndex(indexName: string): string {
  return `DROP INDEX IF EXISTS "${indexName}";`
}

export function dropTrigger(triggerName: string): string {
  return `DROP TRIGGER IF EXISTS "${triggerName}";`
}

export function restoreColumns(fromTableName: string, toTableName: string, columns: RestoreColumnList): string {
  let cols = ''
  let values = ''
  for (const [name, notNullFallbackValue] of columns) {
    cols += `,"${name}"`
    switch (notNullFallbackValue) {
      case 0: // have nullable column in old table
        values += `,IFNULL(CAST("${name}" AS INTEGER),0)`
        break
      case '0': // have nullable column in old table
        values += `,IFNULL(CAST("${name}" AS TEXT),'0')`
        break
      case 1: // no such column in old table
        values += `,0`
        break
      case '1': // no such column in old table
        values += `,'0'`
        break
      default: // same as old table
        values += `,"${name}"`
    }
  }
  return `INSERT INTO "${toTableName}" (${cols.substring(1)}) SELECT ${values.substring(1)} FROM "${fromTableName}";`
}
