import assert from 'node:assert'
import { renderLanguageDiff, applyLanguageDiff } from '@markup-carve/carve-grammars/diff'

const source = [
    '  let fileIcon = document.querySelector("li.file-entry > span.icon");',
    '- fileIcon.classList.add("icon-file-text");',
    '+ fileIcon.classList.remove("icon-file-text");',
    '',
].join('\n')

// Default highlighter escapes; markers become spans, added/removed lines classed.
const html = renderLanguageDiff(source)
assert.match(html, /<span class="line">/)
assert.match(html, /<span class="line diff remove">/)
assert.match(html, /<span class="line diff add">/)
assert.match(html, /<span class="diff-marker">-<\/span>/)
assert.match(html, /<span class="diff-marker">\+<\/span>/)
// HTML is escaped (the `>` in the selector becomes `&gt;`), and only the marker
// character is stripped - the space after it is part of the line body.
assert.match(html, /&gt; span\.icon/)
assert.match(html, /<span class="diff-marker">-<\/span> fileIcon\.classList\.add/)

// A trailing newline does not produce an empty final line.
assert.doesNotMatch(html, /\n<span class="line"><\/span>$/)

// A custom per-line highlighter receives the marker-stripped body.
const seen = []
const upper = (body) => {
    seen.push(body)
    return body.toUpperCase()
}
const custom = renderLanguageDiff('-a\n+b\n', upper)
assert.deepStrictEqual(seen, ['a', 'b'])
assert.match(custom, /<span class="line diff remove"><span class="diff-marker">-<\/span>A<\/span>/)

// applyLanguageDiff decorates a DOM-like <pre><code> and marks the <pre>.
const preClasses = new Set()
const pre = { classList: { add: (c) => preClasses.add(c) } }
const code = { parentElement: pre, textContent: '- x\n+ y\n', innerHTML: '' }
applyLanguageDiff(code)
assert.ok(preClasses.has('has-diff'))
assert.match(code.innerHTML, /<span class="line diff add">/)

console.log('language-diff helper test passed')
