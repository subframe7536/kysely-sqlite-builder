import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    schema: 'src/schema/index.ts',
    plugin: 'src/unplugin/index.ts',
  },
  clean: true,
  external: ['unplugin'],
  format: ['cjs', 'esm'],
  dts: true,
  treeshake: true,
})
