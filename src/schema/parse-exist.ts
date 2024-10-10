import type { ColumnProperty, ParsedColumnType, Table } from './types'
import { type QueryCreator, sql } from 'kysely'

export type ParseExistSchemaExecutor = Pick<QueryCreator<any>, 'selectFrom'>
export type PragmaIndexList = {

}
export type ParsedSchema = {
  table: ParsedTables
  index: [name: string, table: string][]
  trigger: string[]
}
type ParsedTables = Record<string, ParsedTableInfo>
type ParsedColumns = Record<string, ColumnProperty>
export type ParsedTableInfo = Required<Omit<Table, 'softDelete' | 'timeTrigger'>> & {
  primary: string[]
  trigger: string[]
}
export type ParsedColumnProperty = {
  type: ParsedColumnType
  notNull: boolean
  defaultTo: any
}

/**
 * parse table object
 * @param db kysely instance
 * @param tableName table name
 */
export async function parseTable(db: ParseExistSchemaExecutor, tableName: string): Promise<[columns: ParsedColumns, primaryKey: string[]]> {
  const columns: ParsedColumns = {}
  const pk: string[] = []
  const cols = await db
    .selectFrom(sql`pragma_table_info(${tableName})`.as('t'))
    .select(['name', 'type', 'notnull', 'dflt_value', 'pk'])
    .execute()
  for (const { dflt_value, name, notnull, pk, type } of cols) {
    columns[name] = {
      type,
      notNull: !!notnull as any,
      defaultTo: dflt_value,
    }
    if (pk) {
      pk.push(name)
    }
  }

  return [columns, pk]
}

export async function parseIndex(db: ParseExistSchemaExecutor, indexName: string) {
  const indexes = await db
    .selectFrom(sql`pragma_index_list(${indexName})`.as('i'))
    .select(['name', 'unique', 'origin'])
    .execute()
}

/**
 * parse exist db structures
 */
export async function parseExistSchema(
  db: ParseExistSchemaExecutor,
  prefix: string[] = [],
): Promise<ParsedSchema> {
  const tables = await db
    .selectFrom('sqlite_master')
    .where('type', 'in', ['table', 'trigger', 'index'])
    .where(qb => qb.or([
      qb('name', 'not like', 'sqlite_%'),
      qb('name', 'like', 'sqlite_autoindex%'),
    ]))
    .$if(prefix.length > 0, qb => qb.where(
      eb => eb.and(
        prefix.map(t => eb('name', 'not like', `${t}%`)),
      ),
    ))
    .orderBy('type', 'desc')
    .select(['name', 'type', 'tbl_name', 'sql'])
    .execute()

  const tableMap: ParsedSchema = {
    table: {},
    index: [],
    trigger: [],
  }
  const parsedTableMap = new Map<string, Omit<Table, 'softDelete'>>()
  for (const { name, type } of tables) {
    switch (type) {
      case 'table':
        parsedTableMap.set(name, await parseTable(db, name))
        break
      case 'index':
        tableMap.index.push(name)
        break
      case 'trigger':
        tableMap.trigger.push(name)
        break
    }
  }
  return tableMap
}
