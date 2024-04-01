import { SqliteBuilder } from './builder'
import { type InferDatabase, type Schema, useSchema } from './schema'
import type { SyncOptions } from './schema/core'
import type { SqliteBuilderOptions } from './builder'

export type CreateSqliteBuilderOptions<
  T extends Schema,
> = SqliteBuilderOptions & {
  /**
   * {@link Schema}
   */
  schema: T
  /**
   * {@link SyncOptions}
   */
  sync?: SyncOptions<T>
  /**
   * whether to check integrity
   */
  checkIntegrity?: boolean
}

/**
 * {@link SqliteBuilder}
 */
export async function createSqliteBuilder<T extends Schema>(
  options: CreateSqliteBuilderOptions<T>,
): Promise<Omit<SqliteBuilder<InferDatabase<T>>, 'syncDB'>> {
  const builder = new SqliteBuilder<InferDatabase<T>>(options)
  await builder.syncDB(useSchema(options.schema, options.sync), options.checkIntegrity)
  return builder
}
