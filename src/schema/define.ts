import type { IsNotNull } from '@subframe7536/type-utils'
import type { RawBuilder } from 'kysely'
import {
  type _DataType,
  type BooleanColumnType,
  type ColumnProperty,
  type Columns,
  type ColumnsWithErrorInfo,
  DataType,
  type DataTypeValue,
  type InferColumnTypeByNumber,
  type Table,
  type TableProperty,
} from './types'

export const TGRC = '_TC_'
export const TGRU = '_TU_'

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
  C extends string | true | null = null,
  U extends string | true | null = null,
  D extends string | true | null = null,
>(
  options: {
    /**
     * table columns
     */
    columns: T
  } & TableProperty<T, C, U, D>,
): Table<T, C, U, D> {
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
  }
}

type Options<T = any, NotNull extends true | null = true | null> = {
  defaultTo?: T | RawBuilder<unknown> | null
  notNull?: NotNull
}

function parse(type: DataTypeValue, options?: Options): any {
  const data = { type, ...options }
  return { ...data, $cast: () => data }
}

type ColumnBuilder<
  T extends DataTypeValue,
  Type extends InferColumnTypeByNumber<T> | null,
  NotNull extends true | null,
  HasDefaultTo = IsNotNull<Type>,
> = ColumnProperty<T, HasDefaultTo extends true ? Type : Type | null, NotNull> & {
  /**
   * Define column type manually
   */
  $cast: <
    NarrowedType extends InferColumnTypeByNumber<T>,
  >() => ColumnProperty<T, HasDefaultTo extends true ? NarrowedType : NarrowedType | null, NotNull>
}

/**
 * define column util
 */
export const column = {
  /**
   * Column type: INTEGER AUTO INCREMENT
   */
  increments: () => ({ type: DataType.increments } as const),
  /**
   * Column type: INTEGER
   */
  int: <T extends number | null, NotNull extends true | null>(
    options?: Options<T, NotNull>,
  ) => parse(DataType.int, options as any) as ColumnBuilder<_DataType['int'], T, NotNull>,
  /**
   * Column type: REAL
   */
  float: <T extends number | null, NotNull extends true | null>(
    options?: Options<T, NotNull>,
  ) => parse(DataType.float, options as any) as ColumnBuilder<_DataType['float'], T, NotNull>,
  /**
   * Column type: text
   */
  string: <T extends string | null, NotNull extends true | null>(
    options?: Options<T, NotNull>,
  ) => parse(DataType.string, options as any) as ColumnBuilder<_DataType['string'], T, NotNull>,
  /**
   * Column type: BLOB
   */
  blob: <T extends Uint8Array | null, NotNull extends true | null>(
    options?: { notNull?: NotNull },
  ) => parse(DataType.blob, options as any) as ColumnBuilder<_DataType['blob'], T, NotNull>,
  /**
   * Column type: text (serialize with `JSON.parse` and `JSON.stringify`)
   */
  boolean: <T extends BooleanColumnType | null, NotNull extends true | null>(
    options?: Options<T, NotNull>,
  ) => parse(DataType.boolean, options as any) as ColumnBuilder<_DataType['boolean'], T, NotNull>,
  /**
   * Column type: text (serialize with `JSON.parse` and `JSON.stringify`)
   */
  date: <T extends Date | null, NotNull extends true | null>(
    options?: Options<T, NotNull>,
  ) => parse(DataType.date, options as any) as ColumnBuilder<_DataType['date'], T, NotNull>,
  /**
   * Column type: text (serialize with `JSON.parse` and `JSON.stringify`)
   */
  object: <T extends object | null, NotNull extends true | null>(
    options?: Options<T, NotNull>,
  ) => parse(DataType.object, options as any) as ColumnBuilder<_DataType['object'], T, NotNull>,
}
