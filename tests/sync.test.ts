import type { SqliteBuilder } from '../src'
import type { DB } from './utils'
import { beforeEach, describe, expect, it } from 'bun:test'
import { column, DataType, defineTable, generateSyncTableSQL, type InferDatabase, parseExistSchema, useSchema } from '../src/schema'
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
  it('should have no operation', async () => {
    expect(
      generateSyncTableSQL(
        db.kysely,
        await parseExistSchema(db.kysely),
        baseTables,
      ),
    ).toStrictEqual([])
  })
  it('should add column', async () => {
    const test = defineTable({
      ...baseTables.test,
      columns: {
        ...baseTables.test.columns,
        newColumn: column.int({ defaultTo: 0, notNull: true }),
      },
    })
    await db.syncDB(useSchema({ ...baseTables, test }, { log: true }))
    const tables = await db.kysely.introspection.getTables()
    expect(tables.length).toBe(2)
    const _tables = tables.find(t => t.name === 'test')!
    const {
      dataType,
      isNullable,
      hasDefaultValue,
    } = _tables.columns.find(({ name }) => name === 'newColumn')!
    expect(dataType).toBe('INTEGER')
    expect(isNullable).toBe(false)
    expect(hasDefaultValue).toBe(true)
  })
  it('should drop column', async () => {
    const newColumns = JSON.parse(JSON.stringify(baseTables.test.columns))
    delete newColumns.array
    const test = defineTable({
      ...baseTables.test,
      columns: newColumns,
    })
    await db.syncDB(useSchema({ ...baseTables, test }, { log: true }))
    const tables = await db.kysely.introspection.getTables()
    expect(tables.length).toBe(2)
    const _tables = tables.find(t => t.name === 'test')!
    expect(_tables.columns.find(({ name }) => name === 'array')).toBeUndefined()
  })
  it('should update and diff same table with different columns type', async () => {
    await db.insertInto('test').values({ gender: true, name: 'test', person: { name: 'p' } }).execute()
    await db.syncDB(useSchema({
      ...baseTables,
      test: defineTable({
        ...baseTables.test,
        columns: {
          ...baseTables.test.columns,
          array: column.int(),
        },
      }),
    }))
    const tables = await db.kysely.introspection.getTables()
    expect(tables.length).toBe(2)
    const col = tables.find(t => t.name === 'test')!.columns.find(t => t.name === 'array')!
    expect(col.dataType).toBe('INTEGER')
    expect(col.isNullable).toBe(true)
    expect(col.hasDefaultValue).toBe(false)
  })
})
