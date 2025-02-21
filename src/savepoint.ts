import type { Kysely, Transaction } from 'kysely'

import { sql } from 'kysely'

export type SavePoint = {
  release: () => Promise<void>
  rollback: () => Promise<void>
}

/**
 * Create savepoint, release or rollback it later,
 * included in `SqliteBuilder`
 * @example
 * const sp = await savePoint(db, 'savepoint_1')
 * try {
 *   // do something...
 *   await sp.release()
 * } catch (e) {
 *   await sp.rollback()
 * }
 */
export async function savePoint(
  db: Kysely<any> | Transaction<any>,
  name?: string,
): Promise<SavePoint> {
  const _name = name?.toUpperCase() || `SP_${Date.now() % 1e12}_${Math.floor(Math.random() * 1e4)}`
  await sql`SAVEPOINT ${sql.raw(_name)}`.execute(db)
  return {
    release: async () => {
      await sql`RELEASE SAVEPOINT ${sql.raw(_name)}`.execute(db)
    },
    rollback: async () => {
      await sql`ROLLBACK TO SAVEPOINT ${sql.raw(_name)}`.execute(db)
    },
  }
}
