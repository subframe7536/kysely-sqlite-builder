import type { IsNotNull } from '@subframe7536/type-utils'
import type { Generated, RawBuilder } from 'kysely'
import {
  type _DataType,
  type BooleanColumnType,
  type ColumnProperty,
  type Columns,
  type ColumnsWithErrorInfo,
  DataType,
  type DataTypeValue,
  type InferColumnType,
  type Table,
  type TableProperty,
} from './types'

export const TGRC = '_TC_'
export const TGRU = '_TU_'

type DefineTableOptions<
  T extends Columns,
  C extends string | boolean | null,
  U extends string | boolean | null,
  D extends string | boolean | null,
> = {
  /**
   * Table columns
   */
  columns: T
} & Omit<TableProperty<T>, 'timeTrigger' | 'softDelete'> & {
  /**
   * Time trigger for `createAt` and `updateAt`
   *
   * - If type is nullish, ignore
   * - If type is `true`, column name is `deletedAt`
   * - If type is `string`, it will be treated as column name
   */
  timeTrigger?: {
    /**
     * Create time column
     */
    create?: C
    /**
     * Update time column
     */
    update?: U
  }
  /**
   * Whether to use soft delete
   *
   * - If type is nullish, ignore
   * - If type is `true`, column name is `deletedAt`
   * - If type is `string`, it will be treated as column name
   */
  softDelete?: D
}

type ParseFalseToNull<T extends boolean | string | null> = T extends false ? null : T

/**
 * Define table
 *
 * you can use it with {@link $col}
 *
 * @example
 * const testTable = defineTable({
 *   id: column.increments(),
 *   // or just object
 *   simple: { type: 'string', defaultTo: 'test' }
 *   person: column.object({ name: 'test' }),
 *   gender: column.boolean().NotNull(),
 *   array: column.object<string[]>(),
 *   literal: column.string<'l1' | 'l2'>(),
 *   buffer: column.blob(),
 * }, {
 *   primary: 'id',
 *   index: ['person', ['id', 'gender']],
 *   timeTrigger: { create: true, update: true },
 * })
 */
export function defineTable<
  T extends Columns,
  C extends string | boolean | null = null,
  U extends string | boolean | null = null,
  D extends string | boolean | null = null,
>(
  options: DefineTableOptions<T, C, U, D>,
): Table<T, ParseFalseToNull<C>, ParseFalseToNull<U>, ParseFalseToNull<D>> {
  const { columns, ...rest } = options
  const { timeTrigger: { create, update } = {}, softDelete } = rest

  if (create) {
    // #hack if `defaultTo === TGRC`, the column is updateAt
    // @ts-expect-error assign
    columns[create === true ? 'createAt' : create] = { type: DataType.date, defaultTo: TGRC }
  }

  if (update) {
    // #hack if `defaultTo === TGRU`, the column is updateAt
    // @ts-expect-error assign
    columns[update === true ? 'updateAt' : update] = { type: DataType.date, defaultTo: TGRU }
  }

  if (softDelete) {
    // @ts-expect-error assign
    columns[softDelete === true ? 'isDeleted' : softDelete] = { type: DataType.int, defaultTo: 0 }
  }

  return {
    ...rest,
    columns: columns as unknown as ColumnsWithErrorInfo<T>,
  } as Table<T, ParseFalseToNull<C>, ParseFalseToNull<U>, ParseFalseToNull<D>>
}

type NormalizeType<T> =
  T extends string
    ? string
    : T extends number
      ? number
      : T extends boolean
        ? boolean
        : T

type Options<
  T = any,
  DefaultTo extends T | RawBuilder<unknown> | null = T | RawBuilder<unknown> | null,
  NotNull extends boolean | null = null,
> = {
  defaultTo?: NormalizeType<DefaultTo>
  notNull?: NotNull
}

function parse(type: DataTypeValue, options?: Options): any {
  const data = { type, ...options }
  return { ...data, $cast: () => data }
}

type ColumnBuilder<
  T extends DataTypeValue,
  Type extends InferColumnType<T> | null,
  NotNull extends boolean | null,
> = ColumnProperty<
  T,
  IsNotNull<Type> extends true ? Type : Type | null,
  NotNull extends false ? null : true
> & {
  /**
   * Define column type manually
   */
  $cast: <
    NarrowedType extends InferColumnType<T>,
  >() => ColumnProperty<
    T,
    IsNotNull<Type> extends true ? NarrowedType : NarrowedType | null,
    NotNull extends false ? null : true
  >
}

/**
 * Define column util
 */
export const column = {
  /**
   * Column type: INTEGER AUTO INCREMENT
   */
  increments: () => ({ type: DataType.increments }) as ColumnBuilder<_DataType['increments'], Generated<number>, null>,
  /**
   * Column type: INTEGER
   */
  int: <T extends number | null, DefaultTo extends T | RawBuilder<unknown> | null, NotNull extends boolean | null>(
    options?: Options<T, DefaultTo, NotNull>,
  ) => parse(DataType.int, options as any) as ColumnBuilder<_DataType['int'], T, NotNull>,
  /**
   * Column type: REAL
   */
  float: <T extends number | null, DefaultTo extends T | RawBuilder<unknown> | null, NotNull extends boolean | null>(
    options?: Options<T, DefaultTo, NotNull>,
  ) => parse(DataType.float, options as any) as ColumnBuilder<_DataType['float'], T, NotNull>,
  /**
   * Column type: text
   */
  string: <T extends string | null, DefaultTo extends T | RawBuilder<unknown> | null, NotNull extends boolean | null>(
    options?: Options<T, DefaultTo, NotNull>,
  ) => parse(DataType.string, options as any) as ColumnBuilder<_DataType['string'], T, NotNull>,
  /**
   * Column type: BLOB
   */
  blob: <T extends Uint8Array | null, NotNull extends boolean | null>(
    options?: { notNull?: NotNull },
  ) => parse(DataType.blob, options as any) as ColumnBuilder<_DataType['blob'], T, NotNull>,
  /**
   * Column type: text (serialize with `JSON.parse` and `JSON.stringify`)
   */
  boolean: <T extends BooleanColumnType | null, DefaultTo extends T | RawBuilder<unknown> | null, NotNull extends boolean | null>(
    options?: Options<T, DefaultTo, NotNull>,
  ) => parse(DataType.boolean, options as any) as ColumnBuilder<_DataType['boolean'], T, NotNull>,
  /**
   * Column type: text (serialize with `JSON.parse` and `JSON.stringify`)
   */
  date: <T extends Date | null, DefaultTo extends T | RawBuilder<unknown> | null, NotNull extends boolean | null>(
    options?: Options<T, DefaultTo, NotNull>,
  ) => parse(DataType.date, options as any) as ColumnBuilder<_DataType['date'], T, NotNull>,
  /**
   * Column type: text (serialize with `JSON.parse` and `JSON.stringify`)
   */
  object: <T extends object | null, DefaultTo extends T | RawBuilder<unknown> | null, NotNull extends boolean | null>(
    options?: Options<T, DefaultTo, NotNull>,
  ) => parse(DataType.object, options as any) as ColumnBuilder<_DataType['object'], T, NotNull>,
}
