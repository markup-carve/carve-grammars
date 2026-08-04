# Changelog

All notable changes to `carve-grammars` are documented here.

## Unreleased

### Fixed
- **An ordered marker glued to an attribute block with no content is prose in
  all three grammars.** `1.{#x}` renders as a paragraph and `1.{#x} item` as a
  list item; every grammar scoped the marker in both. The guard was `(?= |\{)`,
  which accepts any brace, so the marker-requires-content rule never reached
  past the block.

  The fix spells the attribute block out in full rather than skipping it,
  because the block is not brace-balanced text: a quoted value may contain `}`
  and may escape its own quote, so `{title="a}b"} x` and `{title="a\"b"} x` are
  valid items that a `\{[^}]*\}` run truncates. Six shapes were checked against
  the engine before the grammars were touched, both outcomes.

  `#85` recorded this as TextMate-only, on the grounds that Prism and
  highlight.js match the closer in one pattern. Measured, both carry the same
  `(?= |\{)` guard and the same defect; all three are fixed here.

  The counter-examples live in the shared inventory as `LITERALS`, so all three
  sweeps assert them - a positive case cannot catch this, since the valid and
  the invalid shape differ only in what follows the block.
- **Prism scopes thematic breaks.** It had no rule for the construct at all, so
  `***` and `___` rendered as prose and `---` was claimed by the smart
  typography rule as an em dash - covered-looking output with nothing matching
  the block. Four Prism snapshots change; three gain the break, and ` ***`
  (indented, literal text at the top level) now colors as a break the way
  TextMate and highlight.js already did, so the three grammars make the same
  documented trade rather than two of three.

### Changed
- **Both grammar sweeps consume ONE construct inventory**
  (`tests/lib/constructs.js`, 120 constructs). They used to carry two
  hand-written case lists - 66 and 115 - that overlapped but neither derived
  from the other, so a construct could be exercised in one and absent from the
  other for as long as nobody noticed. That is how every block rule in Prism
  and highlight.js stayed anchored at column zero while the sweep that carried
  the in-list-item cases reported them green.

  What differs per sweep is now the assertion, not the case list: TextMate
  asserts the payload carries the scope the entry NAMES, the engine sweep only
  that the payload is scoped at all, since Prism and highlight.js use different
  vocabularies. Adding a construct forces the decision for all three at once,
  and an absence has to be written down as a `skip` with a reason that prints
  on every run - the covered-or-skip discipline `tests/lib/coverage.js` already
  applies per corpus category.

  Merging the lists exposed the Prism gap above, and four constructs that had
  no TextMate selector (a quoted attribute value, an escaped quote in one, an
  inline extension carrying attributes, and the numbered caption). One skip is
  recorded: highlight.js does not highlight front matter, because it has no
  document-start anchor and a `^---$` begin would swallow from a mid-document
  thematic break to the next one.
- **An unclosed inline delimiter no longer colors the rest of the document in
  highlight.js.** Every inline mark is a `begin`/`end` mode, and such a mode
  opens as soon as `begin` matches whether or not the closer ever arrives - so
  a lone `_` scoped every remaining character of the file as underline. The
  shapes that hit it are not typos: in `:_[x]` the `_` belongs to an inline
  extension and in `:_x:` to a symbol, and neither is a delimiter at all.
  Thirteen modes were written that way (emphasis, underline, strong,
  strikethrough, highlight, insert, delete, subscript, superscript and the four
  forced-intraword marks); each now requires its closer to exist before the
  paragraph ends. A mark may still span lines the way the engine does
  (`/multi`, newline, `line/` is one `<em>`) but cannot reach into the next
  block, and the closer is declared once so the guard and the mode's own `end`
  cannot drift apart.

  Nineteen highlight.js snapshots change. Most drop a false span outright; in
  seven the runaway had been swallowing a construct that now scopes correctly
  (`</#anchor>` cross-references, `[a][]` reference links). One,
  `129-emphasis-opener-slash-adjacency-3` (`/a/_b_`), trades the runaway for a
  narrower pre-existing over-match: the emphasis `end` guard `\/(?![\w/])`
  refuses to close before `_`, so `/a/` now scopes as nothing and `_b_` as
  underline where the engine renders `<em>a</em>_b_`. That end guard is a
  separate defect, not introduced here.

  Prism was never affected - its patterns require the closer in one match - so
  the new `tests/unclosed-delimiter-test.js` runs both engines and uses Prism
  as the control. It also asserts the other direction, that a mark WITH a
  closer still opens, so the fix cannot degrade into never opening the mode.
  Sixteen of its cases fail against the unfixed grammar.
- **The engine dependency pins a revision.** `@markup-carve/carve` was declared
  as `github:markup-carve/carve-js` with no ref, so npm resolved it to whatever
  the default branch held at install time - `npm update`, a lockfile
  regeneration or any consumer resolving without the lock took a different
  engine, and nothing recorded which one the grammars were verified against.
  The lockfile already pinned `857e45f`; the declared dependency now says so
  too. A scheduled `Engine drift` job reports the lag and fails if the pin
  stops being a real commit on carve-js main or drifts from the lockfile, the
  same shape as the existing `Spec drift` job. This records the current pin
  rather than moving it: the engine is 77 commits behind main, and bumping it
  is its own reviewed change.
- **Block constructs indented inside a list item now scope in TextMate.** A
  heading, block quote, caption, admonition, table row, table continuation or
  abbreviation definition at a list item's content column went uncolored,
  because those rules were anchored at column 0 while `fenced_code` was not.
  All seven now allow leading whitespace, so the block rules agree on which
  side of the trade-off they sit. The strict column-0 rule makes an indented
  opener literal text at the TOP level, and a line-based grammar cannot tell
  that apart from the valid in-container case - so this deliberately
  over-colors the rare invalid case rather than under-color the common valid
  one. The decision is recorded in a `comment` on every rule involved.
- **Seven constructs the corpus carries now scope in Prism and highlight.js.**
  Each was rendering as plain prose in one or both engines: the inline footnote
  `^[note]` (neither had a rule, though both scope the `[^a]` reference), the
  task states `[>]` `[-]` `[?]` `[_]` (both stopped at `[ ]`/`[x]`, while the
  spec's `task_state` is ` `, `x`, `X`, `-`, `_`, `>`, `?`), the definition term
  `:: term` (both scoped only the `: definition` line below it), and the table
  continuation row. Three more were parity gaps where one engine had the rule
  and the other did not: smart typography (`--`, `->`, ellipsis) missing in
  highlight.js, the hard break missing in Prism, and the lone `+` continuation
  marker missing in highlight.js.

  Found by running the TextMate sweep's 96 constructs through the other two
  engines - their own sweep carried 50, which is why these survived it. It now
  carries 58, and all seven cases fail against the unfixed grammars.

  Prism's hard-break rule is anchored on an explicit newline rather than an
  end-of-line assertion with the `m` flag: Prism applies a pattern to the
  remaining text chunk, so the assertion matched at a chunk boundary and scoped
  a mid-line backslash as a hard break. The corpus snapshots for
  `163-quote-flanking-after-an-escaped-character` and `137-inline-literal-3`
  caught that.
- **The ProseMirror test bridge accepts the split footnote types.** carve-js
  split `footnote` into `footnote_ref` and `inline_footnote`
  (markup-carve/carve#405); this repo pins a published carve that still emits
  the old name, so all three are accepted and either release order is safe.
  Without it a footnote silently stopped mapping to `carveFootnote`.

### Added
- **`CarveCriticComment`, a tiptap mark for editorial comments (`{# ... #}`).**
  Editorial comments became their own node type in the engines
  (markup-carve/carve#401), and the bridge had nowhere to put them: `insert` and
  `delete` were marks, the comment was not, so it round-tripped as a plain span
  carrying a class - if it survived at all. The mark, the `schema-map.json`
  entry and the serializer token land together, so the map never names something
  CarveKit does not provide.
  It outranks `CarveSpan`, whose `span[class]` rule accepts any simple class
  name and would otherwise claim `<span class="critic-comment">` first.
  The serializer emits `{#...#}` and does NOT escape the content: an editorial
  comment is literal, so escaping it the way prose is escaped would put real
  backslashes into the comment. That extends to the `]` escaping used for link
  and span labels, which leaves a linked comment containing `]` with a label
  that ends early - visible, unlike silently altered comment text. The engine
  gap behind it is markup-carve/carve#403.

### Fixed
- **highlight.js scopes inline extension calls; Prism scopes caption lines.**
  Each engine was missing a rule the other had, so a construct the corpus has
  carried since its first release rendered as plain prose in one of them:
  `:kbd[Ctrl+C]` (corpus `45-inline-extensions`, also `:term[…]` and
  `:index[…]`) was unscoped in highlight.js, and `^ A caption` - image
  captions, blockquote attributions and the numbered `^ Figure #: …` form -
  was unscoped in Prism.
- **Prism no longer scopes an extension call carrying attributes as a span.**
  The `span` rule matches any `[x]` followed by `{`, so `:kbd[Ctrl]{.k}` was
  claimed by it with the `:kbd` left as prose. `extension` now precedes `span`.
  Neither engine's extension rule consumes the trailing attribute block any
  more: an attribute value may itself contain braces (`:kbd[x]{k="{y}"}`), so a
  `{[^}]*}` tail stopped at the inner brace and split the block. The existing
  attribute rules match it whole.
- **The cross-engine sweep covers seven more constructs** - inline extensions
  (bare and with attributes), symbol shortcodes, citations, code callouts, and
  captions (plain and numbered). The sweep exists to catch a construct with no
  rule at all, which snapshots happily as unscoped text; the two gaps above
  survived because it never reached them.
- **highlight.js: verbatim fences wider than two backticks no longer close
  early** (#52). Inline code, the inline literal and both math forms declared
  only the double and single widths, because highlight.js has no begin-to-end
  backreference. A fence of three or more therefore opened on the first two and
  closed at the first shorter run inside it, leaking the remainder as prose:
  `a $```p `` q``` b` lost `q` and mis-scoped the tail. Widened fences are the
  point of the widening rule, since content holding a backtick run needs a
  longer fence.

  The three families now share one `verbatimFence()` factory that captures the
  opening width, carries it in `resp.data`, and rejects a wrong-width closer
  with `ignoreMatch()` - the idiom highlight.js's bundled markdown grammar uses.
  Both patterns match a maximal run, so a longer run inside a narrower fence is
  content rather than a closer. Six tiered modes collapse to four dynamic ones,
  so the families can no longer drift apart.

  The width is read from `match[0]`, not a capture group: highlight.js
  concatenates every sibling mode's `begin` into one alternation, so group
  numbers shift with unrelated modes. An index-based read threw there, which
  made the mode disappear entirely instead of failing loudly.

  Twelve highlight.js snapshots improved as a result - each had pinned a
  truncated closing fence (` `` ` where the source has ` ``` `), which is the
  defect itself rather than a formatting difference.
- **A `%%%` comment fence is never a raw passthrough block.** Prism carried a
  dedicated `raw-block` token matching `%{3,}` plus an info word, and both
  highlighter grammars claimed in comments that `%%% format` was raw
  passthrough. The spec has no such form: a raw block is a *code* fence whose
  info string is `=FORMAT` (```` ```=html ````), and a percent run is always a
  comment. So `%%% TODO` - a natural thing to write - highlighted its body as a
  raw string instead of a comment. The `raw-block` token is gone; the
  `=FORMAT` raw form was already covered by the code-fence rule.
- **A `%%%` fence line tolerates a trailing tail, in all four grammars.** Only
  the leading run of `%` is structural (spec PART 9 §28), so `%%% TODO` opens
  and `%%% end` closes. Prism, highlight.js and TextMate all required a bare
  `%%%` line before, so a fence with any trailing text failed to open and the
  comment body leaked into the highlighted output.
- **The closer matches the opener width exactly**, so `%%%%` nests `%%%`.
  Prism and TextMate use a backreference; highlight.js, which has no
  begin-to-end backreference, carries the width in `resp.data` and rejects a
  wrong-width candidate with `ignoreMatch()`, the idiom its bundled markdown
  grammar uses.

  Known limitation, unchanged in kind: highlight.js and TextMate cannot look
  ahead for a closer, so an *unterminated* `%%%` still scopes to end of input
  rather than degrading to a line comment the way the spec requires. Prism
  matches the whole block in one pattern and gets this exactly right.

### Added
- **Inline literal** `` !`…` `` tokenizes across TextMate, Prism and
  highlight.js (Shiki inherits the TextMate grammar). A `!` prefix on a
  verbatim backtick run is scoped as prose rather than code, mirroring the
  `$`-prefixed math rules and ordered ahead of the inline-code rules so the
  leading `!` claims the span. A trailing `{…}` stays a separate attribute
  block, and `![` still opens an image.
- TextMate and highlight.js additionally handle multi-backtick literal fences
  (`` !``a ` b`` ``), matching Prism's run-length behavior: TextMate gains a
  `literal_inline_multi` rule closing on the same run length, and highlight.js
  splits double/single modes the way the inline-code modes already do. Unlike
  the math rules, a literal has no closing sentinel to anchor its end, so a
  bare `` `+ `` terminator would close early on the inner backtick.

## 0.1.2 - 2026-07-14

### Changed
- **Renamed to `@markup-carve/carve-grammars`.** The package now publishes under
  the org scope, matching every other JS package in the project
  (`@markup-carve/carve`, `@markup-carve/carve-components`, ...). The unscoped
  `carve-grammars` name stops at 0.1.1; update imports and install lines
  accordingly.
- Symbol shortcodes match the refined parser shape (carve#261): the first
  name character may be `+` or `-` (so `:+1:` / `:-1:` tokenize), and a
  left word-boundary guard keeps a colon glued to a word (`word:+1:`) from
  opening a symbol. TextMate, Prism and highlight.js updated together.

### Added
- TextMate: `:name:` symbol shortcodes (e.g. emoji) tokenize
  (`constant.language.symbol` name, `punctuation.definition.symbol` colons),
  mirroring the parser shape (name starts alphanumeric, then word chars,
  `+` or `-`).
- TextMate: reference-link definition lines (`[r]: url "Title"`) tokenize as
  `meta.link.reference.def` with label/url/title scopes; citation (`[@k]:`)
  and footnote (`[^f]:`) definition lines are excluded.
- highlight.js: `:name:` symbol shortcodes produce a `symbol` span.
- Shiki kit: light/dark token colors for the symbol scopes.

### Changed
- **BREAKING (follows carve #259): no bare superscript/subscript.** `^text^` and
  `,text,` are literal text; sup/sub are the braced `{^text^}` / `{,text,}` only.
  TextMate, Prism, highlight.js grammars drop their bare sup/sub patterns; the
  Tiptap serializer always emits the braced forms.
- Prism: the former `emoji` token is now `symbol` and matches the parser
  shape exactly (a leading `+` or `_` in the name no longer tokenizes;
  `:+1:` stays literal).
- Tiptap serializer emits bare `=highlight=` at word boundaries
  (brace form stays for intraword), and the canonical `::: tab [Label]` opener
  instead of a `{label="..."}` attribute line (kept as fallback for labels
  containing `]`).
- `carveTab` ingest lifts the `[label]` opener's rendered `div-label` paragraph
  into the label attribute, so canonical tabs round-trip through the editor.

### Fixed
- `carveDelete` / `carveInsert` outrank StarterKit's Strike for `<del>` parsing;
  `{-...-}` no longer degrades to `~...~` after an HTML round-trip.

## 0.1.1 - 2026-07-12

### Added
- Shiki kit: inline emphasis delimiters (`*` `/` `_` `~` `^` `,` `=`) render
  muted gray like code backticks; the content carries the styling.
- TextMate: word-boundary guards on bare `*bold*`, `~strike~` and `^sup^` so
  intraword delimiters stay literal per spec (matching italic/underline/highlight).
- Full TextMate sweep test (67 positive + 6 intraword-negative cases via Shiki)
  runs in CI.
- `carve-grammars/shiki`: shared Shiki/VitePress kit (grammar + GitHub themes
  extended with Carve scope colors + styling transformer + companion CSS), so
  all Carve docs sites configure highlighting from one import.
- TextMate grammar shipped in the npm package (`textmate/carve.tmLanguage.json`).
- TextMate: bare subscript (`,text,`), brace superscript (`{^text^}`) and brace
  highlight (`{=text=}`) forms; inline/display math (`$` + backtick), inline
  footnotes (`^[...]`), cross-references (`</#id>`), hard breaks, definition
  lists, the full task-state set (`[-] [_] [>] [?]`), fence info strings
  (`"Title"` / `[Label]` / `=format`), and table alignment glyphs (`|=>`,
  glued `|<` overrides) now tokenize. Full 67-construct sweep passes.
- CarveEmbed: inline "Edit" control in the node view to change a media embed's URL / video id in place.

### Changed
- Spec corpus submodule bumped from 7c41ccc to 750ddfa (126 categories, 24 new).
  New categories classified in the per-grammar coverage matrix; snapshot goldens
  refreshed for the changed and added corpus files.
- Prism: inline link/image titles now match backslash-escaped quotes
  (`[t](/url "ti\"tle")`), and links with empty text (`[](url)`) are highlighted.

## 0.1.0 - 2026-07-02

Initial release. Syntax + editor integration for the Carve markup language.

### Grammars
- Prism.js language definition (`carve-grammars/prism/carve.js`).
- highlight.js language definition (`carve-grammars/highlightjs/carve.js`).

### Tiptap integration (`carve-grammars/tiptap`)
- `CarveKit` - one Extension bundle: StarterKit plus Carve marks and nodes,
  keyboard map, and an in-block code-language picker.
- `serializeToCarve(json)` - convert a Tiptap/ProseMirror document to Carve
  markup; `escapeCarve` and `carveMediaDirective` helpers.
- Extensions: CarveInsert / CarveDelete (CriticMarkup), CarveDiv (admonitions),
  CarveSpan, CarveMath, CarveFootnote (+ definition), CarveEmbed, CarveAbbreviation,
  CarveDefinitionList, CarveMention / CarveTag, CarveKeymap.
- Parses the HTML that the reference parsers (carve-js / carve-php) actually
  render, so real documents round-trip: admonitions (`<aside class="admonition">`),
  math spans, footnote sections, media embeds (via a stamped `data-carve-source`),
  mentions/tags (`[@key]` citations), tight/loose lists, and task lists rendered
  as plain `<ul>` + checkboxes.
- Media embeds round-trip losslessly for every provider by reading the
  renderer-stamped `data-carve-source`, falling back to `:youtube[]` / `:vimeo[]`
  / `:media[]` reconstruction for un-stamped iframes.

### Tests
- Corpus round-trip, serializer, and a happy-dom HTML-parse harness verifying the
  editor path (HTML in -> Carve out).
