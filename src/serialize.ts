import type { Deserializer, Serializer } from 'kysely-plugin-serialize'

import {
  dateRegex,
  maybeJson,
  skipTransform as skip,
} from 'kysely-plugin-serialize'

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
    } else if (maybeJson(parameter)) {
      try {
        return JSON.parse(parameter)
      } catch { }
    }
  }
  return parameter
}
