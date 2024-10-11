import type {
  LogEvent,
  RootOperationNode,
} from 'kysely'

export type LoggerParams = {
  sql: string
  params: readonly unknown[]
  duration: number
  queryNode?: RootOperationNode
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
   * Whether to merge parameters into sql, use `JSON.stringify` to serialize params
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

  return (event: LogEvent) => {
    if (!enable || (typeof enable === 'string' && event.level !== enable)) {
      return
    }
    const { level, queryDurationMillis, query: { parameters, sql, query } } = event
    const questionMarker = '_Q_'
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
      sql: _sql.replace(new RegExp(questionMarker, 'g'), '?'),
      params: parameters,
      duration: queryDurationMillis,
      error: err,
    }
    if (logQueryNode) {
      param.queryNode = query
    }
    logger(param)
  }
}
