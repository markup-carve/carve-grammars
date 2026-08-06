/**
 * Full TextMate-grammar sweep: every construct must tokenize with its expected
 * scope (positive cases), and intraword bare delimiters must stay literal
 * (negative cases). Tokenized through Shiki.
 *
 * The positive cases are NOT a list of their own: they come from
 * `tests/lib/constructs.js`, the same inventory `tests/engine-sweep-test.js`
 * consumes. Two hand-maintained lists is how a construct ends up covered in
 * one sweep and absent from the other - the state that let every block rule in
 * Prism and highlight.js stay anchored at column zero while this sweep, which
 * carried the in-list-item cases, reported them green.
 *
 * What differs per sweep is the assertion, not the case list: here the payload
 * must carry the scope the entry NAMES, because a TextMate scope name is a
 * contract with every consumer of the grammar. The engine sweep only asks
 * whether the payload is scoped at all, since Prism and highlight.js use
 * different vocabularies.
 */
import { createHighlighter } from 'shiki'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { CONSTRUCTS, LITERALS, assertInventory } from './lib/constructs.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const grammar = JSON.parse(readFileSync(resolve(__dirname, '../textmate/carve.tmLanguage.json'), 'utf8'))

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

const positives = CONSTRUCTS.filter(c => !c.skip?.textmate)
const skipped = CONSTRUCTS.filter(c => c.skip?.textmate)
assertInventory('textmate sweep', positives.length)

for (const { name, sample, payload, textmate } of positives) {
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
    if ((tk.content ?? '').includes(payload) && scopes.some(s => s.includes(textmate))) {
      found = true
      break
    }
  }
  if (found) { pass++ } else {
    // capture actual tokenization for diagnosis
    const dump = flat.map(tk => `${JSON.stringify(tk.content)}:${(tk.explanation ?? []).flatMap(e => e.scopes.map(s => s.scopeName)).filter(s => s !== 'source.carve').join(',')}`).join(' | ')
    fails.push(`FAIL ${name}  expected scope ~"${textmate}" on "${payload}"\n   got: ${dump.slice(0, 400)}`)
  }
}

console.log(`  ${fails.length ? '✗' : '✓'} textmate sweep: ${pass}/${positives.length} constructs tokenized as expected`)
// A skip is a decision, so it is reported every run rather than quietly
// shrinking the denominator.
for (const c of skipped) console.log(`    - skipped ${c.name}: ${c.skip.textmate}`)
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
  // COLUMN SENSITIVITY. A definition line that sits below EVERY open content
  // column opens nothing and defines nothing - it is item text (PART 9 §24 C3,
  // corpus 183-a-definition-below-every-content-column-folds-as-text). Here the
  // sub-item's content column is 4 and the line is indented 1, so it is text.
  //
  // The assertion is deliberately on `meta.link.reference.def` and NOT on the
  // reference name's own scope: the line is still text CONTAINING a reference,
  // and `constant.other.reference.link` on it is correct. Only the definition
  // wrapper is wrong. Asserting the broader scope would have pinned the wrong
  // answer - a text line may legitimately carry a reference.
  ['def below every content column is text', '- - a\n [r]: /u\n', 'meta.link.reference.def'],
  // The content column is the marker's ACTUAL width, not a fixed two columns.
  // Verified against carve-php: in both of these the reference stays literal
  // (`see [t][r]`), so no definition was collected and the line is item text.
  ['def below a wide bullet content column is text', '-   a\n  [r]: /u\n', 'meta.link.reference.def'],
  ['def below an ordered content column is text', '10. a\n  [r]: /u\n', 'meta.link.reference.def'],
  // The same column rule for a HEADING, which the corpus pins directly:
  // `178-a-flush-left-line-needs-an-open-paragraph-to-fold-into-6` renders
  // ` # H` below the nested item's content column as item TEXT. This grammar
  // coloured it a heading until `#heading` was anchored at column 0 and
  // `#heading_in_container` took over inside a container (carve-grammars#138).
  //
  // The positive half of the pair is in `constructs.js`: `heading` (column 0)
  // and `heading in a list item` (at the item's content column). A rule that
  // stopped matching everywhere would pass these negatives and fail those two,
  // which is what makes the pair a pair.
  ['heading below a nested content column is text', '- x\n  - a\n # H\n', 'markup.heading'],
  ['heading indented at document level is text', ' # H\n', 'markup.heading'],
]
let negPass = 0
const unknownSelectors = [
  ...positives.map(({ name, textmate }) => [name, textmate, 'CONSTRUCTS']),
  ...LITERALS.map(({ name, scopes }) => [name, scopes.textmate, 'LITERALS']),
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

// The shared counter-examples. Unlike NEGATIVE above, which is about scope
// names this grammar alone declares, these shapes are prose in every grammar,
// so all three sweeps assert them from the one inventory.
let litPass = 0
for (const { name, sample, payload, scopes } of LITERALS) {
  const { tokens } = hl.codeToTokens(sample, { lang: 'carve', theme: 'github-light', includeExplanation: 'scopeName' })
  const wrong = tokens.flat().filter(tk => (tk.content ?? '').includes(payload)
    && (tk.explanation ?? []).flatMap(e => e.scopes.map(s => s.scopeName)).some(s => s.includes(scopes.textmate)))
  if (wrong.length) console.log(`FAIL(lit) ${name}: ${JSON.stringify(payload)} scoped as ${scopes.textmate} in ${JSON.stringify(sample)}`)
  else litPass++
}
console.log(`  ${litPass === LITERALS.length ? '✓' : '✗'} textmate sweep: ${litPass}/${LITERALS.length} literal shapes stay unscoped`)
if (litPass !== LITERALS.length) process.exit(1)

