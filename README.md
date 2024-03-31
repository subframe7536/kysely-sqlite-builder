# kysely-sqlite-builder

Utility layer for [Kysely](https://github.com/kysely-org/kysely)  on SQLite

## Features

- table schema
  - infer tables type
  - auto migration
  - auto generate `createAt` and `updateAt`
  - auto generate soft delete
- auto serialize / deserialize
- precompile querys
- auto nest transaction (using `savepoint`) and hooks
- enhanced logger
- typesafe SQLite3 pragma

## Usage

### Dialect choice

For normal usage, you can just use official `SqliteDialect` with `better-sqlite3`

- If you want to run sql in worker thread, you can use [`SqliteWorkerDialect`](https://github.com/subframe7536/kysely-sqlite-tools/tree/master/packages/dialect-sqlite-worker)
- If you have trouble in the compilation of `better-sqlite3`, you can use [`NodeWasmDialect`](https://github.com/subframe7536/kysely-sqlite-tools/tree/master/packages/dialect-wasm#nodewasmdialect-no-compile) with [`node-sqlite3-wasm`](https://github.com/tndrle/node-sqlite3-wasm), just use wasm to load sqlite
- If you want to use sqlite in browser, you can use [`WaSqliteWorkerDialect`](https://github.com/subframe7536/kysely-sqlite-tools/tree/master/packages/dialect-wasqlite-worker), it run sql in Web Worker and persist data in IndexedDB or OPFS

### Definition

```ts
import { FileMigrationProvider, SqliteDialect } from 'kysely'
import { SqliteBuilder, useMigrator } from 'kysely-sqlite-builder'
import Database from 'better-sqlite3'
import type { InferDatabase } from 'kysely-sqlite-builder/schema'
import { column, defineTable } from 'kysely-sqlite-builder/schema'

const testTable = defineTable({
  columns: {
    id: column.increments(),
    person: column.object({ defaultTo: { name: 'test' } }),
    gender: column.boolean({ notNull: true }),
    // or
    // gender: { type: DataType.boolean, notNull: true },
    array: column.object().$cast<string[]>(),
    literal: column.string().$cast<'l1' | 'l2'>(),
    buffer: column.blob(),
  },
  primary: 'id',
  index: ['person', ['id', 'gender']],
  timeTrigger: { create: true, update: true },
})

const DBSchema = {
  test: testTable,
}

const builder = new SqliteBuilder<InferDatabase<typeof DBSchema>>({
  dialect: new SqliteDialect({
    database: new Database(':memory:'),
  }),
  logger: console,
  onQuery: true,
})

// update table using schema
await builder.syncDB(useSchema(DBSchema, { logger: false }))

// update table using migrator
await builder.syncDB(useMigrator(new FileMigrationProvider('./migrations'), {/* options */}))
```

### Execute queries

```ts
await builder.execute(db => db.insertInto('test').values({ person: { name: 'test' }, gender: true }))

builder.transaction(async (trx) => {
  // auto load transaction
  await builder.execute(db => db.insertInto('test').values({ gender: true }))
  // or
  // await trx.insertInto('test').values({ person: { name: 'test' }, gender: true }).execute()
  builder.transaction(async () => {
    // nest transaction, use savepoint
    await builder.execute(db => db.selectFrom('test').where('gender', '=', true))
  })
})

// use origin instance
await builder.kysely.insertInto('test').values({ gender: false }).execute()

// run raw sql
await builder.raw(sql`PRAGMA user_version = 2`)

// destroy
await builder.destroy()
```

### Precompile

inspired by [kysely-params](https://github.com/jtlapp/kysely-params), optimized for sqlite

```ts
const select = builder.precompile<{ name: string }>()
  .query((db, param) =>
    db.selectFrom('test').selectAll().where('name', '=', param('name')),
  )
const compileResult = select.compile({ name: 'test' })
// {
//   sql: 'select * from "test" where "name" = ?',
//   parameters: ['test'],
//   query: { kind: 'SelectQueryNode' } // only node kind by default
// }
select.dispose() // clear cached query

// or auto disposed by using
using selectWithUsing = builder.precompile<{ name: string }>()
  .query((db, param) =>
    db.selectFrom('test').selectAll().where('name', '=', param('name')),
  )
```

### Soft delete

```ts
import { SqliteDialect } from 'kysely'
import Database from 'better-sqlite3'
import type { InferDatabase } from 'kysely-sqlite-builder/schema'
import { column, defineTable } from 'kysely-sqlite-builder/schema'
import { SqliteBuilder, createSoftDeleteExecutorFn } from 'kysely-sqlite-builder'

const softDeleteTable = defineTable({
  columns: {
    id: column.increments(),
    name: column.string(),
  },
  softDelete: true
})

const softDeleteSchema = {
  testSoftDelete: softDeleteTable,
}

const db = new SqliteBuilder<InferDatabase<typeof softDeleteSchema>>({
  dialect: new SqliteDialect({
    database: new Database(':memory:'),
  }),
  // use soft delete
  executorFn: createSoftDeleteExecutorFn(),
})

await builder.executeTakeFirst(db => db.deleteFrom('testSoftDelete').where('id', '=', 1))
// update "testSoftDelete" set "isDeleted" = 1 where "id" = 1
```

### Pragma

```ts
/**
 * check integrity_check pragma
 */
function checkIntegrity(db: Executor): Promise<boolean>
/**
 * control whether to enable foreign keys, **no param check**
 */
function foreignKeys(db: Executor, enable: boolean): Promise<void>
/**
 * get or set user_version pragma, **no param check**
 */
function getOrSetDBVersion(db: Executor, version?: number): Promise<number>

type PragmaJournalMode = 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF'
type PragmaTempStore = 0 | 'DEFAULT' | 1 | 'FILE' | 2 | 'MEMORY'
type PragmaSynchronous = 0 | 'OFF' | 1 | 'NORMAL' | 2 | 'FULL' | 3 | 'EXTRA'
type OptimizePragmaOptions = {
  /**
   * @default 4096
   * @see https://sqlite.org/pragma.html#pragma_cache_size
   */
  cache_size?: number
  /**
   * @default 32768
   * @see https://sqlite.org/pragma.html#pragma_page_size
   */
  page_size?: number
  /**
   * @default -1 (default value)
   * @see https://sqlite.org/pragma.html#pragma_mmap_size
   */
  mmap_size?: number
  /**
   * @default 'WAL'
   * @see https://sqlite.org/pragma.html#pragma_journal_mode
   */
  journal_mode?: PragmaJournalMode
  /**
   * @default 'MEMORY'
   * @see https://sqlite.org/pragma.html#pragma_temp_store
   */
  temp_store?: PragmaTempStore
  /**
   * @default 'NORMAL'
   * @see https://sqlite.org/pragma.html#pragma_synchronous
   */
  synchronous?: PragmaSynchronous
}
/**
 * call optimize pragma, **no param check**
 * @param db database connection
 * @param options pragma options, {@link OptimizePragmaOptions details}
 */
function optimizePragma(db: Executor, options?: OptimizePragmaOptions): Promise<void>
```

## License

MIT
