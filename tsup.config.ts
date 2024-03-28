import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    schema: 'src/schema/index.ts',
  },
  clean: true,
  format: ['cjs', 'esm'],
  dts: true,
  treeshake: true,
})
