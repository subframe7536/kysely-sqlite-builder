import { describe, expect, it } from 'bun:test'
import { NodeWasmDialect } from 'kysely-wasm'
import { Database } from 'node-sqlite3-wasm'
import { createSoftDeleteExecutor, pageQuery, precompile, SqliteBuilder } from '../src'
import { getOrSetDBVersion, optimizePragma } from '../src/pragma'
import { column, defineTable, useSchema } from '../src/schema'
import { baseTables, getDatabaseBuilder } from './utils'
import type { InferDatabase } from '../src/schema'

describe('test builder', async () => {
  const db = getDatabaseBuilder()
  await getOrSetDBVersion(db.kysely, 2)
  // generate table
  await db.syncDB(useSchema(baseTables))
  it('should insert', async () => {
    console.log(await db.transaction(async () => {
      await db.insertInto('test').values([{ gender: false }, { gender: true }]).execute()
      return await db.updateTable('test').set({ gender: true }).where('id', '=', 2).returningAll().execute()
    }, {
      onCommit: () => {
        console.log('after commit')
      },
    }))
    const result = await db.selectFrom('test').selectAll().execute()
    expect(result).toBeInstanceOf(Array)
    expect(result![0].person).toStrictEqual({ name: 'test' })
    expect(result![0].gender).toBe(0)
    expect(result![0].createAt).toBeInstanceOf(Date)
    expect(result![0].updateAt).toBeInstanceOf(Date)
    const result2 = await db.selectFrom('test').selectAll().executeTakeFirst()
    expect(result2).toBeInstanceOf(Object)
    expect(result2!.person).toStrictEqual({ name: 'test' })
    expect(result2!.gender).toBe(0)
    expect(result2!.createAt).toBeInstanceOf(Date)
    expect(result2!.updateAt).toBeInstanceOf(Date)
  })

  it('should precompile', async () => {
    const select = precompile<{ person: { name: string }, test?: 'asd' }>()
      .build(param =>
        db.selectFrom('test').selectAll().where('person', '=', param('person')),
      )
    const insert = precompile<{ gender: boolean }>()
      .build(param =>
        db.insertInto('test').values({ gender: param('gender') }),
      )
    const update = precompile<{ gender: boolean }>()
      .build(param =>
        db.updateTable('test').set({ gender: param('gender') }).where('id', '=', 1),
      )

    const start = performance.now()

    const { parameters, sql } = select.compile({ person: { name: '1' } })
    expect(sql).toBe('select * from "test" where "person" = ?')
    expect(parameters[0]).toBe('{"name":"1"}')

    const start2 = performance.now()
    console.log('no compiled:', `${(start2 - start).toFixed(2)}ms`)

    const { parameters: p1, sql: s1 } = select.compile({ person: { name: 'test' } })
    expect(s1).toBe('select * from "test" where "person" = ?')
    expect(p1).toStrictEqual(['{"name":"test"}'])

    console.log('   compiled:', `${(performance.now() - start2).toFixed(2)}ms`)

    const result = await db.execute(insert.compile({ gender: true }))
    expect(result.rows).toStrictEqual([])
    const result2 = await db.execute(update.compile({ gender: false }))
    expect(result2.rows).toStrictEqual([])
  })

  it('should soft delete', async () => {
    const softDeleteTable = defineTable({
      columns: {
        id: column.increments(),
        name: column.string(),
      },
      primary: 'id',
      softDelete: true,
    })
    const softDeleteSchema = {
      testSoftDelete: softDeleteTable,
    }

    const db = new SqliteBuilder<InferDatabase<typeof softDeleteSchema>>({
      dialect: new NodeWasmDialect({
        database: new Database(':memory:'),
        async onCreateConnection(connection) {
          await optimizePragma(connection)
        },
      }),
      executor: createSoftDeleteExecutor().executor,
      // onQuery: true,
    })
    await db.syncDB(useSchema(softDeleteSchema, { log: false }))

    const insertResult = await db.insertInto('testSoftDelete').values({ name: 'test' }).returning('isDeleted').executeTakeFirst()
    expect(insertResult?.isDeleted).toBe(0)

    await db.deleteFrom('testSoftDelete').where('id', '=', 1).execute()
    const selectResult = await db.selectFrom('testSoftDelete').selectAll().executeTakeFirst()
    expect(selectResult).toBeUndefined()

    const updateResult = await db.updateTable('testSoftDelete').set({ name: 'test' }).where('id', '=', 1).executeTakeFirst()
    expect(updateResult?.numUpdatedRows).toBe(0n)
  })

  it('should paginate', async () => {
    const db = getDatabaseBuilder()
    await db.syncDB(useSchema(baseTables))
    for (let i = 0; i < 10; i++) {
      await db.insertInto('test').values({ gender: true, literal: 'l' + i }).execute()
    }
    const qb = db.selectFrom('test').selectAll()
    const page1 = await pageQuery(qb, { num: 1, size: 4, queryTotal: true })
    expect(page1.total).toBe(10)
    expect(page1.current).toBe(1)
    expect(page1.size).toBe(4)
    expect(page1.records[0].literal).toBe('l0')
    expect(page1.records[3].literal).toBe('l3')
    expect(page1.hasPrevPage).toBe(false)
    expect(page1.hasNextPage).toBe(true)
    expect(page1.pages).toBe(3)

    const page2 = await pageQuery(qb, { num: 2, size: 4 })
    expect(page2.current).toBe(2)
    expect(page2.size).toBe(4)
    expect(page2.records[0].literal).toBe('l4')
    expect(page2.records[3].literal).toBe('l7')

    const page3 = await pageQuery(qb, { num: 3, size: 4 })
    expect(page3.current).toBe(3)
    expect(page3.size).toBe(2)
    expect(page3.records[0].literal).toBe('l8')
    expect(page3.records[1].literal).toBe('l9')

    const newPages = page3.convertRecords(r => r.literal)
    expect(newPages.records).toStrictEqual(['l8', 'l9'])

    const page4 = await pageQuery(qb, { num: 4, size: 4, queryTotal: true })
    expect(page4.total).toBe(10)
    expect(page4.current).toBe(4)
    expect(page4.size).toBe(0)

    const page5 = await pageQuery(qb, { num: 0, size: -1, queryTotal: true })
    expect(page5.total).toBe(10)
    expect(page5.current).toBe(0)
    expect(page5.size).toBe(10)
  })
})
