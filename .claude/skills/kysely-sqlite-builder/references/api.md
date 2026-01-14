# API Reference

## Main exports (`kysely-sqlite-builder`)

### Builders
| Export | Description |
|--------|-------------|
| `SqliteBuilder` | Main builder extending Kysely with auto‑serialization, transactions, schema sync, and utility methods. Provides `insertInto`, `selectFrom`, `updateTable`, `deleteFrom`, `replaceInto` that automatically run in the current transaction. |
| `SoftDeleteSqliteBuilder` | Builder that automatically filters out soft‑deleted records (`isDeleted` column). Includes `whereExists` and `whereDeleted` helpers. `deleteFrom` performs a soft‑delete (sets `isDeleted = 1`). Accepts optional `deleteColumnName` option (default `'isDeleted'`). |
| `BaseSqliteBuilder` | Base class; not needed for typical use. |

### Utilities
| Export | Description |
|--------|-------------|
| `createKyselyLogger` | Factory for a Kysely logger that can merge parameters into the SQL string. |
| `pageQuery` | Pagination helper returning a page of records with total count metadata. |
| `precompile` | Creates a precompiled query builder for parameterized queries. Call `.build(callback)` to create reusable compiled query. |
| `checkIntegrity` | Runs `PRAGMA integrity_check` and returns boolean. |
| `foreignKeys` | Enables/disables foreign key constraints (`PRAGMA foreign_keys`). |
| `getOrSetDBVersion` | Gets or sets the `user_version` pragma. |
| `optimizePragma` | Sets multiple optimization‑related pragmas (cache size, page size, journal mode, etc.). |
| `optimizeDB` | Shrinks memory and runs `PRAGMA optimize` or `VACUUM`. |
| `executeSQL` | Low‑level helper to execute a compiled query or raw SQL string. |
| `savePoint` | **(Deprecated)** Creates a named savepoint; use `Kysely.startTransaction()` or nested transactions instead. |
| `IntegrityError` | Error thrown when integrity check fails. |

### Types
| Export | Description |
|--------|-------------|
| `LoggerOptions`, `LoggerParams`, `DBLogger` | Logging configuration types. |
| `SchemaUpdater`, `StatusResult` | Types used by schema sync and migrator. |
| `defaultRootOperatorNodeProcessFn` | Internal function used by `precompile` to process query nodes; can be overridden. |

## Schema module (`kysely-sqlite-builder/schema`)

### Core functions
| Export | Description |
|--------|-------------|
| `defineTable` | Defines a table schema with columns, primary key, indexes, unique constraints, and optional `createdAt`/`updatedAt`/`softDelete`/`withoutRowId`. |
| `column` | Object with column‑type factories: `increments`, `int`, `float`, `string`, `blob`, `object`, `boolean`, `date`. Each accepts options (`notNull`, `defaultTo`). |
| `DataType` | Enum of column data types (0‑7). |
| `useSchema` | Creates a `SchemaUpdater` that syncs the database with the given table definitions. |
| `generateMigrateSQL` | Generates the SQL statements that would be executed during a schema sync. |
| `parseExistSchema` | Parses the existing database schema into a structured object. |
| `defaultFallbackFunction` | Default fallback function used during column migration when a column’s type changes. |
| `InferDatabase` | Infers the Kysely database type from a schema object. |
| `InferTable` | Infers the table type from a table definition. |
| `SchemaSyncOptions` | Options for schema synchronization (logging, version control, exclude prefixes, fallback function, success/error hooks). |

### Internal utilities (generally not needed directly)
`generateSyncTableSQL`, `migrateWholeTable`, `parseColumnType`

### Additional type exports
`ColumnProperty`, `Columns`, `Table`, `TableProperty`, `ParsedSchema`, `ParsedColumnProperty`, `ParsedColumnType`, `RestoreColumnList`, etc.

## Migrator module (`kysely-sqlite-builder/migrator`)

| Export | Description |
|--------|-------------|
| `useMigrator` | Creates a `SchemaUpdater` that runs Kysely migrations from a `MigrationProvider`. |
| `createCodeProvider` | Creates a `MigrationProvider` from an object or array of migration functions (useful for embedding migrations in code). |

## Column Types

The `column` object provides these factory methods:

| Method | SQLite type | TypeScript type | Notes |
|--------|-------------|-----------------|-------|
| `increments()` | `INTEGER` | `number` | Auto‑increment primary key |
| `int()` | `INTEGER` | `number` | |
| `float()` | `REAL` | `number` | |
| `string()` | `TEXT` | `string` | |
| `blob()` | `BLOB` | `Buffer` | |
| `object()` | `TEXT` (JSON) | `any` | Stored as JSON; use `$cast<T>()` for type safety |
| `boolean()` | `INTEGER` (0/1) | `boolean` | |
| `date()` | `TEXT` (ISO) | `Date` | |

Each accepts optional `{ notNull: boolean, defaultTo: any }`.

## SchemaSyncOptions

```ts
export type SchemaSyncOptions<T extends Schema> = {
  log?: boolean
  version?: {
    current: number
    skipSyncWhenSame: boolean
  }
  excludeTablePrefix?: string[]
  truncateIfExists?: boolean | Array<StringKeys<T> | string & {}>
  fallback?: ColumnFallbackFn
  onSuccess?: (db: Kysely<InferDatabase<T>>, oldSchema: ParsedSchema, oldVersion: number | undefined) => Promisable<void>
  onError?: (err: unknown, sql: string | undefined, existSchema: ParsedSchema, targetSchema: T) => Promisable<void>
}
```

## Precompile Usage

```ts
import { precompile } from 'kysely-sqlite-builder'

const getUser = precompile<{ id: number }>()
  .build(param => builder.selectFrom('myTable').selectAll().where('id', '=', param('id')))

const compiled = getUser.compile({ id: 42 })
const result = await builder.execute(compiled)
getUser.dispose() // or use `using` for automatic cleanup
```

## PageQuery Result

```ts
type PageResult<T> = {
  total: number
  current: number
  size: number
  records: T[]
  pages: number
  hasPrevPage: boolean
  hasNextPage: boolean
  convertRecords: <U>(mapper: (record: T) => U) => PageResult<U>
}
```