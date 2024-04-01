import type { JoinType, Kysely, WhereInterface } from 'kysely'

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
  executor: Executor
  withNoDelete: <DB, W extends WhereInterface<DB, keyof DB>>(qb: W) => WhereInterface<DB, keyof DB>
}

/**
 * create soft delete executor function
 * @param deleteColumnName delete column name, default is 'isDeleted'
 */
export function createSoftDeleteExecutor(
  deleteColumnName = 'isDeleted',
): CreateSoftDeleteExecutorReturn {
  return {
    executor: {
      selectFrom: (db: Kysely<any>, table: any) => db.selectFrom(table).where(deleteColumnName, '=', 0 as any),
      insertInto: (db: Kysely<any>, table: any) => db.insertInto(table),
      updateTable: (db: Kysely<any>, table: any) => db.updateTable(table).where(deleteColumnName, '=', 0 as any),
      deleteFrom: (db: Kysely<any>, table: any) => db.updateTable(table).set(deleteColumnName, 1 as any) as any,
    },
    withNoDelete: <DB, W extends WhereInterface<DB, keyof DB>>(qb: W) => qb.where(deleteColumnName as any, '=', 0 as any),
  }
}
