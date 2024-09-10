import { CompiledQuery, type Kysely, type QueryResult, type RawBuilder } from 'kysely'

export async function executeSQL<O>(kysely: Kysely<any>, rawSql: RawBuilder<O>): Promise<QueryResult<O>>
/**
 * Execute sql string
 */
export async function executeSQL<O>(kysely: Kysely<any>, rawSql: string, parameters?: unknown[]): Promise<QueryResult<O>>
/**
 * Execute compiled query and return result list
 */
export async function executeSQL<O>(kysely: Kysely<any>, query: CompiledQuery<O>): Promise<QueryResult<O>>
export async function executeSQL<O>(
  kysely: Kysely<any>,
  data: CompiledQuery<O> | RawBuilder<O> | string,
  parameters?: unknown[],
): Promise<QueryResult<O>> {
  if (typeof data === 'string') {
    return await kysely.executeQuery<O>(CompiledQuery.raw(data, parameters))
  } else if ('sql' in data) {
    return await kysely.executeQuery<O>(data)
  } else {
    return await data.execute(kysely)
  }
}
