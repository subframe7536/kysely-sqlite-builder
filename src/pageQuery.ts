import type { StringKeys } from '@subframe7536/type-utils'
import type { SelectQueryBuilder } from 'kysely'

export type PageOptions<DB extends Record<string, any>, TB extends keyof DB> = {
  /**
   * page size
   */
  size: number
  /**
   * current page number
   */
  num: number
  /**
   * column name to order by asc
   */
  asc?: StringKeys<DB[TB]>
  /**
   * column name to order by desc
   */
  desc?: StringKeys<DB[TB]>
}

export type PaginationResult<O> = {
  /**
   * all records in current page
   */
  records: O[]
  /**
   * total page count
   */
  pages: number
  /**
   * total item count
   */
  total: number
  /**
   * page size
   */
  size: number
  /**
   * current page number
   */
  current: number
  /**
   * has prev page
   */
  hasPrevPage: boolean
  /**
   * has next page
   */
  hasNextPage: boolean
  /**
   * convert records to new object
   */
  convertRecords: <T>(fn: (records: O) => T) => Omit<PaginationResult<T>, 'convertRecords'>
}

/**
 * page query, using offset
 * @param qb select query builder
 * @param options page options
 * @example
 * inspired by Mybatis-Plus PaginationInnerInterceptor
 *
 * ```ts
 * import { pageQuery } from 'kysely-sqlite-builder'
 *
 * const page = await pageQuery(db.selectFrom('test').selectAll(), { page: 1, pageSize: 10 })
 * // {
 * //   total: 100,
 * //   current: 1,
 * //   size: 10,
 * //   records: [...],
 * //   pages: 10
 * //   hasPrevPage: false,
 * //   hasNextPage: true,
 * //   convertRecords: () => {...},
 * // }
 * console.log(page.convertRecords(p => p.literal).records)
 * ```
 */
export async function pageQuery<O, DB extends Record<string, any>, TB extends keyof DB>(
  qb: SelectQueryBuilder<DB, TB, O>,
  options: PageOptions<DB, TB>,
): Promise<PaginationResult<O>> {
  const { num, size, asc = [], desc = [] } = options
  const records = await qb
    .$call((qb1) => {
      for (const _a of asc) {
        qb1 = qb1.orderBy(_a, 'asc')
      }
      for (const _d of desc) {
        qb1 = qb1.orderBy(_d, 'desc')
      }
      return qb1
    })
    .limit(size)
    .offset((num - 1) * size)
    .execute() as O[]
  // @ts-expect-error have total
  const { total } = await qb
    .clearLimit()
    .clearOffset()
    .clearSelect()
    .select(eb => eb.fn.countAll().as('total'))
    .executeTakeFirstOrThrow()

  const data = {
    total,
    pages: ~~(total / size) + 1,
    size: records.length,
    current: num,
    hasPrevPage: num > 1,
    hasNextPage: num * size < total,
  }
  return {
    ...data,
    records,
    convertRecords: fn => ({ ...data, records: records.map(fn) }),
  }
}
