import {
  CompiledQuery,
  type DatabaseConnection,
  type Kysely,
  type QueryResult,
  type Transaction,
} from 'kysely'

export type KyselyInstance = DatabaseConnection | Kysely<any> | Transaction<any>

/**
 * Execute compiled query and return result list
 */
export async function executeSQL<O>(kysely: KyselyInstance, query: CompiledQuery<O>): Promise<QueryResult<O>>
/**
 * Execute sql string
 */
export async function executeSQL<O>(
  kysely: KyselyInstance,
  rawSql: string,
  parameters?: unknown[]
): Promise<QueryResult<O>>
export async function executeSQL<O>(
  kysely: KyselyInstance,
  data: CompiledQuery<O> | string,
  parameters?: unknown[],
): Promise<QueryResult<O>> {
  if (typeof data === 'string') {
    data = CompiledQuery.raw(data, parameters)
  }
  return await kysely.executeQuery(data)
}
