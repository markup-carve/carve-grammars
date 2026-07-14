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
 *   import { carveMarkdown } from 'carve-grammars/shiki'
 *   export default defineConfig({
 *     markdown: { ...carveMarkdown() },
 *   })
 *
 *   // .vitepress/theme/index.ts
 *   import 'carve-grammars/shiki/carve.css'
 */
import { createRequire } from 'node:module'
import githubLight from '@shikijs/themes/github-light'
import githubDark from '@shikijs/themes/github-dark'

const require = createRequire(import.meta.url)

/** The Carve TextMate grammar, ready for Shiki's `languages` array. */
export const carveGrammar = {
    ...require('../textmate/carve.tmLanguage.json'),
    name: 'carve',
    aliases: ['crv', 'Carve'],
}

/**
 * Token-color rules for Carve scopes the stock GitHub themes do not
 * style: highlight, sub/superscript, code fences, lists and checkboxes,
 * tables, admonitions, captions, attributes, mentions/tags,
 * abbreviations, links and math.
 */
export const carveLightExtras = [
    { scope: 'markup.bold.italic', settings: { foreground: '#24292e', fontStyle: 'italic bold' } },
    { scope: 'markup.highlight', settings: { foreground: '#b08800', fontStyle: 'bold' } },
    { scope: 'markup.superscript', settings: { foreground: '#6f42c1' } },
    { scope: 'markup.subscript', settings: { foreground: '#6f42c1' } },
    { scope: 'markup.raw.inline', settings: { foreground: '#005cc5' } },
    { scope: 'markup.raw.code', settings: { foreground: '#6a737d' } },
    { scope: 'fenced_code.block.language', settings: { foreground: '#22863a', fontStyle: 'bold' } },
    { scope: 'punctuation.definition.fenced', settings: { foreground: '#959da5' } },
    { scope: 'punctuation.definition.raw', settings: { foreground: '#959da5' } },
    { scope: ['punctuation.definition.list.unnumbered', 'punctuation.definition.list.numbered', 'punctuation.definition.list'], settings: { foreground: '#d73a49', fontStyle: 'bold' } },
    { scope: 'punctuation.definition.checkbox', settings: { foreground: '#959da5' } },
    { scope: 'constant.language.checkbox', settings: { foreground: '#22863a', fontStyle: 'bold' } },
    { scope: 'keyword.operator.table.header', settings: { foreground: '#d73a49', fontStyle: 'bold' } },
    { scope: ['keyword.operator.table.rowspan', 'keyword.operator.table.colspan', 'keyword.operator.table.continuation'], settings: { foreground: '#e36209', fontStyle: 'bold' } },
    { scope: 'keyword.operator.table.alignment', settings: { foreground: '#e36209' } },
    { scope: 'punctuation.separator.table', settings: { foreground: '#959da5' } },
    { scope: 'punctuation.definition.admonition', settings: { foreground: '#d73a49', fontStyle: 'bold' } },
    { scope: 'entity.name.tag.admonition', settings: { foreground: '#22863a', fontStyle: 'bold' } },
    { scope: 'string.unquoted.admonition.title', settings: { foreground: '#032f62' } },
    { scope: 'punctuation.definition.caption', settings: { foreground: '#e36209', fontStyle: 'bold' } },
    { scope: 'markup.caption', settings: { foreground: '#6a737d', fontStyle: 'italic' } },
    { scope: 'meta.attributes', settings: { foreground: '#e36209' } },
    { scope: 'punctuation.definition.attributes', settings: { foreground: '#959da5' } },
    { scope: 'punctuation.definition.mention', settings: { foreground: '#d73a49' } },
    { scope: 'variable.other.mention', settings: { foreground: '#d73a49', fontStyle: 'bold' } },
    { scope: 'punctuation.definition.tag', settings: { foreground: '#22863a' } },
    { scope: 'variable.other.tag', settings: { foreground: '#22863a', fontStyle: 'bold' } },
    { scope: 'punctuation.definition.symbol', settings: { foreground: '#959da5' } },
    { scope: 'constant.language.symbol', settings: { foreground: '#e36209', fontStyle: 'bold' } },
    { scope: 'entity.name.abbreviation', settings: { foreground: '#005cc5', fontStyle: 'bold' } },
    { scope: 'string.unquoted.abbreviation', settings: { foreground: '#6a737d', fontStyle: 'italic' } },
    { scope: ['punctuation.definition.link', 'punctuation.definition.image'], settings: { foreground: '#d73a49' } },
    { scope: ['string.other.link.title', 'string.other.link.description', 'string.other.image.alt'], settings: { foreground: '#005cc5' } },
    { scope: 'markup.underline.link', settings: { foreground: '#032f62', fontStyle: 'underline' } },
    { scope: 'constant.other.reference.link', settings: { foreground: '#005cc5', fontStyle: 'bold' } },
    { scope: 'markup.math', settings: { foreground: '#6f42c1' } },
    { scope: 'punctuation.definition.math', settings: { foreground: '#959da5' } },
    // Inline emphasis delimiters recede like code backticks: the content
    // already carries the styling (bold, italic, raised, lowered, marked).
    { scope: ['punctuation.definition.bold', 'punctuation.definition.italic', 'punctuation.definition.bold-italic', 'punctuation.definition.underline', 'punctuation.definition.strike', 'punctuation.definition.superscript', 'punctuation.definition.subscript', 'punctuation.definition.highlight'], settings: { foreground: '#959da5' } },
]

export const carveDarkExtras = [
    { scope: 'markup.bold.italic', settings: { foreground: '#e1e4e8', fontStyle: 'italic bold' } },
    { scope: 'markup.highlight', settings: { foreground: '#ffd33d', fontStyle: 'bold' } },
    { scope: 'markup.superscript', settings: { foreground: '#b392f0' } },
    { scope: 'markup.subscript', settings: { foreground: '#b392f0' } },
    { scope: 'markup.raw.inline', settings: { foreground: '#79b8ff' } },
    { scope: 'markup.raw.code', settings: { foreground: '#959da5' } },
    { scope: 'fenced_code.block.language', settings: { foreground: '#85e89d', fontStyle: 'bold' } },
    { scope: 'punctuation.definition.fenced', settings: { foreground: '#6a737d' } },
    { scope: 'punctuation.definition.raw', settings: { foreground: '#6a737d' } },
    { scope: ['punctuation.definition.list.unnumbered', 'punctuation.definition.list.numbered', 'punctuation.definition.list'], settings: { foreground: '#f97583', fontStyle: 'bold' } },
    { scope: 'punctuation.definition.checkbox', settings: { foreground: '#6a737d' } },
    { scope: 'constant.language.checkbox', settings: { foreground: '#85e89d', fontStyle: 'bold' } },
    { scope: 'keyword.operator.table.header', settings: { foreground: '#f97583', fontStyle: 'bold' } },
    { scope: ['keyword.operator.table.rowspan', 'keyword.operator.table.colspan', 'keyword.operator.table.continuation'], settings: { foreground: '#ffab70', fontStyle: 'bold' } },
    { scope: 'keyword.operator.table.alignment', settings: { foreground: '#ffab70' } },
    { scope: 'punctuation.separator.table', settings: { foreground: '#6a737d' } },
    { scope: 'punctuation.definition.admonition', settings: { foreground: '#f97583', fontStyle: 'bold' } },
    { scope: 'entity.name.tag.admonition', settings: { foreground: '#85e89d', fontStyle: 'bold' } },
    { scope: 'string.unquoted.admonition.title', settings: { foreground: '#79b8ff' } },
    { scope: 'punctuation.definition.caption', settings: { foreground: '#ffab70', fontStyle: 'bold' } },
    { scope: 'markup.caption', settings: { foreground: '#959da5', fontStyle: 'italic' } },
    { scope: 'meta.attributes', settings: { foreground: '#ffab70' } },
    { scope: 'punctuation.definition.attributes', settings: { foreground: '#6a737d' } },
    { scope: 'punctuation.definition.mention', settings: { foreground: '#f97583' } },
    { scope: 'variable.other.mention', settings: { foreground: '#f97583', fontStyle: 'bold' } },
    { scope: 'punctuation.definition.tag', settings: { foreground: '#85e89d' } },
    { scope: 'variable.other.tag', settings: { foreground: '#85e89d', fontStyle: 'bold' } },
    { scope: 'punctuation.definition.symbol', settings: { foreground: '#6a737d' } },
    { scope: 'constant.language.symbol', settings: { foreground: '#ffab70', fontStyle: 'bold' } },
    { scope: 'entity.name.abbreviation', settings: { foreground: '#79b8ff', fontStyle: 'bold' } },
    { scope: 'string.unquoted.abbreviation', settings: { foreground: '#959da5', fontStyle: 'italic' } },
    { scope: ['punctuation.definition.link', 'punctuation.definition.image'], settings: { foreground: '#f97583' } },
    { scope: ['string.other.link.title', 'string.other.link.description', 'string.other.image.alt'], settings: { foreground: '#79b8ff' } },
    { scope: 'markup.underline.link', settings: { foreground: '#9ecbff', fontStyle: 'underline' } },
    { scope: 'constant.other.reference.link', settings: { foreground: '#79b8ff', fontStyle: 'bold' } },
    { scope: 'markup.math', settings: { foreground: '#b392f0' } },
    { scope: 'punctuation.definition.math', settings: { foreground: '#6a737d' } },
    { scope: ['punctuation.definition.bold', 'punctuation.definition.italic', 'punctuation.definition.bold-italic', 'punctuation.definition.underline', 'punctuation.definition.strike', 'punctuation.definition.superscript', 'punctuation.definition.subscript', 'punctuation.definition.highlight'], settings: { foreground: '#6a737d' } },
]

/** Extend any Shiki theme object with extra token-color rules. */
export function extendTheme(theme, extras) {
    return { ...theme, tokenColors: [...(theme.tokenColors ?? []), ...extras] }
}

/** GitHub themes pre-extended with the Carve scope rules. */
export const carveLightTheme = extendTheme(githubLight, carveLightExtras)
export const carveDarkTheme = extendTheme(githubDark, carveDarkExtras)

const FontStyle = { Italic: 1, Bold: 2, Underline: 4, Strikethrough: 8 }

/**
 * Shiki code transformer that tags tokens the HTML emitter cannot style
 * directly. Pair with `carve-grammars/shiki/carve.css`, which styles the
 * emitted `data-carve-*` attributes.
 */
export const carveStylingTransformer = {
    name: 'carve-extras',
    preprocess(_code, options) {
        options.includeExplanation = 'scopeName'
    },
    tokens(tokens) {
        for (const line of tokens) {
            for (const tk of line) {
                const scopes = tk.explanation?.flatMap((e) =>
                    e.scopes.map((s) => s.scopeName),
                ) ?? []
                const hasScope = (prefix) => scopes.some((s) => s.startsWith(prefix))

                const mark = (attr) => {
                    if (!tk.htmlAttrs) tk.htmlAttrs = {}
                    tk.htmlAttrs[attr] = ''
                }

                if ((tk.fontStyle ?? 0) & FontStyle.Strikethrough || hasScope('markup.strikethrough')) {
                    mark('data-carve-strike')
                }
                if (hasScope('markup.superscript')) mark('data-carve-super')
                if (hasScope('markup.subscript')) mark('data-carve-sub')
                if (hasScope('markup.highlight')) mark('data-carve-highlight')
            }
        }
    },
}

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
        languages: [carveGrammar, ...(options.languages ?? [])],
        theme: { light, dark },
        codeTransformers: [carveStylingTransformer],
    }
}
