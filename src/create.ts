import { SqliteBuilder } from './builder'
import { type Schema, useSchema } from './schema'
import type { SyncOptions } from './schema/core'
import type { SqliteBuilderOptions } from './builder'

export async function createSqliteBuilder<T extends Schema, Extra extends Record<string, any>>(
  schema: T,
  options: SqliteBuilderOptions<T, Extra> & { sync?: SyncOptions<T> },
): Promise<Omit<SqliteBuilder<T, Extra>, 'syncDB'>> {
  const builder = new SqliteBuilder(options)
  await builder.syncDB(useSchema(schema, options.sync))
  return builder
}
