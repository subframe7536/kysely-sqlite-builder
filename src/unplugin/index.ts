import { createUnplugin } from 'unplugin'
import { transformKyselyCode } from './transform'
import type { TransformOptions } from './types'

export type { TransformOptions } from './types'

/**
 * kysely plugin, trim kysely method or class names and remove unsupported methods
 * - `append -> _a`
 * - `create -> _c`
 * - `visit -> _v`
 * - `cloneWith -> _clw`
 * - `createWith -> _crw`
 * - `Wrapper -> _W`
 * - `BuilderImpl -> _BI`
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
