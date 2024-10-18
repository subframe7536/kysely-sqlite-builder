import type { Arrayable, IsNotNull, Prettify } from '@subframe7536/type-utils'
import type { ColumnType, Generated, RawBuilder } from 'kysely'

/**
 * Column data typ
 */
export const DataType = {
  increments: 0,
  int: 1,
  float: 2,
  string: 3,
  blob: 4,
  object: 5,
  boolean: 6,
  date: 7,
} as const

export type _DataType = typeof DataType

export type DataTypeValue = _DataType[keyof _DataType]

export type BooleanColumnType = ColumnType<0 | 1, boolean, boolean>

export type InferColumnTypeByNumber<T extends DataTypeValue> =
  T extends _DataType['string'] ? string :
    T extends _DataType['boolean'] ? BooleanColumnType :
      T extends _DataType['int'] | _DataType['float'] ? number :
        T extends _DataType['increments'] ? Generated<number> :
          T extends _DataType['date'] ? Date :
            T extends _DataType['blob'] ? Uint8Array :
              T extends _DataType['object'] ? object :
                never

export type InferStringByColumnType<T> =
  T extends string ? _DataType['string'] :
    T extends BooleanColumnType ? _DataType['boolean'] :
      T extends Generated<number> ? _DataType['increments'] | _DataType['int'] | _DataType['float'] :
        T extends number ? _DataType['int'] | _DataType['float'] :
          T extends Date ? _DataType['date'] :
            T extends ArrayBufferLike ? _DataType['blob'] :
              T extends Generated<infer P> ? InferStringByColumnType<P> :
                T extends object ? _DataType['object'] :
                  never

export type ParsedColumnType =
  | 'TEXT'
  | 'INTEGER'
  | 'BLOB'
  | 'REAL'

export type ColumnProperty<
  ColType extends DataTypeValue = DataTypeValue,
  DefaultTo extends InferColumnTypeByNumber<ColType> | RawBuilder<unknown> | null = InferColumnTypeByNumber<ColType> | null | RawBuilder<unknown>,
  NotNull extends true | null = true | null,
> = {
  type: ColType
  defaultTo?: DefaultTo
  notNull?: NotNull
}

export type TimeTriggerOptions<
  Create extends string | true | null,
  Update extends string | true | null,
> = {
  create?: Create
  update?: Update
}

export type TableProperty<
  Cols extends Columns,
  Create extends string | true | null = null,
  Update extends string | true | null = null,
  Delete extends string | true | null = null,
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
  /**
   * Time trigger for `createAt` and `updateAt`
   *
   * - If type is `true`, column name is `deletedAt`
   * - If type is `string`, it will be treated as column name
   */
  timeTrigger?: TimeTriggerOptions<Create, Update>
  /**
   * Whether to use soft delete
   *
   * - If type is `true`, column name is `deletedAt`
   * - If type is `string`, it will be treated as column name
   */
  softDelete?: Delete
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
          typeIs: InferColumnTypeByNumber<T[K]['type']>
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
} & TableProperty<Cols, Create, Update, Delete>

export type Schema = Record<string, Table<any, any, any, any>>

// export type FilterGenerated<
//   Table extends object,
//   EscapeKeys extends string = never,
// > = {
//   [K in keyof Table]: K extends EscapeKeys
//     ? Table[K]
//     : InferGenereated<Table[K]>
// }

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

export type ParseTableWithExtraColumns<
  T extends Columns,
  P extends TimeTriggerOptions<any, any> | undefined,
  Delete extends string | true | undefined,
> = P extends TimeTriggerOptions<infer A, infer B>
  // eslint-disable-next-line style/indent-binary-ops
  ? Omit<T, ExtraColumnsKey<TriggerKey<A, B>, Delete>> & ({
    [K in ExtraColumnsKey<TriggerKey<A, B>, Delete>]: {
      type: _DataType['increments'] // #hack to ensure Generated
      defaultTo: Generated<K extends TriggerKey<A, B> ? Date : number> | null
      notNull: null
    }
  })
  : never

/**
 * Util type for infering type of table
 */
export type InferTable<
  T extends {
    columns: Columns
    timeTrigger?: TimeTriggerOptions<any, any>
    softDelete?: any
  },
  P = ParseTableWithExtraColumns<T['columns'], T['timeTrigger'], T['softDelete']>,
> = Prettify<{
  [K in keyof P]: P[K] extends ColumnProperty
    // if not null
    ? IsNotNull<P[K]['notNull']> extends true
      // return required defaultTo
      ? Exclude<P[K]['defaultTo'], null>
      // if type is "increments"
      : P[K]['type'] extends _DataType['increments']
        // return "Generated<...>"
        ? Exclude<P[K]['defaultTo'], null>
        // if defaultTo is not null
        : IsNotNull<P[K]['defaultTo']> extends true
          // return Generated
          ? Generated<Exclude<P[K]['defaultTo'], null>>
          // return optional
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
    timeTrigger?: TimeTriggerOptions<any, any>
    softDelete?: any
  }
    ? InferTable<T[K]>
    : `TypeError: some column's [defaultTo] and [type] are mismatched in table '${K & string}'`
}>
