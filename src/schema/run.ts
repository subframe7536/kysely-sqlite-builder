import type { Arrayable } from '@subframe7536/type-utils'
import type { Kysely, RawBuilder, Transaction } from 'kysely'
import { defaultSerializer } from '../serialize'
import { executeSQL } from '../utils'
import { TGR } from './define'
import {
  type ColumnProperty,
  DataType,
  type DataTypeValue,
  type Table,
} from './types'

type ParsedColumnType =
  | 'text'
  | 'integer'
  | 'blob'
  | 'real'

export function parseColumnType(type: DataTypeValue): [type: ParsedColumnType, isIncrements: boolean] {
  let dataType: ParsedColumnType
  let isIncrements = false
  switch (type) {
    case DataType.float:
      dataType = 'real'
      break
    case DataType.increments:
      isIncrements = true
    // eslint-disable-next-line no-fallthrough
    case DataType.boolean:
    case DataType.int:
      dataType = 'integer'
      break
    case DataType.blob:
      dataType = 'blob'
      break
    // date, object, string or other
    default:
      dataType = 'text'
  }
  return [dataType, isIncrements]
}

/**
 * Merge array with `_` and prepend `_`
 *
 * Return merged string and parsed array
 */
export function parseArray<T>(arr: Arrayable<T>): [key: string, columns: T[]] {
  const columns = Array.isArray(arr) ? arr : [arr]
  return [columns.reduce((a, b) => `${a}_${b}`, ''), columns]
}

export async function runDropTable(trx: Kysely<any>, tableName: string): Promise<void> {
  await executeSQL(trx, dropTable(tableName))
}

export function dropTable(tableName: string): string {
  return `drop table if exists "${tableName}";`
}

export async function runCreateTableWithIndexAndTrigger(
  trx: Transaction<any>,
  tableName: string,
  table: Table<any>,
): Promise<void> {
  const { index, ...props } = table
  const triggerOptions = await runCreateTable(trx, tableName, props)
  await runCreateTimeTrigger(trx, tableName, triggerOptions)
  await runCreateTableIndex(trx, tableName, index)
}

export async function runCreateTableIndex(
  trx: Transaction<any>,
  tableName: string,
  index: Arrayable<string>[] = [],
): Promise<void> {
  const sqls = createTableIndex(tableName, index)
  for (const sql of sqls) {
    await executeSQL(trx, sql)
  }
}

export function createTableIndex(
  tableName: string,
  index: Arrayable<string>[] = [],
): string[] {
  return index.map((i) => {
    const [key, columns] = parseArray(i)
    return `create index if not exists idx_${tableName + key} on "${tableName}" (${columns.map(c => `"${c}"`)});`
  })
}

export async function runCreateTable(
  trx: Transaction<any>,
  tableName: string,
  { columns, primary, timeTrigger, unique }: Omit<Table, 'index'>,
): Promise<RunTriggerOptions | undefined> {
  const { triggerOptions, sql } = createTable(trx, tableName, { columns, primary, timeTrigger, unique })
  await executeSQL(trx, sql)
  return triggerOptions
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

  let _haveAutoKey = false

  const columnList: string[] = []

  for (const [columnName, columnProperty] of Object.entries(columns)) {
    const { type, notNull, defaultTo } = columnProperty as ColumnProperty

    const [dataType, isIncrements] = parseColumnType(type)

    if (isIncrements) {
      _haveAutoKey = true
      if (_triggerOptions) {
        _triggerOptions.triggerKey = columnName
      }
      columnList.push(`"${columnName}" ${dataType} primary key autoincrement`)
    } else if (
      // see hacks in `./define.ts`
      // time trigger column is default with TGR
      defaultTo === TGR
    ) {
      // update trigger column is not null
      // #hack to detect update column
      if (_triggerOptions && notNull) {
        _triggerOptions.update = columnName
      }
      // default with current_timestamp
      columnList.push(`"${columnName}" ${dataType} default CURRENT_TIMESTAMP`)
    } else {
      let _defaultTo
      if (defaultTo !== undefined) {
        _defaultTo = (defaultTo && typeof defaultTo === 'object' && '$cast' in defaultTo)
          ? (defaultTo as RawBuilder<unknown>).compile(trx).sql
          : defaultSerializer(defaultTo)
        _defaultTo = typeof _defaultTo === 'string' ? `'${_defaultTo}'` : _defaultTo
      }
      columnList.push(`"${columnName}" ${dataType}${notNull ? ' not null' : ''}${defaultTo !== undefined ? ` default ${_defaultTo}` : ''}`)
    }
  }

  // primary/unique key is jointable, so can not be set as trigger key

  if (!_haveAutoKey && primary) {
    const [key, columns] = parseArray(primary)
    columnList.push(`constraint pk${key} primary key (${columns.map(v => `"${v}"`)})`)
  }

  for (const uk of unique || []) {
    const [key, columns] = parseArray(uk)
    columnList.push(`constraint uk${key} unique (${columns.map(v => `"${v}"`)})`)
  }

  return {
    sql: `create table if not exists "${tableName}" (${columnList});`,
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

export async function runCreateTimeTrigger(
  trx: Transaction<any>,
  tableName: string,
  options?: RunTriggerOptions,
): Promise<void> {
  const sql = createTimeTrigger(tableName, options)
  if (sql) {
    await executeSQL(trx, sql)
  }
}

export function createTimeTrigger(
  tableName: string,
  options?: RunTriggerOptions,
): string | undefined {
  if (!options?.update) {
    return
  }
  const triggerName = `tgr_${tableName}_${options.update}`
  return `create trigger if not exists "${triggerName}" after update on "${tableName}" begin update "${tableName}" set "${options.update}" = CURRENT_TIMESTAMP where "${options.triggerKey}" = NEW."${options.triggerKey}"; end;`
}

export async function runRenameTable(
  trx: Transaction<any>,
  tableName: string,
  newTableName: string,
): Promise<void> {
  await executeSQL(trx, renameTable(tableName, newTableName))
}

export function renameTable(
  tableName: string,
  newTableName: string,
): string {
  return `alter table "${tableName}" rename to "${newTableName}";`
}

export async function runDropIndex(
  trx: Transaction<any>,
  indexName: string,
): Promise<void> {
  await executeSQL(trx, dropIndex(indexName))
}

export function dropIndex(indexName: string): string {
  return `drop index if exists "${indexName}";`
}

export async function runDropTrigger(
  trx: Transaction<any>,
  triggerName: string,
): Promise<void> {
  await executeSQL(trx, dropTrigger(triggerName))
}

export function dropTrigger(triggerName: string): string {
  return `drop trigger if exists "${triggerName}";`
}

export async function runRestoreColumns(
  trx: Transaction<any>,
  fromTableName: string,
  toTableName: string,
  columns: string[],
): Promise<void> {
  await executeSQL(trx, restoreColumns(fromTableName, toTableName, columns))
}

export function restoreColumns(fromTableName: string, toTableName: string, columns: string[]): string {
  const cols = columns.map(v => `"${v}"`)
  return `insert into "${toTableName}" (${cols}) select ${cols} from "${fromTableName}";`
}
