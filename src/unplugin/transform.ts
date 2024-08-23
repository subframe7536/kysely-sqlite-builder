import MagicString from 'magic-string'
import type { TransformResult } from 'unplugin'
import type { TransformOptions } from './types'

function methodRegexWithSemicolon(methodName: string, tail = ''): RegExp {
  return new RegExp(`${methodName}\\(([^)]*)\\) \\{[\\s\\S]*?;[\\s\\S]*?}${tail}`, 'gm')
}

export function transformKyselyCode(code: string, id: string, options: TransformOptions): TransformResult {
  let _code = new MagicString(code)
  function has(...patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (id.includes(pattern)) {
        return true
      }
    }
    return false
  }
  function replace(pattern: string | RegExp, replacement: string | ((substring: string, ...args: any[]) => string)): void {
    _code = new MagicString(_code.replace(pattern, replacement).toString())
  }

  if (options.dropDelete) {
    if (has('delete-query-builder')) {
      return ';'
    }
  }
  if (options.dropMigrator) {
    if (has('migration')) {
      return ';'
    }
    if (has('sqlite-introspector')) {
      const s = new MagicString('export class SqliteIntrospector {}')
      return {
        code: s.toString(),
        map: s.generateMap(),
      }
    }
    if (has('sqlite-adapter')) {
      const s = new MagicString('export class SqliteAdapter { get supportsReturning() { return true; } }')
      return {
        code: s.toString(),
        map: s.generateMap(),
      }
    }
    if (has('kysely.js')) {
      replace(/get introspection\(\) \{[\s\S]*?\}/, '')
    }
  }

  if (options.dropSchema) {
    if (has('expression-builder')) {
      replace(/withSchema\(.*?\) \{[\s\S]*?\},/, '')
    } else if (has('kysely.js', 'query-creator')) {
      replace(methodRegexWithSemicolon('withSchema'), '')
      replace(/get schema\(\) \{[\s\S]*?\}/g, '')
    } else if (has(
      '-view-node',
      '-table-node',
      '-index-node',
      '-type-node',
      '-schema-node',
    )) {
      return ';'
    } else if (has('default-query-compiler')) {
      replace('!CreateTableNode.is(this.parentNode) &&', '')
      replace('!CreateViewNode.is(this.parentNode) &&', '')
      replace(/visitCreateTable[\s\S]*(?=visitList)/, '')
      replace(/visitAlterTable[\s\S]*(?=visitSetOperation)/, '')
      replace(/visitCreateView[\s\S]*(?=visitGenerated)/, '')
      replace(/visitCreateType[\s\S]*(?=visitExplain)/, '')
    }
  }

  if (has(
    'prevent-await',
    'require-all-props',
    'merge-query-node',
    'operation-node-visitor',
    'log-once',
  )) {
    return ';'
  }

  if (has('object-utils')) {
    replace(/export function freeze\(obj\) \{[\s\S]*?\}/g, '')
  }

  if (has('data-type-parser')) {
    replace('isColumnDataType(dataType)', '["text", "integer", "real", "blob"].includes(dataType)')
  }

  if (has('query-node')) {
    replace(/ \|\|\s.*MergeQueryNode\.is\(node\)/, '')
    replace(methodRegexWithSemicolon('cloneWithTop', ','), '')
    replace(methodRegexWithSemicolon('cloneWithFetch', ','), '')
  }

  if (has(
    'insert-query-builder',
    'delete-query-builder',
    'update-query-builder',
    'select-query-builder',
  )) {
    replace(methodRegexWithSemicolon('top'), '')
  }

  if (has('insert-query-builder')) {
    replace(methodRegexWithSemicolon('ignore'), '')
  }

  if (has('select-query-builder')) {
    replace(methodRegexWithSemicolon('fetch'), '')
  }

  if (has('select-query-node')) {
    replace(methodRegexWithSemicolon('cloneWithFetch', ','), '')
  }

  if (has('with-schema-transformer')) {
    replace('MergeQueryNode: true,', '')
  }

  if (has('operation-node-transformer')) {
    replace(methodRegexWithSemicolon('transformTop'), '')
    replace(methodRegexWithSemicolon('transformMergeQuery'), '')
    replace(methodRegexWithSemicolon('transformFetch'), '')
    replace(/top: this.transformNode\(node.top\),/g, '')
    replace(/ignore: node.ignore,/g, '')
    replace('fetch: this.transformNode(node.fetch),', '')
    replace(/replace: node.replace,/g, '')

    if (options?.useDynamicTransformer) {
      replace(/#transformers = freeze\([\s\S]*?\}\);/, '')
      replace('this.#transformers[node.kind]', 'this["transform" + node.kind.substring(0, node.kind.length - 4)]')
    } else {
      replace(/TopNode: this.transformTop.bind\(this\),/g, '')
      replace(/MergeQueryNode: this.transformMergeQuery.bind\(this\),/g, '')
      replace(/FetchNode: this.transformFetch.bind\(this\),/g, '')
    }
  }

  if (has('default-query-compiler')) {
    replace(/visitMergeQuery[\s\S]*(?=visitMatched)/g, '')
    replace(/visitFetch[\s\S]*(?=append\(str\))/g, '')
    replace(/if \(node.fetch\) \{[\s\S]*?\}/g, '')
    replace(/if \(node.top\) \{[\s\S]*?\}/g, '')
    replace('this.append(node.replace ? \'replace\' : \'insert\');', 'this.append(\'insert\');')
    replace(' extends OperationNodeVisitor', '')

    replace(/visit(\w+)\(.*\) \{/g, (_, str) => `${str}Node(node) {`)
    replace('#parameters = [];', `#parameters = [];
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

  if (has('query-creator')) {
    replace(methodRegexWithSemicolon('replaceInto'), '')
    replace(methodRegexWithSemicolon('mergeInto'), '')
  }
  if (has('query-executor-base')) {
    replace('warnOfOutdatedDriverOrPlugins(result, transformedResult);', '')
  }

  replace(/preventAwait\(.*?\)/g, '')
  replace(/(?:freeze|requireAllProps),?/g, '')
  replace(/#props/g, '_p')
  replace(/#db/g, '_d')
  replace(/#queryBuilder/g, '_q')
  replace(/#transformers/g, '_t')
  replace(/#node/g, '_n')
  replace(/#alias/g, '_al')
  replace(/#column/g, '_cl')
  replace(/#executor/g, '_e')
  replace(/#levels/g, '_le')
  replace(/#logger/g, '_lg')
  replace(/#connection/g, '_cn')
  replace(/#runningPromise/g, '_rp')
  replace(/#/g, '_')

  if (options.minifyMethodName) {
    replace(/append/g, '_a')
    replace(/create(?=\(|\))/g, '_c')
    replace(/visit(?=[A-Z(])/g, '_v')
    replace(/cloneWith/g, '_clw')
    replace(/createWith/g, '_crw')
    replace(/Wrapper/g, '_W')
    replace(/toOperationNode/g, '_ton')
    replace(/(?<!-)executor/g, '_ec')
  }

  _code = options.transform?.(_code, id) ?? _code

  return {
    code: _code.toString(),
    map: _code.generateMap(),
  }
}
