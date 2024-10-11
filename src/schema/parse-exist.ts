import type { ParsedColumnType } from './types'
import { type Kysely, sql } from 'kysely'

export type ParsedSchema = Record<string, ParsedTableInfo>

export type ParsedTableInfo = {
  columns: Record<string, {
    type: ParsedColumnType
    notNull: boolean
    defaultTo: string | null
  }>
  /**
   * Primary key constraint
   */
  primary: string[]
  /**
   * Unique constraint
   */
  unique: string[][]
  /**
   * Index
   */
  index: string[][]
  /**
   * Trigger
   */
  trigger: string[]
  /**
   * Auto increment column name
   */
  increment?: string
}

/**
 * parse table object
 * @param db kysely instance
 * @param tableName table name
 */
export async function parseTable(db: Kysely<any>, tableName: string, hasAutoIncrement: boolean): Promise<ParsedTableInfo> {
  const result: ParsedTableInfo = {
    columns: {},
    primary: [],
    unique: [],
    index: [],
    trigger: [],
  }

  type TableInfoPragma = {
    name: string
    type: ParsedColumnType
    notnull: number
    dflt_value: string | null
    pk: number
  }
  const cols = (await sql<TableInfoPragma>`SELECT name, type, "notnull", dflt_value, pk FROM PRAGMA_TABLE_INFO(${tableName})`.execute(db)).rows

  for (const { dflt_value, name, notnull, pk, type } of cols) {
    result.columns[name] = {
      type,
      notNull: !!notnull as any,
      defaultTo: dflt_value,
    }
    if (pk !== 0) {
      if (hasAutoIncrement && pk === 1 && type === 'INTEGER') {
        result.increment = name
      } else {
        result.primary.push(name)
      }
    }
  }

  type IndexInfoPragma = {
    origin: string
    columns: string
  }

  const indexes = (await sql<IndexInfoPragma>`SELECT origin, (SELECT GROUP_CONCAT(name) FROM PRAGMA_INDEX_INFO(i.name)) as columns FROM PRAGMA_INDEX_LIST(${tableName}) as i WHERE origin != 'pk'`.execute(db)).rows

  for (const { columns, origin } of indexes) {
    result[origin === 'u' ? 'unique' : 'index'].push(
      (columns as string).split(',').map(c => c.trim()),
    )
  }

  return result
}

/**
 * parse exist db structures
 */
export async function parseExistSchema(
  db: Kysely<any>,
  prefix: string[] = [],
): Promise<ParsedSchema> {
  type MasterData = {
    type: 'table' | 'trigger'
    name: 1 | string
    table: string
  }

  const extraColumns = prefix.length ? ` AND ${prefix.map(t => `"name" NOT LIKE '${t}%'`).join(' AND ')}` : ''
  const tables = (await sql<MasterData>`SELECT "type", "tbl_name" AS "table", CASE WHEN "sql" LIKE '%PRIMARY KEY AUTOINCREMENT%' THEN 1 ELSE "name" END AS "name" FROM "sqlite_master" WHERE "type" IN ('table', 'trigger') AND "name" NOT LIKE 'SQLITE_%'${sql.raw(extraColumns)} ORDER BY "type"`.execute(db)).rows

  const tableMap: ParsedSchema = {}
  for (const { name, table, type } of tables) {
    switch (type) {
      case 'table':
        tableMap[table] = await parseTable(db, table, (name as number | string) === 1)
        break
      case 'trigger':
        tableMap[table].trigger.push(name as string)
        break
    }
  }
  return tableMap
}
