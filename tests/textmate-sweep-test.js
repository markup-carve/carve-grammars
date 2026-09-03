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
import {
  MARKER_LINE_FENCES,
  MARKER_LINE_NOT_A_QUOTE,
  MARKER_LINE_QUOTES,
  MARKER_LINE_QUOTE_FENCES,
  NOT_CLOSED_AT_COLUMN_0,
  GLUED_IS_NOT_A_FENCE,
  QUOTE_MARKER_LINE_FENCES,
  QUOTE_NOT_CLOSED,
} from './lib/marker-line-fences.js'
import { UNTERMINATED_FENCES, TEXTMATE_CANNOT_BOUND } from './lib/unterminated-fences.js'

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
  // The separator BETWEEN the checkbox and its content is a literal space too
  // (`task_marker = '[', task_state, ']', space`). carve-rs renders
  // `- [x]<TAB>a` as a list item whose content is the literal text `[x]<TAB>a`,
  // with no checkbox at all - so the item is still a list and only the checkbox
  // is wrong, which is why the block battery cannot express this shape: both
  // spellings classify as `list` there (carve-grammars#152).
  ['task marker, tab before its content', '- [x]\ta\n\nafter\n', 'checkbox'],
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
  // THE MIRRORED BOLD-ITALIC'S SPACE GUARDS (carve-grammars#375). The engine
  // renders `a */ b /* c` and `a */b /* c` as BOLD runs holding literal
  // slashes, not combined runs. They are here rather than in LITERALS because
  // highlight.js spells its combined rule `strong` too, so on that grammar no
  // selector separates the right reading from the wrong one - and a shared
  // negative has to hold on all three.
  ['a space after the mirrored bold-italic opener', 'a */ b /* c\n', 'markup.bold.italic'],
  ['a space before the mirrored bold-italic closer', 'a */b /* c\n', 'markup.bold.italic'],
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
  // The same column rule for the other three document-level anchors the
  // container split made strict (carve-grammars#138). Every shape here was
  // checked against the pinned engine before its anchor moved:
  //
  //   ` ```js` / ` x` / ` ``` `  -> <p><code>js x </code></p>
  //   ` > q`                     -> <p>&gt; q</p>
  //   ` *[HTML]: HyperText`      -> <p>*[HTML]: HyperText</p>, defining nothing
  //
  // and below every open content column each renders as item text, the corpus
  // 178 shape. The fence sample keeps its CLOSER indented too: a flush-left
  // ``` on the last line is itself a valid document-level opener, so a sample
  // spelled ` ```js\nx\n``` ` would carry a fence scope for a reason that has
  // nothing to do with the anchor under test.
  //
  // The positive halves are in `constructs.js` - `fenced code`, `blockquote`
  // and `abbreviation` at column 0, and `fenced code in a list item`,
  // `blockquote in a list item` and `abbreviation in a list item` at the item's
  // content column. Pointing `#container_blocks` back at the strict rule passes
  // every negative here and fails those three, which is what makes them pairs.
  ['fence indented at document level is text', ' ```js\n x\n ```\n', 'fenced_code'],
  ['fence below a nested content column is text', '- x\n  - a\n ```js\n y\n ```\n', 'fenced_code'],
  ['blockquote indented at document level is text', ' > q\n', 'markup.quote'],
  ['blockquote below a nested content column is text', '- x\n  - a\n > q\n', 'markup.quote'],
  ['abbreviation indented at document level is text', ' *[HTML]: HyperText\n', 'meta.abbreviation'],
  ['abbreviation below a nested content column is text', '- x\n  - a\n *[HTML]: HyperText\n', 'meta.abbreviation'],
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
// The tick is CONDITIONAL, as it is on the literal sweep below. It was
// hardcoded, so a failing run printed a line claiming success immediately
// under its own FAIL output and then exited 1 - the transcript disagreed with
// itself, and a reader skimming for ticks saw a pass.
console.log(`  ${negPass === NEGATIVE.length ? '✓' : '✗'} textmate sweep: ${negPass}/${NEGATIVE.length} intraword-literal checks passed`)
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


// MARKER-LINE COMMENT FENCES (tests/lib/marker-line-fences.js, corpus 337,
// carve-grammars#243).
//
// Driven off the same table the Prism and highlight.js batteries in
// tests/grammar-test.js use, for the reason this file's own header gives about
// its inventory: two hand-maintained lists is how a construct ends up covered
// in one sweep and absent from another. All three grammars here were wrong on
// this shape, and each was wrong differently.
//
// BOTH DIRECTIONS, because the failures ran in opposite directions and a
// one-sided check passes one of them. This grammar managed both at once: the
// `%%%` after the marker fell through to `#trailing_comment` and scoped as a
// LINE comment so no block opened, the hidden definition came back as a live
// `meta.link.reference.def.carve`, and the real closer was then taken for an
// opener and swallowed the paragraph below.
let fencePass = 0
const fenceFails = []
// Collected PER LINE, not per token: without the fix the hidden definition is
// split across four live tokens, so a per-token content test finds no token
// holding the whole needle and reports "not tokenized" for what is really
// "tokenized as live syntax". A diagnostic that names the wrong failure is how
// a real one gets read past.
const scopesOfLinesContaining = (sample, needle) => {
  const { tokens } = hl.codeToTokens(sample, { lang: 'carve', theme: 'github-light', includeExplanation: 'scopeName' })
  return tokens
    .filter(line => line.map(tk => tk.content ?? '').join('').includes(needle))
    .flatMap(line => line.flatMap(tk => (tk.explanation ?? []).flatMap(e => e.scopes.map(s => s.scopeName))))
}
const isHidden = (scopes) => scopes.some(s => s.startsWith('comment.'))

for (const { label, src, hidden, visible } of [...MARKER_LINE_FENCES, ...QUOTE_MARKER_LINE_FENCES, ...MARKER_LINE_QUOTE_FENCES]) {
  const hiddenScopes = scopesOfLinesContaining(src, hidden)
  const visibleScopes = scopesOfLinesContaining(src, visible)
  if (!hiddenScopes.length) {
    fenceFails.push(`FAIL(fence) ${label}: no line carries the fence body ${JSON.stringify(hidden)}`)
  } else if (!isHidden(hiddenScopes)) {
    fenceFails.push(`FAIL(fence) ${label}: hidden body scoped live as ${[...new Set(hiddenScopes)].join(',')}`)
  } else if (isHidden(visibleScopes)) {
    fenceFails.push(`FAIL(fence) ${label}: the comment swallowed the block after its closer`)
  } else { fencePass++ }
}

for (const [label, shape] of [
  ['a column-0 line is not the fence closer', NOT_CLOSED_AT_COLUMN_0],
  ['a glued percent run is not a fence', GLUED_IS_NOT_A_FENCE],
  ['an unmarked line stops an unclosed quote fence', QUOTE_NOT_CLOSED],
]) {
  // `visible` may name one line or several: corpus 326-6 keeps TWO paragraphs
  // visible and checking only the first passed through a runaway comment.
  const all = Array.isArray(shape.visible) ? shape.visible : [shape.visible]
  const recorded = shape.textmateRecorded ?? []
  const bad = all.filter((needle) => {
    const scopes = scopesOfLinesContaining(shape.src, needle)
    if (!scopes.length) return true
    // A RECORDED needle is asserted the other way: this grammar is known to
    // swallow it, so it failing to swallow means the record has gone stale.
    return recorded.includes(needle) ? !isHidden(scopes) : isHidden(scopes)
  })
  if (bad.length) {
    fenceFails.push(
      `FAIL(fence) ${label}: ${JSON.stringify(bad)} - each must stay visible, `
      + `except ${JSON.stringify(recorded)}, which is recorded as swallowed and must stay so`,
    )
  } else { fencePass++ }
}

const fenceTotal = MARKER_LINE_FENCES.length + QUOTE_MARKER_LINE_FENCES.length + MARKER_LINE_QUOTE_FENCES.length + 3
console.log(`  ${fenceFails.length ? '✗' : '✓'} textmate sweep: ${fencePass}/${fenceTotal} marker-line comment fences hide their body and close`)
fenceFails.forEach(f => console.log(f))
if (fenceFails.length) process.exit(1)

// A QUOTE OPENED ON A LIST ITEM'S MARKER LINE (tests/lib/marker-line-fences.js,
// carve-grammars#259). Same table the Prism and highlight.js batteries read,
// asserted in this grammar's own vocabulary: the quoted run has to carry a
// `markup.quote` scope, and the block past the item must not.
//
// The scope NAME rather than "scoped at all", for the reason this file's header
// gives: a TextMate scope name is a contract with every consumer, and the
// failure here was the list rule taking the whole line - which is very much a
// scope, just the wrong one.
let quotePass = 0
const quoteFails = []
const isQuoted = (scopes) => scopes.some(s => s.includes('markup.quote'))

for (const { label, src, quoted, outside } of MARKER_LINE_QUOTES) {
  const quotedScopes = scopesOfLinesContaining(src, quoted)
  if (!quotedScopes.length) {
    quoteFails.push(`FAIL(quote) ${label}: no line carries ${JSON.stringify(quoted)}`)
  } else if (!isQuoted(quotedScopes)) {
    quoteFails.push(`FAIL(quote) ${label}: the quoted run scoped as ${[...new Set(quotedScopes)].join(',')}`)
  } else if (isQuoted(scopesOfLinesContaining(src, outside))) {
    quoteFails.push(`FAIL(quote) ${label}: the quote ran past the item and took ${JSON.stringify(outside)}`)
  } else { quotePass++ }
}

for (const { label, src, notQuoted } of MARKER_LINE_NOT_A_QUOTE) {
  if (isQuoted(scopesOfLinesContaining(src, notQuoted))) {
    quoteFails.push(`FAIL(quote) ${label}: ${JSON.stringify(notQuoted)} must not be scoped as a quote`)
  } else { quotePass++ }
}

const quoteTotal = MARKER_LINE_QUOTES.length + MARKER_LINE_NOT_A_QUOTE.length
console.log(`  ${quoteFails.length ? '✗' : '✓'} textmate sweep: ${quotePass}/${quoteTotal} marker-line quotes take the rest of their line`)
quoteFails.forEach(f => console.log(f))
if (quoteFails.length) process.exit(1)

// AN UNTERMINATED `%{3,}` RUN (tests/lib/unterminated-fences.js,
// carve-grammars#260). Prism and highlight.js decline it and fall through to a
// line comment; this grammar cannot, and TEXTMATE_CANNOT_BOUND says why.
//
// RECORDED IN BOTH DIRECTIONS, not skipped. A skip is a sentence nobody runs: it
// stays true whatever the grammar does, so the day this becomes reachable the
// record would quietly describe a shape that no longer behaves that way. Asserted
// the other way round instead - every shape here MUST still swallow - so a change
// that fixes one fails this check and forces the entry out of the list. Same
// three-direction discipline the corpus over-acceptance record uses.
let boundPass = 0
const boundFails = []
for (const { label, src, visible } of UNTERMINATED_FENCES) {
  const scopes = scopesOfLinesContaining(src, visible)
  if (!scopes.length) {
    boundFails.push(`FAIL(unterminated) ${label}: no line carries ${JSON.stringify(visible)}`)
  } else if (isHidden(scopes)) { boundPass++ } else {
    boundFails.push(
      `FAIL(unterminated) ${label}: ${JSON.stringify(visible)} is no longer swallowed - this grammar `
      + 'now bounds an unclosed run, so delete the entry from UNTERMINATED_FENCES\'s recorded list '
      + 'and assert it like Prism and highlight.js do',
    )
  }
}
console.log(
  `  ${boundFails.length ? '✗' : '✓'} textmate sweep: ${boundPass}/${UNTERMINATED_FENCES.length} `
  + `unterminated runs still swallow, as recorded (${TEXTMATE_CANNOT_BOUND})`,
)
boundFails.forEach(f => console.log(f))
if (boundFails.length) process.exit(1)
