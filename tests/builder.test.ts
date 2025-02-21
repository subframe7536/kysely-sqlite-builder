import type { InferDatabase } from '../src/schema'

import { describe, expect, it } from 'bun:test'

import { pageQuery, precompile, SoftDeleteSqliteBuilder } from '../src'
import { getOrSetDBVersion } from '../src/pragma'
import { column, defineTable, useSchema } from '../src/schema'
import { baseTables, createDialect, getDatabaseBuilder } from './utils'

describe('test builder', async () => {
  it('should insert', async () => {
    const db = getDatabaseBuilder()
    await getOrSetDBVersion(db.kysely, 2)
    await db.syncDB(useSchema(baseTables))

    console.log(await db.transaction(async () => {
      await db
        .insertInto('test')
        .values([{ gender: false }, { gender: true }])
        .execute()
      return await db
        .updateTable('test')
        .set({ gender: true })
        .where('id', '=', 2)
        .returningAll()
        .execute()
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
    const db = getDatabaseBuilder()
    await getOrSetDBVersion(db.kysely, 2)
    await db.syncDB(useSchema(baseTables))

    const select = precompile<{ person: { name: string }, test?: 'asd' }>()
      .build(
        param => db
          .selectFrom('test')
          .selectAll()
          .where('person', '=', param('person')),
      )
    const insert = precompile<{ gender: boolean }>()
      .build(
        param => db
          .insertInto('test')
          .values({ gender: param('gender') }),
      )
    const update = precompile<{ gender: boolean }>()
      .build(
        param => db
          .updateTable('test')
          .set({ gender: param('gender') })
          .where('id', '=', 1),
      )

    const start = performance.now()

    const normalSelect = select.compile({ person: { name: '1' } })
    expect(normalSelect).toMatchInlineSnapshot(`
{
  "parameters": [
    "{"name":"1"}",
  ],
  "query": {
    "kind": "SelectQueryNode",
  },
  "sql": "select * from "test" where "person" = ?",
}
`)

    const start2 = performance.now()
    console.log('no compiled:', `${(start2 - start).toFixed(2)}ms`)

    const cachedSelect = select.compile({ person: { name: 'test' } })
    expect(cachedSelect).toMatchInlineSnapshot(`
{
  "parameters": [
    "{"name":"test"}",
  ],
  "query": {
    "kind": "SelectQueryNode",
  },
  "sql": "select * from "test" where "person" = ?",
}
`)

    console.log('   compiled:', `${(performance.now() - start2).toFixed(2)}ms`)

    const compiledInsert = insert.compile({ gender: true })
    expect(compiledInsert).toMatchInlineSnapshot(`
{
  "parameters": [
    true,
  ],
  "query": {
    "kind": "InsertQueryNode",
  },
  "sql": "insert into "test" ("gender") values (?)",
}
`)
    const result = await db.execute(compiledInsert)
    expect(result.rows).toStrictEqual([])

    const compiledUpdate = update.compile({ gender: false })
    expect(compiledUpdate).toMatchInlineSnapshot(`
{
  "parameters": [
    false,
    1,
  ],
  "query": {
    "kind": "UpdateQueryNode",
  },
  "sql": "update "test" set "gender" = ? where "id" = ?",
}
`)
    const result2 = await db.execute(compiledUpdate)
    expect(result2.rows).toStrictEqual([])

    const compiledSelectCol = precompile<{ col: 'name', col1: 'gender' }>().build(
      param => db.selectFrom('test').select([param('col'), param('col1')]),
    ).compile({ col: 'name', col1: 'gender' })
    expect(compiledSelectCol).toMatchInlineSnapshot(`
{
  "parameters": [],
  "query": {
    "kind": "SelectQueryNode",
  },
  "sql": "select "name", "gender" from "test"",
}
`)
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

    const db = new SoftDeleteSqliteBuilder<InferDatabase<typeof softDeleteSchema>>({
      dialect: createDialect(),
      logger: console,
      onQuery: false,
    })
    await db.syncDB(useSchema(softDeleteSchema, { log: false }))

    const insertResult = await db
      .insertInto('testSoftDelete')
      .values({ name: 'test' })
      .returning('isDeleted')
      .executeTakeFirst()
    expect(insertResult?.isDeleted).toBe(0)

    const deleteResult = await db.deleteFrom('testSoftDelete').where('id', '=', 1).execute()
    expect(deleteResult[0].numDeletedRows).toBeUndefined()
    const fixedDeleteResult = db.toDeleteResult(deleteResult)
    expect(fixedDeleteResult[0].numDeletedRows).toBe(1n)

    const selectResult = await db
      .selectFrom('testSoftDelete')
      .selectAll()
      .executeTakeFirst()
    expect(selectResult).toBeUndefined()
    const selectResult1 = await db.kysely
      .selectFrom('testSoftDelete')
      .selectAll()
      .$call(db.whereExists)
      .executeTakeFirst()
    expect(selectResult1).toBeUndefined()

    const updateResult = await db
      .updateTable('testSoftDelete')
      .set({ name: 'test' })
      .where('id', '=', 1)
      .executeTakeFirst()
    expect(updateResult?.numUpdatedRows).toBe(0n)
  })

  it('should paginate', async () => {
    const db = getDatabaseBuilder()
    await db.syncDB(useSchema(baseTables))
    for (let i = 0; i < 10; i++) {
      await db
        .insertInto('test')
        .values({ gender: true, literal: `l${i}` })
        .execute()
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
