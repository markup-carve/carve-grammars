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
  // A non-ASCII space IS content: only spaces and tabs separate a marker from
  // it, so `#<space><NBSP>Title` is a heading. `(?=\S)` was tried as the
  // marker-requires-content guard and rejected this, because oniguruma counts
  // NBSP as whitespace; the guard is a line-end lookahead instead.
  ['heading whose content starts with NBSP', '# \u00a0Title', 'markup.heading', 'Title'],
  ['bullet whose content starts with NBSP', '- \u00a0item', 'list.unnumbered', '-'],
  // Inline
  ['italic', 'some /italic/ text', 'markup.italic', 'italic'],
  ['bold', 'some *bold* text', 'markup.bold', 'bold'],
  ['bold-italic', 'some /*both*/ text', 'markup.bold.italic', 'both'],
  ['underline', 'some _under_ text', 'markup.underline', 'under'],
  ['strike', 'some ~strike~ text', 'markup.strikethrough', 'strike'],
  // Sup/sub are braced-only: a bare `^` / `,` is literal text.
  ['superscript brace', 'mc{^2^} end', 'markup.superscript', '2'],
  ['superscript brace flanked', 'a {^sup^} end', 'markup.superscript', 'sup'],
  ['subscript brace', 'H{,2,}O', 'markup.subscript', '2'],
  ['subscript brace flanked', 'water {,sub,} here', 'markup.subscript', 'sub'],
  ['highlight bare', 'a =mark= b', 'markup.highlight', 'mark'],
  ['highlight brace', 'wo{=mark=}rd', 'markup.highlight', 'mark'],
  ['inline code', 'a `code` b', 'markup.raw.inline', 'code'],
  // Inline literal: !`...` renders as prose, so the content carries the raw
  // content scope and the `!` its own literal punctuation scope.
  ['inline literal', 'a !`/kaet/` b', 'markup.raw.inline.content', '/kaet/'],
  ['inline literal punct', 'a !`/kaet/` b', 'punctuation.definition.literal', '!'],
  // A wider fence carries an inner backtick; the span must close on the same
  // run length, not on the first backtick (literal_inline_multi).
  ['inline literal multi', 'a !``x ` y`` b', 'markup.raw.inline.content', 'x ` y'],
  ['inline literal multi punct', 'a !``x ` y`` b', 'punctuation.definition.literal', '!'],
  ['link text', '[text](https://x.de)', 'string.other.link.title', 'text'],
  ['link url', '[text](https://x.de)', 'markup.underline.link', 'https://x.de'],
  ['link punct', '[text](https://x.de)', 'punctuation.definition.link', '['],
  ['wiki link', '[Page Name][]', 'string.other.link.title', 'Page Name'],
  ['autolink', '<https://example.com>', 'markup.underline.link', 'https://example.com'],
  ['cross-ref', 'see </#section-id> here', 'markup.underline.link.cross-reference', 'section-id'],
  ['image', '![alt](img.jpg)', 'punctuation.definition.image', '!['],
  ['footnote ref', 'text[^1] end', 'constant.other.footnote', '1'],
  // Citations and code callouts (ported from the intellij-carve grammar, which
  // already covered them; the highlight.js grammar here did too, TextMate did not).
  ['citation key', 'see [@smith2020] here', 'variable.other.citation.key', 'smith2020'],
  ['citation integral', 'see [+@smith2020] here', 'keyword.operator.citation.integral', '+'],
  ['citation punct', 'see [@smith2020] here', 'punctuation.definition.citation', '['],
  ['callout annotation', '<1> explains the line', 'constant.numeric.callout', '1'],
  ['callout marker in fence', '``` js\nconst a = 1 <1>\n```', 'constant.numeric.callout', '1'],
  ['inline footnote', 'a ^[inline note] b', 'string.other.footnote.inline', 'inline note'],
  ['span attr', '[span]{.class}', 'attributes', '.class'],
  // Forced brace family (PART 9 S22). `{_x_}` must beat the attribute rule (a
  // bare boolean key is shape-identical), and the content may contain the
  // delimiter: `{/a/b/}` is <em>a/b</em>.
  ['forced bold', 'foo{*bar*}baz', 'markup.bold', 'bar'],
  ['forced italic', 'a{/b/}c', 'markup.italic', 'b'],
  ['forced underline', 'my{_path_}name', 'markup.underline', 'path'],
  ['forced strike', 'x{~gone~}y', 'markup.strikethrough', 'gone'],
  ['forced italic spanning its own delimiter', '{/a/b/}', 'markup.italic', 'a/b'],
  // Link titles admit an escaped quote; a `[^"]*` title run truncated at the
  // backslash and dropped link scoping for the whole construct (corpus 03-links-4).
  ['escaped-quote link title', '[t](/url "ti\\"tle")', 'markup.underline.link', '/url'],
  ['empty link title', '[x](u "")', 'markup.underline.link', 'u'],
  // A marker line may open several lists at once (corpus 103).
  ['nested list markers on one line', '- - A', 'punctuation.definition.list.unnumbered', '- '],
  // Every ordered marker the language accepts, not only `1.` (carve#472 added
  // the bare dot). `numbered_item` matched `\d+\.` alone, so `1)`, `a.`, `i.`
  // and `.` all rendered as prose.
  ['ordered marker decimal', '1. first', 'punctuation.definition.list.numbered', '1.'],
  ['ordered marker paren', '1) first', 'punctuation.definition.list.numbered', '1)'],
  ['ordered marker alpha', 'a. first', 'punctuation.definition.list.numbered', 'a.'],
  ['ordered marker roman', 'iv. fourth', 'punctuation.definition.list.numbered', 'iv.'],
  ['ordered marker bare dot', '. first', 'punctuation.definition.list.numbered', '.'],
  ['ordered marker bare dot with attrs', '.{#x} attributed', 'punctuation.definition.list.numbered', '.'],
  ['mention', 'hi @user here', 'mention', '@user'],
  ['tag', 'a #tagname here', 'tag', '#tagname'],
  ['symbol', 'Great :rocket: end', 'constant.language.symbol', 'rocket'],
  ['symbol punct', 'Great :rocket: end', 'punctuation.definition.symbol', ':'],
  ['symbol leading plus', 'Vote :+1: now', 'constant.language.symbol', '+1'],
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
  // The asterisk and underscore spellings are the same block (PART 9), but the
  // rule listed only the hyphen, so `***` colored as prose while `---` did not.
  ['thematic break asterisks', 'a\n\n***\n\nb', 'separator', '***'],
  ['thematic break underscores', 'a\n\n___\n\nb', 'separator', '___'],
  ['thematic break in a list item', '- item\n\n  ***', 'separator', '***'],
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
  // Indented inside a list item. Every one of these opens its real block
  // there (verified against carve-rs) and used to go uncolored, because the
  // rules were anchored at column 0 while `fenced_code` was not - the
  // asymmetry #71 is about. The cost of the fix is that the same constructs
  // indented at the TOP level, where they are literal text, now color as
  // blocks; a line-based grammar cannot separate the two cases.
  ['heading in a list item', '- item\n\n  # Title', 'heading', 'Title'],
  ['blockquote in a list item', '- item\n\n  > quoted', 'quote', 'quoted'],
  ['caption in a list item', '- item\n\n  | a |\n  ^ Attribution', 'caption', 'Attribution'],
  ['admonition in a list item', '- item\n\n  ::: note\n  body\n  :::', 'admonition', 'note'],
  ['table row in a list item', '- item\n\n  | a | b |', 'punctuation.separator.table', '|'],
  ['table continuation in a list item', '- item\n\n  | a |\n  + cont cell |', 'keyword.operator.table.continuation', '+'],
  ['abbreviation in a list item', '- item\n\n  *[HTML]: HyperText', 'abbreviation', 'HTML'],
  ['fenced code in a list item', '- item\n\n  ```js\n  x\n  ```', 'fenced_code', 'js'],
  ['ref def label', '[r]: https://ref.example', 'constant.other.reference.link', 'r'],
  ['ref def url', '[r]: https://ref.example', 'markup.underline.link', 'https://ref.example'],
  ['ref def title', '[r]: https://ref.example "Site"', 'string.quoted.link.title', 'Site'],
  ['frontmatter', '---\ntitle: Doc\n---\n\nText', 'frontmatter', 'title'],
  ['inline math', 'a $`e=mc^2` b', 'markup.math', 'e=mc^2'],
  ['display math', '$$`\\int_0^1 x`', 'markup.math', '\\int_0^1 x'],
  ['line comment', '%% comment line', 'comment', 'comment line'],
  ['trailing comment', 'text %% trailing', 'comment', 'trailing'],
  ['block comment', '%%%\nhidden\n%%%', 'comment', 'hidden'],
  // A %%% fence line is a delimiter plus an insignificant tail (PART 9 §28):
  // `%%% html` is a comment, not a raw passthrough block, and `%%% end` closes.
  ['block comment with a tail', '%%% html\nhidden\n%%% end', 'comment', 'hidden'],
]

const hl = await createHighlighter({
  themes: ['github-light'],
  langs: [{ ...grammar, name: 'carve' }],
})

let pass = 0
const fails = []
const allScopes = new Set()

// Every scope name the grammar declares, so a selector naming none of them is
// reported as a TYPO rather than silently passing.
//
// This matters most for NEGATIVE cases: "no token carries `list.begn`" is true
// of every document ever written, so a mistyped selector is a check that cannot
// fail. It has happened - a case here was written with another repo's scope
// name and asserted nothing until the grammar was reverted and CI stayed green.
const declaredScopes = new Set()
;(function collect(node) {
  if (Array.isArray(node)) return node.forEach(collect)
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if ((key === 'name' || key === 'contentName') && typeof value === 'string') declaredScopes.add(value)
      else collect(value)
    }
  }
})(grammar)

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
  // MARKER REQUIRES CONTENT. A marker alone on its line is prose - verified
  // against carve-rs, every one of these renders as a paragraph. The rules did
  // require a separator, but wrote it `\s+`, and `\s` matches the line's own
  // newline, so the requirement never bit (markup-carve/carve#513).
  ['bare heading marker', '#\n\nafter\n', 'markup.heading'],
  ['bare definition marker', '::\n\nafter\n', 'list.definition'],
  ['bare bullet', '-\n\nafter\n', 'list.unnumbered'],
  ['bare ordered marker', '1.\n\nafter\n', 'list.numbered'],
  ['bare dot marker', '.\n\nafter\n', 'list.numbered'],
  ['bare caption marker', '^\n\nafter\n', 'caption'],
  // Trailing whitespace is not content either: `# ` renders as `<p>#</p>`.
  ['heading marker, trailing space only', '# \n\nafter\n', 'markup.heading'],
  ['definition marker, trailing space only', ':: \n\nafter\n', 'list.definition'],
  ['bullet, trailing space only', '- \n\nafter\n', 'list.unnumbered'],
  ['ordered marker, trailing space only', '1. \n\nafter\n', 'list.numbered'],
  ['caption marker, trailing space only', '^ \n\nafter\n', 'caption'],
  // `- [ ] ` with no content is a plain bullet holding the literal `[ ]`, not a
  // task item - the checkbox never forms.
  ['empty task item is not a checkbox', '- [ ] \n\nafter\n', 'checkbox'],
  // A blockquote marker takes a SPACE, or stands alone on its line. Verified
  // against carve-rs: every one of these renders as a paragraph. `>>` is not a
  // nested marker (that is written `> > x`, a space per marker), and a TAB does
  // not separate. A `>+` run or a `\s` separator colored `>>= operator` and
  // `>=3 items` as quotes when the language calls them prose
  // (markup-carve/carve#525).
  ['no space after marker', '>no space', 'quote'],
  ['doubled marker without spaces', '>>x', 'quote'],
  ['doubled marker with one space', '>> x', 'quote'],
  ['tab does not separate', '>\tx', 'quote'],
  // A bracket whose `]` is followed by ( [ { is a link/ref-link/span, never a citation -
  // even when it contains an @. Without the suffix check in the citation `begin`, the
  // citation rule fired here and its `end` refused to close, running away over the line
  // and swallowing the link.
  ['link with @ is not a citation', '[contact @team](https://x.de)', 'citation'],
  ['@-only link is not a citation', '[@smith](https://x.de)', 'citation'],
  ['intraword bold literal', 'foo*bar*baz stays', 'markup.bold'],
  ['intraword strike literal', 'a~b~c stays', 'markup.strikethrough'],
  ['intraword super literal', 'foo^2^bar stays', 'markup.superscript'],
  ['intraword italic literal', 'a/b/c stays', 'markup.italic'],
  ['intraword sub literal', 'x,y,z stays', 'markup.subscript'],
  ['intraword highlight literal', 'key=value=x stays', 'markup.highlight'],
  ['unquoted fence title literal', '::: note Custom Title', 'meta.admonition'],
  // Trailing unquoted text after the type word makes the whole line an
  // ordinary paragraph - the opener is strict (fence, type, optional
  // `"title"`, optional `[label]`, nothing else). A rule that scoped
  // `::: name args` as a directive coloured that paragraph as though the
  // engine had understood it, which HIDES the author's mistake; the
  // strictness exists so a malformed opener stays visible. The admonition
  // check above did not catch it, because it fired under a different scope.
  ['unquoted fence args not a directive', '::: note extra text', 'extension.carve'],
  ['unquoted fence kwargs not a directive', '::: chart width=4', 'extension.carve'],
  ['unquoted fence args not a directive name', '::: note extra text', 'entity.name.function'],
  ['curly-quoted fence title literal', '::: tab “Overview”', 'meta.admonition'],
  ['fence trailing attrs literal', '::: note {#id}', 'meta.admonition'],
  // Strict attribute identifier (PART 9 S14): a digit-first key is not an
  // attribute block, it is literal text (corpus 122).
  ['digit-first attr key literal', '`x`{2=v}', 'meta.attributes'],
  ['empty attr block literal', 'a {} b', 'meta.attributes'],
  // A symbol only opens at a word boundary, so a colon glued to a word does
  // not; whitespace inside never tokenizes either.
  ['symbol after word literal', 'word:+1: stays', 'symbol.carve'],
  ['spaced colons literal', 'a : b : c stays', 'symbol.carve'],
  // A definition-list line must not read `:: term` as symbol punctuation
  ['def list not symbol', ':: term\n:  definition', 'symbol.carve'],
  // Citation defs stay citations, footnote defs stay footnotes
  ['citation not ref def', '[@k]: x', 'meta.link.reference.def'],
  ['footnote def not ref def', '[^f]: note body', 'meta.link.reference.def'],
]
let negPass = 0
const unknownSelectors = [
  ...CASES.map(([label, , scopeSub]) => [label, scopeSub, 'CASES']),
  ...NEGATIVE.map(([label, , badScope]) => [label, badScope, 'NEGATIVE']),
].filter(([, selector]) => ![...declaredScopes].some((name) => name.includes(selector)))

if (unknownSelectors.length) {
  console.log('\nSelectors matching no scope this grammar declares:')
  for (const [label, selector, list] of unknownSelectors) {
    console.log(`  ${list} "${label}": "${selector}"`)
  }
  console.log('A negative case with an unknown selector can never fail.')
  process.exit(1)
}
console.log(`  ✓ textmate sweep: every selector names a scope the grammar declares (${declaredScopes.size} known)`)

for (const [label, sample, badScope] of NEGATIVE) {
  const { tokens } = hl.codeToTokens(sample, { lang: 'carve', theme: 'github-light', includeExplanation: 'scopeName' })
  const scopes = tokens.flat().flatMap(tk => (tk.explanation ?? []).flatMap(e => e.scopes.map(s => s.scopeName)))
  if (scopes.some(s => s.includes(badScope))) {
    console.log(`FAIL(neg) ${label}: ${badScope} matched in "${sample}"`)
  } else { negPass++ }
}
console.log(`  ✓ textmate sweep: ${negPass}/${NEGATIVE.length} intraword-literal checks passed`)
if (negPass !== NEGATIVE.length) process.exit(1)

