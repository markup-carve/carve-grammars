import assert from 'node:assert'
import { Window } from 'happy-dom'
import {
    renderLanguageDiff,
    applyLanguageDiff,
    findDiffFences,
    isDiffFence,
    isDiffCodeBlock,
    DIFF_FENCE_SELECTOR,
} from '@markup-carve/carve-grammars/diff'

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

// A captioned fence carries `.diff` on its figure; both shapes are found, in order.
const { document } = new Window({ url: 'http://localhost/' })
document.body.innerHTML = [
    '<pre class="diff"><code id="a" class="language-js">-a</code></pre>',
    '<figure id="lst" class="diff"><pre><code id="b" class="language-php">+b</code></pre><figcaption>Listing 1</figcaption></figure>',
    '<figure class="diffs"><pre><code id="c">-c</code></pre></figure>',
    '<pre class="side-diff"><code id="d">-d</code></pre>',
    '<figure class="diff"><blockquote><p>q</p></blockquote></figure>',
    '<figure class="scroll"><pre class="diff"><code id="e">+e</code></pre></figure>',
].join('')
assert.deepStrictEqual(findDiffFences(document).map((el) => el.id), ['a', 'b', 'e'])
assert.strictEqual(document.querySelectorAll(DIFF_FENCE_SELECTOR).length, 3)
const preOf = (id) => document.getElementById(id).parentElement
assert.ok(isDiffFence(preOf('a')))
assert.ok(isDiffFence(preOf('b')))
assert.ok(!isDiffFence(preOf('c')))
assert.ok(!isDiffFence(preOf('d')))
assert.ok(!isDiffFence(null))
assert.ok(!isDiffFence(document.querySelector('figure')))

// applyLanguageDiff marks the <pre> of a captioned fence too, which carve-diff.css keys on.
applyLanguageDiff(document.getElementById('b'))
assert.ok(preOf('b').classList.contains('has-diff'))

// AST: the class sits on the code block, or on its figure when captioned.
const bare = { type: 'code_block', lang: 'js', attrs: { classes: ['diff'] } }
const target = { type: 'code_block', lang: 'php' }
const figure = { type: 'figure', target, attrs: { id: 'lst', classes: ['diff', 'playground'] } }
assert.ok(isDiffCodeBlock(bare))
assert.ok(isDiffCodeBlock(target, figure))
assert.ok(!isDiffCodeBlock(target))
assert.ok(!isDiffCodeBlock(target, { ...figure, attrs: { classes: ['playground'] } }))
assert.ok(!isDiffCodeBlock({ type: 'code_block' }, figure))
assert.ok(!isDiffCodeBlock(figure))
assert.ok(!isDiffCodeBlock({ type: 'code_block', attrs: { classes: ['side-diff'] } }))

console.log('language-diff helper test passed')
