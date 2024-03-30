import type { ColumnDataType, Kysely, Transaction } from 'kysely'
import { sql } from 'kysely'
import type { Arrayable } from '@subframe7536/type-utils'
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
    case DataType.date:
    case DataType.object:
    case DataType.boolean:
    case DataType.string:
      dataType = 'text'
      break
    case DataType.float:
      dataType = 'real'
      break
    case DataType.increments:
      isIncrements = true
      // eslint-disable-next-line no-fallthrough
    case DataType.int:
      dataType = 'integer'
      break
    default:
      dataType = 'blob'
  }
  return [dataType, isIncrements]
}

export function parseArray<T>(arr: Arrayable<T>): T[] {
  return Array.isArray(arr) ? arr : [arr]
}

function isFunction(value: any): value is (...args: any) => any {
  return typeof value === 'function'
}

export async function runDropTable(db: Kysely<any>, tableName: string) {
  await db.schema.dropTable(tableName).execute()
}

export async function runCreateTableWithIndexAndTrigger(
  trx: Transaction<any>,
  tableName: string,
  table: Table<any>,
) {
  const { index, ...props } = table
  const triggerOptions = await runCreateTable(trx, tableName, props)
  await runCreateTimeTrigger(trx, tableName, triggerOptions)
  await runCreateTableIndex(trx, tableName, index)
}
export async function runCreateTableIndex(
  trx: Transaction<any>,
  tableName: string,
  index: Arrayable<string>[] | undefined,
) {
  for (const i of index || []) {
    const _i = parseArray(i)

    await trx.schema.createIndex('idx_' + tableName + '_' + _i.reduce((a, b) => a + '_' + b, ''))
      .on(tableName)
      .columns(_i as string[])
      .ifNotExists()
      .execute()
  }
}

export async function runCreateTable(
  trx: Transaction<any>,
  tableName: string,
  { columns, primary, timeTrigger, unique }: Omit<Table, 'index'>,
  temporary = false,
) {
  const _triggerOptions: RunTriggerOptions | undefined = timeTrigger
    ? {
        triggerKey: 'rowid',
        update: undefined,
      }
    : undefined

  let _haveAutoKey = false
  let tableSql = trx.schema.createTable(tableName)

  if (temporary) {
    tableSql = tableSql.temporary()
  }

  for (const [columnName, columnProperty] of Object.entries(columns)) {
    const { type, notNull, defaultTo } = columnProperty as ColumnProperty

    const [dataType, isIncrements] = parseColumnType(type)

    tableSql = tableSql.addColumn(columnName, dataType, (builder) => {
      if (isIncrements) {
        _haveAutoKey = true
        if (_triggerOptions) {
          _triggerOptions.triggerKey = columnName
        }
        return builder.autoIncrement().primaryKey()
      }

      // see hacks in `./define.ts`
      // time trigger column is default with TGR
      if (defaultTo === TGR) {
        // update trigger column is not null
        // #hack to detect update column
        if (_triggerOptions && notNull) {
          _triggerOptions.update = columnName
        }
        // default with current_timestamp
        return builder.defaultTo(sql`CURRENT_TIMESTAMP`)
      }

      if (notNull === true) {
        builder = builder.notNull()
      }

      if (defaultTo !== undefined) {
        builder = builder.defaultTo(isFunction(defaultTo) ? defaultTo(sql) : defaultTo)
      }

      return builder
    })
  }

  // primary/unique key is jointable, so can not be set as trigger key

  if (!_haveAutoKey && primary) {
    const _p = parseArray(primary)
    tableSql = tableSql.addPrimaryKeyConstraint(
      'pk_' + _p.reduce((a, b) => a + '_' + b, ''),
      _p as any,
    )
  }

  for (const uk of unique || []) {
    const _u = parseArray(uk)
    tableSql = tableSql.addUniqueConstraint(
      'uk_' + _u.reduce((a, b) => a + '_' + b, ''),
      _u as any,
    )
  }

  await tableSql.ifNotExists().execute()

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
) {
  if (!options || !options.update) {
    return
  }
  const { triggerKey, update } = options

  const triggerName = 'tgr_' + tableName + '_' + update
  await sql`create trigger if not exists ${sql.ref(triggerName)}
after update
on ${sql.table(tableName)}
begin
  update ${sql.table(tableName)}
  set ${sql.ref(update)} = CURRENT_TIMESTAMP
  where ${sql.ref(triggerKey)} = NEW.${sql.ref(triggerKey)};
end`.execute(trx)
}

export async function runRenameTable(
  trx: Transaction<any>,
  tableName: string,
  newTableName: string,
) {
  await trx.schema.alterTable(tableName).renameTo(newTableName).execute()
}
