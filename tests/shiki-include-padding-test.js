import assert from 'node:assert'
import { createHighlighter } from './lib/shiki.js'
import { carveGrammar, carveLightTheme, carveDarkTheme, carveStylingTransformer } from '../shiki/index.js'

const highlighter = await createHighlighter({
    themes: [carveLightTheme, carveDarkTheme],
    langs: [carveGrammar],
})

try {
    for (const lang of ['carve', 'crv', 'Carve']) {
        const html = highlighter.codeToHtml('{{ chapters/introduction.crv }}', {
            lang,
            themes: { light: 'github-light', dark: 'github-dark' },
            transformers: [carveStylingTransformer],
        })
        const path = html.match(/<span style="[^"]*text-decoration:underline[^"]*">([^<]*)<\/span>/)
        assert.strictEqual(path?.[1], 'chapters/introduction.crv', lang)
        assert.match(html, /\{\{<\/span><span[^>]*> <\/span><span[^>]*>chapters\/introduction\.crv<\/span>/)
    }
} finally {
    highlighter.dispose()
}
