import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import { applyLineOptions, lineStart, parseHighlight } from '@markup-carve/carve-grammars/diff'
import { lineOptionsTransformer } from '@markup-carve/carve-grammars/shiki/line-options'
import { createHighlighter } from 'shiki'

assert.deepEqual([...parseHighlight('1,3-5,4,9', 5)].sort(), [1, 3, 4, 5])
for (const invalid of ['', '0', '01', '1, 2', '3-2', '1,,2', '1-2-3', '1-x']) {
  assert.equal(parseHighlight(invalid, 5).size, 0, invalid)
}
assert.equal(lineStart('42'), 42n)
assert.equal(lineStart('9007199254740993'), 9007199254740993n)
for (const invalid of [null, 'auto', '0', '01', '-2']) assert.equal(lineStart(invalid), 1n)

const { document } = new Window()
document.body.innerHTML = '<pre class="line-numbers" data-line-start="42" data-highlight="1,3-5"><code>a\nb\nc\n</code></pre>'
const pre = document.querySelector('pre')
applyLineOptions(pre)
assert.deepEqual([...pre.querySelectorAll('.line')].map((line) => line.getAttribute('data-line-number')), ['42', '43', '44'])
assert.deepEqual([...pre.querySelectorAll('.highlighted-line')].map((line) => line.textContent), ['a', 'c'])
applyLineOptions(pre)
assert.equal(pre.querySelectorAll('.line').length, 3)

document.body.innerHTML = '<pre class="line-numbers"><code><span class="token">a\nb</span>\n<span class="other">c</span></code></pre>'
applyLineOptions(document.querySelector('pre'))
assert.deepEqual([...document.querySelectorAll('.line')].map((line) => line.textContent), ['a', 'b', 'c'])
assert.deepEqual([...document.querySelectorAll('.line .token')].map((token) => token.textContent), ['a', 'b'])
assert.equal(document.querySelector('.line .other').textContent, 'c')

document.body.innerHTML = '<figure><pre class="line-numbers" data-line-start="7" data-highlight="2"><code>x\ny\n</code></pre><figcaption>Sample</figcaption></figure>'
applyLineOptions(document.querySelector('figure pre'))
assert.equal(document.querySelector('figure .highlighted-line').getAttribute('data-line-number'), '8')

const attrs = { classes: ['line-numbers'], keyValues: [['data-line-start', '42'], ['data-highlight', '1,3-5']] }
const transformer = lineOptionsTransformer(attrs)
transformer.preprocess('a\nb\nc')
const context = { addClassToHast(node, name) { (node.properties.class ??= []).push(name) } }
const top = { properties: {} }
transformer.pre.call(context, top)
assert.ok(top.properties.class.includes('has-line-numbers'))
const lines = [1, 2, 3].map(() => ({ properties: {} }))
lines.forEach((line, i) => transformer.line.call(context, line, i + 1))
assert.deepEqual(lines.map((line) => line.properties.dataLineNumber), ['42', '43', '44'])
assert.deepEqual(lines.map((line) => line.properties.class?.includes('highlighted-line') ?? false), [true, false, true])

const mixed = lineOptionsTransformer({ classes: ['line-numbers'], keyValues: [['data-Line-Start', '7'], ['data-Highlight', '2']] })
mixed.preprocess('a\nb')
const mixedLine = { properties: {} }
mixed.line.call(context, mixedLine, 2)
assert.equal(mixedLine.properties.dataLineNumber, '8')
assert.ok(mixedLine.properties.class.includes('highlighted-line'))

const shiki = await createHighlighter({ themes: ['github-dark'], langs: ['js'] })
const output = shiki.codeToHtml('a\nb\nc', {
  lang: 'js', theme: 'github-dark', transformers: [lineOptionsTransformer(attrs)],
})
assert.match(output, /class="line highlighted-line" data-line-number="42"/)
assert.match(output, /data-line-number="43"/)
assert.match(output, /class="line highlighted-line" data-line-number="44"/)

console.log('code line options test passed')
