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
 *
 * if `num <= 0` or `size <= 0`, return all records
 * @param qb select query builder
 * @param options page options
 * @example
 * ```ts
 * import { pageQuery } from 'kysely-sqlite-builder'
 *
 * const page = await pageQuery(db.selectFrom('test').selectAll(), { num: 1, size: 10 })
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
  const _num = ~~num
  const _size = ~~size
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
    .$if(_size > 0 && _num > 0, qb1 => qb1.offset((_num - 1) * _size).limit(_size))
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
    pages: ~~(total / _size) + 1,
    size: records.length,
    current: _num,
    hasPrevPage: _num > 1,
    hasNextPage: _num * _size < total,
  }
  return {
    ...data,
    records,
    convertRecords: fn => ({ ...data, records: records.map(fn) }),
  }
}
