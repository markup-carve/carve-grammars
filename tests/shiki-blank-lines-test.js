import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHighlighter } from 'shiki'
import { carveBlankLineTransformer, sourceForShiki } from '../shiki/themes.js'

const grammars = ['carve', 'carve2'].map(name => ({
    ...JSON.parse(readFileSync(new URL(`../textmate/${name}.tmLanguage.json`, import.meta.url), 'utf8')),
    name,
}))
const highlighter = await createHighlighter({ themes: ['github-light'], langs: grammars })

function scopes(source, lang) {
    return highlighter.codeToTokens(sourceForShiki(source), {
        lang, theme: 'github-light', includeExplanation: true,
    }).tokens.flatMap(line => line.flatMap(token =>
        (token.explanation ?? []).flatMap(entry => entry.scopes.map(scope => scope.scopeName))))
}

for (const lang of ['carve', 'carve2']) {
    const heading = lang === 'carve2' ? '= Heading' : '# Heading'
    for (const [block, scope] of [
        [heading, 'markup.heading.carve'],
        ['- [x] done', 'punctuation.definition.checkbox.carve'],
        ['- item', 'punctuation.definition.list.unnumbered.carve'],
        ['> quote', 'markup.quote.carve'],
    ]) {
        const separated = `Paragraph.\n\n${block}\n`
        assert.ok(scopes(separated, lang).includes(scope), `${lang}: ${block} after blank line`)
        const html = highlighter.codeToHtml(separated, {
            lang, theme: 'github-light', transformers: [carveBlankLineTransformer],
        })
        assert.match(html, /<span class="line"><\/span>/, `${lang}: blank line stays empty in HTML`)
    }
    if (lang === 'carve2') {
        assert.ok(!scopes(`Paragraph.\n${heading}\n`, lang).includes('markup.heading.carve'),
            `${lang}: heading without separator stays paragraph text`)
    }
}

assert.equal(sourceForShiki('a\r\n\r\n- b\n'), 'a\r\n \r\n- b\n ')
console.log('Shiki blank-line state: 0.1 and 0.2 block scopes passed')
