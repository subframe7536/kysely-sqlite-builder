import { describe, expect, it } from 'bun:test'
import { Kysely } from 'kysely'
import { executeSQL } from '../src'
import { column, defineTable, generateMigrateSQL, type Schema } from '../src/schema'
import { createDialect } from './utils'

const db = new Kysely({ dialect: createDialect() })

describe('test sync sql', async () => {
  async function run(schema: Schema, expectSQLs: string[]): Promise<Promise<void>> {
    const initSQLs = await generateMigrateSQL(db, schema)
    expect(initSQLs).toStrictEqual(expectSQLs)
    for (const sql of initSQLs) {
      await executeSQL(db, sql)
    }
  }

  it('should generate sqls and run', async () => {
    await run(
      {
        test: defineTable({
          columns: {
            id: column.increments(),
            person: column.object({ defaultTo: { name: 'test' } }),
            gender: column.boolean({ notNull: true }),
          },
          primary: 'id', // optional
          index: ['person', ['id', 'gender']],
          createAt: true, // `createTime` column
          updateAt: true, // `updateTime` column
        }),
      },
      [
        'CREATE TABLE IF NOT EXISTS "test" ("id" INTEGER PRIMARY KEY AUTOINCREMENT,"person" TEXT DEFAULT \'{"name":"test"}\',"gender" INTEGER NOT NULL,"createAt" TEXT DEFAULT CURRENT_TIMESTAMP,"updateAt" TEXT DEFAULT CURRENT_TIMESTAMP);',
        'CREATE INDEX IF NOT EXISTS idx_test_person on "test" ("person");',
        'CREATE INDEX IF NOT EXISTS idx_test_id_gender on "test" ("id","gender");',
        'CREATE TRIGGER IF NOT EXISTS "tgr_test_updateAt" AFTER UPDATE ON "test" BEGIN UPDATE "test" SET "updateAt" = CURRENT_TIMESTAMP WHERE "rowid" = NEW."rowid"; END;',
      ],
    )

    await run(
      {
        test: defineTable({
          columns: {
            id: column.increments(),
            person: column.object({ defaultTo: { name: 'test' } }),
            gender: column.boolean({ notNull: true }),
          },
          primary: 'id', // optional
          index: ['person', ['id', 'gender']],
        }),
      },
      [
        'DROP TRIGGER IF EXISTS "tgr_test_updateAt";',
        'ALTER TABLE "test" DROP COLUMN "createAt";',
        'ALTER TABLE "test" DROP COLUMN "updateAt";',
      ],
    )

    await run(
      {
        test: defineTable({
          columns: {
            id: column.increments(),
            person: column.object({ defaultTo: { name: 'test' } }),
            gender: column.boolean({ notNull: true }),
          },
          primary: 'id', // optional
        }),
      },
      [
        'DROP INDEX IF EXISTS "idx_test_id_gender";',
        'DROP INDEX IF EXISTS "idx_test_person";',
      ],
    )

    await run(
      {
        test: defineTable({
          columns: {
            id: column.increments(),
            person: column.object({ defaultTo: { name: 'test' } }),
            type: column.string().$cast<'normal' | 'premium'>(),
          },
          primary: 'id',
        }),
      },
      [
        'ALTER TABLE "test" ADD COLUMN "type" TEXT;',
        'ALTER TABLE "test" DROP COLUMN "gender";',
      ],
    )
  })
})
