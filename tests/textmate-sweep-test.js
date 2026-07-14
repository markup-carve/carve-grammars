/**
 * Full TextMate-grammar sweep: every cheatsheet construct must tokenize
 * with its expected scope (positive cases), and intraword bare delimiters
 * must stay literal (negative cases). Tokenized through Shiki.
 */
import { createHighlighter } from 'shiki'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const grammar = JSON.parse(readFileSync(resolve(__dirname, '../textmate/carve.tmLanguage.json'), 'utf8'))

// [label, sample, substring-of-expected-scope, token-text-that-should-carry-it]
const CASES = [
  // Inline
  ['italic', 'some /italic/ text', 'markup.italic', 'italic'],
  ['bold', 'some *bold* text', 'markup.bold', 'bold'],
  ['bold-italic', 'some /*both*/ text', 'markup.bold.italic', 'both'],
  ['underline', 'some _under_ text', 'markup.underline', 'under'],
  ['strike', 'some ~strike~ text', 'markup.strikethrough', 'strike'],
  ['superscript bare', 'a ^sup^ end', 'markup.superscript', 'sup'],
  ['superscript brace', 'mc{^2^} end', 'markup.superscript', '2'],
  ['subscript bare', 'water ,sub, here', 'markup.subscript', 'sub'],
  ['subscript brace', 'H{,2,}O', 'markup.subscript', '2'],
  ['highlight bare', 'a =mark= b', 'markup.highlight', 'mark'],
  ['highlight brace', 'wo{=mark=}rd', 'markup.highlight', 'mark'],
  ['inline code', 'a `code` b', 'markup.raw.inline', 'code'],
  ['link text', '[text](https://x.de)', 'string.other.link.title', 'text'],
  ['link url', '[text](https://x.de)', 'markup.underline.link', 'https://x.de'],
  ['link punct', '[text](https://x.de)', 'punctuation.definition.link', '['],
  ['wiki link', '[Page Name][]', 'string.other.link.title', 'Page Name'],
  ['autolink', '<https://example.com>', 'markup.underline.link', 'https://example.com'],
  ['cross-ref', 'see </#section-id> here', 'markup.underline.link.cross-reference', 'section-id'],
  ['image', '![alt](img.jpg)', 'punctuation.definition.image', '!['],
  ['footnote ref', 'text[^1] end', 'constant.other.footnote', '1'],
  ['inline footnote', 'a ^[inline note] b', 'string.other.footnote.inline', 'inline note'],
  ['span attr', '[span]{.class}', 'attributes', '.class'],
  ['mention', 'hi @user here', 'mention', '@user'],
  ['tag', 'a #tagname here', 'tag', '#tagname'],
  ['symbol', 'Great :rocket: end', 'constant.language.symbol', 'rocket'],
  ['symbol punct', 'Great :rocket: end', 'punctuation.definition.symbol', ':'],
  ['escape', 'a \\*literal\\* b', 'constant.character.escape', '\\*'],
  ['smart typography', 'a -- b', 'typography', '--'],
  ['hard break', 'line\\\n next', 'hard-break', '\\'],
  ['raw inline', 'a `<br>`{=html} b', 'raw', '<br>'],
  ['extension inline', ':youtube[ID]{.a}', 'extension', 'youtube'],
  ['critic add', 'a {+ins+} b', 'markup.inserted', 'ins'],
  ['critic del', 'a {-del-} b', 'markup.deleted', 'del'],
  ['critic sub', 'a {~old~>new~} b', 'markup.changed', 'old'],
  ['critic comment', 'a {#note#} b', 'comment', 'note'],
  // Blocks
  ['heading', '# Title', 'heading', 'Title'],
  ['thematic break', 'a\n\n---\n\nb', 'separator', '---'],
  ['ul marker', '- item', 'punctuation.definition.list', '-'],
  ['ol marker', '1. item', 'punctuation.definition.list', '1.'],
  ['task unchecked', '- [ ] todo', 'checkbox', '['],
  ['task checked', '- [x] done', 'constant.language.checkbox', 'x'],
  ['task more states', '- [>] deferred', 'constant.language.checkbox', '>'],
  ['list attr', '-{.c} styled', 'attributes', '.c'],
  ['plus attach', '- step\n+\n> note', 'list', '+'],
  ['def list term', ':: term\n:  definition', 'entity.name.tag.definition.term', 'term'],
  ['blockquote', '> quoted', 'quote', 'quoted'],
  ['caption', '> q\n^ Attribution', 'caption', 'Attribution'],
  ['fence open', '```php\ncode\n```', 'punctuation.definition.fenced', '```'],
  ['fence language', '```php\ncode\n```', 'fenced_code.block.language', 'php'],
  ['fence header', '```php "Header" [Label]\ncode\n```', 'string.quoted.double.fenced.title', 'Header'],
  ['fence raw html', '```=html\n<b>x</b>\n```', 'fenced_code.block.language', '=html'],
  ['admonition open', '::: note\nbody\n:::', 'admonition', 'note'],
  ['admonition custom', '::: myclass\nbody\n:::', 'admonition', 'myclass'],
  ['layout pipe', '::: |\nRoses\n:::', 'admonition', '|'],
  ['admonition title', '::: note "Custom Title"\nbody\n:::', 'string.quoted.double.admonition.title', 'Custom Title'],
  ['admonition title and label', '::: tip "Pro Tip" [Build]\nbody\n:::', 'constant.other.label.admonition', '[Build]'],
  ['admonition label only', '::: tab [Overview]\nbody\n:::', 'constant.other.label.admonition', '[Overview]'],
  ['typeless flush label', ':::[First]\nbody\n:::', 'constant.other.label.admonition', '[First]'],
  ['nested longer fence', ':::: tabs\nbody\n::::', 'admonition', 'tabs'],
  ['table header cell', '|= Name |= Age |', 'keyword.operator.table.header', '|='],
  ['table sep', '| a | b |', 'punctuation.separator.table', '|'],
  ['table align', '|=> Age |', 'keyword.operator.table.alignment', '>'],
  ['table rowspan', '| ^ | spanned |', 'keyword.operator.table.rowspan', '^'],
  ['table colspan', '| a | < |', 'keyword.operator.table.colspan', '<'],
  ['table continuation', '+ cont cell |', 'keyword.operator.table.continuation', '+'],
  ['gfm delimiter row', '| a | b |\n|---|--:|', 'keyword.operator.table.alignment', '--:'],
  ['block attrs line', '{#id .class key=value}\n# H', 'attributes', '#id'],
  ['abbreviation', '*[HTML]: HyperText', 'abbreviation', 'HTML'],
  ['ref def label', '[r]: https://ref.example', 'constant.other.reference.link', 'r'],
  ['ref def url', '[r]: https://ref.example', 'markup.underline.link', 'https://ref.example'],
  ['ref def title', '[r]: https://ref.example "Site"', 'string.quoted.link.title', 'Site'],
  ['frontmatter', '---\ntitle: Doc\n---\n\nText', 'frontmatter', 'title'],
  ['inline math', 'a $`e=mc^2` b', 'markup.math', 'e=mc^2'],
  ['display math', '$$`\\int_0^1 x`', 'markup.math', '\\int_0^1 x'],
  ['line comment', '%% comment line', 'comment', 'comment line'],
  ['trailing comment', 'text %% trailing', 'comment', 'trailing'],
  ['block comment', '%%%\nhidden\n%%%', 'comment', 'hidden'],
]

const hl = await createHighlighter({
  themes: ['github-light'],
  langs: [{ ...grammar, name: 'carve' }],
})

let pass = 0
const fails = []
const allScopes = new Set()

for (const [label, sample, scopeSub, text] of CASES) {
  const { tokens } = hl.codeToTokens(sample, {
    lang: 'carve',
    theme: 'github-light',
    includeExplanation: 'scopeName',
  })
  const flat = tokens.flat()
  let found = false
  for (const tk of flat) {
    const scopes = (tk.explanation ?? []).flatMap(e => e.scopes.map(s => s.scopeName))
    scopes.forEach(s => allScopes.add(s))
    if (scopes.some(s => s.includes(scopeSub)) && (text === '' || (tk.content ?? '').includes(text) || flat.some(t2 => (t2.content ?? '').includes(text) && ((t2.explanation ?? []).flatMap(e => e.scopes.map(s => s.scopeName))).some(s => s.includes(scopeSub))))) {
      found = true
      break
    }
  }
  if (found) { pass++ } else {
    // capture actual tokenization for diagnosis
    const dump = flat.map(tk => `${JSON.stringify(tk.content)}:${(tk.explanation ?? []).flatMap(e => e.scopes.map(s => s.scopeName)).filter(s => s !== 'source.carve').join(',')}`).join(' | ')
    fails.push(`FAIL ${label}  expected scope ~"${scopeSub}" on "${text}"\n   got: ${dump.slice(0, 400)}`)
  }
}

console.log(`  ✓ textmate sweep: ${pass}/${CASES.length} constructs tokenized as expected`)
fails.forEach(f => console.log(f + '\n'))
if (fails.length) process.exit(1)

// Negative cases: intraword bare delimiters must NOT tokenize as emphasis.
const NEGATIVE = [
  ['intraword bold literal', 'foo*bar*baz stays', 'markup.bold'],
  ['intraword strike literal', 'a~b~c stays', 'markup.strikethrough'],
  ['intraword super literal', 'foo^2^bar stays', 'markup.superscript'],
  ['intraword italic literal', 'a/b/c stays', 'markup.italic'],
  ['intraword sub literal', 'x,y,z stays', 'markup.subscript'],
  ['intraword highlight literal', 'key=value=x stays', 'markup.highlight'],
  ['unquoted fence title literal', '::: note Custom Title', 'meta.admonition'],
  ['curly-quoted fence title literal', '::: tab “Overview”', 'meta.admonition'],
  ['fence trailing attrs literal', '::: note {#id}', 'meta.admonition'],
  // Parser rejects a leading `+` in a symbol name and whitespace inside
  ['symbol leading plus literal', 'a :+1: b stays', 'symbol.carve'],
  ['spaced colons literal', 'a : b : c stays', 'symbol.carve'],
  // A definition-list line must not read `:: term` as symbol punctuation
  ['def list not symbol', ':: term\n:  definition', 'symbol.carve'],
  // Citation defs stay citations, footnote defs stay footnotes
  ['citation not ref def', '[@k]: x', 'meta.link.reference.def'],
  ['footnote def not ref def', '[^f]: note body', 'meta.link.reference.def'],
]
let negPass = 0
for (const [label, sample, badScope] of NEGATIVE) {
  const { tokens } = hl.codeToTokens(sample, { lang: 'carve', theme: 'github-light', includeExplanation: 'scopeName' })
  const scopes = tokens.flat().flatMap(tk => (tk.explanation ?? []).flatMap(e => e.scopes.map(s => s.scopeName)))
  if (scopes.some(s => s.includes(badScope))) {
    console.log(`FAIL(neg) ${label}: ${badScope} matched in "${sample}"`)
  } else { negPass++ }
}
console.log(`  ✓ textmate sweep: ${negPass}/${NEGATIVE.length} intraword-literal checks passed`)
if (negPass !== NEGATIVE.length) process.exit(1)

