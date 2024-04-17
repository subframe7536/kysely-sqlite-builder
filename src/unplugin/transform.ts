import type { TransformOptions } from './plugin'

const methodRegexWithSemicolon = (methodName: string, tail = '') => new RegExp(`${methodName}\\(([^)]*)\\) \\{[\\s\\S]*?;[\\s\\S]*?}${tail}`, 'gm')

const methodRegexWithoutSemicolon = (methodName: string) => new RegExp(`${methodName}\\(([^)]*)\\) \\{(?:[^{}]*(?:\\{(?:[^{}]*(?:\\{[^{}]*\\})?)*\\})?)*[^{}]*\\}`, 'gm')

/**
 * trim kysely method or class names
 * - `append -> _a`
 * - `create -> _c`
 * - `visit -> _v`
 * - `cloneWith -> _clw`
 * - `createWith -> _crw`
 * - `Wrapper -> _W`
 * - `BuilderImpl -> _BI`
 */
export function trimNames(code: string) {
  return code
    .replace(/append/g, '_a')
    .replace(/create(?=\(|\))/g, '_c')
    .replace(/visit(?=[A-Z]|\()/g, '_v')
    .replace(/cloneWith/g, '_clw')
    .replace(/createWith/g, '_crw')
    .replace(/Wrapper/g, '_W')
    .replace(/BuilderImpl/g, '_BI')
}

export function removeVisitSchema(code: string) {
  return code
    .replace(/visitCreateTable[\s\S]*(?=visitList)/m, '')
    .replace(/visitAlterTable[\s\S]*(?=visitSetOperation)/m, '')
    .replace(/visitCreateView[\s\S]*(?=visitGenerated)/m, '')
    .replace(/visitCreateType[\s\S]*(?=visitExplain)/m, '')
}

export function transformKyselyCode(code: string, id: string, options: TransformOptions) {
  if (options.dropMigrator) {
    if (id.includes('migration')) {
      return ';'
    }
    if (id.includes('kysely.js')) {
      code = code.replace(/get introspection\(\) \{[\s\S]*?\}/m, '')
    }
    if (id.includes('sqlite-introspector')) {
      return 'export class SqliteIntrospector {}'
    }
    if (id.includes('sqlite-adapter')) {
      return `export class SqliteAdapter {
  get supportsReturning() {
    return true;
  }
}`
    }
  }

  if (options.dropSchema) {
    if (id.includes('expression-builder')) {
      code = code.replace(/withSchema\(.*?\) \{[\s\S]*?\},/m, '')
    } else if (id.includes('kysely.js') || id.includes('query-creator')) {
      code = code
        .replace(methodRegexWithSemicolon('withSchema'), '')
        .replace(/get schema\(\) \{[\s\S]*?\}/gm, '')
    } else if (
      id.includes('create-view-node')
      || id.includes('create-table-node')
    ) {
      return ';'
    } else if (id.includes('default-query-compiler')) {
      code = removeVisitSchema(
        code
          .replace('!CreateTableNode.is(this.parentNode) &&', '')
          .replace('!CreateViewNode.is(this.parentNode) &&', ''),
      )
    }
  }

  if (
    id.includes('prevent-await')
    || id.includes('require-all-props')
    || id.includes('merge-query-node')
    || id.includes('operation-node-visitor')
    || id.includes('log-once')
  ) {
    return ';'
  }

  if (id.includes('object-utils')) {
    code = code.replace(/export function freeze\(obj\) {[\s\S]*?}/gm, '')
  }

  if (id.includes('data-type-parser')) {
    code = code.replace('isColumnDataType(dataType)', '["text", "integer", "real", "blob"].includes(dataType)')
  }

  if (id.includes('query-node')) {
    code = code
      .replace(/ \|\|\s.*MergeQueryNode\.is\(node\)/m, '')
      .replace(methodRegexWithSemicolon('cloneWithTop', ','), '')
      .replace(methodRegexWithSemicolon('cloneWithFetch', ','), '')
  }

  if (
    id.includes('insert-query-builder')
    || id.includes('delete-query-builder')
    || id.includes('update-query-builder')
    || id.includes('select-query-builder')
  ) {
    code = code.replace(methodRegexWithSemicolon('top'), '')
  }

  if (id.includes('insert-query-builder')) {
    code = code.replace(methodRegexWithSemicolon('ignore'), '')
  }

  if (id.includes('select-query-builder')) {
    code = code.replace(methodRegexWithSemicolon('fetch'), '')
  }

  if (id.includes('select-query-node')) {
    code = code.replace(methodRegexWithSemicolon('cloneWithFetch', ','), '')
  }

  if (id.includes('with-schema-transformer')) {
    code = code.replace('MergeQueryNode: true,', '')
  }

  if (id.includes('operation-node-transformer')) {
    code = code
      .replace(methodRegexWithSemicolon('transformTop'), '')
      .replace(methodRegexWithSemicolon('transformMergeQuery'), '')
      .replace(methodRegexWithSemicolon('transformFetch'), '')
      .replace(/top: this.transformNode\(node.top\),/g, '')
      .replace(/ignore: node.ignore,/g, '')
      .replace('fetch: this.transformNode(node.fetch),', '')
      .replace(/replace: node.replace,/g, '')

    code = options?.useDynamicTransformer
      ? code.replace(/#transformers = freeze\([\s\S]*?}\);/m, '')
        .replace('this.#transformers[node.kind]', 'this["transform" + node.kind.substring(0, node.kind.length - 4)]')
      : code
        .replace(/TopNode: this.transformTop.bind\(this\),/g, '')
        .replace(/MergeQueryNode: this.transformMergeQuery.bind\(this\),/g, '')
        .replace(/FetchNode: this.transformFetch.bind\(this\),/g, '')
  }

  if (id.includes('default-query-compiler')) {
    code = code
      .replace(methodRegexWithoutSemicolon('visitMergeQuery'), '')
      .replace(methodRegexWithoutSemicolon('visitFetch'), '')
      .replace(methodRegexWithoutSemicolon('visitTop'), '')
      .replace(/if \(node.fetch\) {[\s\S]*?}/gm, '')
      .replace(/if \(node.top\) {[\s\S]*?}/gm, '')
      .replace('this.append(node.replace ? \'replace\' : \'insert\');', 'this.append(\'insert\');')
      .replace(' extends OperationNodeVisitor', '')
      .replace(/visit(.*)\(.*\) {/g, (_, str) => `${str}Node(node) {`)
      .replace('#parameters = [];', `#parameters = [];
  nodeStack = [];
  get parentNode() {
    return this.nodeStack[this.nodeStack.length - 2];
  }
  _vNode(node) {
    this.nodeStack.push(node);
    this[node.kind](node);
    this.nodeStack.pop();
  };`)
  }

  if (id.includes('query-creator')) {
    code = code
      .replace(methodRegexWithSemicolon('replaceInto'), '')
      .replace(methodRegexWithSemicolon('selectNoFrom'), '')
      .replace(methodRegexWithSemicolon('mergeInto'), '')
  }
  if (id.includes('query-executor-base')) {
    code = code.replace('warnOfOutdatedDriverOrPlugins(result, transformedResult);', '')
  }

  return trimNames(
    code
      .replace(/preventAwait\(.*?\)/g, '')
      .replace(/(?:freeze|requireAllProps),?/g, '')
      .replace(/#/g, '_'),
  )
}
