import type { SqliteBuilder } from '../src'
import type { DB } from './utils'
import { beforeEach, describe, expect, it } from 'bun:test'
import { column, DataType, defineTable, generateSyncTableSQL, parseExistSchema, useSchema } from '../src/schema'
import { parseChangedList } from '../src/schema/core'
import { baseTables, getDatabaseBuilder } from './utils'

describe('test create table', async () => {
  it('should create new table', async () => {
    const db = getDatabaseBuilder()

    await db.syncDB(useSchema(baseTables, { log: false }))
    let _tables = await parseExistSchema(db.kysely)
    expect(Object.keys(_tables).length).toBe(2)
    expect(_tables.blob).toBeTruthy()
    expect(_tables.test).toBeTruthy()

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

    _tables = await parseExistSchema(db.kysely)
    expect(Object.keys(_tables).length).toBe(3)
    expect(_tables.blob).toBeTruthy()
    expect(_tables.foo).toBeTruthy()
    expect(_tables.test).toBeTruthy()
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
    db = getDatabaseBuilder(true)
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
    const tables = await parseExistSchema(db.kysely)
    expect(Object.keys(tables).length).toBe(2)
    const {
      defaultTo,
      notNull,
      type,
    } = tables.test.columns.newColumn
    expect(type).toBe('INTEGER')
    expect(notNull).toBe(true)
    expect(defaultTo).toBe('0')
  })

  it('should drop column', async () => {
    const newColumns = JSON.parse(JSON.stringify(baseTables.test.columns))
    delete newColumns.array
    const test = defineTable({
      ...baseTables.test,
      columns: newColumns,
    })
    await db.syncDB(useSchema({ ...baseTables, test }, { log: true }))
    const tables = await parseExistSchema(db.kysely)
    expect(Object.keys(tables).length).toBe(2)
    expect(tables.test.columns.array).toBeUndefined()
  })

  it('should update and diff same table with different columns type, not null and default value', async () => {
    const prevTables = await parseExistSchema(db.kysely)
    expect(Object.keys(prevTables).length).toBe(2)
    await db.syncDB(useSchema({
      ...baseTables,
      test: defineTable({
        ...baseTables.test,
        columns: {
          ...baseTables.test.columns,
          arrayType: column.int(),
          genderNotNull: column.boolean({ notNull: false }),
          literalDefaultTo: column.string({ defaultTo: '123' }),
        },
      }),
    }))
    const tables = await parseExistSchema(db.kysely)
    expect(Object.keys(tables).length).toBe(2)

    const { columns } = tables.test
    const { columns: prevColumns } = prevTables.test

    const prevColT = prevColumns.array!
    expect(prevColT.type).toBe('TEXT')
    expect(prevColT.notNull).toBe(false)
    expect(prevColT.defaultTo).toBe(null)
    const colT = columns.arrayType
    expect(colT.type).toBe('INTEGER')
    expect(colT.notNull).toBe(false)
    expect(colT.defaultTo).toBe(null)

    const prevColN = prevColumns.gender
    expect(prevColN.type).toBe('INTEGER')
    expect(prevColN.notNull).toBe(true)
    expect(prevColN.defaultTo).toBe(null)
    const colN = columns.genderNotNull
    expect(colN.type).toBe('INTEGER')
    expect(colN.notNull).toBe(false)
    expect(colN.defaultTo).toBe(null)

    const prevColD = prevColumns.literal
    expect(prevColD.type).toBe('TEXT')
    expect(prevColD.notNull).toBe(false)
    expect(prevColD.defaultTo).toBe(null)
    const colD = columns.literalDefaultTo!
    expect(colD.type).toBe('TEXT')
    expect(colD.notNull).toBe(false)
    expect(colD.defaultTo).toBe('\'123\'')
  })

  it('should update table with new index', async () => {
    const tableName = 'test' as const
    const updatedTable = defineTable({
      ...baseTables[tableName],
      index: ['literal'],
    })

    await db.syncDB(useSchema({ ...baseTables, [tableName]: updatedTable }, { log: true }))
    const tables = await parseExistSchema(db.kysely)
    expect(Object.keys(tables).length).toBe(2)
    expect(tables[tableName].index).toStrictEqual([['literal']])
  })

  it('should update table with dropped index', async () => {
    const tableName = 'test' as const
    const updatedTable = defineTable({
      ...baseTables[tableName],
      index: [],
    })
    await db.syncDB(useSchema({ ...baseTables, [tableName]: updatedTable }, { log: true }))
    const tables = await parseExistSchema(db.kysely)
    expect(Object.keys(tables).length).toBe(2)
    expect(tables[tableName].index).toStrictEqual([])
  })

  it('should update table with new trigger', async () => {
    const tableName = 'blob' as const
    const updatedTable = defineTable({
      ...baseTables[tableName],
      timeTrigger: { create: true, update: true },
    })

    await db.syncDB(useSchema({ ...baseTables, [tableName]: updatedTable }, { log: true }))
    const tables = await parseExistSchema(db.kysely)
    expect(Object.keys(tables).length).toBe(2)
    expect(tables[tableName].trigger).toStrictEqual(['tgr_blob_updateAt'])
  })

  it('should update table with dropped trigger', async () => {
    const tableName = 'test' as const
    const updatedTable = defineTable({
      ...baseTables[tableName],
      timeTrigger: { create: false, update: false },
    })
    // @ts-expect-error create at
    delete updatedTable.columns.createAt
    // @ts-expect-error create at
    delete updatedTable.columns.updateAt

    await db.syncDB(useSchema({ ...baseTables, [tableName]: updatedTable }, { log: true }))
    const tables = await parseExistSchema(db.kysely)
    expect(Object.keys(tables).length).toBe(2)
    expect(tables[tableName].trigger).toStrictEqual([])
  })

  it('should update table with new unique constraint', async () => {
    const tableName = 'test' as const
    const updatedTable = defineTable({
      ...baseTables[tableName],
      unique: ['literal', ['id', 'name']],
    })

    await db.syncDB(useSchema({ ...baseTables, [tableName]: updatedTable }, { log: true }))
    const tables = await parseExistSchema(db.kysely)
    expect(Object.keys(tables).length).toBe(2)
    expect(tables[tableName].unique).toStrictEqual([['id', 'name'], ['literal']])
  })

  it('should update table with dropped unique constraint', async () => {
    const tableName = 'test' as const
    const updatedTable = defineTable({
      ...baseTables[tableName],
      unique: [],
    })

    await db.syncDB(useSchema({ ...baseTables, [tableName]: updatedTable }, { log: true }))
    const tables = await parseExistSchema(db.kysely)
    expect(Object.keys(tables).length).toBe(2)
    expect(tables[tableName].unique).toStrictEqual([])
  })
})
