import MagicStringStack from 'magic-string-stack'
import type { TransformResult } from 'unplugin'
import type { TransformOptions } from './types'

const methodRegexWithSemicolon = (methodName: string, tail = '') => new RegExp(`${methodName}\\(([^)]*)\\) \\{[\\s\\S]*?;[\\s\\S]*?}${tail}`, 'gm')

export function transformKyselyCode(code: string, id: string, options: TransformOptions): TransformResult {
  const _code = new MagicStringStack(code)
  if (options.dropMigrator) {
    if (id.includes('migration')) {
      return ';'
    }
    if (id.includes('sqlite-introspector')) {
      return {
        code: 'export class SqliteIntrospector {}',
        map: 'export class SqliteIntrospector {}',
      }
    }
    if (id.includes('sqlite-adapter')) {
      return {
        code: `export class SqliteAdapter {
    get supportsReturning() {
        return true;
    }
}`,
        map: `export class SqliteAdapter {
    get supportsReturning() {
        return true;
    }
}`,
      }
    }
    if (id.includes('kysely.js')) {
      _code.replace(/get introspection\(\) \{[\s\S]*?\}/m, '')
    } else if (id.includes('expression-builder')) {
      _code.replace(/withSchema\(.*?\) \{[\s\S]*?\},/m, '')
    } else if (id.includes('kysely.js') || id.includes('query-creator')) {
      _code
        .replace(methodRegexWithSemicolon('withSchema'), '')
        .replace(/get schema\(\) \{[\s\S]*?\}/gm, '')
    } else if (id.includes('create-view-node') || id.includes('create-table-node')) {
      return ';'
    } else if (id.includes('default-query-compiler')) {
      _code
        .replace('!CreateTableNode.is(this.parentNode) &&', '')
        .replace('!CreateViewNode.is(this.parentNode) &&', '')
        .replace(/visitCreateTable[\s\S]*(?=visitList)/m, '')
        .replace(/visitAlterTable[\s\S]*(?=visitSetOperation)/m, '')
        .replace(/visitCreateView[\s\S]*(?=visitGenerated)/m, '')
        .replace(/visitCreateType[\s\S]*(?=visitExplain)/m, '')
    }
    _code.commit()
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
    _code.replace(/export function freeze\(obj\) {[\s\S]*?}/gm, '')
    _code.commit()
  }

  if (id.includes('data-type-parser')) {
    _code.replace('isColumnDataType(dataType)', '["text", "integer", "real", "blob"].includes(dataType)')
    _code.commit()
  }

  if (id.includes('query-node')) {
    _code
      .replace(/ \|\|\s.*MergeQueryNode\.is\(node\)/m, '')
      .replace(methodRegexWithSemicolon('cloneWithTop', ','), '')
      .replace(methodRegexWithSemicolon('cloneWithFetch', ','), '')
    _code.commit()
  }

  if (
    id.includes('insert-query-builder')
    || id.includes('delete-query-builder')
    || id.includes('update-query-builder')
    || id.includes('select-query-builder')
  ) {
    _code.replace(methodRegexWithSemicolon('top'), '')
    _code.commit()
  }

  if (id.includes('insert-query-builder')) {
    _code.replace(methodRegexWithSemicolon('ignore'), '')
    _code.commit()
  }

  if (id.includes('select-query-builder')) {
    _code.replace(methodRegexWithSemicolon('fetch'), '')
    _code.commit()
  }

  if (id.includes('select-query-node')) {
    _code.replace(methodRegexWithSemicolon('cloneWithFetch', ','), '')
    _code.commit()
  }

  if (id.includes('with-schema-transformer')) {
    _code.replace('MergeQueryNode: true,', '')
    _code.commit()
  }

  if (id.includes('operation-node-transformer')) {
    _code
      .replace(methodRegexWithSemicolon('transformTop'), '')
      .replace(methodRegexWithSemicolon('transformMergeQuery'), '')
      .replace(methodRegexWithSemicolon('transformFetch'), '')
      .replace(/top: this.transformNode\(node.top\),/g, '')
      .replace(/ignore: node.ignore,/g, '')
      .replace('fetch: this.transformNode(node.fetch),', '')
      .replace(/replace: node.replace,/g, '')
    _code.commit()

    options?.useDynamicTransformer
      ? _code.replace(/#transformers = freeze\([\s\S]*?}\);/m, '')
        .replace('this.#transformers[node.kind]', 'this["transform" + node.kind.substring(0, node.kind.length - 4)]')
      : _code
        .replace(/TopNode: this.transformTop.bind\(this\),/g, '')
        .replace(/MergeQueryNode: this.transformMergeQuery.bind\(this\),/g, '')
        .replace(/FetchNode: this.transformFetch.bind\(this\),/g, '')
    _code.commit()
  }

  if (id.includes('default-query-compiler')) {
    // writeFileSync('test.js', _code.toString(), 'utf-8')
    _code
      .replace(/visitMergeQuery[\s\S]*(?=visitMatched)/gm, '')
      .replace(/visitFetch[\s\S]*(?=append\(str\))/gm, '')
      .replace(/if \(node.fetch\) \{[\s\S]*?\}/gm, '')
      .replace(/if \(node.top\) \{[\s\S]*?\}/gm, '')
      .replace('this.append(node.replace ? \'replace\' : \'insert\');', 'this.append(\'insert\');')
      .replace(' extends OperationNodeVisitor', '')
    _code.commit()

    _code.replace(/visit(.*)\(.*\) {/g, (_, str) => `${str}Node(node) {`)
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
    _code.commit()
  }

  if (id.includes('query-creator')) {
    _code
      .replace(methodRegexWithSemicolon('replaceInto'), '')
      .replace(methodRegexWithSemicolon('mergeInto'), '')
    _code.commit()
  }
  if (id.includes('query-executor-base')) {
    _code.replace('warnOfOutdatedDriverOrPlugins(result, transformedResult);', '')
    _code.commit()
  }

  _code
    .replace(/preventAwait\(.*?\)/g, '')
    .replace(/(?:freeze|requireAllProps),?/g, '')
    .replace(/#/g, '_')
    .replace(/append/g, '_a')
    .replace(/create(?=\(|\))/g, '_c')
    .replace(/visit(?=[A-Z]|\()/g, '_v')
    .replace(/cloneWith/g, '_clw')
    .replace(/createWith/g, '_crw')
    .replace(/Wrapper/g, '_W')
    .replace(/BuilderImpl/g, '_BI')
  _code.commit()

  return {
    code: _code.toString(),
    map: _code.generateMap(),
  }
}
