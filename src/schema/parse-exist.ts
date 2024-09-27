import type { ParsedColumnType } from './types'
import { type QueryCreator, sql } from 'kysely'

export type ParseExistSchemaExecutor = Pick<QueryCreator<any>, 'selectFrom'>

export type ParsedSchema = {
  table: ParsedTables
  index: string[]
  trigger: string[]
}
type ParsedTables = Record<string, ParsedTableInfo>
export type ParsedTableInfo = {
  columns: Record<string, ParsedColumnProperty>
  primary: string[]
}
export type ParsedColumnProperty = {
  type: ParsedColumnType
  notNull: boolean
  defaultTo?: any
}

/**
 * parse table object
 * @param db kysely instance
 * @param tableName table name
 * @todo support extra constraints
 */
export async function parseTable(db: ParseExistSchemaExecutor, tableName: string): Promise<ParsedTableInfo> {
  const result: ParsedTableInfo = {
    columns: {},
    primary: [],
  }

  const cols = await db
    .selectFrom(sql`pragma_table_info(${tableName})`.as('c'))
    .select(['name', 'type', 'notnull', 'dflt_value', 'pk'])
    .execute()
  for (const { dflt_value, name, notnull, pk, type } of cols) {
    result.columns[name] = {
      type,
      notNull: !!notnull,
      defaultTo: dflt_value,
    }
    if (pk) {
      result.primary.push(name)
    }
  }

  return result
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
    .where('name', 'not like', 'sqlite_%')
    .orderBy('type', 'desc')
    .$if(prefix.length > 0, qb => qb.where(
      eb => eb.and(
        prefix.map(t => eb('name', 'not like', `${t}%`)),
      ),
    ))
    .select(['name', 'type'])
    .execute()

  const tableMap: ParsedSchema = {
    table: {},
    index: [],
    trigger: [],
  }
  for (const { name, type } of tables) {
    switch (type) {
      case 'table':
        tableMap.table[name] = await parseTable(db, name)
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
