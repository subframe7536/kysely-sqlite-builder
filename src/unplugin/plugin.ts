import { createUnplugin } from 'unplugin'
import { transformKyselyCode } from './transform'

export type TransformOptions = {
  /**
   * use dynamic node transformer, maybe impact performance
   * @default true
   */
  useDynamicTransformer?: boolean
  /**
   * drop support of `migrator`, `instropection` and remove all props in `adapter` except `supportsReturning: true`
   */
  dropMigrator?: boolean
  /**
   * drop support of `schema`
   */
  dropSchema?: boolean
}

/**
 * kysely plugin
 * @example
 * import { defineConfig } from 'vite'
 * import { plugin } from 'kysely-sqlite-builder/plugin'
 *
 * export default defineConfig({
 *   plugins: [plugin.vite({ dropMigrator: true })],
 * })
 */
export const plugin = createUnplugin<TransformOptions | undefined>(
  (options = { useDynamicTransformer: true }) => ({
    name: 'unplugin-kysely',
    transformInclude(id) {
      return id.includes('kysely') && id.includes('esm')
    },
    transform(code, id) {
      return transformKyselyCode(code, id, options)
    },
  }),
)
