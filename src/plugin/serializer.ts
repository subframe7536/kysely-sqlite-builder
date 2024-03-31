export type Serializer = (parameter: unknown) => unknown
export type Deserializer = (parameter: unknown) => unknown

export const defaultSerializer: Serializer = (parameter) => {
  if (skipTransform(parameter) || typeof parameter === 'string') {
    return parameter
  } else {
    try {
      return JSON.stringify(parameter)
    } catch (ignore) {
      return parameter
    }
  }
}

export const dateRegex = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?$/

export const defaultDeserializer: Deserializer = (parameter) => {
  if (skipTransform(parameter)) {
    return parameter
  }
  if (typeof parameter === 'string') {
    if (dateRegex.test(parameter)) {
      return new Date(parameter)
    } else if (
      (parameter[0] === '{' && parameter[parameter.length - 1] === '}')
      || (parameter[0] === '[' && parameter[parameter.length - 1] === ']')
    ) {
      try {
        return JSON.parse(parameter)
      } catch (ignore) { }
    }
    return parameter
  }
}

/**
 * check if the parameter is no need to transform
 *
 * skip type: `undefined`/`null`, `boolean`/`bigint`/`number`, `ArrayBuffer`/`Buffer`
 */
export function skipTransform(parameter: unknown) {
  if (parameter === null || parameter === undefined || parameter instanceof ArrayBuffer) {
    return true
  }
  const type = typeof parameter
  return type === 'bigint'
    || type === 'number'
    || type === 'boolean'
    || (type === 'object' && 'buffer' in (parameter as any))
}
