import type MagicString from 'magic-string'

export type TransformOptions = {
  /**
   * Filter files to be transformed
   * @param filePath file path
   */
  filter?: (filePath: string) => boolean
  /**
   * Custom extra transformer
   * @param code source code
   * @param filePath file path
   */
  transform?: (code: MagicString, filePath: string) => MagicString
  /**
   * Use dynamic node transformer in `DefaultQueryCompiler`
   * @default true
   */
  useDynamicTransformer?: boolean
  /**
   * Drop support of `migrator`, `instropection`, and remove all props in `adapter` except `supportsReturning: true`
   *
   * If you are using `defineTable`, recommend to set `true`
   */
  dropMigrator?: boolean
  /**
   * Drop support of `schema` and table management
   *
   * If you are using `defineTable`, recommend to set `true`
   */
  dropSchema?: boolean
  /**
   * Drop support of `delete`
   *
   * If you are using `createSoftDeleteExecutor`, recommend to set `true`
   */
  dropDelete?: boolean
  /**
   * Minify method name, maybe you should also setup `filter`
   *
   * method names:
   * - `append -> _a`
   * - `cloneWith -> _clw`
   * - `create -> _c`
   * - `createWith -> _crw`
   * - `Wrapper -> _W`
   * - `visit -> _v`
   * - `toOperationNode` -> `_ton`
   * - `executor` -> `_ec`
   */
  minifyMethodName?: boolean
}
