import type {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from 'kysely'
import { SerializeParametersTransformer } from './serialize-transformer'
import { defaultDeserializer } from './serializer'

export class SerializePlugin implements KyselyPlugin {
  private transformer: SerializeParametersTransformer

  public constructor() {
    this.transformer = new SerializeParametersTransformer()
  }

  public transformQuery({ node }: PluginTransformQueryArgs): RootOperationNode {
    return this.transformer.transformNode(node)
  }

  public async transformResult(
    { result }: PluginTransformResultArgs,
  ): Promise<QueryResult<UnknownRow>> {
    return { ...result, rows: this.parseRows(result.rows) }
  }

  private parseRows(rows: UnknownRow[]): UnknownRow[] {
    const result: UnknownRow[] = []
    for (const row of rows) {
      const parsedRow: UnknownRow = {}
      for (const [key, value] of Object.entries(row)) {
        parsedRow[key] = defaultDeserializer(value)
      }
      result.push(parsedRow)
    }
    return result
  }
}
