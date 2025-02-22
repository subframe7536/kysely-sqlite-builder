import type { DataTypeValue, TDataType } from './column'
import type {
  BooleanColumnType,
  ColumnProperty,
  Columns,
  ColumnsWithErrorInfo,
  DefaultValue,
  ExtraOptions,
  InferColumnType,
  Nullable,
  Table,
  TableProperty,
} from './types'
import type { Generated } from 'kysely'

import { DataType } from './column'

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
 * Define table schema with {@link column}
 *
 * @example
 * import { column, defineTable } from 'kysely-sqlite-builder/schema'
 *
 * const testTable = defineTable({
 *   columns: {
 *     id: column.increments(),
 *     person: column.object({ defaultTo: { name: 'test' } }),
 *     gender: column.boolean({ notNull: true }),
 *     // or just object
 *     manual: { type: DataType.boolean },
 *     array: column.object().$cast<string[]>(),
 *     literal: column.string().$cast<'l1' | 'l2'>(),
 *     buffer: column.blob(),
 *   },
 *   primary: 'id', // optional
 *   index: ['person', ['id', 'gender']],
 *   unique: [['id', 'gender']],
 *   // these params will auto add columns into table
 *   createAt: true, // `createTime` column
 *   updateAt: true, // `updateTime` column
 *   softDelete: true, // `isDeleted` column
 *   withoutRowId: true, // disables implicit rowId
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
  DefaultTo extends DefaultValue<T> = DefaultValue<T>,
  NotNull extends Nullable = null,
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
  DefaultTo extends InferColumnType<T> | null,
  NotNull extends Nullable,
> = ColumnProperty<
  T,
  Exclude<DefaultTo, null>,
  NotNull extends false ? null : true
> & {
  /**
   * Define column type manually
   */
  $cast: <
    NarrowedType extends InferColumnType<T>,
  >() => ColumnProperty<
    T,
    Exclude<NarrowedType, null>,
    NotNull
  >
}

/**
 * Define column util
 */
export const column = {
  /**
   * Column type: INTEGER AUTO INCREMENT
   */
  increments: () => ({ type: DataType.increments }) as ColumnBuilder<TDataType['increments'], Generated<number>, Nullable>,
  /**
   * Column type: INTEGER
   */
  int: <T extends number, DefaultTo extends DefaultValue<T>, IsNotNull extends Nullable>(
    options?: Options<T, DefaultTo, IsNotNull>,
  ) => parse(DataType.int, options as any) as ColumnBuilder<TDataType['int'], T, IsNotNull>,
  /**
   * Column type: REAL
   */
  float: <T extends number, DefaultTo extends DefaultValue<T>, IsNotNull extends Nullable>(
    options?: Options<T, DefaultTo, IsNotNull>,
  ) => parse(DataType.float, options as any) as ColumnBuilder<TDataType['float'], T, IsNotNull>,
  /**
   * Column type: text
   */
  string: <T extends string, DefaultTo extends DefaultValue<T>, IsNotNull extends Nullable>(
    options?: Options<T, DefaultTo, IsNotNull>,
  ) => parse(DataType.string, options as any) as ColumnBuilder<TDataType['string'], T, IsNotNull>,
  /**
   * Column type: BLOB
   */
  blob: <T extends Uint8Array, IsNotNull extends Nullable>(
    options?: { notNull?: IsNotNull },
  ) => parse(DataType.blob, options as any) as ColumnBuilder<TDataType['blob'], T, IsNotNull>,
  /**
   * Column type: INTEGER
   */
  boolean: <T extends BooleanColumnType, DefaultTo extends DefaultValue<T>, IsNotNull extends Nullable>(
    options?: Options<T, DefaultTo, IsNotNull>,
  ) => parse(DataType.boolean, options as any) as ColumnBuilder<TDataType['boolean'], T, IsNotNull>,
  /**
   * Column type: TEXT (serialize with `JSON.parse` and `JSON.stringify`)
   */
  date: <T extends Date, DefaultTo extends DefaultValue<T>, IsNotNull extends Nullable>(
    options?: Options<T, DefaultTo, IsNotNull>,
  ) => parse(DataType.date, options as any) as ColumnBuilder<TDataType['date'], T, IsNotNull>,
  /**
   * Column type: TEXT (serialize with `JSON.parse` and `JSON.stringify`)
   */
  object: <T extends object, DefaultTo extends DefaultValue<T>, IsNotNull extends Nullable>(
    options?: Options<T, DefaultTo, IsNotNull>,
  ) => parse(DataType.object, options as any) as ColumnBuilder<TDataType['object'], DefaultTo, IsNotNull>,
}
