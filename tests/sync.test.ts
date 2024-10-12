import type { SqliteBuilder } from '../src'
import type { DB } from './utils'
import { beforeEach, describe, expect, it } from 'bun:test'
import { column, DataType, defineTable, useSchema } from '../src/schema'
import { baseTables, getDatabaseBuilder } from './utils'

describe('test create table', async () => {
  it('should create new table', async () => {
    const db = getDatabaseBuilder()

    await db.syncDB(useSchema(baseTables, { log: false }))
    let _tables = await db.kysely.introspection.getTables()
    expect(_tables.length).toBe(2)
    expect(_tables[0].name).toBe('blob')
    expect(_tables[1].name).toBe('test')

    const foo = defineTable({
      columns: {
        col1: { type: DataType.increments },
        col2: { type: DataType.string },
      },
      index: ['col2'],
      timeTrigger: { create: true, update: true },
      unique: ['col2'],
    })

    await db.syncDB(useSchema({
      ...baseTables,
      foo,
    }, { log: true }))

    _tables = await db.kysely.introspection.getTables()
    expect(_tables.length).toBe(3)
    expect(_tables[0].name).toBe('blob')
    expect(_tables[1].name).toBe('foo')
    expect(_tables[2].name).toBe('test')
  })
})
describe('test drop table', async () => {
  it('should drop old table', async () => {
    const db = getDatabaseBuilder()

    await db.syncDB(useSchema(baseTables, { log: false }))
    let _tables = await db.kysely.introspection.getTables()
    expect(_tables.length).toBe(2)

    await db.syncDB(useSchema({}, { log: true }))
    _tables = await db.kysely.introspection.getTables()
    expect(_tables.length).toBe(0)
  })
})
describe('test update table', async () => {
  let db: SqliteBuilder<DB>
  beforeEach(async () => {
    db = getDatabaseBuilder()
    await db.syncDB(useSchema(baseTables, { log: false }))
  })
  it('should update and diff same table with columns', async () => {
    await db.insertInto('test').values({ gender: true, name: 'test', person: { name: 'p' } }).execute()
    const test = defineTable({
      columns: {
        id: column.increments(),
        name: column.string(),
        person: column.int({ notNull: true }),
        bool: column.boolean({ notNull: true }),
        array: column.object().$cast<string[]>(),
        buffer: column.blob(),
        newColumn: column.int(),
      },
      primary: 'id',
      timeTrigger: { create: true, update: true },
    })
    await db.syncDB(useSchema({ test }, { log: true }))
    const tables = await db.kysely.introspection.getTables()
    expect(tables.length).toBe(1)
    const _tables = tables[0]
    expect(
      _tables.columns
        .filter(({ name }) => name === 'person')[0]
        .dataType,
    ).toBe('INTEGER')
    expect(
      _tables.columns
        .filter(({ name }) => name === 'name')[0]
        .hasDefaultValue,
    ).toBe(false)
    expect(_tables
      .columns
      .filter(({ name }) => name === 'gender')
      .length,
    ).toBe(0)
    expect(_tables
      .columns
      .filter(({ name }) => name === 'bool')[0]
      .dataType,
    ).toBe('INTEGER')
    expect(_tables
      .columns
      .filter(({ name }) => name === 'newColumn')[0]
      .dataType,
    ).toBe('INTEGER')

    const data = await db.selectFrom('test').selectAll().executeTakeFirstOrThrow()
    expect(data.person).toBe(0 as any)
  })
})
