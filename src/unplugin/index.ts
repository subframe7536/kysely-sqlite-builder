import { createUnplugin } from 'unplugin'
import { transformKyselyCode } from './transform'
import type { TransformOptions } from './types'

export type { TransformOptions } from './types'

/**
 * kysely plugin, convert `#props` to `_props`,
 * trim kysely method or class names and remove unsupported methods
 *
 * method name:
 * - `append -> _a`
 * - `cloneWith -> _clw`
 * - `create -> _c`
 * - `createWith -> _crw`
 * - `#props -> _p`
 * - `Wrapper -> _W`
 * - `visit -> _v`
 *
 * removed methods:
 * - `mergeInto`
 * - `replaceInto`
 * - `top`
 * - `fetch`
 * - `ignore`
 * @example
 * import { defineConfig } from 'vite'
 * import { plugin } from 'kysely-sqlite-builder/plugin'
 *
 * export default defineConfig({
 *   plugins: [plugin.vite({ dropMigrator: true })],
 * })
 */
export const plugin = createUnplugin<TransformOptions | undefined>(
  (options = {}) => {
    const { filter = () => false, useDynamicTransformer = true, ...rest } = options
    return {
      name: 'unplugin-kysely',
      transformInclude(id) {
        return (id.includes('kysely') && id.includes('esm')) || filter(id)
      },
      transform(code, id) {
        return transformKyselyCode(code, id, { useDynamicTransformer, ...rest })
      },
    }
  },
)
