import type { StringKeys } from '@subframe7536/type-utils'
import type { SelectQueryBuilder } from 'kysely'

export type PageOptions<DB extends Record<string, any>, TB extends keyof DB, Total extends boolean> = {
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
  /**
   * whether query total size
   */
  queryTotal?: Total
}

export type PaginationResult<Total extends boolean, O> = {
  /**
   * all records in current page
   */
  records: O[]
  /**
   * page size
   */
  size: number
  /**
   * current page number
   */
  current: number
  /**
   * convert records to new object
   */
  convertRecords: <T>(fn: (records: O) => T) => Omit<PaginationResult<Total, T>, 'convertRecords'>
} & (Total extends true ? {
  /**
   * total page count
   */
  pages: number
  /**
   * total item count
   */
  total: number
  /**
   * has prev page
   */
  hasPrevPage: boolean
  /**
   * has next page
   */
  hasNextPage: boolean
} : {})

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
 * const page = await pageQuery(db.selectFrom('test').selectAll(), { num: 1, size: 10, queryTotal: true })
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
export async function pageQuery<O, DB extends Record<string, any>, TB extends keyof DB, Total extends boolean>(
  qb: SelectQueryBuilder<DB, TB, O>,
  options: PageOptions<DB, TB, Total>,
): Promise<PaginationResult<Total, O>> {
  const { num, size, asc = [], desc = [], queryTotal } = options
  const _num = ~~num
  const _size = ~~size
  const records = await qb
    .$call((qb1) => {
      qb1 = qb1
        .clearWhere()
        .clearLimit()
        .clearOffset()
        .where(
          'rowid',
          'in',
          qb1
            .clearSelect()
            .select('rowid')
            .$if(_size > 0 && _num > 0, qb2 => qb2.offset((_num - 1) * _size).limit(_size)),
        )

      for (const _a of asc) {
        qb1 = qb1.orderBy(_a, 'asc')
      }
      for (const _d of desc) {
        qb1 = qb1.orderBy(_d, 'desc')
      }
      return qb1
    })
    .execute() as O[]

  const total = queryTotal
    ? (await qb
        .clearLimit()
        .clearOffset()
        .clearSelect()
        .select(eb => eb.fn.countAll().as('total'))
        .executeTakeFirstOrThrow())
        // @ts-expect-error have total
        .total
    : 0

  const data = {
    ...queryTotal
      ? {
          total,
          hasPrevPage: _num > 1,
          hasNextPage: total ? _num * _size < total : false,
          pages: total ? ~~(total / _size) + 1 : 0,
        }
      : {},
    size: records.length,
    current: _num,
  }
  return {
    ...data,
    records,
    convertRecords: fn => ({ ...data, records: records.map(fn) }),
  } as PaginationResult<Total, O>
}
