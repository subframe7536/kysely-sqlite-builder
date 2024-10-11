import type { InferDatabase } from '../src/schema'
import { NodeWasmDialect } from 'kysely-wasm'
import { Database } from 'node-sqlite3-wasm'
import { optimizePragma, SqliteBuilder } from '../src'
import { column, defineTable } from '../src/schema'

const testTable = defineTable({
  columns: {
    id: column.increments(),
    name: column.string({ defaultTo: 'test' }),
    person: column.object({ defaultTo: { name: 'test' } }),
    gender: column.boolean({ notNull: true }),
    array: column.object().$cast<string[]>(),
    literal: column.string().$cast<'l1' | 'l2' | string & {}>(),
  },
  primary: 'id',
  index: ['person', ['id', 'gender']],
  timeTrigger: { create: true, update: true },
})

const blobTable = defineTable({
  columns: {
    id: column.int({ notNull: true }),
    // better-sqlite3 always return Buffer
    // node sqlite wasm always return Uint8Array
    buffer: column.blob(),
    uint8: column.blob(),
  },
  primary: 'id',
})

export const baseTables = {
  test: testTable,
  blob: blobTable,
}
export type DB = InferDatabase<typeof baseTables>

export const dialect = new NodeWasmDialect({
  database: new Database(':memory:'),
  async onCreateConnection(connection) {
    await optimizePragma(connection)
  },
})

export function getDatabaseBuilder(debug = false): SqliteBuilder<DB> {
  return new SqliteBuilder<DB>({
    dialect,
    logger: console,
    onQuery: debug,
  })
}
