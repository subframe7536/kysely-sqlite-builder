import { DeleteResult, type JoinType, type Kysely, type UpdateResult, type WhereInterface } from 'kysely'

type CamelCase<S extends string> = S extends `${infer First}${infer Rest}`
  ? First extends Uppercase<First>
    ? `${Lowercase<First>}${Rest}`
    : S
  : S
export type JoinFnName = CamelCase<JoinType>

/**
 * basic executor
 */
export const baseExecutor = {
  selectFrom: (db: Kysely<any>, tb: any) => db.selectFrom(tb),
  insertInto: (db: Kysely<any>, tb: any) => db.insertInto(tb),
  updateTable: (db: Kysely<any>, tb: any) => db.updateTable(tb),
  deleteFrom: (db: Kysely<any>, tb: any) => db.deleteFrom(tb),
}

export type Executor = typeof baseExecutor

type CreateSoftDeleteExecutorReturn = {
  /**
   * SQLite builder executor
   * @example
   * const { executor, withNoDelete } = createSoftDeleteExecutor()
   *
   * const db = new SqliteBuilder<InferDatabase<typeof softDeleteSchema>>({
   *   dialect: new SqliteDialect({
   *     database: new Database(':memory:'),
   *   }),
   *   // use soft delete executor
   *   executor,
   * })
   */
  executor: Executor
  /**
   * Filter query builder with `where('isDeleted', '=', 0)`
   * @example
   * const { executor, withNoDelete } = createSoftDeleteExecutor()
   * db.selectFrom('test').selectAll().$call(withNoDelete)
   */
  withNoDelete: <T>(qb: T) => T
}

/**
 * Create soft delete executor function,
 *
 * return type of `deleteFrom` is `UpdateResult` insteadof `DeleteResult`,
 * to fix it, wrap the result with {@link toDeleteResult}
 * @param deleteColumnName delete column name, default is 'isDeleted'
 */
export function createSoftDeleteExecutor(deleteColumnName = 'isDeleted'): CreateSoftDeleteExecutorReturn {
  return {
    executor: {
      selectFrom: (db: Kysely<any>, table: any) => db.selectFrom(table).where(deleteColumnName, '=', 0),
      insertInto: (db: Kysely<any>, table: any) => db.insertInto(table),
      updateTable: (db: Kysely<any>, table: any) => db.updateTable(table).where(deleteColumnName, '=', 0),
      deleteFrom: (db: Kysely<any>, table: any) => db.updateTable(table).set(deleteColumnName, 1) as any,
    },
    withNoDelete: <T>(qb: T) => (qb as WhereInterface<any, any>).where(deleteColumnName, '=', 0) as T,
  }
}

/**
 * Fix the type of `DeleteResult` when using soft delete
 * @param result the result of `deleteFrom` in `createSoftDeleteExecutor`
 */
export function toDeleteResult(result: DeleteResult): DeleteResult {
  return new DeleteResult((result as unknown as UpdateResult).numUpdatedRows)
}
