import type { Kysely, RawBuilder, Transaction } from 'kysely'
import { sql } from 'kysely'
import type { Arrayable } from '@subframe7536/type-utils'
import { defaultSerializer } from '../serialize'
import {
  type ColumnProperty,
  DataType,
  type DataTypeValue,
  type Table,
} from './types'
import { TGR } from './define'

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
    // date, object, string or othera
    default:
      dataType = 'text'
  }
  return [dataType, isIncrements]
}

export function parseArray<T>(arr: Arrayable<T>): [key: string, value: T[]] {
  const value = Array.isArray(arr) ? arr : [arr]
  return [value.reduce((a, b) => a + '_' + b, ''), value]
}

export async function runDropTable(db: Kysely<any>, tableName: string): Promise<void> {
  await sql`drop table if exists ${sql.table(tableName)}`.execute(db)
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
  index: Arrayable<string>[] | undefined,
): Promise<void> {
  for (const i of index || []) {
    const [key, value] = parseArray(i)

    await sql`create index if not exists ${sql.ref('idx_' + tableName + key)} on ${sql.table(tableName)} (${sql.join(value.map(sql.ref))})`.execute(trx)
  }
}

export async function runCreateTable(
  trx: Transaction<any>,
  tableName: string,
  { columns, primary, timeTrigger, unique }: Omit<Table, 'index'>,
): Promise<RunTriggerOptions | undefined> {
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
      columnList.push('"' + columnName + '" ' + dataType + ' primary key autoincrement')
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
      columnList.push('"' + columnName + '" ' + dataType + ' default CURRENT_TIMESTAMP')
    } else {
      let _defaultTo
      if (defaultTo !== undefined) {
        _defaultTo = (defaultTo && typeof defaultTo === 'object' && '$cast' in defaultTo)
          ? (defaultTo as RawBuilder<unknown>).compile(trx).sql
          : defaultSerializer(defaultTo)
        _defaultTo = typeof _defaultTo === 'string' ? '\'' + _defaultTo + '\'' : _defaultTo
      }
      columnList.push('"' + columnName + '" ' + dataType + (notNull ? ' not null' : '') + (defaultTo !== undefined ? ' default ' + _defaultTo : ''))
    }
  }

  // primary/unique key is jointable, so can not be set as trigger key

  if (!_haveAutoKey && primary) {
    const [key, value] = parseArray(primary)
    columnList.push('constraint pk' + key + ' primary key (' + value.map(v => '"' + v + '"') + ')')
  }

  for (const uk of unique || []) {
    const [key, value] = parseArray(uk)
    columnList.push('constraint uk' + key + ' unique (' + value.map(v => '"' + v + '"') + ')')
  }

  await sql`create table if not exists ${sql.table(tableName)} (${sql.raw(columnList.join(', '))})`.execute(trx)
  return _triggerOptions
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
  if (!options?.update) {
    return
  }
  const triggerName = 'tgr_' + tableName + '_' + options.update
  await sql`create trigger if not exists ${sql.ref(triggerName)} after update on ${sql.table(tableName)} begin   update ${sql.table(tableName)} set ${sql.ref(options.update)} = CURRENT_TIMESTAMP where ${sql.ref(options.triggerKey)} = NEW.${sql.ref(options.triggerKey)}; end`.execute(trx)
}

export async function runRenameTable(
  trx: Transaction<any>,
  tableName: string,
  newTableName: string,
): Promise<void> {
  await sql`alter table ${sql.table(tableName)} rename to ${sql.table(newTableName)}`.execute(trx)
}
