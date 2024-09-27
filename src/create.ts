import type { WhereInterface } from 'kysely'
import type { SqliteBuilderOptions } from './builder'
import type { SyncOptions } from './schema/core'
import { SqliteBuilder } from './builder'
import { createSoftDeleteExecutor } from './executor'
import { type InferDatabase, type Schema, useSchema } from './schema'

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
   * Whether to check integrity
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

type SoftDeleteSqliteBuilderReturn<T extends Schema> = [
  db: Omit<SqliteBuilder<InferDatabase<T>>, 'syncDB'>,
  withNoDelete: <DB, W extends WhereInterface<DB, keyof DB>>(qb: W) => W,
]

export async function createSoftDeleteSqliteBuilder<T extends Schema>(
  options: Omit<CreateSqliteBuilderOptions<T>, 'executor'>,
): Promise<SoftDeleteSqliteBuilderReturn<T>> {
  const { executor, withNoDelete } = createSoftDeleteExecutor()
  ; (options as CreateSqliteBuilderOptions<T>).executor = executor
  return [await createSqliteBuilder(options), withNoDelete]
}
