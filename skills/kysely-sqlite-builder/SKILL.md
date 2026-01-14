---
name: kysely-sqlite-builder
description: "Utility layer for Kysely on SQLite databases. Use when working with SQLite via Kysely for: schema definition and auto-migration, soft-delete patterns, precompiled queries, pagination, nested transactions using savepoints, SQLite pragma utilities (integrity check, foreign keys, optimization), serialization/deserialization, enhanced logging. Also use when user asks about kysely-sqlite-builder library usage, table definitions, syncDB, generateMigrateSQL, parseExistSchema, or any related functionality."
---

# kysely-sqlite-builder Skill

This skill provides guidance for working with the `kysely-sqlite-builder` library, a utility layer on top of Kysely for SQLite databases.

## Quick Start

### Installation
```bash
npm install kysely-sqlite-builder
```
Peer dependency: `kysely@>=0.28`

### Basic Setup
```ts
import Database from 'better-sqlite3'
import { SqliteDialect } from 'kysely'
import { SqliteBuilder } from 'kysely-sqlite-builder'
import { column, defineTable, InferDatabase, useSchema } from 'kysely-sqlite-builder/schema'

const myTable = defineTable({
  columns: {
    id: column.increments(),
    name: column.string({ notNull: true }),
  },
  primary: 'id',
  createAt: true,
  updateAt: true,
})

const schema = { myTable }
type DB = InferDatabase<typeof schema>

const builder = new SqliteBuilder<DB>({
  dialect: new SqliteDialect({ database: new Database(':memory:') }),
  onQuery: true,
})

await builder.syncDB(useSchema(schema, { log: true }))
```

## Core Workflows

### 1. Schema Definition & Auto‑Migration
- Use `defineTable` with `column.*` factories to define tables
- Apply schema with `syncDB(useSchema(schema, options))`
- Supports `createAt`, `updateAt`, `softDelete`, `withoutRowId`
- No foreign‑key or check‑constraint support (SQLite limitation)

### 2. Soft‑Delete Patterns
- Use `SoftDeleteSqliteBuilder` for automatic soft‑delete filtering
- `deleteFrom` sets `isDeleted = 1` (configurable column name)
- Use `whereExists` / `whereDeleted` to explicitly include/exclude soft‑deleted rows

### 3. Precompiled Queries
- Use `precompile<T>()` for parameterized query reuse
- Call `.build(callback)` to create reusable compiled query
- Dispose manually or with `using` statement (ES2022)

### 4. Pagination
- Use `pageQuery(queryBuilder, { num, size, queryTotal })` for offset‑based pagination
- Returns total count, records, page metadata

### 5. Nested Transactions
- Nested `builder.transaction()` calls automatically use `SAVEPOINT`
- Works with both `SqliteBuilder` and `SoftDeleteSqliteBuilder`

### 6. SQLite Pragma Utilities
- `checkIntegrity(db)` – verify database integrity
- `foreignKeys(db, enable)` – enable/disable foreign key constraints
- `getOrSetDBVersion(db, version?)` – get/set `user_version`
- `optimizePragma(db, options)` – set optimization pragmas (cache size, journal mode, etc.)
- `optimizeSize(db, rebuild?)` – shrink database file

### 7. Serialization/Deserialization
- Automatic via `kysely-plugin-serialize` (included)
- Object/array columns stored as JSON, booleans as 0/1, dates as ISO strings
- Do not add another camel‑case plugin if using `createAt`/`updateAt`/`softDelete`

## Common Patterns

### Generating Migration SQL
```ts
import { generateMigrateSQL } from 'kysely-sqlite-builder/schema'
const sqlStatements = await generateMigrateSQL(db, schema, options)
```

### Parsing Existing Schema
```ts
import { parseExistSchema } from 'kysely-sqlite-builder/schema'
const existing = await parseExistSchema(db.kysely)
```

### Code‑Based Migrations
```ts
import { createCodeProvider, useMigrator } from 'kysely-sqlite-builder/migrator'
const provider = createCodeProvider({ ... })
await builder.syncDB(useMigrator(provider, options))
```

### Using Different SQLite Dialects
Works with:
- Official `SqliteDialect` (`better‑sqlite3`)
- `SqliteWorkerDialect` (worker threads)
- `NodeWasmDialect` (`node‑sqlite3‑wasm`)
- `WaSqliteWorkerDialect` (browser + IndexedDB/OPFS)

## Error Handling

- `IntegrityError` thrown when integrity check fails
- Schema sync provides `onSuccess` and `onError` hooks
- Failed migrations can be rolled back automatically

## Tree‑Shaking

For smaller bundles, consider the external `kysely-unplugin-sqlite` plugin:
```ts
import { plugin } from 'kysely-unplugin-sqlite'
// Use with your bundler (Vite, Webpack, Rollup, etc.)
```

## References

- **Detailed API reference**: See [references/api.md](references/api.md) for complete export list and type definitions
- **Schema sync options**: See [references/schema-sync.md](references/schema-sync.md) for `SchemaSyncOptions`
- **Migration examples**: See [references/migrations.md](references/migrations.md) for advanced migration patterns

## Notes

- Always use `InferDatabase<typeof schema>` for type safety
- The builder automatically includes `kysely-plugin-serialize`
- Nested transactions use `SAVEPOINT`; ensure your SQLite version supports it
- For production, set appropriate pragmas (`journal_mode='WAL'`, `synchronous='NORMAL'`, etc.)

## Troubleshooting

- **Schema sync fails**: Check `excludeTablePrefix` (default `sqlite_%`) and `truncateIfExists` options
- **Precompiled queries not caching**: Ensure `.compile()` is called with same parameter shape
- **Soft‑delete not working**: Verify column name matches `deleteColumnName` option (default `'isDeleted'`)