#!/usr/bin/env bun
// Example: Generate migration SQL for a schema

import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { column, defineTable } from 'kysely-sqlite-builder/schema'
import { generateMigrateSQL } from 'kysely-sqlite-builder/schema'

// Define a sample schema
const userTable = defineTable({
  columns: {
    id: column.increments(),
    name: column.string({ notNull: true }),
    email: column.string(),
    active: column.boolean({ defaultTo: true }),
    meta: column.object(),
    createdAt: column.date(),
  },
  primary: 'id',
  index: ['email', 'active'],
  createAt: true,
  updateAt: true,
})

const postTable = defineTable({
  columns: {
    id: column.increments(),
    userId: column.int({ notNull: true }),
    title: column.string({ notNull: true }),
    content: column.string(),
    published: column.boolean({ defaultTo: false }),
  },
  primary: 'id',
  index: [['userId', 'published']],
})

const schema = {
  user: userTable,
  post: postTable,
}

async function main() {
  // Create a temporary in‑memory database
  const db = new Kysely<any>({
    dialect: new SqliteDialect({
      database: new Database(':memory:'),
    }),
  })

  try {
    // Generate migration SQL
    const sqlStatements = await generateMigrateSQL(db, schema, {
      log: true,
      excludeTablePrefix: ['sqlite_%'],
    })

    console.log('Generated migration SQL:')
    console.log('='.repeat(80))
    sqlStatements.forEach((sql, i) => {
      console.log(`${i + 1}. ${sql}`)
    })
    console.log('='.repeat(80))
    console.log(`Total: ${sqlStatements.length} statements`)
  } finally {
    await db.destroy()
  }
}

if (require.main === module) {
  main().catch(console.error)
}

export {}