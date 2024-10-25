import type { SqliteBuilder } from '../src'
import type { DB } from './utils'
import { beforeEach, describe, expect, it } from 'bun:test'
import { sql } from 'kysely'
import {
  column,
  DataType,
  defaultFallbackFunction,
  defineTable,
  parseExistSchema,
  useSchema,
} from '../src/schema'
import { baseTables, getDatabaseBuilder } from './utils'

describe('test user_version', () => {
  it('should skip when version same', async () => {
    const db = getDatabaseBuilder()
    await db.syncDB(useSchema(baseTables, { version: { current: 1, skipSyncWhenSame: true } }))
    const tableName = 'asd'
    await db.syncDB(
      useSchema(
        {
          ...baseTables,
          [tableName]: defineTable({ columns: { asd: column.int() } }),
        },
        { version: { current: 1, skipSyncWhenSame: true } },
      ),
    )
    const schema = await parseExistSchema(db.kysely)
    expect(schema[tableName]).toBeUndefined()
  })
})

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
      createAt: true,
      updateAt: true,
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
    db = getDatabaseBuilder({ enable: false })
    await db.syncDB(useSchema(baseTables, { log: false }))
    await db.insertInto('test')
      .values([
        {
          gender: false,
          array: [],
          birth: new Date(),
          literal: 'l1',
          score: 3.21,
        },
        {
          gender: true,
          array: ['test'],
          // birth: new Date(),
          // score: 5.5,
          literal: 'l2',
          name: 'testName',
          person: { name: '11' },
        },
      ])
      .execute()
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
          floatNotNull: column.float({ notNull: true }),
          genderNullable: column.boolean({ notNull: false }),
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
    const colN = columns.genderNullable
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

    const prevColF = prevColumns.score
    expect(prevColF.type).toBe('REAL')
    expect(prevColF.notNull).toBe(false)
    expect(prevColF.defaultTo).toBe(null)
    const colF = columns.floatNotNull!
    expect(colF.type).toBe('REAL')
    expect(colF.notNull).toBe(true)
    expect(colF.defaultTo).toBe(null)
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
      createAt: true,
      updateAt: true,
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
      createAt: false,
      updateAt: false,
    })
    // @ts-expect-error delete create at
    delete updatedTable.columns.createAt
    // @ts-expect-error delete update at
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

  it('should return `ready: false` when have multiple primary keys', async () => {
    const result = await db.syncDB(
      useSchema({
        ...baseTables,
        test: {
          ...baseTables.test,
          primary: ['id', 'name'],
        },
      }),
    )
    expect(result.ready).toBeFalse()
  })

  it('should return `ready: false` when have multiple increment columns', async () => {
    const result = await db.syncDB(
      useSchema({
        ...baseTables,
        test: defineTable({
          ...baseTables.test,
          columns: {
            ...baseTables.test.columns,
            inc: column.increments(),
          },
        }),
      }),
    )
    expect(result.ready).toBeFalse()

    const result2 = await db.syncDB(useSchema({
      a: defineTable({
        columns: {
          i1: column.increments(),
          i2: column.increments(),
        },
      }),
    }))
    expect(result2.ready).toBeFalse()
  })

  it('should use fallback value when have different not null value', async () => {
    await db.syncDB(
      useSchema({
        ...baseTables,
        test: defineTable({
          ...baseTables.test,
          columns: {
            ...baseTables.test.columns,
            birth: column.date({ notNull: true }),
            score: column.float({ notNull: true }),
          },
        }),
      }, {
        fallback: data => data.target.type === DataType.date
          ? sql`CURRENT_TIMESTAMP`
          : defaultFallbackFunction(data),
      }),
    )
    const [result] = await db
      .selectFrom('test')
      .select(['birth', 'score'])
      .where('id', '=', 2)
      .execute()

    expect(result.score).toBe(0)
    expect(result.birth).toBeInstanceOf(Date)
  })
})
