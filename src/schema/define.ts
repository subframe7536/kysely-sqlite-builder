import type { RawBuilder } from 'kysely'
import type { IsNotNull } from '@subframe7536/type-utils'
import {
  type BooleanColumnType,
  type ColumnProperty,
  type Columns,
  type ColumnsWithErrorInfo,
  DataType,
  type DataTypeValue,
  type InferColumnTypeByNumber,
  type Table,
  type TableProperty,
  type _DataType,
} from './types'

export const TGR = '_T_'

/**
 * define table
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

  const triggerOptions = { type: DataType.date, defaultTo: TGR }
  if (create === true) {
    // @ts-expect-error assign
    columns.createAt = triggerOptions
  } else if (create) {
    // @ts-expect-error assign
    columns[create] = triggerOptions
  }
  if (update === true) {
    // #hack if `notNull === true` and `defaultTo === TGR`, the column is updateAt
    // @ts-expect-error assign
    columns.updateAt = { ...triggerOptions, notNull: true }
  } else if (update) {
    // #hack if `notNull === true` and `defaultTo === TGR`, the column is updateAt
    // @ts-expect-error assign
    columns[update] = { ...triggerOptions, notNull: true }
  }
  const softDeleteOptions = { type: DataType.int, defaultTo: 0 }
  if (softDelete === true) {
    // @ts-expect-error assign
    columns.isDeleted = softDeleteOptions
  } else if (softDelete) {
    // @ts-expect-error assign
    columns[softDelete] = softDeleteOptions
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
   * define column type manually
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
   * column type: INTEGER AUTO INCREMENT
   */
  increments: () => ({ type: DataType.increments } as const),
  /**
   * column type: INTEGER
   */
  int: <T extends number | null, NotNull extends true | null>(
    options?: Options<T, NotNull>,
  ) => parse(DataType.int, options as any) as ColumnBuilder<_DataType['int'], T, NotNull>,
  /**
   * column type: REAL
   */
  float: <T extends number | null, NotNull extends true | null>(
    options?: Options<T, NotNull>,
  ) => parse(DataType.float, options as any) as ColumnBuilder<_DataType['float'], T, NotNull>,
  /**
   * column type: text
   */
  string: <T extends string | null, NotNull extends true | null>(
    options?: Options<T, NotNull>,
  ) => parse(DataType.string, options as any) as ColumnBuilder<_DataType['string'], T, NotNull>,
  /**
   * column type: BLOB
   */
  blob: <T extends Uint8Array | null, NotNull extends true | null>(
    options?: { notNull?: NotNull },
  ) => parse(DataType.blob, options as any) as ColumnBuilder<_DataType['blob'], T, NotNull>,
  /**
   * column type: text (serialize with `JSON.parse` and `JSON.stringify`)
   */
  boolean: <T extends BooleanColumnType | null, NotNull extends true | null>(
    options?: Options<T, NotNull>,
  ) => parse(DataType.boolean, options as any) as ColumnBuilder<_DataType['boolean'], T, NotNull>,
  /**
   * column type: text (serialize with `JSON.parse` and `JSON.stringify`)
   */
  date: <T extends Date | null, NotNull extends true | null>(
    options?: Options<T, NotNull>,
  ) => parse(DataType.date, options as any) as ColumnBuilder<_DataType['date'], T, NotNull>,
  /**
   * column type: text (serialize with `JSON.parse` and `JSON.stringify`)
   */
  object: <T extends object | null, NotNull extends true | null>(
    options?: Options<T, NotNull>,
  ) => parse(DataType.object, options as any) as ColumnBuilder<_DataType['object'], T, NotNull>,
}
