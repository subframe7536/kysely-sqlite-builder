import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'tsdown'

const dir = path.dirname(fileURLToPath(import.meta.url))

const entry = {
  index: 'src/index.ts',
  schema: 'src/schema/index.ts',
  migrator: 'src/migrator/index.ts',
}

export default defineConfig({
  entry,
  clean: true,
  format: ['cjs', 'esm'],
  external: ['@subframe7536/type-utils'],
  dts: {
    isolatedDeclarations: true,
  },
  treeshake: true,
})
