import type { Migration, MigrationProvider } from 'kysely'

/**
 * create provider inside code
 * @param migrations kysely migration, support Record or Array
 */
export function createCodeProvider(migrations: Record<string, Migration> | Migration[]): MigrationProvider {
  return {
    getMigrations: Array.isArray(migrations)
      ? async () => {
        const len = (migrations.length + '').length
        const _: Record<string, Migration> = {}
        for (const [i, m] of Object.entries(migrations)) {
          _[i.padStart(len, '0') as keyof typeof _] = m
        }
        return _
      }
      : async () => migrations,
  }
}
