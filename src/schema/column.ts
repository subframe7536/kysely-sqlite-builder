/**
 * Column data type
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

export type TDataType = typeof DataType

export type DataTypeValue = TDataType[keyof TDataType]
