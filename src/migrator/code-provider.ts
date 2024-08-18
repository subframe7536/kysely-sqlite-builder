import type { Migration, MigrationProvider } from 'kysely'

/**
 * create provider inside code
 * @param migrations kysely migration, support Record or Array
 * @param idLength index id length, default is 8
 * @example
 * ```ts
 * import { createCodeProvider, useMigrator } from 'kysely-sqlite-builder/migrator'
 *
 * const provider = createCodeProvider({
 *   '2024-01-01': {
 *     up: async (db) => {
 *       await db.schema.createTable('test').ifNotExists().column('name', 'text').execute()
 *     }
 *   },
 *   '2024-01-02': {
 *     up: async (db) => {
 *       await db.schema.alterTable('test').addColumn('age', 'integer').execute()
 *     },
 *     down: async (db) => {
 *       await db.schema.alterTable('test').dropColumn('age').execute()
 *     }
 *   }
 * })
 * await db.syncDB(useMigrator(provider, options))
 *
 * // or use array
 * const providerArray = createCodeProvider([
 *   {
 *     up: async (db) => {
 *       await db.schema.createTable('test').ifNotExists().column('name', 'text').execute()
 *     }
 *   },
 *   {
 *     up: async (db) => {
 *       await db.schema.alterTable('test').addColumn('age', 'integer').execute()
 *     },
 *     down: async (db) => {
 *       await db.schema.alterTable('test').dropColumn('age').execute()
 *     }
 *   }
 * ])
 * await db.syncDB(useMigrator(providerArray, options))
 * ```
 */
export function createCodeProvider(migrations: Record<string, Migration> | Migration[], idLength = 8): MigrationProvider {
  return {
    getMigrations: Array.isArray(migrations)
      ? async () => {
        const _: Record<string, Migration> = {}
        for (const [i, m] of Object.entries(migrations)) {
          _[i.padStart(idLength, '0') as keyof typeof _] = m
        }
        return _
      }
      : async () => migrations,
  }
}
