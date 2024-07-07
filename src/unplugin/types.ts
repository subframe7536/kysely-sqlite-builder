import type MagicStringStack from 'magic-string-stack/index'

export type TransformOptions = {
  /**
   * filter files to be transformed
   * @param filePath file path
   */
  filter?: (filePath: string) => boolean
  /**
   * custom transformer
   * @param code source code
   * @param filePath file path
   */
  transform?: (code: MagicStringStack, filePath: string) => MagicStringStack
  /**
   * use dynamic node transformer, maybe impact performance
   * @default true
   */
  useDynamicTransformer?: boolean
  /**
   * drop support of `migrator`, `instropection`, `schema` and remove all props in `adapter` except `supportsReturning: true`
   */
  dropMigrator?: boolean
  /**
   * drop support of `delete`
   */
  dropDelete?: boolean
}
