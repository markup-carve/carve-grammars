import { parseHighlight, lineStart } from '../diff/line-options.js'

/** Create a fresh Shiki transformer for one Carve code block. */
export function lineOptionsTransformer(attrs) {
  const numbered = attrs?.classes?.includes('line-numbers') ?? false
  const values = new Map(attrs?.keyValues ?? [])
  const highlight = values.get('data-highlight')
  const start = lineStart(values.get('data-line-start'))
  let selected = new Set()
  return {
    name: 'carve:line-options',
    preprocess(code) {
      selected = parseHighlight(highlight, code.split('\n').length)
    },
    pre(node) {
      if (numbered || highlight !== undefined) this.addClassToHast(node, 'has-line-options')
      if (numbered) this.addClassToHast(node, 'has-line-numbers')
    },
    line(node, line) {
      if (numbered) node.properties.dataLineNumber = String(start + BigInt(line - 1))
      if (selected.has(line)) this.addClassToHast(node, 'highlighted-line')
    },
  }
}
