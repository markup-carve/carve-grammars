import assert from 'node:assert'
import { createHighlighter } from 'shiki'
import { diffCodeTransformer } from '@markup-carve/carve-grammars/shiki/diff'

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

    // The marker is REMOVED before the language grammar runs. Leaving it in
    // place still produced every class and every marker span asserted above,
    // so the suite stayed green while each changed line rendered its marker
    // twice and tokenized `- fileIcon` as a unary minus.
    assert.doesNotMatch(
        html, /class="line[^"]*"><span class="diff-marker">[-+]<\/span><span[^>]*>[-+]/,
        'a changed line still starts with the marker the transformer should have stripped',
    )
} finally {
    highlighter.dispose()
}

// A factory captures its OWN block's markers. Comparing two fresh objects for
// reference inequality could not fail, so nothing checked that.
{
    const first = diffCodeTransformer()
    const second = diffCodeTransformer()
    first.preprocess('- only in the first\n')
    second.preprocess('no markers here\n')
    const node = { children: [] }
    const classes = []
    second.line.call({ addClassToHast: (_n, cls) => classes.push(cls) }, node, 1)
    assert.deepStrictEqual(classes, [], "the second transformer replayed the first block's markers")
    assert.deepStrictEqual(node.children, [], 'the second transformer wrote a marker span for an unmarked line')
}

console.log('Shiki language-diff transformer test passed')
