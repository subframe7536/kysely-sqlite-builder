import { SqliteBuilder } from './builder'
import { type InferDatabase, type Schema, useSchema } from './schema'
import type { SyncOptions } from './schema/core'
import type { SqliteBuilderOptions } from './builder'

export type CreateSqliteBuilderOptions<
  T extends Schema,
  Extra extends Record<string, any>,
> = SqliteBuilderOptions<InferDatabase<T>, Extra> & {
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
export async function createSqliteBuilder<T extends Schema, Extra extends Record<string, any>>(
  options: CreateSqliteBuilderOptions<T, Extra>,
): Promise<Omit<SqliteBuilder<InferDatabase<T>, Extra>, 'syncDB'>> {
  const builder = new SqliteBuilder(options)
  await builder.syncDB(useSchema(options.schema, options.sync), options.checkIntegrity)
  return builder
}
