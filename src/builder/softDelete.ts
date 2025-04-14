import type { SqliteBuilderOptions } from './base'
import type { DeleteQueryBuilder, Kysely, UpdateResult, WhereInterface } from 'kysely'
import type { DeleteFrom } from 'kysely/dist/cjs/parser/delete-from-parser'
import type { TableExpressionOrList } from 'kysely/dist/cjs/parser/table-parser'

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
   * <!-- siteExample("delete", "Single row", 10) -->
   *
   * Delete a single row:
   *
   * ```ts
   * const result = await db
   *   .deleteFrom('person')
   *   .where('person.id', '=', '1')
   *   .executeTakeFirst()
   *
   * console.log(result.numDeletedRows)
   * ```
   *
   * The generated SQL (SQLite):
   *
   * ```sql
   * update "person" set "isDeleted" = 1 where "person"."id" = $1
   * ```
   */
  public deleteFrom: <TE extends TableExpressionOrList<DB, never>>(from: TE) => DeleteFrom<DB, TE>
    = (tb: any) => (this.kysely.updateTable(tb) as any).set(this.col, 1)

  /**
   * Fix `DeleteResult` runtime type
   * @param result original `DeleteResult`
   * @example
   * db.toDeleteResult(
   *   await db
   *     .deleteFrom('testSoftDelete')
   *     .where('id', '=', 1)
   *     .execute()
   * )
   */
  public toDeleteResult(result: DeleteResult[]): DeleteResult[] {
    return result.map(r => new DeleteResult((r as unknown as UpdateResult).numUpdatedRows))
  }
}
