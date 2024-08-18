import { type Deserializer, type Serializer, dateRegex, skipTransform as skip } from 'kysely-plugin-serialize'

const skipTransform = (parameter: unknown): boolean => skip(parameter) || typeof parameter === 'boolean'

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
