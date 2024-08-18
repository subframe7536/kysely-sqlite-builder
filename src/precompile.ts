import type { Compilable, CompiledQuery, RootOperationNode } from 'kysely'
import type { QueryBuilderOutput } from './types'
import { defaultSerializer } from './serializer'

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

/**
 * precompile query, call it with different params later, design for better performance
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
      let compiled: CompiledQuery<Compilable<O>> | null
      const dispose = (): null => compiled = null
      return {
        [Symbol.dispose]: dispose,
        dispose,
        compile: (param: T) => {
          if (!compiled) {
            const { query: node, ...data } = queryBuilder(name => ('_P_' + name) as any).compile()
            compiled = { ...data, query: processRootOperatorNode(node) as any }
          }
          return {
            ...compiled,
            parameters: compiled.parameters.map((p) => {
              const key = (typeof p === 'string' && p.startsWith('_P_')) ? p.substring(3) : undefined
              return key ? serializer(param[key]) : p
            }),
          }
        },
      }
    },
  }
}
