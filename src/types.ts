import type {
  Compilable,
  DeleteQueryBuilder,
  InsertQueryBuilder,
  Kysely,
  SelectQueryBuilder,
  UpdateQueryBuilder,
} from 'kysely'
import type { IntegrityError } from './builder'

export type DBLogger = {
  debug: (args: any) => void
  info: (msg: any) => void
  warn: (msg: any) => void
  error: (msg: any, e?: Error) => void
}

export type AvailableBuilder<DB, O> =
  | SelectQueryBuilder<DB, any, O>
  | UpdateQueryBuilder<DB, any, any, O>
  | InsertQueryBuilder<DB, any, O>
  | DeleteQueryBuilder<DB, any, O>

export type StatusResult =
  | { ready: true }
  | { ready: false, error: IntegrityError | unknown }

export type SchemaUpdater = (db: Kysely<any>, logger?: DBLogger) => Promise<StatusResult>

export type QueryBuilderOutput<QB> = QB extends Compilable<infer O> ? O : never
