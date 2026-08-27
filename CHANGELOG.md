# Changelog

All notable changes to `carve-grammars` are documented here.

## [Unreleased]

### Fixed

- The Tiptap serializer keeps a shared outer emphasis delimiter open across nested marks, so `*bold with /italic/ inside*`, `/italic with *bold* inside/` and `_underline with *bold*_` remain balanced instead of duplicating the outer delimiter around each ProseMirror text node (#362).
- Empty definition descriptions serialize as the canonical `: {empty}` form and stay glued to a following term, preserving the description boundary through an editable round trip.

### Changed

- The pinned Carve spec corpus advances from `e3b0333` to `b5b603d`, adding 60 documents across 12 recent definition-body, continuation-marker, invisible-line and unresolved-image categories. Prism and highlight.js carry reviewed goldens for every new document, and the Tiptap coverage ledger records which projections remain source-position dependent.

## [0.1.5] - 2026-08-27

### Added

- **Tab sets and code groups are editable as widgets.** Both render an interactive bar: click a label to switch, double-click to rename, `+` to add, `×` to remove (refused on the last panel), `‹`/`›` to reorder. A code group had no bar at all before this, so its per-block `[label]`s were invisible and it rendered as a plain stack of code blocks; a tab set had one that could only switch. Switching still dispatches nothing - it sets `data-active` and the stylesheet does the rest - so moving between panels never marks the document dirty. The other four are ordinary undoable edits.

  A code group deliberately stays a plain `carveDiv`: giving it node types to mirror the tab-set shape would change what the serializer sees for a change that is only about presentation, so the document shape and the round trip are untouched.

- **A `tiptap/editor.css` export** - the stylesheet the bars need. It is not decoration: switching is only an attribute, so without it every panel shows at once and clicking a label appears to do nothing. It shipped nowhere before, so wp-carve wrote its own copy of the tab-set rules and every other consumer had an inert bar. Reads carve-css tokens when present, falls back to literals otherwise.

### Fixed

- A bare `=` that begins or ends a smart-typography pattern opens no highlight in any of the three grammars. `Not an arrow: key => value stays literal, and p <= q is a comparison.` (corpus 386) scoped the whole sentence as one highlight: the `=` of `=>` opened and the `=` of `<=` closed it 48 characters later, where the engine renders no mark at all. `<=b c=`, `>=b c=` and `!=b c=` were the same defect on the comparisons (#325).
- highlight.js no longer scopes an empty highlight over a doubled run. `==x==`, `==doubled==` and the `==` of the `==>` arrow each opened and closed on the two delimiters of a run the engine renders literally, so `==>` colored as a highlight plus a stray `>` rather than as one arrow (#325).
- The TextMate grammar scopes the canonical doubled arrows (`-->`, `<--`, `<-->`, `==>`, `<==`, `<=>`) as one arrow. Its typography alternation listed only the single runs and matched them first, so `-->` scoped as an en dash plus a stray `>` - the defect Prism and highlight.js shed in #282, one surface over (#324, #326).
- highlight.js scopes a cross-reference with auto text (`</#id>`). It had no rule for one and the id was not left alone: the tag rule claimed `#id`, so every crossref scoped as a hashtag - the defect Prism carried until #308, one surface over (#317).
- highlight.js scopes a reference image (`![alt][ref]`) and a collapsed one (`![alt][]`) as images. Both fell through to the reference-LINK rule, which matches from the `[` and left the `!` as prose (#317).
- highlight.js scopes the combined bold-italic delimiter as one run. The emphasis rule already matched it, so it scoped italic and not bold (#317).
- highlight.js scopes `{=text=}` as a highlight, braces included. The bare `=text=` rule claimed the inner delimiters as a side effect and left the braces as prose, so the fifth braced spelling had no rule of its own where the other four do (#317).
- A `{% ... %}` comment and a `{# ... #}` editorial comment spanning a line break are one comment in TextMate. Both were line-bounded `match` rules, so a comment written across a break was not recognized at all and the markup inside it colored - 144 of 469 and 87 of 286 generated documents. Prism and highlight.js were given the multi-line reading in #312; this is the same fix on the TextMate side (#307, #320).
- An unpartnered verbatim run is a code span to the end of its paragraph in TextMate, as it is in the engine and in Prism, instead of leaving the rest of the paragraph live markup (#307, #320).
- TextMate and Prism scope a reference image (`![alt][ref]`) and a collapsed one (`![alt][]`) as images. Both fell through to the reference-LINK rule, which matched from the `[` and left the `!` as prose, so the alt text carried a link's scope (#307, #308).
- Prism scopes a cross-reference with auto text (`</#id>`). It had no rule for one, and the id was not left alone: the tag rule claimed `#id`, so every crossref colored as a hashtag, and a line carrying two of them colored the run between them as emphasis (#308).
- TextMate scopes `{=text=}` as a highlight. A rule for a CriticMarkup highlight, which Carve does not have, sat in front of the real one and claimed it under `markup.highlight.critic.carve` (#307).
- Prism closes a fenced code block the way PART 9 §2 states it - the same fence character at a length at least the opener's, at the opener's own column. `~~~` closed by `~~~~` was no block at all, and a run indented past the opener ended one early, so in both cases the payload's markers colored as markup (#312).
- An unpartnered verbatim run is a code span to the end of its paragraph in Prism, as it is in the engine, instead of leaving the rest of the paragraph live markup. A closing run must also be the WHOLE run, so a span no longer ends on half of a wider one (#312).
- A `{% ... %}` comment spanning a line break is one comment in Prism, and a `{# ... #}` one is in highlight.js. Both guards were line-bounded, so a comment written across a break colored the markup inside it (#312).
- An unpartnered backtick run in highlight.js stops at the paragraph break instead of scoping the rest of the document as code (#312).
- highlight.js keeps a fenced code block's payload inert. The opener and the closer were two independent single-line rules with nothing between them, so the body was handed to the full mode list: corpus 11-fenced-code-15, a document whose content reads `# not a heading` and `*not bold*`, was highlighted as a heading and a strong. The delimiters keep their `keyword` scope and the body is now `code` (#309, markup-carve/carve#1239).
- highlight.js recognizes the fence openers the engine accepts - ```` ```c++ ````, ```` ```text/html ````, a digit-led language, a `"title"` or a `[label]` after the language, and the raw ```` ```=html ```` block - each of which fell through to the inline code rule with its body live. The opener also stops at the end of its own line rather than taking the first line of the payload with it, and a closer longer than its opener closes the fence, as PART 9 §2 says it does (#309).
- Nine more braced inline constructs (`{~` `{-` `{+` `{^` `{_` `{=` `{,` `{/` `{*`) are linear instead of quadratic in both Prism and highlight.js. 48 KB of one opener took up to 1.9 s and now takes at most 43 ms; every construct moved from x4 to x2 per doubling. Highlighting is unchanged on all 1325 corpus documents and on the bodies that hold a non-closing delimiter, such as `{/a/b/}` (#300).
- Prism no longer scans to the end of the line from every position on an unclosed `{%` inline comment, so a document made of `{%` openers is linear instead of quadratic: 48 KB of them took 312 ms and now takes 9.5 ms. Highlighting is unchanged on every corpus document (#298).
- An unclosed `%%%` comment fence opened on a list item's marker no longer makes Prism and highlight.js backtrack exponentially: `- %%%` followed by a couple of dozen ordinary indented lines took hundreds of milliseconds and a thirty-line one did not finish, which hangs any page highlighting untrusted Carve. Flat at 2000 lines now, with highlighting unchanged (#294).
- Prism and highlight.js answer the `crv` fence word, so a ```` ```crv ```` block highlights on every surface this package ships rather than under Shiki alone. Prism also keeps `carvemd` and Shiki keeps `Carve` (#290).
- Prism and highlight.js scope the canonical doubled arrows (`-->`, `<--`, `<-->`, `==>`, `<==`, `<=>`) as one arrow instead of an en dash plus a stray `>`, and `=>` alone is no longer an arrow (#282, markup-carve/carve#1442).
- A hyphen run that opens a word after whitespace is a command-line flag in both highlighters: `--oneline` stays literal, while `1--10`, `Mon--Fri` and `a -- b` remain en dashes (#282, markup-carve/carve#1443).
- `package.json` is in `exports`, so the installed version can be read back through the package specifier instead of throwing `ERR_PACKAGE_PATH_NOT_EXPORTED`. Only that file is opened at the package root; every other path stays refused (#288, #287).
- The `empty-span-and-editorial-marks` wire fixture no longer spells an empty `{++}` or `{--}`, shapes no Carve source produces now that an empty brace pair is text. `carveEmptyMark` and the schema map are unchanged (#285).

### Changed

- TextMate scopes a table alignment run only when it is horizontal-first with a vertical partner (`<^`, `>v`); a lone `^` or `v` and a vertical-first pair (`^<`, `v>`, `~>`) stay ordinary cell content (#273, #277, #281).
- The Carve engine is an ordinary registry range (`^0.1.4`) instead of a pinned carve-js commit. Installing 0.1.4 cloned the engine over git, which skips npm's integrity check, needs git and GitHub reachability at install time, and stops tracking engine releases (#276, #274).

## [0.1.4] - 2026-08-18

### Breaking

- Carve attributes on stock ProseMirror nodes carry a `carve` prefix
  (`carveRef`, `carveDelim`, `carveOlType`, `carveHeader`, `carveKeyValues` and
  friends). A ProseMirror document stored by 0.1.3 or earlier is not read at the
  old keys (#236).

### Added

- A framework-independent `<carve-editor>` Web Component from
  `@markup-carve/carve-grammars/editor`, with declarative content, programmatic
  updates, `readonly`, `defineCarveEditor()` and a `carve-editor::part(editor)`
  hook (#209).
- TypeScript declarations for the root, `/tiptap` and `/editor` entry points,
  with a downstream-consumer compile in CI (#208).
- `carveToProseMirrorWithReport(source, options)`, so the bridge reports what
  the editor model could not hold: `preserved` (kept as exact source) and
  `degraded` (text survives, node does not) (#237).
- Semantic language attributes: `{:TAG}` and `{:}` highlight in Prism and
  highlight.js and survive the Tiptap HTML and AST paths (#213); TextMate
  accepts them, and the construct joins the shared sweep inventory that had let
  the gap ship green (#214).
- Composite figures are their own construct in all three grammars - a bare
  `::: figure` opener is a figure group rather than an admonition (#223,
  markup-carve/carve#1215).
- A composite figure is a node the editor holds: `CarveKit` registers
  `carveFigureGroup`, and opener, panels, closer and group caption round-trip
  (#225, markup-carve/carve#1122).
- `CarveKit` registers every authored Carve construct; ten node types leave the
  schema map's unmapped list, matching carve-php's bridge (#221,
  markup-carve/carve-php#1266).
- Eleven map-declared nodes are actually built rather than loading as opaque
  source atoms, including `carveInlineNote` with editable content and a new
  `carveInlineExtension` for the general `:name[content]` form (#235).
- `tiptap/wire-fixtures.json` pins 30 sources to the exact ProseMirror document
  a bridge must produce, and `schema-map.json` publishes attributes rather than
  only node names (#236).
- `carveAttrOrder` carries an attribute run's authored order, and `carveTight`
  records whether a list was written loose or tight (#236, #241).
- `aliasOf` in `tiptap/schema-map.json` names the owner when two Carve types
  share a ProseMirror name, so a sorted-map reader stops routing every labelled
  div down the admonition path (#224, markup-carve/carve-rs#993).
- `carveToProseMirror(source, { parse })` passes options through to the engine,
  so extension-gated constructs can load at all (#235).
- `{% … %}` delimited inline comments in Prism, highlight.js and TextMate,
  preserved by the Tiptap serializer, plus a CI gate that validates spec section
  citations against the pinned spec revision (#268).

### Fixed

- A quote's caption is a figure caption again (`carveFigure` + `carveCaption`)
  and survives an edit, following the withdrawal of `block_quote.attribution`
  in markup-carve/carve#1213 (#218, #220).
- A block opened on a list item's or block quote's marker line stays at the
  marker: a quote in all three grammars (#261), a `%%%` comment fence whose body
  stays hidden (#244, #246), and a fenced block in the serializer (#268).
- An unterminated `%%%` run no longer greys out the rest of the document in
  highlight.js; it degrades to a line comment as PART 9 section 28 requires
  (#262).
- A list marker glued to a language attribute (`-{:fr} item`) is still a list
  marker in Prism and highlight.js (#216).
- The `{:TAG}` language attribute reaches the editor, not only the highlighters:
  the bundled engine pin moves onto a commit that parses it (#217).
- A label closes at the MATCHING bracket in all three grammars, so
  `![t[z]](/i.png)` is highlighted and an unbalanced `[t[z](/u)` is not (#227).
- A container's closing fence no longer opens a phantom container in
  highlight.js, which had cost mode precedence for every construct sharing a
  div's opener (#223).
- No grammar rule scans to the end of the document any more. The citation body,
  bracket labels, link destinations, reference labels, autolinks, critic
  comments, footnote references, inline notes, fence info strings and inline
  code spans are bounded in Prism and highlight.js, moving nine opener shapes
  from quadratic to linear in document length (#228, #229). A construct longer
  than its bound stops being highlighted rather than being highlighted slowly.
- `carveDiv` records whether the author wrote a class or an admonition kind, and
  a container's `{#id}` and key/values are written back at all (#239).
- The bridge hands back the attribute run the author typed: `` `code`{.cls} ``
  keeps its run, a fence title is no longer also written as an attribute line,
  and a mark with no content (`[](https://example.com)`, `[]{.a}`, `{++}`,
  `{--}`) loads as a `carveEmptyMark` atom instead of vanishing (#241).
- An inline atom inside a mark keeps the mark, so `*:rocket:*` and
  `[see </#H>](/u)` stop losing the emphasis or moving the atom out of the link,
  and an authored attribute run survives on every construct that takes one
  (#235).
- highlight.js highlights document-start front matter and keeps malformed typed
  openers literal; TextMate scopes standalone multiline attribute blocks and
  bracketed span text rather than only its trailing attributes (#269).
- Table cell attributes serialize after their kind and alignment markers, and
  nested-list attribute lines indent to the parent content column (#266, #267).

### Changed

- The spec corpus pin moves from carve `c19d1a4` to the `22f7f47` freeze:
  892 to 1259 documents, 288 to 365 categories, every added category classified
  rather than regenerated (#250, #257, #264).
- The bundled `@markup-carve/carve` engine pin moves to carve-js `2dc3232e`,
  83 commits forward. Both projection ratchets moved in both directions:
  the source envelope 337 to 329 (18 in, 26 out) and the mounted projection
  240 to 239 (24 in, 25 out) (#263).
- Highlighter construct coverage: highlight.js 170 of 170 applicable, TextMate
  172 of 172, Prism 170 of 170. The only deliberate skips left are the two
  container-column reference-definition cases in the line-based engines (#269).
## 0.1.3 - 2026-08-10

### Fixed
- Tiptap's editor-shaped footnote reference and definition HTML now outranks
  the generic Superscript and ListItem parsers, so a getHTML/setContent cycle
  keeps them as footnotes instead of superscript text and an ordinary list.

### Changed
- **A preservation-mode load is lossless, and a document that cannot be written
  back exactly now arrives as one opaque block** (#171). `unsupported:
  'preserve'` promised that a load/save pass keeps the document and only
  enforced half of it: a construct with no rich mapping became a
  `carveUnsupported` atom, but a construct that HAD one was trusted to write
  back unchanged. Many do not. A list item's content column, a marker
  lookalike, a table's filler cells and other source-sensitive shapes normalize
  on the way out, so the editor handed back Carve that parses to a different
  document than the one it loaded. Silent alteration is the worst outcome
  available in this position, because nothing downstream can tell that it
  happened - the same reasoning that made an invented `{.class}` worse than a
  dropped one.

  The loader now serializes the rich document it just built, reparses it, and
  compares it against the AST it started from with positions, orders and the
  other volatile fields normalized away. On any difference - or on a throw from
  either step - it returns the whole source as a single `carveUnsupported`
  atom, and `serializeToCarve` short-circuits that exact shape straight back to
  its source instead of sending it through the block joiner and the edge
  trimmer, which is what would corrupt precisely the whitespace-sensitive
  documents the fallback exists for. All 281 corpus categories over 856 files
  are load/save lossless now, with 148 still keeping structured or source-local
  conversion.

  **This changes what a lossy document looks like to a consumer.** Such a
  document used to load as rich, editable nodes and write back subtly altered;
  it now loads as one opaque block and writes back byte-for-byte. An
  application built against the old behavior loses the editable tree for that
  class of input and gains an exact one, which is the trade the mode's name
  always claimed. Which documents are in the class is inspectable rather than a
  surprise: `tests/lib/coverage.js` keeps the 133 structured-conversion reasons
  as a fallback matrix, and the README states the contract. The default
  `unsupported: 'throw'` mode is untouched.

### Added
- **`CarveHeading`, a tiptap heading node that keeps the attributes the author
  wrote** (#170). `{#intro .lead lang=en}` on a heading survived as far as the
  converter and no further: tiptap's stock heading models `level` and nothing
  else, so an id was written onto a node whose schema had no slot for it, and a
  class or any key/value pair sent the whole heading to the
  `heading-with-attrs` fallback. An authored attribute run is the only way
  Carve gives a heading an id that can be linked to, so losing it is not a
  cosmetic loss. The new extension declares `id`, `class` and `keyValues` as
  real schema attributes, and it promotes the shared corpus categories for
  heading attributes, including
  `only-the-id-hoists-to-the-section-wrapper`.

  `CarveKit` registers it in StarterKit's place, so a consumer configuring the
  kit gets it without asking. `heading: false` opts out and `heading: {...}`
  configures it, matching every other node the kit swaps. A consumer that
  registers its own heading extension alongside `CarveKit` must now pass
  `heading: false`, since tiptap rejects two extensions under one name.

  The `id` attribute deliberately does NOT parse from HTML. Rendered Carve puts
  a GENERATED id on a heading inside a section wrapper, and HTML does not record
  whether an id was authored, so importing one would write `{#slug}` into a
  document that never carried it - an invented attribute, and worse than a
  dropped one for the reason above. Source conversion sets the attribute
  directly, and it is the only path that knows the answer.

### Fixed
- **Mounting the structured document in Tiptap no longer loses common authored
  metadata.** The real Tiptap 2 and 3 lifecycle now retains link titles, image
  attributes and reference metadata, paragraph/list/quote/rule attributes,
  span key/value attributes, div ids/key-values/labels, table row/cell
  attributes, inline-footnote source, and the required separator before an
  inline comment. Adjacent ProseMirror runs carrying one link or span serialize
  back as one construct. The mounted-corpus render-equivalence ratchet improves
  from 671/892 to 729/892.

- Tiptap documents no longer receive invalid empty text nodes from zero-width
  parser leaves, and an absent tab label that the editor schema materializes as
  `label: ""` no longer writes an authored `{label=""}` attribute.

- **An inline attribute block no longer scopes across a newline** (#164). A block
  glued to an inline construct pads and separates with `opt_ws` - "spaces/tabs
  only, no line breaks" (markup-carve/carve#897) - and only a standalone
  attribute LINE crosses a newline, through `attr_separator`'s continuation.
  Prism and highlight.js served both roles from one `\s`-separated pattern, so
  `*x*{.a` + newline + `.b}` coloured as an attribute block where every engine
  renders it as prose.

  The two roles are now two branches of the same token. The line-anchored one is
  a LOOKBEHIND that does not consume the indentation, so the match still starts
  at the `{` and token boundaries are unchanged everywhere the decision is
  unchanged - which is why exactly one corpus document moves, the one that should
  (`253-an-inline-attribute-block-does-not-span-lines-but-an-attribute-line-does`).
  Anchoring with `^` and the `m` flag is the wrong tool here for the reason
  already recorded on the hard-break rule: Prism applies a pattern to the
  remaining text chunk, so `^` matches at a chunk boundary rather than a line
  start.

  The TextMate grammar is untouched. It got the reported case right by accident -
  its attribute rule is single-line, so it also misses the standalone multi-line
  block, which is the other direction of the same bug. That is recorded as a skip
  on the new inventory entry rather than fixed here.
- **An empty attribute block no longer comes back from the tiptap serializer as
  a class named `class`** (#159). `[x]{}` and `[x]{ }` are valid Carve - an
  empty block is the explicit "make this a span" hook and yields a bare
  `<span>` - but the serializer wrote them back as `[x]{.class}`, so a document
  that passed through a tiptap editor gained a class it never had. The invented
  name was a fallback: a span mark has to write something after `[text]`, or
  the brackets stop being a span on the next parse, and the fallback filled the
  gap with `{.` + the mark's class + `}` even when there was no class to write.
  The empty block `{}` is what that position wants, so `[x]{}` now round-trips
  exactly. Dropping an attribute loses information; inventing one is worse,
  because nothing downstream can tell that it was invented.

  A span whose only class is `custom` still writes `{.custom}`. That string is
  CarveSpan's schema default, so at the serializer an editor-created span and an
  authored `[x]{.custom}` are the same object - only a schema change could
  separate them, and it is not this fallback's call to make.
- **A file that begins with a UTF-8 byte order mark keeps the highlighting on
  its first line** (#154). The mark is neither a space nor a tab, so it sat
  between the line start and the marker and defeated every line-anchored block
  opener in all three grammars: a heading, thematic break, list or task marker,
  quote marker, fence, div, table row or continuation, caption, definition term,
  abbreviation, reference or footnote definition, comment and front matter all
  lost their scope on line 1, and some degraded worse than that - a fence opener
  was claimed by the inline code rule in Prism and highlight.js, and a front
  matter `---` by the smart-typography rule in TextMate.

  A mark at the start of a document is not content (spec: "Line endings and a
  byte order mark"), and every engine strips it. The allowance is deliberately
  restricted to the document's start: a mark on any later line is an ordinary
  zero-width character that opens nothing in carve-rs and carve-php. Since every
  rule anchors with `^` under a multiline flag, the three grammars each needed
  their own document-start assertion - `(?<![\s\S])` in Prism and highlight.js,
  Oniguruma's `\A` in TextMate - which is written up in the README under "One
  rule, three spellings: a leading byte order mark".
- **An indented fence, blockquote or abbreviation definition at document level
  is no longer highlighted by the TextMate grammar** (#138). Carve opens a
  block at column 0, or at an enclosing container's content column - nowhere in
  between, so ` > q`, ` *[HTML]: HyperText` and an indented fence are all
  paragraphs at the top level, and below every open content column they are
  item text (the corpus 178 shape). Following `heading` (#149), the
  `fenced_code`, `blockquote` and `abbreviation` rules are now anchored at
  column 0, with `fenced_code_in_container`, `blockquote_in_container` and
  `abbreviation_in_container` carrying the indented forms - reachable only
  through `container_blocks`, so a fence, quote or abbreviation at a list
  item's content column highlights exactly as before.

  The Prism and highlight.js grammars keep their `^[ \t]*` anchors and are
  unchanged. They have no container model, so tightening them would stop
  highlighting every legitimately indented construct inside a list item or a
  block quote rather than only the invalid top-level one. That divergence is
  deliberate and is now written up in the README under "Where the three
  grammars deliberately differ", with a matching note in each engine grammar.
- **A colon in an attribute key no longer scopes as an attribute block in the
  Prism and highlight.js grammars** (#135). Both built their block from
  `[A-Za-z_][\w:-]*`, so `[x]{a:b}`, `[x]{a:b=v}` and `[x]{xmlns:x=y}` coloured
  as attributes on lines carve-js renders as literal text - `[x]{a:b}` is
  `<p>[x]{a:b}</p>`, braces and all. The damage was not only the brace run:
  once the payload read as attributes, the preceding `[x]` was claimed as a
  span (Prism) or a link label (highlight.js), so a line of prose came out
  looking like a resolved construct.

  An attribute name is the grammar's `identifier` production - a letter or `_`,
  then letters, digits, `_` and `-` - and PART 9 §14 makes one invalid name
  enough to leave the whole block literal. The TextMate grammar in this
  package already spelled it that way, as did both files' own list-marker
  guards, so the two engine grammars now agree with the third, with carve-js,
  and with the comment each file already carried. A colon belongs to the value
  grammar rather than the key, so `[x]{k=a:b}` and `[x]{k="a:b"}` are still
  attribute blocks; `{2=v}`, `{-a}` and `{#-id}` are unaffected and stay
  literal as before.
- **An abbreviation definition inside a div no longer scopes as a definition,
  and a tag inside a heading's literal trailing brace run now scopes as a
  tag** (#125). Two unrelated gaps in the shared grammars:

  In all three grammars, the div/admonition rule matched only its own
  delimiter LINE, leaving the body wide open to the full top-level pattern
  set - which incorrectly let `*[HTML]: Hyper Text` scope as an abbreviation
  definition inside `:::`/`:::`, even though PART 9 recognizes abbreviations
  at document level only (the sibling list-item and blockquote cases already
  read correctly, but only by accident of their own line mechanics, not
  because either detects the container). The div/admonition rule is now a
  real begin/end span (TextMate, highlight.js) or a backreferenced multi-line
  pattern (Prism), closing on an exact colon-run length match per PART 9's
  fence-depth rule, with everything else that already worked inside a div
  body - headings, nested divs, lists, blockquotes - unaffected; only
  `abbreviation`/`abbreviation-definition` is excluded from the body.

  Headings applied no (TextMate) or only a narrow emphasis-only (Prism,
  highlight.js) set of inline patterns to their own text, so `#id` inside a
  heading's literal `{#id .cls}` (headings take no trailing attribute block,
  so the brace run was already correctly left unscoped as attributes) got no
  tag scope either. Headings now recognize a tag inside their own text,
  narrowly - not the full inline set - and specifically exclude a `#`
  immediately after `</` so a heading cross-reference (`</#id>`) is not
  mis-claimed as a tag.

  As a side effect of the div fix, an admonition's own type word (`note`,
  `tip`, …) now gets `class-name` scope in Prism where it previously fell
  through unscoped - a pre-existing ordering gap the restructuring
  incidentally closed.

- **A bullet glued to an attribute block is a marker, and both marker rules now
  validate the payload** (#126). The ordered rule learned the glued form in #85;
  the bullet rule beside it never did, in any of the three grammars, so
  `-{#x} item`, `*{.c} item` and `-{title="a}b"} item` went uncoloured on lines
  that ARE list items. Four corpus documents already pinned the shape and were
  snapshotting the wrong answer - `90-list-item-attributes`, `-4`, `-5` and
  `172-attribute-braces-on-a-list-item-marker-line` - which a snapshot cannot
  report, since it pins whatever the grammar does.

  Copying the ordered guard verbatim would have REGRESSED
  `90-list-item-attributes-6`: `-{+a+} text` is a paragraph, because `{+a+}` is
  an insertion span rather than attributes, and a guard accepting any
  brace-delimited run colours the `-`. So the guard now requires valid attribute
  syntax, and both branches share it - the ordered rule had the same hole,
  unpinned only because no corpus document writes `1.{+a+} text`. Identifiers are
  strict (PART 9 §14) and admit no colon, matching carve-js and the TextMate
  grammar; Prism's and highlight.js's own standalone attribute rules still
  admitted one at the time, which #135 below closes.

  Known limitation, unchanged and shared with every Carve TextMate grammar: the
  checkbox after a glued block (`-{.c} [x] done`) is not scoped, because
  `task_item` runs first and has no glued branch. The bullet is scoped. The guard
  is a lookahead rather than a consuming group, so the attribute rule keeps the
  block - consuming it is the failure mode recorded in #85.
- **A mixed-case roman run is not an ordered marker.** All three grammars spelled a
  roman run as one class, `[ivxlcdmIVXLCDM]+`, which matches any mixture of the two
  cases - so `Vim. text`, `Mix. text` and `Ix. text` coloured as lists where carve-js
  renders paragraphs. Those are exactly the shape of a word starting a sentence,
  which is the risk the rule's own comment was written to avoid: it names `Note.` as
  the case to keep literal, and `Note` happens to fall outside the class while `Vim`
  does not. A roman numeral in Carve is case-consistent, so the fix is two classes.

  Not a length or dictionary rule: `mix.`, `civil.` and `did.` DO open lists
  (`type="i"`, start 1009 / 153 / 999), and `ivx.` and `IVX.` both do too. All five
  spellings are in the shared inventory now - the three mixed-case ones as `LITERALS`,
  which fail in all three grammars when the grammar files are reverted.
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
- **A list item tracks its own content column, in the TextMate grammar** (#94). A
  link-reference definition indented under a list item scoped as a definition at
  ANY indent: the rule allowed leading whitespace and nothing in the grammar knew
  where the item's content actually started. So `- a` over `  [r]: /u` (content
  column 2, line at 2) and `-   a` over `  [r]: /u` (content column 4, line at 2)
  both scoped, where the engines collect the first and leave `[r]` literal in the
  second.

  List items, task items and footnote definitions are now `begin`/`end`
  containers. One stays open across blank lines and closes on the first nonblank
  line indented below its own content column, and the document-level definition
  rule narrows to flush-left, so an indented definition is reachable only through
  a container that has already established the line sits at or beyond that
  column. A definition below every open content column is item text again.

  Exact for bullets at any indent and any separator width, for task items and
  footnote bodies (both measured at column 2 whatever the separator is), and for
  ordered markers up to five characters, which get one rule variant per width.
  Wider ordered markers (`10000.`, `civil.`) and attribute-glued markers
  (`-{#x} item`, `1.{#x} item`) are APPROXIMATE: `vscode-textmate` splices a
  begin-capture into the `end` pattern as literal text, so a captured run cannot
  be counted, and both approximations err toward holding the container open a
  column or two too long rather than closing it early. Every column was measured
  against carve-php, and spot-checked against carve-js, rather than reasoned from
  the spec text. Prism and highlight.js are untouched.
- **A tab after a heading marker leaves the line as prose, in the Prism grammar**
  (#140). The heading separator is a LITERAL SPACE and the pattern accepted
  `[ \t]+`, so a heading marker followed by a tab scoped as a heading where every
  engine renders that line as a paragraph. The separator is required and the run
  behind it stays optional, so whitespace AFTER the space is still heading text,
  and `# Heading`, `#   Heading`, `#Heading` and a bare `#` are all unchanged.
  The sibling markers were already right and are untouched: the quote arm never
  matched a tab and the caption pattern already required a space. highlight.js
  has always declined this line, so the two engines agree now.
- **One term alphabet for an abbreviation definition, in all three grammars.**
  `abbreviation_term` is `(letter | digit)+`, with `letter` enumerated `a`-`z`
  plus `A`-`Z`, and this repo spelled it three ways. TextMate and Prism both
  required `[A-Z][A-Z0-9]*`, so `*[dl]:` and `*[9]:` were prose; highlight.js
  took `[^\]]+`, so `*[e.g.]:` and `*[ß]:` scoped as definitions. All three now
  take the production. Every abbreviation sample in the corpus uses an uppercase
  multi-letter term - the single shape all three spellings agreed on - which is
  why 1210 pinned tokens caught none of it.

  Two Prism fixes fell out of writing the test. Its inner `symbol` was
  unanchored, so it also scoped every capital in the EXPANSION
  (`HyperText Markup Language` tokenized as eight alternating runs, and the
  goldens pinned it); and the expansion had no scope of its own, where TextMate
  has always scoped it `string.unquoted.abbreviation`. Both inner rules have to
  precede `punctuation`, since Prism applies them in order.
- **A description line scopes as a definition only inside a real entry** (#91).
  All three grammars matched a `:` description line unconditionally, per line,
  independent of whether a real `:: ` term preceded it. So a term line
  disqualified by a tab separator followed by `:  d`, and a bare `:  d` after
  ordinary prose with no term at all, both scoped as definition lists where every
  engine renders one paragraph. Corpus `176` and `216` were each snapshotted with
  the wrong answer.

  The rule is an ENTRY now in each grammar: it opens on a real `:: ` term line
  and runs forward through blank lines and lazy-continuation prose until another
  block opener - heading, list or task marker, blockquote, fence, hr, caption,
  table row - ends it, and a `:` description marker only colors while inside it.
  A folded term line and a definition separated from its term by one blank line
  still scope. Narrow trade in highlight.js: a lone `+` continuation marker and a
  `%%%` comment line nested inside a definition body lose their scope, because
  the entry's own `contains` is just the two definition sub-modes. The text is
  unaffected.
- **An indented comment fence closes, in the highlight.js grammar.** The `%%%`
  opener had always been column-free there; the CLOSER was anchored at column 0,
  so an indented fence never closed and the comment span ran to the end of the
  document. Corpus `186` is that shape, and its `tail` line - ordinary item
  content - highlighted as comment text. A comment is recognized at any column
  and closes nothing. Leading whitespace is not part of the delimiter, the `%`
  run is, so the width backreference still holds and `%%%%` does not close
  `%%%`. Prism and TextMate were already correct.
- **Block openers indented inside a container scope in Prism and highlight.js.**
  Carve has no indented code block, so a block construct sits at its container's
  content column: two spaces inside a list item is ordinary indentation. Both
  engines anchored most block rules at column zero, so a heading, caption,
  blockquote, admonition, table row or abbreviation definition inside a list item
  came out as unscoped prose - `- item`, a blank line, then `  # Title`
  reproduces it. This puts the two engines in the position the TextMate grammar
  already took: the same constructs indented at the TOP level, where they are
  literal text, now color as blocks too, because a line-based grammar cannot
  separate the two cases. 73 snapshots re-record. Front matter stays anchored in
  both. TextMate gained the `***` and `___` spellings of an indented thematic
  break along the way, its `hr` rule having listed only the hyphen.
- **A tab does not separate a marker from its content, in any grammar.** The spec
  pins this twice - corpus `176` for markers and `135`/`136`/`137` for the three
  definition kinds - and each of the three grammars highlighted some of the tab
  forms as real constructs where the engines render every one as a paragraph:
  `#`, `-`, `1.`, `::`, `^` and `- [x]` followed by a tab, and `[^a]:`, `[a]:`
  and `*[HTML]:` the same. The blockquote rule was already right in all three and
  is what the others now look like. Two narrower forms came out of review, both
  confirmed against the engine:
  `- [x]<TAB>a` is a bullet whose CONTENT is `[x]<TAB>a`, not a task item, and
  `- -<TAB>a` is a bullet whose content is `-<TAB>a`. highlight.js additionally
  did not test the definition separator at all, so a bare `[r]:` with nothing
  after it also read as a definition.
- **A marker followed only by whitespace is prose in Prism and highlight.js.**
  `# `, `- `, `1. `, `:: ` and `^ ` scoped as markers in both, and Prism also read
  `#` plus a RUN of spaces as a heading, `.+` matching it happily. carve-rs
  renders every one of them as a paragraph. TextMate was already correct, having
  taken the same rule for a bare marker. One snapshot moves the other way and is
  accepted rather than hidden: in `:  %%%` the comment is extracted first, so the
  definition marker then looks content-less and loses its scope. The engine
  renders that body empty - the line is a marker whose only content is a comment,
  a shape a line grammar cannot see - and reverting the guard to keep it would
  re-break the five real cases.
- **A marker alone on its line is prose, in the TextMate grammar**
  (markup-carve/carve#513). The rules did require a separator; they wrote it
  `\s+`, and `\s` matches the line's own newline, so the requirement never bit.
  `#`, `::`, `-`, `1.`, `.` and `^` each got their construct scope where carve-rs
  renders a paragraph. Trailing whitespace is not content either - `# ` renders
  `<p>#</p>` - so each rule now takes `[ \t]+` and a line-end lookahead. Prism
  and highlight.js were already correct on all six; this was a TextMate-only
  divergence, and TextMate is the grammar vscode-carve, intellij-carve and
  sublime-carve port from.

  Not `(?=\S)`, which is the obvious guard and is wrong: Oniguruma counts NBSP as
  whitespace and Carve does not, so a heading whose content starts with a NBSP
  lost its scope under it. An empty task item (`- [ ]` with nothing after) is a
  plain bullet holding the literal `[ ]`, which the task rule now declines and the
  bullet rule takes, matching the engine.
- **A blockquote marker takes a space, in all three grammars**
  (markup-carve/carve#525). None had noticed the space becoming mandatory, so
  `>>= operator` and `>=3 items` colored as quotes. Verified against carve-rs
  rather than read off the rule: `>no space`, `>>x`, `>> x` and a marker followed
  by a TAB are paragraphs, while `>` alone on its line, `> real` and `> > x` are
  quotes. Two surprises worth stating - `>>` is not a nested marker at all,
  nesting is written a space per marker, and a tab does not count as the
  separator. Leading indentation stays allowed.
- **Every ordered marker scopes, including the bare dot**
  (markup-carve/carve#472). A `.` alone continues an ordered sequence and is the
  only marker allowed to drop its value; no grammar here matched it, so a
  `.`-marked list rendered as prose in every editor these grammars reach.
  TextMate was further behind than that: `numbered_item` matched `\d+\.` only, so
  `1)`, `a.` and `iv.` were prose there while Prism and highlight.js had covered
  them for a while. It takes the same marker set as the other two now. All three
  also accept a marker glued to an attribute block (`3.{#x k=v}`, `.{#x}`), which
  is how corpus `88-list-item-attributes-2`/`-3` and
  `174-bare-dot-ordered-markers-3` write it; the old `(?=\s)` lookahead refused
  them.
- **A paragraph is no longer colored as a directive, in the TextMate grammar**
  (#68). `extension_block` scoped `::: name rest-of-line` as a recognized
  directive with a highlighted name and arguments. Measured against carve-js with
  every builtin extension loaded, that shape is not an opener at all -
  `::: note extra text`, `::: chart width=4`, `::: toc 2-4` and
  `::: details Click me` all render as paragraphs - so the rule is removed rather
  than rescoped. Coloring an invalid opener hides the author's mistake, which is
  worse than leaving a valid one uncolored. It was dead in two other ways as
  well: it matched exactly `:::` rather than `:{3,}`, so it could never fire on a
  nested container, and the strict opener rule that handles every width arrived
  after it.
- **Math has no closing dollar sentinel, in Prism and highlight.js.** Both
  required a trailing `$` to close a math span - `` $`x`$ `` inline,
  `` $$`y`$$ `` display. Carve has no such form: the `$` prefix opens a verbatim
  span, the backtick run ends it, and the prefix alone disambiguates currency. On
  spec-valid input Prism dropped the prefix to text and handed the span to
  `code`; highlight.js never matched its end pattern and ran the string mode to
  the end of the block, swallowing the following prose in `42-math` and the
  trailing attribute block in `42-math-2`. The corpus `.crv` files always used
  the correct syntax and the goldens had encoded the defect, which is why CI
  stayed green. `README.md` documented the trailing-sentinel form in three places
  and no longer does; the Tiptap serializer was always correct.
- **A footnote body keeps its blocks, and a definition-shaped paragraph is not
  rewritten** (#121). `carveFootnoteDefinition` only ever serialized a flat list
  of paragraphs, so any non-paragraph block in a footnote body - a table, a
  heading, a nested list, a second paragraph - was silently dropped past the
  first. Every content block serializes now, standalone and indented to the
  body's own fixed continuation column (carve-js's writer canonicalizes on three
  spaces independent of label width or source indentation, verified
  empirically).

  Separately, a top-level paragraph whose literal text starts with a
  `[label]:`-shaped run was escaped with a backslash to keep it from being read
  as a document-level definition at column 0. That backslash reparses into an
  `escaped_text` plus `text` pair where the original held a single plain `text`
  node. A single leading space defeats the same column-0 read without going
  through the escape machinery.
- **A no-break space survives the serializer, in both directions.** Two ways it
  was lost, neither visible to the round-trip test, which compares ASTs - and the
  AST is where both bugs agree with themselves.

  The engines publish U+E000 in a text node's `value` for a no-break space the
  PARSER resolved, from an escaped space or from preserved line-block
  indentation, and publish a literally typed U+00A0 as itself. This serializer
  wrote the private-use codepoint straight into Carve source, so the document
  came out holding a character no author typed and an editor drew a tofu box for
  it. It writes the escape now, except in the two positions where that changes
  the render: at the END of a block, where a trailing backslash is a hard break,
  and immediately before a mark's closing delimiter, where a resolved space kills
  the span (`*a\ *` parses as literal text, while the same run with a typed
  U+00A0 is still strong). Those two take a real U+00A0 instead, which loses only
  the resolved-versus-typed distinction.

  The final `String.prototype.trim` also stripped a real U+00A0 - whitespace to
  JavaScript, content to Carve - so a document whose first or last character was
  one lost it. Only ASCII layout whitespace is structural here.
- **A list marker's own metadata survives, and four inline marks nothing could
  produce now work.** Five defects in the Tiptap bridge, all the same shape: the
  construct is modeled in the Carve AST and dropped here, so a document that goes
  through an editor comes back as a different document.

  `INLINE_MARKS` keys are AST type names, and four named nothing any engine emits
  - `super`/`sub` predate the braced-only spelling, `critic-insert`/
  `critic-delete` predate the rename to `insert`/`delete` - so `{^a^}` threw
  `unsupported node type "superscript"`. `schema-map.json` declared all four
  correctly; nothing had ever compared the map to the converter that has to
  produce the marks, and that check now exists in both directions.

  A marker attribute belongs to the ITEM (PART 9 §15 A8), and ProseMirror drops
  any attribute a node does not declare, so `-{.c} A classed item.` came back as
  `- A classed item.`. The ordered marker style is carried too - Carve records
  `olType`, `delim` and `bareMarker`, where Tiptap's `OrderedList` declares only
  `start`, so `a. An alpha item.` came back as `1.`. Autolinks had no converter
  case at all and threw. A link's trailing attribute run (`[t](/u){#id .c}`) was
  dropped in silence, and is kept now behind two filters that keep the editor
  path honest: Tiptap fills `target` and `rel` in on every link it parses, and
  task-list HTML carries presentation classes no Carve engine emits, so writing
  either back would invent source the author never wrote.
- **The image half of the reference form, and a phantom definition per
  unresolved reference.** Reference LINKS were taught to the converter and the
  serializer; images were left out, so `![moon][m]` with its definition came back
  as `![moon](/moon.png)`, the reference form gone and the definition with it.
  Images carry `ref`/`rawRef` now and get the collapsed or full form the same way
  links do. The serializer also recorded a definition for any reference it saw,
  so `![moon][gone]` came back with a `[gone]: ` pointing at the empty string
  that the author never wrote; only references with a destination are recorded,
  on both the link and the image path.

  `carveFootnoteDefinition` had a serializer case and a registered extension and
  nothing had ever produced one: definitions live on `ast.footnoteDefs` rather
  than in `children`, and the converter walks children only, so every round trip
  dropped the definition and the note's body with it. The converter emits one per
  definition, appended after the body - a definition may be written anywhere and
  renders nothing where it sits, so its existence rather than its position is
  what has to survive.
- **The serializer keeps a reference link a reference link** (#101). `[click][a]`
  with its definition re-serialized to the resolved inline form, so the `rawRef`
  the pre-resolve AST records was gone on reparse. PART 12 §3a made the tree
  pre-resolve precisely so a reference survives a format cycle and stays
  distinguishable from an inline link; the serializer predates that clause. Three
  parts, because any two alone make it worse: the converter carries `ref`/`rawRef`
  onto the link mark; the Link mark DECLARES those attributes, since ProseMirror
  drops what a mark does not declare and the metadata otherwise survived only
  when the JSON never reached an editor; and the serializer writes the
  definitions the labels point at, emitting `[click][a]` without `[a]: …` being a
  worse round trip than the inline rewrite it replaces.

  The form comes from the label, not from replaying `rawRef`: collapsed when the
  label matches the link's own text, full otherwise, because the text may have
  been edited since and replaying the raw string would resurrect the old label.
  Definition POSITION is not preserved - they are collected and emitted together
  at the end - and a label used twice writes one definition.
- **A soft break converts to a newline, not a space** (#102). The
  Carve-to-ProseMirror converter emitted a space text node, so a two-line
  paragraph came back as one line and the serialized document no longer reparsed
  to the same AST. A following block-shaped line cannot arise to make that
  dangerous: a line that would OPEN a block interrupts the paragraph at parse
  time (PART 9 §10 I1), so a soft break is only ever followed by text that opens
  nothing. The safety is structural, not incidental.
- **Attributes on a math span survive serialization.** `` $`a^2` `` carrying an
  id, a class and a data attribute came back bare. Three layers each had a hole:
  `carveMath` declared only `src` and `display`, so there was nowhere to keep
  them (authored key/values travel together in one `keyValues` map, since a
  `data-` name cannot be known upfront); the serializer's math branch never
  called `serializeAttributes`, which every other attribute-bearing node already
  uses; and the bridge built the ProseMirror node from `content` and `display`
  only. Rendering hooks are not authored classes, so the classes carve-php and
  this node's own `renderHTML` add are not re-emitted - which needed a parse
  priority as well, because `CarveSpan` claims any span whose class is a single
  simple word and so re-read the editor's own rendered math as a generic
  attributed span.

  One fix reaches past math: `serializeAttributes` suppressed a `class` of
  `custom` for EVERY caller, because that is the value CarveSpan's class
  attribute defaults to. On every other node the default is `null`, so `.custom`
  there can only be a class the author wrote, and it was being dropped from
  headings and images.
- **Nested list blocks indent to the item's content column** (#45).
  `serializeToCarve` emitted list markers at a fixed two-space step per level and
  continuation blocks one step further, ignoring the enclosing item's real marker
  width. Bullet items (content column 2) were fine; ordered items are wider
  (`1. ` is 3, `10. ` is 4), so a nested sublist marker and a continuation block
  both landed below the content column and dedented out of the item on reparse.
  The serializer threads the literal indent string instead of a depth counter,
  and each item measures its own marker. A task item's `[ ]` is content of a
  plain `- ` bullet rather than part of the marker, so its content column stays 2
  regardless of the checkbox.
- **A list item's non-paragraph blocks survive serialization.**
  `serializeListItem` handled a lead `paragraph` and nested lists and nothing
  else: a second paragraph was emitted at column 0, so it dedented out of the
  list when reparsed, and a code block, block quote, div or table was dropped
  ENTIRELY, the function having no branch for it. Every child serializes now -
  the lead paragraph on the marker line, nested lists with their own marker
  indentation, any other block standalone and indented to the item content
  column, blocks separated by a blank line. One Carve-specific exception is
  preserved: a nested sublist stays TIGHT directly under its lead, since Carve
  nests a content-column marker without a blank line and adding one would render
  the list loose.

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
- **`CarveKit` installs on Tiptap 3 as well as 2.** The kit declared
  `"@tiptap/core": "^2"`, so a Tiptap 3 application could not install it as a
  peer at all, and two things break on 3.x once it is forced. The table extension
  dropped its default export, which fails at module load and takes down every
  suite touching the kit; it is read through a namespace import now that accepts
  whichever shape the installed major provides, and of the 17 tiptap packages the
  kit imports it is the only one affected. StarterKit also bundles Underline and
  Link on 3.x, both of which the kit pushes separately (underline carries Carve's
  `_text_` mapping, link the Carve attribute handling), so each mark registered
  twice; StarterKit is configured with `underline: false, link: false`, keys
  Tiptap 2's StarterKit has no notion of and ignores, so one config serves both
  majors. The peer ranges for core, StarterKit and the underline extension widen
  to `^2 || ^3`.
- **The serializer widens colon fences inward, from local depth.** A closer
  matches its opener's length exactly now (PART 9 §12), so nesting only needs the
  lengths to differ, and an outer container no longer has to outrank everything
  in its subtree. `carveDivFenceLength` was a whole-subtree scan for exactly that
  reason; it is the minimum fence plus the local depth now, threaded down through
  `serializeNode`. Output flips from a `::::` tab set holding a `:::` tab to a
  `:::` set holding a `::::` tab. The old form still parses - the lengths differ
  either way - but it is no longer what `carve fmt` emits in any engine, so a
  document leaving the editor would have been rewritten the first time anyone
  formatted it.
- **The published schema map gains an `accepts` field, and two decisions.** A
  bridge fed a payload from a plain Tiptap editor hits `mention`, the name the
  stock mention extension emits, and the map refused it - and Carve models
  mentions fully, so refusing the stock spelling made an editor fail on a concept
  the language already has. `accepts` names the spellings a bridge should
  recognize on the way IN, which leaves `pm` meaning "the name CarveKit
  registers" - the invariant the schema-map test checks, and widening `pm` would
  have traded a real check for a convenience. `textStyle` is an answered question
  now rather than an open one, and stays out: it is a carrier mark for color,
  font family and font size, so mapping it onto `span` would push presentational
  attributes into a Carve document; an application that wants that registers it
  itself. `abbreviation_def`, which carve-php gained as a real node class, is
  recorded as unmapped for the same reason `comment` and `frontmatter` are - it
  renders nothing of its own and carries document metadata rather than editor
  content.

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
- **`carveToProseMirror` and `astToProseMirror`, so an editor loads through the
  AST.** This package could turn a ProseMirror document INTO Carve and not the
  other way round, so every consumer loaded by rendering Carve to HTML and
  handing that to Tiptap's `parseHTML` - fidelity then depends on each
  extension's HTML parsing rather than on the tree, and an attribute no extension
  claims is gone, silently, on load. The converter already existed as a test
  helper: unpublished, undocumented, reachable only by copying it. The round-trip
  test imports the published module now, so the thing that is tested is the thing
  that ships.

  ```js
  import { carveToProseMirror } from '@markup-carve/carve-grammars/tiptap'

  const doc = carveToProseMirror(source)                              // strict (default)
  const doc = carveToProseMirror(source, { unsupported: 'preserve' }) // lossless-on-save
  ```

  Strict, which throws, stays the default: correct for a test harness, wrong for
  an editor, where opening a document containing one admonition must not fail to
  open the document. In `preserve` an unrepresentable construct becomes a
  `CarveUnsupported` atom carrying its own Carve source, and `serializeToCarve`
  writes that source back out verbatim, so a load/save cycle through an editor
  that cannot EDIT a construct does not LOSE it. `@markup-carve/carve` moves to
  runtime `dependencies`, since the shipped loader imports it.
- **`tiptap/schema-map.json`, the Carve-to-ProseMirror mapping published as
  data** (reachable through the package exports). A bridge needs three
  vocabularies to agree - Carve node types, the ProseMirror node and mark names,
  and which Carve types the editor model cannot represent - and only the first
  was owned anywhere, so an engine building a bridge in another language had to
  rediscover the names, the attribute policy and the divergence set from this
  repo's source, and would drift exactly that way. Every Carve node type appears
  exactly once, either mapped with its ProseMirror name or names, or unmapped
  with a reason. The negative space is deliberately part of the contract: a
  bridge that silently drops table alignment or figure captions is worse than one
  that reports it cannot carry them.
- **Client-side diagram renderers for fenced Graphviz, D2 and PlantUML blocks.**
  The fenced-render presets split in two: Mermaid, WaveDrom, Vega-Lite and Chart
  each render themselves once their library is loaded, while PlantUML, D2 and
  Graphviz have no browser library and emit a hydration element that nothing
  turns into a diagram - so every integration that wanted them hand-rolled its
  own client.

  ```js
  import { renderDiagrams } from '@markup-carve/carve-grammars/diagrams'

  await renderDiagrams(container)                                  // graphviz + d2, offline
  await renderDiagrams(container, { kroki: { server: 'https://kroki.internal' } })
  ```

  `renderGraphvizDiagrams` and `renderD2Diagrams` run OFFLINE, on the WASM builds
  of the viz-js and Terrastruct D2 packages - both optional peer dependencies,
  imported lazily only when a matching block is present, with the engine instance
  reused. `renderKrokiDiagrams` covers PlantUML, which has no offline path: it
  POSTs the source as plain text, so no deflate or base64 dependency is needed,
  takes a `server` for a self-hosted instance, and carries a GDPR note, because
  the default `kroki.io` is a third party outside the caller's domain and the
  diagram source leaves their control. `renderDiagrams` leaves Kroki OFF unless
  asked for it.

  All rendered SVG, offline or from Kroki, rides in an inert
  `data:image/svg+xml` image element, so untrusted diagram output cannot run
  script or expose a `javascript:` link. Every renderer marks what it has handled
  and skips it afterwards, so calling after each content update is safe.
- **TextMate scopes citations and code callouts.** The highlight.js grammar here
  already had both and `textmate/carve.tmLanguage.json` had neither, so citation
  groups and `<N>` callout markers rendered as plain text in Shiki and VS Code.
  Citation groups scope with their integral `+`, per-item `-`/`+` modifiers and
  `;` separators; `<N>` scopes both as a leading annotation line and as a
  trailing marker inside a fenced block, whose body is scanned for it now.

  A bug in the ported rule was found and fixed in the same pass: the citation
  `begin` only checked for a key INSIDE the bracket and never the suffix, while
  its `end` refuses to close a `]` followed by `(`, `[` or `{` - so a link whose
  text happens to contain a mention opened a citation that could never close,
  running away over the line and swallowing the link. `begin` requires the
  closing `]` now, and that it is not followed by one of those three.

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
- `@markup-carve/carve-grammars/shiki`: shared Shiki/VitePress kit (grammar + GitHub themes
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
- Prism.js language definition (`@markup-carve/carve-grammars/prism/carve.js`).
- highlight.js language definition (`@markup-carve/carve-grammars/highlightjs/carve.js`).

### Tiptap integration (`@markup-carve/carve-grammars/tiptap`)
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
