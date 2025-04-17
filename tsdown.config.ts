import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'tsdown'

const dir = path.dirname(fileURLToPath(import.meta.url))

const entry = {
  index: 'src/index.ts',
  schema: 'src/schema/index.ts',
  migrator: 'src/migrator/index.ts',
}

const inputAlias = Object.fromEntries(
  Object.entries(entry)
    .map(([k, v]) => [path.join(dir, v).replace('.ts', '.d.ts'), `${k}.d`]),
)

export default defineConfig({
  entry,
  clean: true,
  format: ['cjs', 'esm'],
  dts: {
    isolatedDeclaration: true,
    inputAlias,
  },
  treeshake: true,
})
