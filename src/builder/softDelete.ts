import type { SqliteBuilderOptions } from './base'
import type { Kysely, WhereInterface } from 'kysely'

import { DeleteResult } from 'kysely'

import { BaseSqliteBuilder } from './base'

interface SoftDeleteSqliteBuilderOptions extends SqliteBuilderOptions {
  /**
   * Delete column name
   * @default 'isDeleted'
   */
  deleteColumnName?: string
}

/**
 * {@link SqliteBuilder} with soft delete
 */
export class SoftDeleteSqliteBuilder<DB extends Record<string, any>> extends BaseSqliteBuilder<DB> {
  private col: string
  /**
   * Filters rows that are not soft deleted
   */
  public whereExists: <T>(qb: T) => T
  /**
   * Filters rows that are soft deleted
   */
  public whereDeleted: <T>(qb: T) => T
  constructor(options: SoftDeleteSqliteBuilderOptions) {
    super(options)
    const delCol = options.deleteColumnName || 'isDeleted'
    this.col = delCol
    this.whereExists = <T>(qb: T) => (qb as WhereInterface<any, any>).where(delCol, '=', 0) as T
    this.whereDeleted = <T>(qb: T) => (qb as WhereInterface<any, any>).where(delCol, '=', 1) as T
  }

  public insertInto: Kysely<DB>['insertInto'] = tb => this.kysely.insertInto(tb)
  public replaceInto: Kysely<DB>['replaceInto'] = tb => this.kysely.replaceInto(tb)
  public selectFrom: Kysely<DB>['selectFrom'] = (tb: any) =>
    (this.kysely.selectFrom(tb) as any).where(this.col, '=', 0)

  public updateTable: Kysely<DB>['updateTable'] = (tb: any) =>
    (this.kysely.updateTable(tb) as any).where(this.col, '=', 0)

  /**
   * Creates a soft delete query.
   *
   * See the {@link DeleteQueryBuilder.where} method for examples on how to specify
   * a where clause for the delete operation.
   *
   * The return value of the query is an instance of {@link DeleteResult}.
   *
   * ### Examples
   *
   * Delete a single row:
   *
   * ```ts
   * const result = await db
   *   .deleteFrom('person')
   *   .where('person.id', '=', '1')
   *   .executeTakeFirst()
   *
   * console.log(result.numUpdatedRows)
   * ```
   *
   * The generated SQL (SQLite):
   *
   * ```sql
   * update "person" set "isDeleted" = 1 where "person"."id" = $1
   * ```
   */
  public deleteFrom: Kysely<DB>['updateTable'] = (tb: any) => (this.kysely.updateTable(tb) as any).set(this.col, 1)
}
