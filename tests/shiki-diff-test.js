import assert from 'node:assert'
import { createHighlighter } from 'shiki'
import { diffCodeTransformer } from '../shiki/index.js'

const source = [
    '  let fileIcon = document.querySelector("li.file-entry > span.icon");',
    '- fileIcon.classList.add("icon-file-text");',
    '+ fileIcon.classList.remove("icon-file-text");',
    '',
].join('\n')

const highlighter = await createHighlighter({
    themes: ['github-light'],
    langs: ['javascript'],
})

try {
    const html = highlighter.codeToHtml(source, {
        lang: 'javascript',
        theme: 'github-light',
        transformers: [diffCodeTransformer()],
    })

    assert.match(html, /class="shiki github-light has-diff"/)
    assert.match(html, /class="line diff remove"/)
    assert.match(html, /class="line diff add"/)
    assert.match(html, /class="diff-marker">-<\/span>/)
    assert.match(html, /class="diff-marker">\+<\/span>/)
    assert.match(html, /style="color:[^"]+">querySelector<\/span>/)
} finally {
    highlighter.dispose()
}

// Factories must not share marker state between blocks.
assert.notStrictEqual(diffCodeTransformer(), diffCodeTransformer())

console.log('Shiki language-diff transformer test passed')
