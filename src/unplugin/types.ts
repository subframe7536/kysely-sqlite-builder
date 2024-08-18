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
   * Use dynamic node transformer, maybe impact performance
   * @default true
   */
  useDynamicTransformer?: boolean
  /**
   * Drop support of `migrator`, `instropection`, `schema` and remove all props in `adapter` except `supportsReturning: true`
   */
  dropMigrator?: boolean
  /**
   * Drop support of `delete`
   */
  dropDelete?: boolean
}
