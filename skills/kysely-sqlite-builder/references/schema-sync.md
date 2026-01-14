# Schema Synchronization

## Overview

Schema synchronization (`syncDB`) compares the existing database schema with your TypeScript table definitions and automatically generates and executes the necessary SQL to bring the database up to date.

## Basic Usage

```ts
import { useSchema } from 'kysely-sqlite-builder/schema'

await builder.syncDB(useSchema(schema, {
  log: true,
  version: {
    current: 1,
    skipSyncWhenSame: true,
  },
}))
```

## Options

### `log?: boolean`
Whether to enable debug logger (default `false`).

### `version?: { current: number; skipSyncWhenSame: boolean }`
Version control using SQLite's `user_version` pragma.

- `current`: The version number to set after successful sync.
- `skipSyncWhenSame`: If `true`, skips the entire sync process when the database's `user_version` already equals `current`.

**Example:**
```ts
version: {
  current: 2,
  skipSyncWhenSame: true,
}
```

### `excludeTablePrefix?: string[]`
List of table name prefixes to exclude from schema comparison. Appended with `%` for SQL `LIKE` pattern.

Default: `['sqlite_%']` (excludes SQLite internal tables).

**Example:**
```ts
excludeTablePrefix: ['temp_%', 'backup_%']
```

### `truncateIfExists?: boolean | Array<string>`
Do not restore data from old table to new table when a table already exists.

- `true`: Restore no data for any table.
- `false` (default): Restore all data.
- `Array<string>`: Restore no data only for the listed tables.

**Use case:** When you want to reset certain tables during migration (e.g., cache tables).

### `fallback?: ColumnFallbackFn`
Function to determine default values for migrated columns when a column's type changes and data cannot be directly converted.

Default: `defaultFallbackFunction` (returns `NULL` for nullable columns, otherwise a type‑appropriate default).

**Signature:**
```ts
type ColumnFallbackFn = (data: ColumnFallbackInfo) => RawBuilder<unknown>

type ColumnFallbackInfo = {
  table: string
  column: string
  exist: ParsedColumnProperty | undefined
  target: Omit<ParsedColumnProperty, 'type'> & {
    type: DataTypeValue
    parsedType: ParsedColumnType
  }
}
```

**Example custom fallback:**
```ts
fallback: ({ table, column, target }) => {
  if (target.parsedType === 'INTEGER') return sql`0`
  if (target.parsedType === 'TEXT') return sql`''`
  return sql`NULL`
}
```

### `onSuccess?: (db, oldSchema, oldVersion) => Promisable<void>`
Triggered after successful sync.

- `db`: Kysely instance with the new schema.
- `oldSchema`: Parsed schema before sync.
- `oldVersion`: Previous `user_version` (or `undefined`).

**Example:**
```ts
onSuccess: async (db, oldSchema, oldVersion) => {
  console.log(`Migrated from version ${oldVersion ?? 'none'} to new schema`)
}
```

### `onError?: (err, sql, existSchema, targetSchema) => Promisable<void>`
Triggered when a sync operation fails.

- `err`: The error that occurred.
- `sql`: The failed SQL statement, or `undefined` if the error occurred during schema analysis.
- `existSchema`: The existing database schema.
- `targetSchema`: The target schema you tried to apply.

**Example:**
```ts
onError: async (err, sql, existSchema, targetSchema) => {
  console.error('Sync failed:', err)
  if (sql) console.error('Failed SQL:', sql)
}
```

## How Sync Works

1. **Parse existing schema** – Reads `sqlite_master` and extracts table definitions, columns, indexes, etc.
2. **Compare with target schema** – Determines which tables/columns need to be added, modified, or removed.
3. **Generate migration SQL** – Creates a sequence of SQL statements:
   - Create new tables
   - Add columns to existing tables
   - Drop unused columns (via table reconstruction)
   - Rebuild indexes and constraints
4. **Execute migration** – Runs the generated SQL in a transaction.
5. **Update version** – Sets `user_version` pragma if version control is enabled.

## Table Reconstruction

SQLite does not support dropping columns. To remove a column or change its type, the library:

1. Creates a new table with the desired schema.
2. Copies data from the old table (excluding dropped columns, applying fallback for new/changed columns).
3. Drops the old table.
4. Renames the new table to the original name.
5. Recreates indexes and triggers.

This is done automatically; you only need to be aware of the performance impact for large tables.

## Limitations

- **No foreign‑key support** – Foreign key constraints are not represented in the schema definition.
- **No check constraints** – CHECK constraints are not supported.
- **Column type affinity** – SQLite uses type affinity; the library maps TypeScript types to SQLite types as follows:
  - `integer` → `INTEGER`
  - `float` → `REAL`
  - `string` → `TEXT`
  - `blob` → `BLOB`
  - `object` → `TEXT` (JSON)
  - `boolean` → `INTEGER` (0/1)
  - `date` → `TEXT` (ISO string)

## Examples

### Basic sync with logging
```ts
await builder.syncDB(useSchema(schema, { log: true }))
```

### Versioned sync
```ts
await builder.syncDB(useSchema(schema, {
  version: { current: 3, skipSyncWhenSame: true },
  onSuccess: (db, oldSchema, oldVersion) => {
    if (oldVersion && oldVersion < 3) {
      console.log('Upgraded from', oldVersion, 'to 3')
    }
  },
}))
```

### Excluding temporary tables
```ts
await builder.syncDB(useSchema(schema, {
  excludeTablePrefix: ['temp_%', 'cache_%', 'sqlite_%'],
}))
```

### Custom fallback for type changes
```ts
await builder.syncDB(useSchema(schema, {
  fallback: ({ target }) => {
    if (target.parsedType === 'INTEGER') return sql`0`
    if (target.parsedType === 'TEXT') return sql`'<migrated>'`
    return sql`NULL`
  },
}))
```