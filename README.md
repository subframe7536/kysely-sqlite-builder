# kysely-sqlite-builder

Utility layer for [Kysely](https://github.com/kysely-org/kysely)  on SQLite

- Breaking updates may occur, use at your own risk

## Features

- table schema
  - infer tables type
  - auto migration
  - auto generate `createAt` and `updateAt`
  - auto soft delete
- auto serialize / deserialize
- precompile query
- page query
- auto nest transaction (using `savepoint`) and hooks
- enhanced logger
- typesafe SQLite3 pragma
- treeshake plugin for various bundlers

## Usage

### Dialect Choice

For normal usage, you can just use official `SqliteDialect` with `better-sqlite3`

- If you want to run sql in worker thread, you can use [`SqliteWorkerDialect`](https://github.com/subframe7536/kysely-sqlite-tools/tree/master/packages/dialect-sqlite-worker)
- If you have trouble in the compilation of `better-sqlite3`, you can use [`NodeWasmDialect`](https://github.com/subframe7536/kysely-sqlite-tools/tree/master/packages/dialect-wasm#nodewasmdialect-no-compile) with [`node-sqlite3-wasm`](https://github.com/tndrle/node-sqlite3-wasm), just use wasm to load sqlite
- If you want to use sqlite in browser, you can use [`WaSqliteWorkerDialect`](https://github.com/subframe7536/kysely-sqlite-tools/tree/master/packages/dialect-wasqlite-worker), it run sql in Web Worker and persist data in IndexedDB or OPFS

### Definition

```ts
import { FileMigrationProvider, SqliteDialect } from 'kysely'
import { SqliteBuilder } from 'kysely-sqlite-builder'
import { useMigrator } from 'kysely-sqlite-builder/migrator'
import Database from 'better-sqlite3'
import type { InferDatabase } from 'kysely-sqlite-builder/schema'
import { DataType, column, defineTable } from 'kysely-sqlite-builder/schema'

const testTable = defineTable({
  columns: {
    id: column.increments(),
    person: column.object({ defaultTo: { name: 'test' } }),
    gender: column.boolean({ notNull: true }),
    // or just object
    manual: { type: DataType.boolean },
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

const db = new SqliteBuilder<InferDatabase<typeof DBSchema>>({
  dialect: new SqliteDialect({
    database: new Database(':memory:'),
  }),
  logger: console,
  onQuery: true,
})

// update table using schema
await db.syncDB(useSchema(DBSchema, { logger: false }))

// update table using migrator
await db.syncDB(useMigrator(new FileMigrationProvider('./migrations'), {/* options */}))
```

sync options type:

```ts
export type SyncOptions<T extends Schema> = {
  /**
   * whether to enable debug logger
   */
  log?: boolean
  /**
   * version control
   */
  version?: {
    /**
     * current version
     */
    current: number
    /**
     * whether to skip sync when the db's `user_version` is same with `version.current`
     */
    skipSyncWhenSame: boolean
  }
  /**
   * exclude table prefix list, append with `%`
   *
   * `sqlite_%` by default
   */
  excludeTablePrefix?: string[]
  /**
   * do not restore data from old table to new table
   */
  truncateIfExists?: boolean | Array<StringKeys<T> | string & {}>
  /**
   * trigger on sync success
   * @param db kysely instance
   */
  onSyncSuccess?: (db: Kysely<InferDatabase<T>>) => Promisable<void>
  /**
   * trigger on sync fail
   */
  onSyncFail?: (err: unknown) => Promisable<void>
}
```

### Execute Queries

```ts
// usage: insertInto / selectFrom / updateTable / deleteFrom
await db.insertInto('test').values({ person: { name: 'test' }, gender: true }).execute()

db.transaction(async (trx) => {
  // auto load transaction
  await db.insertInto('test').values({ gender: true }).execute()
  // or
  await trx.insertInto('test').values({ person: { name: 'test' }, gender: true }).execute()
  db.transaction(async () => {
    // nest transaction, use savepoint
    await db.selectFrom('test').where('gender', '=', true).execute()
  })
})

// use origin instance: Kysely or Transaction
await db.kysely.insertInto('test').values({ gender: false }).execute()

// run raw sql
await db.execute(sql`PRAGMA user_version = ${2}`)
await db.execute('PRAGMA user_version = ?', [2])

// destroy
await db.destroy()
```

### Precompile

inspired by [kysely-params](https://github.com/jtlapp/kysely-params)

```ts
import { precompile } from 'kysely-sqlite-builder'

const select = precompile<{ name: string }>()
  .query(param =>
    db.selectFrom('test').selectAll().where('name', '=', param('name')),
  )
const compileResult = select.compile({ name: 'test' })
// {
//   sql: 'select * from "test" where "name" = ?',
//   parameters: ['test'],
//   query: { kind: 'SelectQueryNode' } // only node kind by default
// }
await db.execute(compileResult)
select.dispose() // clear cached query

// or auto disposed by using
using selectWithUsing = precompile<{ name: string }>()
  .query((db, param) =>
    db.selectFrom('test').selectAll().where('name', '=', param('name')),
  )
```

### Soft Delete

```ts
import { SqliteDialect } from 'kysely'
import Database from 'better-sqlite3'
import type { InferDatabase } from 'kysely-sqlite-builder/schema'
import { column, defineTable } from 'kysely-sqlite-builder/schema'
import { SqliteBuilder, createSoftDeleteExecutor } from 'kysely-sqlite-builder'

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
const { executor, withNoDelete } = createSoftDeleteExecutor()

const db = new SqliteBuilder<InferDatabase<typeof softDeleteSchema>>({
  dialect: new SqliteDialect({
    database: new Database(':memory:'),
  }),
  // use soft delete executor
  executor,
})

await db.deleteFrom('testSoftDelete').where('id', '=', 1).execute()
// update "testSoftDelete" set "isDeleted" = 1 where "id" = 1

await db.kysely.selectFrom('testSoftDelete').selectAll().$call(withNoDelete).execute()
```

### Page Query

page query, using offset

if num <= 0 or size <= 0, return all records

inspired by Mybatis-Plus PaginationInnerInterceptor

```ts
import { pageQuery } from 'kysely-sqlite-builder'

const page = await pageQuery(db.selectFrom('test').selectAll(), { num: 1, size: 10, queryTotal: true })
// {
//   total: 100,
//   current: 1,
//   size: 10,
//   records: [...],
//   pages: 10
//   hasPrevPage: false,
//   hasNextPage: true,
//   convertRecords: () => {...},
// }
console.log(page.convertRecords(p => p.literal).records)
```

### Util

```ts
import { createSoftDeleteSqliteBuilder, createSqliteBuilder } from 'kysely-sqlite-builder'

const db = await createSqliteBuilder({
  dialect,
  schema: { test: testTable },
  // other options
})

const [softDeleteDB, withNoDelete] = createSoftDeleteSqliteBuilder({
  dialect,
  schema: { test: testTable },
})
```

### Pragma

```ts
type KyselyInstance = DatabaseConnection | Kysely<any> | Transaction<any>
/**
 * check integrity_check pragma
 */
function checkIntegrity(db: KyselyInstance): Promise<boolean>
/**
 * control whether to enable foreign keys, **no param check**
 */
function foreignKeys(db: KyselyInstance, enable: boolean): Promise<void>
/**
 * get or set user_version pragma, **no param check**
 */
function getOrSetDBVersion(db: KyselyInstance, version?: number): Promise<number>

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
function optimizePragma(db: KyselyInstance, options?: OptimizePragmaOptions): Promise<void>

/**
 * optimize db file
 * @param db database connection
 * @param rebuild if is true, run `vacuum` instead of `pragma optimize`
 * @see https://sqlite.org/pragma.html#pragma_optimize
 * @see https://www.sqlite.org/lang_vacuum.html
 */
function optimizeSize(db: KyselyInstance, rebuild?: boolean): Promise<QueryResult<unknown>>
```

### Migrate By Code

```ts
import { createCodeProvider, useMigrator } from 'kysely-sqlite-builder/migrator'

const provider = createCodeProvider({
  '2024-01-01': {
    up: async (db) => {
      await db.schema.createTable('test').ifNotExists().column('name', 'text').execute()
    }
  },
  '2024-01-02': {
    up: async (db) => {
      await db.schema.alterTable('test').addColumn('age', 'integer').execute()
    },
    down: async (db) => {
      await db.schema.alterTable('test').dropColumn('age').execute()
    }
  }
})
await db.syncDB(useMigrator(provider, {/* options */}))

// or use array
const providerArray = createCodeProvider([
  {
    up: async (db) => {
      await db.schema.createTable('test').ifNotExists().column('name', 'text').execute()
    }
  },
  {
    up: async (db) => {
      await db.schema.alterTable('test').addColumn('age', 'integer').execute()
    },
    down: async (db) => {
      await db.schema.alterTable('test').dropColumn('age').execute()
    }
  }
])
await db.syncDB(useMigrator(providerArray, {/* options */}))
```

## Unplugin

v0.7.1 introduced a experimental plugin (using `unplugin`) to reduce the bundle size.

convert `#props` to `_props`, trim kysely method or class names and remove unsupported methods

transformed method name:
- `append -> _a`
- `cloneWith -> _clw`
- `create -> _c`
- `createWith -> _crw`
- `#props -> _p`
- `visit -> _v`
- `Wrapper -> _W`

removed methods:
- `mergeInto`
- `replaceInto`
- `top`
- `fetch`
- `ignore`

About 35% of the minified bundle size is reduced when turn on all options.

**use at your own risk!**

you need to install `unplugin` first (auto installed by peerDependencies)

### Usage

```ts
import { defineConfig } from 'vite'
import { plugin } from 'kysely-sqlite-builder/plugin'

export default defineConfig({
  plugins: [plugin.vite({ dropMigrator: true })],
})
```

types:
```ts
export type TransformOptions = {
  /**
   * filter files to be transformed
   * @param filePath file path
   */
  filter?: (filePath: string) => boolean
  /**
   * custom transformer
   * @param code source code
   * @param filePath file path
   */
  transform?: (code: MagicStringStack, filePath: string) => MagicStringStack
  /**
   * use dynamic node transformer, maybe impact performance
   * @default true
   */
  useDynamicTransformer?: boolean
  /**
   * drop support of `migrator`, `instropection`, `schema` and remove all props in `adapter` except `supportsReturning: true`
   */
  dropMigrator?: boolean
  /**
   * drop support of `delete`
   */
  dropDelete?: boolean
}
```

## License

MIT
