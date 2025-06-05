import { defineConfig } from 'bunup'

export default defineConfig({
  entry: ['src/index.ts','src/schema/index.ts','src/migrator/index.ts'],
  clean: true,
  format: ['cjs', 'esm'],
  // dts: true,
  dts: false,
})
