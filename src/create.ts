import type { WhereInterface } from 'kysely'
import { SqliteBuilder } from './builder'
import { type InferDatabase, type Schema, useSchema } from './schema'
import type { SyncOptions } from './schema/core'
import type { SqliteBuilderOptions } from './builder'
import { createSoftDeleteExecutor } from './executor'

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

export async function createSoftDeleteSqliteBuilder<T extends Schema>(
  options: Omit<CreateSqliteBuilderOptions<T>, 'executor'>,
): Promise<[
  db: Omit<SqliteBuilder<InferDatabase<T>>, 'syncDB'>,
  withNoDelete: <DB, W extends WhereInterface<DB, keyof DB>>(qb: W) => WhereInterface<DB, keyof DB>,
]> {
  const { executor, withNoDelete } = createSoftDeleteExecutor()
  // @ts-expect-error assign executor
  options.executor = executor
  return [await createSqliteBuilder(options), withNoDelete]
}
