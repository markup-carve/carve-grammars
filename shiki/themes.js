/**
 * Carve theme rules and the styling transformer, with no Node.js imports, so a
 * browser bundle (an in-page playground highlighter) can use the same colors as
 * `carveMarkdown()`. `./index.js` re-exports everything here.
 */
import githubLight from '@shikijs/themes/github-light'
import githubDark from '@shikijs/themes/github-dark'

/**
 * Token-color rules for Carve scopes the stock GitHub themes do not
 * style: highlight, sub/superscript, code fences, lists and checkboxes,
 * tables, admonitions, captions, attributes, mentions/tags, citations,
 * abbreviations, links, math, raw formats and structural punctuation.
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
    { scope: 'punctuation.definition.list.continuation', settings: { foreground: '#8250df', fontStyle: 'bold' } },
    { scope: 'punctuation.definition.checkbox', settings: { foreground: '#959da5' } },
    { scope: 'constant.language.checkbox', settings: { foreground: '#22863a', fontStyle: 'bold' } },
    // Table markers by meaning: header blue, alignment orange, spans purple,
    // continuation green, and separators gray.
    { scope: 'keyword.operator.table.header', settings: { foreground: '#005cc5', fontStyle: 'bold' } },
    { scope: ['keyword.operator.table.rowspan', 'keyword.operator.table.colspan'], settings: { foreground: '#6f42c1', fontStyle: 'bold' } },
    { scope: 'keyword.operator.table.continuation', settings: { foreground: '#22863a', fontStyle: 'bold' } },
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
    // Structural punctuation recedes too; the content it delimits carries the color.
    // Shared names are qualified with `.carve` so embedded languages keep their own colors.
    { scope: ['punctuation.definition.footnote', 'punctuation.definition.span', 'punctuation.definition.abbreviation', 'punctuation.separator.carve', 'punctuation.separator.citation', 'punctuation.separator.include', 'punctuation.definition.directive.begin.carve', 'punctuation.definition.directive.end.carve', 'punctuation.definition.extension', 'punctuation.definition.citation', 'punctuation.definition.literal', 'punctuation.definition.callout', 'punctuation.definition.label.carve', 'punctuation.definition.frontmatter'], settings: { foreground: '#959da5' } },
    // A figure group is a container fence, colored like an admonition's.
    { scope: 'punctuation.definition.figure-group', settings: { foreground: '#d73a49', fontStyle: 'bold' } },
    { scope: 'entity.name.tag.figure-group', settings: { foreground: '#22863a', fontStyle: 'bold' } },
    // A citation key resolves against the bibliography the way a reference label resolves against its definition.
    { scope: 'variable.other.citation.key', settings: { foreground: '#005cc5', fontStyle: 'bold' } },
    // A raw format names the output language, like a fence's language word.
    { scope: 'constant.other.raw.format', settings: { foreground: '#22863a', fontStyle: 'bold' } },
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
    { scope: 'punctuation.definition.list.continuation', settings: { foreground: '#d2a8ff', fontStyle: 'bold' } },
    { scope: 'punctuation.definition.checkbox', settings: { foreground: '#6a737d' } },
    { scope: 'constant.language.checkbox', settings: { foreground: '#85e89d', fontStyle: 'bold' } },
    { scope: 'keyword.operator.table.header', settings: { foreground: '#79b8ff', fontStyle: 'bold' } },
    { scope: ['keyword.operator.table.rowspan', 'keyword.operator.table.colspan'], settings: { foreground: '#b392f0', fontStyle: 'bold' } },
    { scope: 'keyword.operator.table.continuation', settings: { foreground: '#85e89d', fontStyle: 'bold' } },
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
    { scope: ['punctuation.definition.footnote', 'punctuation.definition.span', 'punctuation.definition.abbreviation', 'punctuation.separator.carve', 'punctuation.separator.citation', 'punctuation.separator.include', 'punctuation.definition.directive.begin.carve', 'punctuation.definition.directive.end.carve', 'punctuation.definition.extension', 'punctuation.definition.citation', 'punctuation.definition.literal', 'punctuation.definition.callout', 'punctuation.definition.label.carve', 'punctuation.definition.frontmatter'], settings: { foreground: '#6a737d' } },
    { scope: 'punctuation.definition.figure-group', settings: { foreground: '#f97583', fontStyle: 'bold' } },
    { scope: 'entity.name.tag.figure-group', settings: { foreground: '#85e89d', fontStyle: 'bold' } },
    { scope: 'variable.other.citation.key', settings: { foreground: '#79b8ff', fontStyle: 'bold' } },
    { scope: 'constant.other.raw.format', settings: { foreground: '#85e89d', fontStyle: 'bold' } },
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
 * directly. Pair with `@markup-carve/carve-grammars/shiki/carve.css`, which styles the
 * emitted `data-carve-*` attributes.
 */
export const carveStylingTransformer = {
    name: 'carve-extras',
    preprocess(_code, options) {
        options.includeExplanation = 'scopeName'
        // Keep plain directive padding outside the underlined include path.
        if (['carve', 'crv'].includes(options.lang?.toLowerCase()) && options.mergeWhitespaces === undefined) {
            options.mergeWhitespaces = false
        }
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
