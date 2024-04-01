/* eslint-disable test/consistent-test-it */
import { NodeWasmDialect } from 'kysely-wasm'
import { Database } from 'node-sqlite3-wasm'
import { bench } from 'vitest'
import { createSqliteBuilder } from '../src'
import { column, defineTable } from '../src/schema'

const testTable = defineTable({
  columns: {
    id: column.increments(),
    person: column.object({ defaultTo: { name: 'test' } }),
    gender: column.boolean({ notNull: true }),
    array: column.object().$cast<string[]>(),
    literal: column.string().$cast<'l1' | 'l2'>(),
    buffer: column.blob(),
  },
  primary: 'id',
  index: ['person', ['id', 'gender']],
  timeTrigger: { create: true, update: true },
})

const db = await createSqliteBuilder({
  dialect: new NodeWasmDialect({
    database: new Database(':memory:'),
  }),
  schema: {
    test: testTable,
  },
})

await db.insertInto('test').values({ person: { name: 'test1' }, gender: true }).execute()

bench('normal', async () => {
  await db.selectFrom('test').selectAll().where('id', '=', 1).execute()
})

const select = db.precompile<{ id: number }>()
  .build((db, param) => db.selectFrom('test').selectAll().where('id', '=', param('id')))

bench('precompile', async () => {
  await db.execute(select.compile({ id: 1 }))
})

bench('raw', async () => {
  await db.execute(`select * from test where id = ?`, [1])
})
