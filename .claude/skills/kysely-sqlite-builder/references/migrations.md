# Migration Patterns

## Overview

The library supports two migration approaches:

1. **Schema‑based auto‑migration** – Let the library generate and execute SQL to match your TypeScript schema definitions.
2. **Kysely migrations** – Use Kysely's migration system with a `MigrationProvider`, either file‑based or code‑based.

## Schema‑Based Auto‑Migration

This is the simplest approach: define your tables with `defineTable` and call `syncDB(useSchema(...))`. The library automatically creates/alters tables as needed.

**When to use:**
- Early development, frequent schema changes
- Small projects where manual migration files are overhead
- Prototypes, internal tools, scripts

**Limitations:**
- No down migrations
- Cannot express complex changes (data transformations, conditional logic)
- Limited to the schema definition capabilities (no foreign keys, check constraints)

## Kysely Migrations

For more control, use Kysely's migration system via `useMigrator`. This gives you full SQL control and supports up/down migrations.

### File‑Based Migrations

Use Kysely's `FileMigrationProvider` (from `'kysely'`) with the builder's `syncDB`:

```ts
import { FileMigrationProvider } from 'kysely'
import { useMigrator } from 'kysely-sqlite-builder/migrator'

await builder.syncDB(useMigrator(
  new FileMigrationProvider('./migrations'),
  { migrationTableName: 'migration' }
))
```

**Migration file example (`./migrations/2024-01-01-create-user.ts`):**
```ts
import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('user')
    .ifNotExists()
    .addColumn('id', 'integer', col => col.primaryKey().autoIncrement())
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('email', 'text', col => col.unique())
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('user').ifExists().execute()
}
```

### Code‑Based Migrations

Embed migrations directly in your code using `createCodeProvider`:

```ts
import { createCodeProvider, useMigrator } from 'kysely-sqlite-builder/migrator'

const provider = createCodeProvider({
  '2024-01-01': {
    up: async (db) => {
      await db.schema
        .createTable('user')
        .ifNotExists()
        .addColumn('id', 'integer', col => col.primaryKey().autoIncrement())
        .addColumn('name', 'text', col => col.notNull())
        .execute()
    },
    down: async (db) => {
      await db.schema.dropTable('user').ifExists().execute()
    },
  },
  '2024-01-02': {
    up: async (db) => {
      await db.schema
        .alterTable('user')
        .addColumn('email', 'text', col => col.unique())
        .execute()
    },
    down: async (db) => {
      await db.schema
        .alterTable('user')
        .dropColumn('email')
        .execute()
    },
  },
})

await builder.syncDB(useMigrator(provider, {
  migrationTableName: 'migration',
}))
```

**Array syntax** (auto‑generated migration names):

```ts
const providerArray = createCodeProvider([
  {
    up: async (db) => {
      // first migration
    },
  },
  {
    up: async (db) => {
      // second migration
    },
    down: async (db) => {
      // rollback second migration
    },
  },
])
```

Migration names will be zero‑padded indices: `00000000`, `00000001`, etc.

### Mixed Approach

You can combine both methods:

1. Use schema‑based migration for initial setup and simple column additions.
2. Use Kysely migrations for complex data transformations, backfills, or when you need down migrations.

**Example workflow:**
- Start with `syncDB(useSchema(...))` during early development.
- Once the schema stabilizes, switch to Kysely migrations for future changes.
- For additive changes (new columns, new tables) you can still use schema sync if convenient.

## Migration Best Practices

### 1. Always Provide Down Migrations
When using Kysely migrations, always write a `down` function that rolls back the changes. This enables safe rollbacks and testing.

### 2. Use Transactions
Wrap migration steps in a transaction if they are not already atomic (Kysely migrations run in a transaction by default).

```ts
up: async (db) => {
  await db.transaction().execute(async (trx) => {
    await trx.schema.createTable('temp').execute()
    // ... more steps
  })
}
```

### 3. Handle Existing Data
When altering tables, consider existing data:

```ts
up: async (db) => {
  // Add column with default value
  await db.schema
    .alterTable('user')
    .addColumn('status', 'text', col => col.defaultTo('active').notNull())
    .execute()

  // Backfill based on existing data
  await db.updateTable('user')
    .set({ status: 'inactive' })
    .where('lastLogin', '<', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000))
    .execute()
}
```

### 4. Use Raw SQL for Complex Operations
For operations not supported by Kysely's schema builder, use raw SQL:

```ts
import { sql } from 'kysely'

up: async (db) => {
  await sql`CREATE VIRTUAL TABLE documents USING fts5(title, content)`.execute(db)
}
```

### 5. Test Migrations
Test both `up` and `down` directions, especially with production‑like data.

## Migration Table

By default, Kysely uses a table named `migration` to track which migrations have been applied. You can customize the name via `migrationTableName` in `MigratorProps`.

**Schema:**
```sql
CREATE TABLE migration (
  name TEXT PRIMARY KEY NOT NULL,
  timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
```

## Error Handling

The `syncDB` function with `useMigrator` returns a `StatusResult`:

```ts
type StatusResult = 
  | { ready: true }
  | { ready: false; error: unknown }
```

Check the result after calling `syncDB`:

```ts
const result = await builder.syncDB(useMigrator(provider))
if (!result.ready) {
  console.error('Migration failed:', result.error)
  // handle error
}
```

## Migrator Options

`useMigrator` accepts all options from Kysely's `MigratorProps` except `db` and `provider`:

| Option | Type | Description |
|--------|------|-------------|
| `migrationTableName` | `string` | Name of the migration table (default `'migration'`) |
| `migrationTableSchema` | `string` | Schema name for the migration table |
| `allowUnorderedMigrations` | `boolean` | Allow applying migrations out of order (default `false`) |

Example:
```ts
useMigrator(provider, {
  migrationTableName: 'app_migrations',
  allowUnorderedMigrations: true,
})
```