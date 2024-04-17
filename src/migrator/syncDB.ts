import { type Kysely, type MigrationProvider, Migrator, type MigratorProps } from 'kysely'
import type { DBLogger, TableUpdater } from '../types'

/**
 * use migrator to migrate to latest
 * @param provider migration provider
 * @param options migrator options
 */
export function useMigrator(
  provider: MigrationProvider,
  options?: Omit<MigratorProps, 'db' | 'provider'>,
): TableUpdater {
  return async (db: Kysely<any>, logger?: DBLogger) => {
    const migrator = new Migrator({ db, provider, ...options })
    const { error, results } = await migrator.migrateToLatest()

    results?.forEach((it) => {
      if (it.status === 'Success') {
        logger?.debug('migration "' + it.migrationName + '" was executed successfully')
      } else if (it.status === 'Error') {
        logger?.error('failed to execute migration "' + it.migrationName + '"')
      }
    })

    if (!error) {
      return { ready: true as const }
    }
    logger?.error('failed to run `migrateToLatest`', error as any)
    return { ready: false as const, error }
  }
}
export type { DBLogger } from '../types'
