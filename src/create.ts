import { SqliteBuilder } from './builder'
import { type InferDatabase, type Schema, useSchema } from './schema'
import type { SyncOptions } from './schema/core'
import type { SqliteBuilderOptions } from './builder'

export async function createSqliteBuilder<T extends Schema, Extra extends Record<string, any>>(
  schema: T,
  options: SqliteBuilderOptions<InferDatabase<T>, Extra> & { sync?: SyncOptions<T> },
): Promise<Omit<SqliteBuilder<InferDatabase<T>, Extra>, 'syncDB'>> {
  const builder = new SqliteBuilder(options)
  await builder.syncDB(useSchema(schema, options.sync))
  return builder
}
