import type { Kysely } from 'kysely'

export type ParsedSchema = {
  existTables: ParsedTables
  indexList: string[]
  triggerList: string[]
}
type ParsedTables = Record<string, ParsedCreateTableSQL>
export type ParsedCreateTableSQL = {
  name: string
  columns: Record<string, ParsedColumnProperty>
  primary: string[] | undefined
  unique: string[][]
}
export type ParsedColumnProperty = {
  type: string
  notNull: boolean
  defaultTo?: any
}

const baseRegex = /create table (?:if not exist)?\s*"([^"]+)"\s*\((.*)\)/i
const columnRegex = /"([^"]+)"\s+(\w+)\s?(not null)?/gi

/**
 * parse table object
 * @param definition create table sql
 * @todo support extra constraints
 */
export function parseCreateTableSQL(definition: string): ParsedCreateTableSQL {
  const [, tableName, cols] = definition.replace(/\r?\n/g, '').match(baseRegex)!

  const ret: ParsedCreateTableSQL = {
    columns: {},
    name: tableName,
    primary: undefined,
    unique: [],
  }
  const columnMatches = cols.matchAll(columnRegex)
  for (const match of columnMatches) {
    const [, columnName, type, notNull] = match
    if (columnName.startsWith('pk_')) {
      const [, ...keys] = columnName.split('_')
      ret.primary = keys
    } else if (columnName.startsWith('un_')) {
      const [, ...keys] = columnName.split('_')
      ret.unique.push(keys)
    } else {
      ret.columns[columnName] = {
        type,
        notNull: !!notNull,
      }
    }
  }

  return ret
}

type ExistTable = {
  name: string
  sql: string
  type: string
}

/**
 * parse exist db structures
 */
export async function parseExistDB(
  db: Kysely<any>,
  prefix: string[] = [],
): Promise<ParsedSchema> {
  const tables = await db
    .selectFrom('sqlite_master')
    .where('type', 'in', ['table', 'trigger', 'index'])
    .where('name', 'not like', 'sqlite_%')
    .$if(prefix.length > 0, qb => qb.where(
      eb => eb.and(
        prefix.map(t => eb('name', 'not like', `${t}%`)),
      ),
    ))
    .select(['name', 'sql', 'type'])
    .execute()

  const tableMap: ParsedSchema = {
    existTables: {},
    indexList: [],
    triggerList: [],
  }
  for (const { name, sql, type } of tables as ExistTable[]) {
    if (!sql) {
      continue
    }
    switch (type) {
      case 'table':
        tableMap.existTables[name] = parseCreateTableSQL(sql)
        break
      case 'index':
        tableMap.indexList.push(name)
        break
      case 'trigger':
        tableMap.triggerList.push(name)
        break
    }
  }
  return tableMap
}
