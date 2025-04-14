import type { DataTypeValue, TDataType } from './column'
import type { Arrayable, IsNotNull, Prettify } from '@subframe7536/type-utils'
import type { ColumnType, Generated, RawBuilder } from 'kysely'

export type BooleanColumnType = ColumnType<0 | 1, boolean, boolean>

export type InferColumnType<T extends DataTypeValue> =
  T extends TDataType['string'] ? string :
    T extends TDataType['boolean'] ? BooleanColumnType :
      T extends TDataType['int'] | TDataType['float'] ? number :
        T extends TDataType['increments'] ? Generated<number> :
          T extends TDataType['date'] ? Date :
            T extends TDataType['blob'] ? Uint8Array :
              T extends TDataType['object'] ? object :
                never

export type InferStringByColumnType<T> =
  T extends string ? TDataType['string'] :
    T extends BooleanColumnType ? TDataType['boolean'] :
      T extends Generated<number> ? TDataType['increments'] | TDataType['int'] | TDataType['float'] :
        T extends number ? TDataType['int'] | TDataType['float'] :
          T extends Date ? TDataType['date'] :
            T extends ArrayBufferLike ? TDataType['blob'] :
              T extends Generated<infer P> ? InferStringByColumnType<P> :
                T extends object ? TDataType['object'] :
                  never

export type ParsedColumnType =
  | 'TEXT'
  | 'INTEGER'
  | 'BLOB'
  | 'REAL'

export type DefaultValue<T> = T | RawBuilder<unknown> | null

export type Nullable = boolean | null

export type ColumnProperty<
  ColType extends DataTypeValue = DataTypeValue,
  DefaultTo extends DefaultValue<InferColumnType<ColType>> = DefaultValue<InferColumnType<ColType>>,
  NotNull extends Nullable = Nullable,
> = {
  type: ColType
  defaultTo?: DefaultTo
  notNull?: NotNull
}

export interface ExtraOptions<Create, Update, Delete> {
  /**
  /**
   * Create time column
   * - If type is `undefined` or `false`, ignore
   * - If type is `true`, column name is `createAt`
   * - If type is `string`, it will be treated as column name
   */
  createAt?: Create
  /**
   * Update time column. Use trigger to update
   * - If type is `undefined` or `false`, ignore
   * - If type is `true`, column name is `updateAt`
   * - If type is `string`, it will be treated as column name
   */
  updateAt?: Update
  /**
   * Soft delete column
   *
   * - If type is `undefined` or `false`, ignore
   * - If type is `true`, column name is `isDeleted`
   * - If type is `string`, it will be treated as column name
   */
  softDelete?: Delete
  /**
   * Disable implicit rowId
   *
   * - If type is `true`, disable implicit rowId
   * - If type is `false`, enable implicit rowId
   */
  withoutRowId?: boolean
}

export type TableProperty<
  Cols extends Columns,
> = {
  /**
   * Primary key constraint, only if have no `column.increments()` key
   *
   * Support pattern:
   * - `'id'`: `id` as primary key
   * - `['name', 'gender']`: `name` and `gender` as primary key
   */
  primary?: Arrayable<keyof Cols & string>
  /**
   * Unique constraint
   *
   * Support pattern:
   * - `['id']`: `id` as unique
   * - `[['id']]`: `id` as unique
   * - `['name', 'gender']`: `name` and `gender` as unique
   * - `[['name', 'gender'], 'id']`: `name` / `gender` and `id` as unique
   */
  unique?: Arrayable<keyof Cols & string>[]
  /**
   * Column indexes, allow multiple, no unique index support
   *
   * Support pattern:
   * - `['id']`: `id` as index
   * - `[['id']]`: `id` as index
   * - `['name', 'gender']`: `name` and `gender` as index
   * - `[['name', 'gender'], 'id']`: `name` / `gender` and `id` as index
   */
  index?: Arrayable<keyof Cols & string>[]
}

export type Columns = Record<string, ColumnProperty>

export type ColumnsWithErrorInfo<T extends Columns> = {
  [K in keyof T]: T[K] extends ColumnProperty<
    infer Type,
    infer DefaultTo,
    infer NotNull
  >
    ? {
        type: Type
        defaultTo: DefaultTo
        notNull: NotNull
      }
    : {
        type: {
          error: 'TypeError: [defaultTo] not satisfied [type]'
          column: K
          typeIs: InferColumnType<T[K]['type']>
          defaultToIs: T[K]['defaultTo']
        }
      };
}

export type Table<
  Cols extends Columns = any,
  Create extends string | true | null = null,
  Update extends string | true | null = null,
  Delete extends string | true | null = null,
> = {
  columns: ColumnsWithErrorInfo<Cols>
} & TableProperty<Cols> & ExtraOptions<Create, Update, Delete>

export type Schema = Record<string, Table<any, any, any, any>>

type TriggerKey<A, B> =
  | (A extends true ? 'createAt' : A extends string ? A : never)
  | (B extends true ? 'updateAt' : B extends string ? B : never)

type ExtraColumnsKey<
  TriggerKey extends string,
  Delete extends string | true | undefined,
> = Delete extends string
  ? (TriggerKey | Delete)
  : Delete extends true
    ? (TriggerKey | 'isDeleted')
    : TriggerKey

type ParseTableWithExtraColumns<
  T extends Columns,
  Create extends string | true | undefined,
  Update extends string | true | undefined,
  Delete extends string | true | undefined,
  Time extends TriggerKey<Create, Update> = TriggerKey<Create, Update>,
  Extra extends ExtraColumnsKey<Time, Delete> = ExtraColumnsKey<Time, Delete>,
> = Omit<T, Extra> & {
  [K in Extra]: {
    type: TDataType['increments'] // #hack to ensure Generated
    defaultTo: Generated<K extends Time ? Date : number> | null
    notNull: null
  }
}

/**
 * Util type for infering type of table
 */
export type InferTable<
  T extends {
    columns: Columns
    createAt?: any
    updateAt?: any
    softDelete?: any
  },
  P = ParseTableWithExtraColumns<T['columns'], T['createAt'], T['updateAt'], T['softDelete']>,
> = Prettify<{
  [K in keyof P]: P[K] extends ColumnProperty
    // if not null
    ? IsNotNull<P[K]['notNull']> extends true
      // return required defaultTo
      ? Exclude<P[K]['defaultTo'], null>
      // if type is "increments"
      : P[K]['type'] extends TDataType['increments']
        // return "Generated<...>"
        ? Exclude<P[K]['defaultTo'], null>
        // return defaultTo
        : P[K]['defaultTo'] | null
    // return error info
    : `TypeError: [defaultTo] is not satisfied [type] in column "${K & string}"`
}>

/**
 * Util type for infering type of database
 *
 * if the infered type contains `"HAVE_TYPE_ERROR_IN_DEFINITION"`,
 * there is some error in target table's default value type
 *
 * use {@link InferTable} to check details
 */
export type InferDatabase<T extends Schema> = Prettify<{
  [K in keyof T]: T[K] extends {
    columns: Columns
    createAt?: any
    updateAt?: any
    softDelete?: any
  }
    ? InferTable<T[K]>
    : `TypeError: some column's [defaultTo] and [type] are mismatched in table '${K & string}'`
}>
