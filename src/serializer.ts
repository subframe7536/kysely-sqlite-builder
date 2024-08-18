import { type Deserializer, type Serializer, dateRegex } from 'kysely-plugin-serialize'

export const defaultSerializer: Serializer = (parameter) => {
  if (skipTransform(parameter) || typeof parameter === 'string') {
    return parameter
  } else {
    try {
      return JSON.stringify(parameter)
    } catch {
      return parameter
    }
  }
}

export const defaultDeserializer: Deserializer = (parameter) => {
  if (skipTransform(parameter)) {
    return parameter
  }
  if (typeof parameter === 'string') {
    if (dateRegex.test(parameter)) {
      return new Date(parameter)
    } else if (
      (parameter.startsWith('{') && parameter.endsWith('}'))
      || (parameter.startsWith('[') && parameter.endsWith(']'))
    ) {
      try {
        return JSON.parse(parameter)
      } catch { }
    }
  }
  return parameter
}

const skipType = new Set([
  'bigint',
  'number',
  'boolean',
])
/**
 * check if the parameter is no need to transform
 *
 * skip type: `undefined`/`null`, `boolean`/`bigint`/`number`, `ArrayBuffer`/`Buffer`
 */
export function skipTransform(parameter: unknown): boolean {
  if (parameter === null || parameter === undefined || parameter instanceof ArrayBuffer) {
    return true
  }
  return skipType.has(typeof parameter)
}
