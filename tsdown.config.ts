import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    schema: 'src/schema/index.ts',
    migrator: 'src/migrator/index.ts',
  },
  clean: true,
  format: ['cjs', 'esm'],
  dts: {
    isolatedDeclarations: true,
  },
  exports: true
})
