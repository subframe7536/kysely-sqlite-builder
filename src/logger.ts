import type { LogEvent, RootOperationNode } from 'kysely'

export type LoggerParams = {
  /**
   * Source SQL. If {@link LoggerOptions.merge} is `true`,
   * the `?` will be replaced by the param value
   */
  sql: string
  /**
   * SQL parmas
   */
  params: readonly unknown[]
  /**
   * Execution duration in milliseconds, precision is 2
   */
  duration: number
  /**
   * SQL ast nodes. If {@link LoggerOptions.logQueryNode} is `false` or `undefined`,
   * the value will be `undefined`
   */
  queryNode?: RootOperationNode
  /**
   * Error emit from sqlite
   */
  error?: unknown
}

export type LoggerOptions = {
  /**
   * Toggle log or setup log level
   * @default 'error'
   */
  enable?: boolean | LogEvent['level']
  /**
   * Log functions
   * @param data logger params, see {@link LoggerParams}
   * @default console.log
   */
  logger?: (data: LoggerParams) => void
  /**
   * Whether to merge parameters into sql
   *
   * e.g. from `select ? from ?` to `select "name" from "user"`
   */
  merge?: boolean
  /**
   * Whether to log queryNode
   */
  logQueryNode?: boolean
}

/**
 * Util for `KyselyConfig.log`, log on every execution
 * @example
 * import { Kysely } from 'kysely'
 *
 * const db = new Kysely<DB>({
 *   dialect,
 *   log: createKyselyLogger({
 *     logger: console.log,
 *     merge: true,
 *   })
 * })
 */
export function createKyselyLogger(
  options: LoggerOptions = {},
): (event: LogEvent) => void {
  const { enable = 'error', logger = console.log, merge, logQueryNode } = options
  const questionMarker = '_Q_'
  const regexp = new RegExp(questionMarker, 'g')
  return (event: LogEvent) => {
    if (!enable || (typeof enable === 'string' && event.level !== enable)) {
      return
    }
    const { level, queryDurationMillis, query: { parameters, sql, query } } = event
    const err = level === 'error' ? event.error : undefined
    let _sql = sql.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ')
    if (merge) {
      for (let param of parameters) {
        if (param instanceof Date) {
          param = param.toLocaleString()
        }
        if (typeof param === 'string') {
          param = `'${param}'`.replace(/\?/g, questionMarker)
        }
        _sql = _sql.replace(/\?/, param as any)
      }
    }
    const param: LoggerParams = {
      sql: _sql.replace(regexp, '?'),
      params: parameters,
      duration: Math.round(queryDurationMillis * 100) / 100,
      error: err,
    }
    if (logQueryNode) {
      param.queryNode = query
    }
    logger(param)
  }
}
