import type { QueryBuilderOutput } from './types'
import type { Compilable, CompiledQuery, RootOperationNode } from 'kysely'

import { defaultSerializer } from './serialize'

export type PrecompileBuilder<T extends Record<string, any>> = {
  build: <O>(
    queryBuilder: (param: <K extends keyof T & string>(name: K) => T[K]) => Compilable<O>
  ) => {
    [Symbol.dispose]: VoidFunction
    dispose: VoidFunction
    compile: (param: T) => CompiledQuery<QueryBuilderOutput<Compilable<O>>>
  }
}
export type ProcessRootOperatorNodeFn = (node: RootOperationNode) => RootOperationNode

export const defaultRootOperatorNodeProcessFn: ProcessRootOperatorNodeFn = (
  node: RootOperationNode,
): RootOperationNode => ({ kind: node.kind }) as any

const PARAM_PREFIX = '_P@'
const PARAM_IN_SQL = new RegExp(`"${PARAM_PREFIX}([^"]+)"`, 'g')

/**
 * Precompile query, call it with different params later, design for better performance
 * @example
 * import { precompile } from 'kysely-sqlite-builder'
 *
 * const select = precompile<{ name: string }>()
 *   .query(param =>
 *     db.selectFrom('test').selectAll().where('name', '=', param('name')),
 *   )
 * const compileResult = select.compile({ name: 'test' })
 * // {
 * //   sql: 'select * from "test" where "name" = ?',
 * //   parameters: ['test'],
 * //   query: { kind: 'SelectQueryNode' } // only node kind by default
 * // }
 * select.dispose() // clear cached query
 *
 * // or auto disposed by using
 * using selectWithUsing = precompile<{ name: string }>()
 *   .query((db, param) =>
 *     db.selectFrom('test').selectAll().where('name', '=', param('name')),
 *   )
 */
export function precompile<T extends Record<string, any>>(
  serializer: (v: any) => any = defaultSerializer,
  processRootOperatorNode: ProcessRootOperatorNodeFn = defaultRootOperatorNodeProcessFn,
): PrecompileBuilder<T> {
  return {
    build: <O>(
      queryBuilder: (param: <K extends keyof T & string>(name: K) => T[K]) => Compilable<O>,
    ) => {
      let _sql: string | undefined
      let _params: any[] | undefined
      let _query: any | undefined
      const dispose = (): void => {
        _sql = _params = _query = undefined
      }
      return {
        [Symbol.dispose]: dispose,
        dispose,
        compile: (param: T) => {
          if (!_sql) {
            const { parameters, query, sql } = queryBuilder(name => (`${PARAM_PREFIX}${name}`) as any).compile()
            _sql = sql
            _params = parameters as any
            _query = processRootOperatorNode(query)
          }
          return {
            query: _query,
            sql: _sql.replace(PARAM_IN_SQL, (_, key: string) => `"${serializer(param[key])}"`),
            parameters: _params!.map(
              p => typeof p === 'string' && p.startsWith(PARAM_PREFIX)
                ? serializer(param[p.substring(3)])
                : p,
            ),
          }
        },
      }
    },
  }
}
