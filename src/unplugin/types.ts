export type TransformOptions = {
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
