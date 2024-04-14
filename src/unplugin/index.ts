import { createUnplugin } from 'unplugin'
import { transformKyselyCode } from './transform'

export type TransformOptions = {
  /**
   * use dynamic node transformer, maybe impact performance
   * @default true
   */
  useDynamicTransformer?: boolean
  /**
   * drop support of migrator and instropection
   */
  dropMigrator?: boolean
}

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
