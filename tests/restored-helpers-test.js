import assert from 'node:assert'
import { Window } from 'happy-dom'
import { applyLanguageDiff } from '@markup-carve/carve-grammars/diff'
import { renderDiagrams } from '@markup-carve/carve-grammars/diagrams'

const window = new Window()
const document = window.document

// The rendered text is marker plus body per line, so a repeated applyLanguageDiff sees the original source.
document.body.innerHTML = '<pre class="diff"><code class="language-js">- a(&lt;b&gt;)\n+ b()\n  c()\n</code></pre>'
const code = document.querySelector('code')
const upper = (body) => `<em>${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</em>`
applyLanguageDiff(code, upper)
const once = code.innerHTML
applyLanguageDiff(code, upper)
assert.strictEqual(code.innerHTML, once, 'a second pass is idempotent')

// New content set by the host is presented from that content.
code.textContent = '+ d()\n'
applyLanguageDiff(code)
assert.strictEqual(code.innerHTML, '<span class="line diff add"><span class="diff-marker">+</span> d()</span>')

// A class in the Kroki type map is rendered by Kroki only.
document.body.innerHTML = '<pre class="graphviz">digraph { a -> b }</pre><pre class="d2">x -> y</pre>'
const claimed = []
const count = await renderDiagrams(document.body, {
    graphviz: { load: async () => { claimed.push('viz'); return { renderString: () => '<svg/>' } } },
    d2: { load: async () => ({ compile: async () => ({ diagram: {}, renderOptions: {} }), render: async () => '<svg/>' }) },
    kroki: {
        types: { graphviz: 'graphviz' },
        fetch: async () => { claimed.push('kroki'); return { ok: true, text: async () => '<svg/>' } },
    },
})
assert.deepStrictEqual(claimed, ['kroki'], 'the offline Graphviz renderer leaves the Kroki-claimed block alone')
assert.strictEqual(count, 2, 'graphviz via Kroki plus d2 offline')
assert.strictEqual(document.querySelectorAll('pre').length, 0)

await window.happyDOM.close()
console.log('restored helpers test passed')
