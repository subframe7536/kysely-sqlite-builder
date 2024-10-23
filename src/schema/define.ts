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
  type ExtraOptions,
  type InferColumnType,
  type Table,
  type TableProperty,
} from './types'

export const TGRC = '_TC_'
export const TGRU = '_TU_'

type DefineTableOptions<
  T extends Columns,
  C extends string | boolean | null = null,
  U extends string | boolean | null = null,
  D extends string | boolean | null = null,
> = TableProperty<T> & ExtraOptions<C, U, D> & {
  /**
   * Table columns definition
   */
  columns: T
}

type ParseFalseToNull<T extends boolean | string | null> = T extends false ? null : T

/**
 * Define table
 *
 * you can use it with {@link $col}
 *
 * @example
 * import { column, defineTable } from 'kysely-sqlite-builder/schema'
 *
 * const testTable = defineTable({
 *   id: column.increments(),
 *   // or just object
 *   simple: { type: 'string', defaultTo: 'test' }
 *   person: column.object({ name: 'test' }),
 *   gender: column.boolean().NotNull(),
 *   array: column.object<string[]>(),
 *   score: column.float(),
 *   birth: column.date(),
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
  const { updateAt, createAt, softDelete } = rest

  if (createAt) {
    // #hack if `defaultTo === TGRC`, the column is updateAt
    // @ts-expect-error assign
    columns[createAt === true ? 'createAt' : createAt] = { type: DataType.date, defaultTo: TGRC }
  }

  if (updateAt) {
    // #hack if `defaultTo === TGRU`, the column is updateAt
    // @ts-expect-error assign
    columns[updateAt === true ? 'updateAt' : updateAt] = { type: DataType.date, defaultTo: TGRU }
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
  int: <T extends number, DefaultTo extends T | RawBuilder<unknown> | null, NotNull extends boolean | null>(
    options?: Options<T, DefaultTo, NotNull>,
  ) => parse(DataType.int, options as any) as ColumnBuilder<_DataType['int'], T, NotNull>,
  /**
   * Column type: REAL
   */
  float: <T extends number, DefaultTo extends T | RawBuilder<unknown> | null, NotNull extends boolean | null>(
    options?: Options<T, DefaultTo, NotNull>,
  ) => parse(DataType.float, options as any) as ColumnBuilder<_DataType['float'], T, NotNull>,
  /**
   * Column type: text
   */
  string: <T extends string, DefaultTo extends T | RawBuilder<unknown> | null, NotNull extends boolean | null>(
    options?: Options<T, DefaultTo, NotNull>,
  ) => parse(DataType.string, options as any) as ColumnBuilder<_DataType['string'], T, NotNull>,
  /**
   * Column type: BLOB
   */
  blob: <T extends Uint8Array, NotNull extends boolean | null>(
    options?: { notNull?: NotNull },
  ) => parse(DataType.blob, options as any) as ColumnBuilder<_DataType['blob'], T, NotNull>,
  /**
   * Column type: text (serialize with `JSON.parse` and `JSON.stringify`)
   */
  boolean: <T extends BooleanColumnType, DefaultTo extends T | RawBuilder<unknown> | null, NotNull extends boolean | null>(
    options?: Options<T, DefaultTo, NotNull>,
  ) => parse(DataType.boolean, options as any) as ColumnBuilder<_DataType['boolean'], T, NotNull>,
  /**
   * Column type: text (serialize with `JSON.parse` and `JSON.stringify`)
   */
  date: <T extends Date, DefaultTo extends T | RawBuilder<unknown> | null, NotNull extends boolean | null>(
    options?: Options<T, DefaultTo, NotNull>,
  ) => parse(DataType.date, options as any) as ColumnBuilder<_DataType['date'], T, NotNull>,
  /**
   * Column type: text (serialize with `JSON.parse` and `JSON.stringify`)
   */
  object: <T extends object, DefaultTo extends T | RawBuilder<unknown> | null, NotNull extends boolean | null>(
    options?: Options<T, DefaultTo, NotNull>,
  ) => parse(DataType.object, options as any) as ColumnBuilder<_DataType['object'], T, NotNull>,
}
