/** Code line options from C2-H-211 to C2-H-213. */
const positive = (value) => /^(?:[1-9][0-9]*)$/.test(value)

/** Parse a complete highlight value into 1-based line indexes. */
export function parseHighlight(value, lineCount) {
  const result = new Set()
  if (typeof value !== 'string' || !value || !Number.isSafeInteger(lineCount) || lineCount < 0) return result
  const ranges = []
  for (const item of value.split(',')) {
    const parts = item.split('-')
    if (parts.length > 2 || !parts.every(positive)) return new Set()
    const first = BigInt(parts[0])
    const last = BigInt(parts.at(-1))
    if (first > last) return new Set()
    ranges.push([first, last])
  }
  for (const [first, last] of ranges) {
    if (first > BigInt(lineCount)) continue
    for (let line = Number(first); line <= Number(last < BigInt(lineCount) ? last : BigInt(lineCount)); line++) result.add(line)
  }
  return result
}

/** Invalid or absent values start the gutter at 1. */
export function lineStart(value) {
  return typeof value === 'string' && positive(value) ? BigInt(value) : 1n
}

/** Decorate a rendered `<pre><code>` from either a plain or captioned block. */
export function applyLineOptions(preElement) {
  const code = preElement?.querySelector(':scope > code')
  if (!code) return
  const numbered = preElement.classList.contains('line-numbers')
  const highlight = preElement.getAttribute('data-highlight')
  if (!numbered && highlight === null) return
  let lines = [...code.children].filter((child) => child.classList.contains('line'))
  if (!lines.length) {
    const source = code.textContent.replace(/\n$/, '')
    code.replaceChildren(...source.split('\n').flatMap((value, index) => {
      const line = code.ownerDocument.createElement('span')
      line.className = 'line'
      line.textContent = value
      return index ? [code.ownerDocument.createTextNode('\n'), line] : [line]
    }))
    lines = [...code.children]
  }
  const selected = parseHighlight(highlight, lines.length)
  const start = lineStart(preElement.getAttribute('data-line-start'))
  preElement.classList.add('has-line-options')
  if (numbered) preElement.classList.add('has-line-numbers')
  for (const [index, line] of lines.entries()) {
    if (numbered) line.setAttribute('data-line-number', String(start + BigInt(index)))
    if (selected.has(index + 1)) line.classList.add('highlighted-line')
  }
}
