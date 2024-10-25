# kysely-sqlite-builder

Utility layer for [Kysely](https://github.com/kysely-org/kysely)  on SQLite

- Breaking updates may occur, use at your own risk

## Features

- Table schema
  - Infer tables type
  - Auto migration
  - Auto generate `createAt` and `updateAt`
  - Auto soft delete
- Auto serialize / deserialize
- Precompile query
- Page query
- Auto nest transaction (using `savepoint`) and hooks
- Enhanced logger
- Typesafe SQLite3 pragma
- Treeshake plugin for various bundlers

## Usage

### Dialect Choice

For normal usage, you can just use official `SqliteDialect` with `better-sqlite3`

- If you want to run sql in worker thread, you can use [`SqliteWorkerDialect`](https://github.com/subframe7536/kysely-sqlite-tools/tree/master/packages/dialect-sqlite-worker)
- If you have trouble in the compilation of `better-sqlite3`, you can use [`NodeWasmDialect`](https://github.com/subframe7536/kysely-sqlite-tools/tree/master/packages/dialect-wasm#nodewasmdialect-no-compile) with [`node-sqlite3-wasm`](https://github.com/tndrle/node-sqlite3-wasm), just use wasm to load sqlite
- If you want to use sqlite in browser, you can use [`WaSqliteWorkerDialect`](https://github.com/subframe7536/kysely-sqlite-tools/tree/master/packages/dialect-wasqlite-worker), it run sql in Web Worker and persist data in IndexedDB or OPFS

### Definition

```ts
import type { InferDatabase } from 'kysely-sqlite-builder/schema'
import Database from 'better-sqlite3'
import { FileMigrationProvider, SqliteDialect } from 'kysely'
import { SqliteBuilder } from 'kysely-sqlite-builder'
import { useMigrator } from 'kysely-sqlite-builder/migrator'
import { column, DataType, defineTable } from 'kysely-sqlite-builder/schema'

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
  primary: 'id', // optional
  index: ['person', ['id', 'gender']],
  unique: [['id', 'gender']],
  // these params will auto add columns into table
  createAt: true, // `createTime` column
  updateAt: true, // `updateTime` column
  softDelete: true, // `isDeleted` column
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
   * Whether to enable debug logger
   */
  log?: boolean
  /**
   * Version control
   */
  version?: {
    /**
     * Current version
     */
    current: number
    /**
     * Whether to skip sync when the db's `user_version` is same with `version.current`
     */
    skipSyncWhenSame: boolean
  }
  /**
   * Exclude table prefix list, append with `%`
   *
   * `sqlite_%` by default
   */
  excludeTablePrefix?: string[]
  /**
   * Do not restore data from old table to new table
   */
  truncateIfExists?: boolean | Array<StringKeys<T> | string & {}>
  /**
   * Function to determine default values for migrated columns,
   * default is {@link defaultFallbackFunction}
   */
  fallback?: ColumnFallbackFn
  /**
   * Trigger on sync success
   * @param db kysely instance
   * @param oldSchema old database schema
   * @param oldVersion old database version
   */
  onSuccess?: (
    db: Kysely<InferDatabase<T>>,
    oldSchema: ParsedSchema,
    oldVersion: number | undefined
  ) => Promisable<void>
  /**
   * Trigger on sync fail
   * @param err error
   * @param sql failed sql, if `undefined`, there exists some errors in schema
   * @param existSchema old database schema
   * @param targetSchema new database schema
   */
  onError?: (err: unknown, sql: string | undefined, existSchema: ParsedSchema, targetSchema: T) => Promisable<void>
}

type ColumnFallbackFn = (data: ColumnFallbackInfo) => RawBuilder<unknown>

export type ColumnFallbackInfo = {
  /**
   * Table name
   */
  table: string
  /**
   * Column name
   */
  column: string
  /**
   * Exist column info, `undefined` if there is no exising column with same target name
   */
  exist: ParsedColumnProperty | undefined
  /**
   * Target column info
   */
  target: Omit<ParsedColumnProperty, 'type'> & {
    /**
     * {@link DataType} in schema
     */
    type: DataTypeValue
    /**
     * DataType in SQLite
     */
    parsedType: ParsedColumnType
  }
}
```

#### Limitation of Schema

No `check` or `foreign key` support

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

// use origin instance: Kysely or current Transaction
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
import type { InferDatabase } from 'kysely-sqlite-builder/schema'
import Database from 'better-sqlite3'
import { SqliteDialect } from 'kysely'
import { createSoftDeleteExecutor, SqliteBuilder } from 'kysely-sqlite-builder'
import { column, defineTable } from 'kysely-sqlite-builder/schema'

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
const { executor, whereExists, whereDeleted } = createSoftDeleteExecutor()

const db = new SqliteBuilder<InferDatabase<typeof softDeleteSchema>>({
  dialect: new SqliteDialect({
    database: new Database(':memory:'),
  }),
  // use soft delete executor
  executor,
})

await db.deleteFrom('testSoftDelete').where('id', '=', 1).execute()
// update "testSoftDelete" set "isDeleted" = 1 where "id" = 1

// If you are using original kysely instance:
await db.kysely.selectFrom('testSoftDelete').selectAll().$call(whereExists).execute()
```

### Page Query

page query, using offset

if `num <= 0` or `size <= 0`, return all records

inspired by Mybatis-Plus `PaginationInnerInterceptor`

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

### Pragma / Utils

```ts
type KyselyInstance = DatabaseConnection | Kysely<any> | Transaction<any>
/**
 * Execute compiled query and return result list
 */
function executeSQL<O>(kysely: KyselyInstance, query: CompiledQuery<O>): Promise<QueryResult<O>>
/**
 * Execute sql string
 */
function executeSQL<O>(kysely: KyselyInstance, rawSql: string, parameters?: unknown[]): Promise<QueryResult<O>>

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
 *
 * `version` must be integer
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

#### Generate Migrate SQL

```ts
import { generateMigrateSQL } from 'kysely-sqlite-buidler/schema'

const db = new Kysely({/* options */})
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
  primary: 'id', // optional
  index: ['person', ['id', 'gender']],
  createAt: true, // `createTime` column
  updateAt: true, // `updateTime` column
})

await generateMigrateSQL(db, { test: testTable }, {/* options */})
```

More cases: [tests/sync-sql.test.ts](tests/sync-sql.test.ts)

#### Parse Exist Database

```ts
import { parseExistSchema } from 'kysely-sqlite-builder/schema'

const schema = await parseExistSchema(db.kysely)
```

type:

```ts
type ParsedSchema = Record<string, ParsedTableInfo>

type ParsedTableInfo = {
  columns: Record<string, ParsedColumnProperty>
  /**
   * Primary key constraint
   */
  primary: string[]
  /**
   * Unique constraint
   */
  unique: string[][]
  /**
   * Index
   */
  index: string[][]
  /**
   * Trigger
   */
  trigger: string[]
  /**
   * Auto increment column name
   */
  increment?: string
}

type ParsedColumnProperty = {
  type: ParsedColumnType
  notNull: boolean
  defaultTo: string | null
}
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

From v0.9.0, the plugin is externalized, please install [`kysely-unplugin-sqlite`](https://github.com/subframe7536/kysely-unplugin-sqlite)

### Recommend Config

```ts
import { plugin } from 'kysely-unplugin-sqlite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [plugin.vite({
    // If you are using `useSchema()`
    dropMigrator: true,
    dropSchema: true,
    minifyMethodName: true,
    // If you are using `createSoftDeleteExecutor()`
    dropDelete: true,
  })]
})
```

## License

MIT
