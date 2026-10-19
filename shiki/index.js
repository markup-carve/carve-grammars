/**
 * Shared Shiki setup for Carve documentation sites.
 *
 * One import gives a docs site the same Carve highlighting everywhere:
 * the TextMate grammar, GitHub-theme scope extras for Carve-specific
 * scopes, and the transformer + CSS that bridge what Shiki's HTML
 * emitter cannot express (strikethrough, sub/superscript positioning,
 * highlight background).
 *
 * VitePress usage:
 *
 *   // .vitepress/config.ts
 *   import { carveMarkdown } from '@markup-carve/carve-grammars/shiki'
 *   export default defineConfig({
 *     markdown: { ...carveMarkdown() },
 *   })
 *
 *   // .vitepress/theme/index.ts
 *   import '@markup-carve/carve-grammars/shiki/carve.css'
 */
import { createRequire } from 'node:module'
import githubLight from '@shikijs/themes/github-light'
import githubDark from '@shikijs/themes/github-dark'
import { carveLightExtras, carveDarkExtras, extendTheme, carveStylingTransformer } from './themes.js'

const require = createRequire(import.meta.url)

/**
 * The Carve TextMate grammar, ready for Shiki's `languages` array.
 *
 * The alias list carries the shared fence words every surface of this package
 * answers - `carve` and the canonical extension `crv` (tests/lib/aliases.js) -
 * plus `Carve`. That capitalized spelling is meaningful HERE and nowhere else:
 * Shiki matches a language name by exact string, so the casing variant is a
 * distinct, reachable alias, while Prism and highlight.js both lowercase
 * before they look anything up.
 */
export const carveGrammar = {
    ...require('../textmate/carve.tmLanguage.json'),
    name: 'carve',
    aliases: ['crv', 'Carve'],
}
export const carveCsvGrammar = { ...require('../textmate/csv.tmLanguage.json'), name: 'carve-csv' }
export const carveTsvGrammar = { ...require('../textmate/tsv.tmLanguage.json'), name: 'carve-tsv' }

export {
    carveLightExtras,
    carveDarkExtras,
    extendTheme,
    carveLightTheme,
    carveDarkTheme,
    carveStylingTransformer,
} from './themes.js'
export { diffCodeTransformer } from './diff.js'

/**
 * Everything a VitePress `markdown` config needs, in one spreadable
 * object: the Carve grammar, the extended dual themes and the styling
 * transformer.
 *
 * @param {object} [options]
 * @param {object} [options.light] Base light theme (default: github-light)
 * @param {object} [options.dark] Base dark theme (default: github-dark)
 * @param {Array}  [options.languages] Additional grammars to register
 */
export function carveMarkdown(options = {}) {
    const light = extendTheme(options.light ?? githubLight, carveLightExtras)
    const dark = extendTheme(options.dark ?? githubDark, carveDarkExtras)

    return {
        languages: [carveGrammar, carveCsvGrammar, carveTsvGrammar, ...(options.languages ?? [])],
        theme: { light, dark },
        codeTransformers: [carveStylingTransformer],
    }
}
