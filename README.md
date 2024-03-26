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
    // gender: { type: 'boolean', notNull: true },
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
import { SqliteBuilder } from 'kysely-sqlite-builder'
import { createSoftDeleteExecutorFn } from 'kysely-sqlite-builder/utils'

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

### Utils

```ts
type LoggerParams = {
  sql: string
  params: readonly unknown[]
  duration: number
  queryNode?: RootOperationNode
  error?: unknown
}
type LoggerOptions = {
  /**
   * log functions
   */
  logger: (data: LoggerParams) => void
  /**
   * whether to merge parameters into sql, use `JSON.stringify` to serialize params
   *
   * e.g. from `select ? from ?` to `select "name" from "user"`
   */
  merge?: boolean
  /**
   * whether to log queryNode
   */
  logQueryNode?: boolean
}
/**
 * util for `KyselyConfig.log`, log on every execution
 * @example
 * import { Kysely } from 'kysely'
 * import { createKyselyLogger } from 'kysely-sqlite-builder/utils'
 *
 * const db = new Kysely<DB>({
 *   dialect,
 *   log: createKyselyLogger({
 *     logger: console.log,
 *     merge: true,
 *   })
 * })
 */
function createKyselyLogger(options: LoggerOptions): (event: LogEvent) => void

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

/**
 * create savepoint, release or rollback it later,
 * included in `SqliteBuilder`
 * @example
 * import { savePoint } from 'kysely-sqlite-builder/utils'
 *
 * const sp = await savePoint(db, 'savepoint_1')
 * try {
 *   // do something...
 *   await sp.release()
 * } catch (e) {
 *   await sp.rollback()
 * }
 */
function savePoint(db: Kysely<any> | Transaction<any>, name?: string): Promise<SavePoint>
```

## License

MIT
