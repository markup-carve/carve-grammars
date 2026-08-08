/**
 * Per-grammar coverage matrix for the shared corpus.
 *
 * For each of the three grammars (prism, highlightjs, tiptap) we declare which
 * corpus categories are COVERED by the conformance suite and which are SKIPPED,
 * each skip carrying a concrete reason. Together `covered` and `skip` must
 * partition the full category list with no gaps and no overlap; the coverage
 * test enforces that, so a newly added spec category forces a deliberate
 * covered-or-skip decision per grammar instead of silently slipping through.
 *
 * Prism and highlight.js are syntax HIGHLIGHTERS: they tokenize arbitrary text,
 * so every category is coverable (the snapshot simply records current token
 * output). Their skip maps are therefore empty, and a new category is implicitly
 * covered. The decision is still forced for them, just by a different gate: the
 * snapshot test requires a committed golden for every covered corpus file, so a
 * new category's files fail snapshot comparison (no golden) until someone runs
 * `snapshots:update` and reviews the recorded tokens.
 *
 * Tiptap is different. The round-trip test needs a carve-AST -> ProseMirror-JSON
 * converter, and the serializer models only a subset of carve constructs. A
 * category is tiptap-COVERED only if every one of its corpus files survives
 * parse -> toPm -> serialize -> parse with an identical AST. Categories using
 * constructs the serializer/converter cannot represent, or that are simply not
 * idempotent through it, are SKIPPED with the specific reason. This set was
 * determined empirically by running the round-trip, not guessed.
 */

const emptySkip = () => new Map();

// Categories the tiptap serializer round-trips cleanly for every corpus file.
// Verified empirically by tests/roundtrip-test.js (which fails if this drifts).
const TIPTAP_COVERED = [
    '02-headings',
    '112-adjacent-attribute-blocks-on-one-line-merge',
    '169-attribute-order-on-an-unwrapped-heading',
    '167-only-the-id-hoists-to-the-section-wrapper',
    // Classified empirically with the spec corpus bump to 26a0d64.
    '257-link-and-image-title-slots-must-be-a-space',
    '259-a-tab-continues-a-list-item-just-as-two-spaces-do',
    '260-an-absorbed-colon-fence-leaves-a-block-quote-s-paragraph-open',
    '261-a-blank-line-holds-spaces-and-tabs-and-nothing-else',
    '262-a-link-title-takes-exactly-one-space',
    '263-a-code-fence-opener-takes-exactly-one-space',
    '270-a-real-div-in-a-container-and-the-flush-left-line-after-it',
    '271-the-flush-left-line-after-a-container-a-quoted-line-opened',
    // Classified with the bump that added them: both round-trip cleanly through
    // parse -> toPm -> serialize -> parse.
    '253-an-inline-attribute-block-does-not-span-lines-but-an-attribute-line-does',
    '251-a-continuation-marker-after-a-blank-line-in-a-loose-item',
    '250-line-endings-and-a-byte-order-mark',
    '230-an-at-sign-is-a-reference-label-character-everywhere-but-the-first-position',
    '233-two-backticks-are-not-a-code-fence-opening-or-closing',
    '234-a-single-percent-is-not-a-comment',
    '235-an-uppercase-roman-numeral-is-a-list-marker',
    '236-a-table-delimiter-cell-needs-at-least-one-dash',
    '237-a-continuation-row-carries-no-trailing-text',
    '238-a-format-character-before-a-scheme-is-not-stripped-and-is-inert',
    '239-a-link-definition-written-before-a-footnote-stays-before-it',
    '240-a-zero-width-character-in-a-reference-definition-destination',
    '242-a-block-image-is-separated-from-the-block-after-it-on-every-target',
    '243-a-tab-indent-is-the-column-it-reaches-whatever-the-line-holds',
    '245-sibling-markers-that-reach-one-column-are-one-list',
    '247-a-continuation-marker-after-a-blank-line-in-the-item',
    '226-a-definition-attached-by-a-continuation-marker-is-collected-and-the-item-keeps-no-trace',
    '224-a-tab-reaches-a-footnote-body-s-column-just-as-two-spaces-do',
    '220-a-definition-past-a-footnote-body-s-column-is-the-body-s-own-text',
    '221-a-heading-reference-folds-unicode-normalization-but-not-compatibility',
    // Promoted by carrying the LIST MARKER's own metadata in this change: the
    // marker attribute (`-{.c} item`), the marker style (`a.`, `iv)`, bare `.`)
    // and the autolink spelling. Each was modeled in the AST and dropped here.
    '90-list-item-attributes',
    '215-a-marker-attribute-may-hold-a-quoted-brace',
    '31-ordered-list-start-and-delimiter',
    '32-ordered-list-dialects',
    '174-bare-dot-ordered-markers',
    '127-autolink-display-keeps-the-raw-content',
    // Promoted by keeping a link's ATTRIBUTE RUN and by writing the email
    // autolink form: `[t](/u){#id .c}` used to come back as `[t](/u)`.
    '17-collapsed-reference-link',
    '108-security-hardening',
    '152-leading-attribute-brace-before-an-inline-span-stays-literal',
    // Promoted by producing `carveFootnoteDefinition` in this change: the
    // serializer could always write one; nothing had ever made one.
    '120-footnotes-placement',
    '202-a-definition-on-a-footnote-body-s-continuation-line-is-collected',
    '212-a-flush-left-line-after-a-footnote-definition-belongs-to-the-document',
    // Promoted by carve-grammars#121: `carveFootnoteDefinition` now serializes
    // every content block (not just a lead paragraph), reusing the same
    // `serializeListItem` pattern of a standalone, indented block per line.
    '218-a-footnote-body-s-own-column-is-two-and-a-third-column-is-its-text',
    '203-a-footnote-body-holds-blocks-and-they-render-where-they-were-written',
    '204-a-heading-in-a-footnote-body-takes-an-id-but-no-section-wrapper',
    '205-an-attribute-line-inside-a-footnote-body-attaches-inside-it',
    '206-a-nested-list-in-a-footnote-body-stays-nested',
    '66-footnote-with-multiple-blocks',
    // Promoted by carve-grammars#121: a top-level paragraph whose text starts
    // with a `[label]:`-shaped run only needed its bracket escaped to avoid
    // being read as a document-level definition at column 0. Swapping that
    // escape for a single leading space keeps it a plain `text` node on
    // reparse instead of splitting into `escaped_text` + `text`.
    '219-a-definition-below-a-footnote-body-s-column-is-the-document-s-own-text',
    '134-link-reference-definition-separator-must-be-a-space',
    // Promoted by the unresolved-reference fix in this change: with no phantom
    // definition invented, an unresolved reference survives the round trip.
    '192-a-collapsed-reference-is-matched-by-the-label-the-author-wrote',
    '18-unresolved-reference-link',
    '76-reference-labels-are-case-sensitive',
    '171-implicit-heading-references-with-no-definition',
    // Reference IMAGES round-trip since the converter and serializer learned
    // the image half of the reference form (carve-grammars#101 covered links).
    '198-an-image-takes-a-reference-the-way-a-link-does',
    '199-a-collapsed-image-reference-uses-its-alt-text-as-the-label',
    '200-one-definition-serves-a-link-and-an-image',
    '201-an-unresolved-image-reference-stays-literal',
    '210-a-quote-marker-is-plus-a-space-and-a-lazy-line-keeps-its-own-text',
    '211-a-block-attribute-line-inside-a-quote-ends-the-paragraph-above-it',
    '213-a-tag-inside-a-literal-brace-run-is-still-a-tag',
    '217-a-heading-id-keeps-a-non-ascii-space',
    // round-trips since the serializer learned the reference form and writes the
    // definitions it points at (carve-grammars#101)
    '121-scheme-probe-strips-unicode-whitespace',
    // round-trips cleanly since the soft break became a newline (carve-grammars#102)
    '12-inline-code',
    '73-parenthesized-ordered-marker',
    '85-blockquote-lazy-continuation-stops-at-a-fenced-block',
    '134-footnote-definition-requires-an-inline-body',
    '156-wrapped-definition-term-continuation-below-the-content-column-strips-leading-whitespace',
    '176-a-marker-separator-is-a-space-never-a-tab',
    '222-a-tab-as-the-first-character-of-a-definition-term',
    '82-single-line-headings',
    '04-images',
    '06-task-lists',
    '21-math',
    '28-hard-line-breaks',
    '34-thematic-breaks',
    '38-bare-urls-stay-literal',
    '44-mentions-and-tags',
    '51-table-without-alignment',
    '54-fenced-code-shorter-inner-fence',
    '59-mention-ignores-email-addresses',
    '60-tag-requires-a-word-boundary',
    '63-table-multi-line-cell-continuation',
    '65-ordered-marker-vs-prose',
    '67-empty-delimiters',
    '68-nested-containers',
    '74-doubled-emphasis-delimiters',
    '77-two-char-delimiter-runs',
    '81-fenced-code-language-with-punctuation',
    '94-literal-less-than-in-prose',
    '100-block-quote-continuation-marker',
    '102-paragraph-trailing-whitespace',
    '110-unquoted-attribute-values-may-contain-dots-and-colons',
    '111-a-pipe-pair-with-no-cell-is-not-a-table',
    '113-a-continuation-row-needs-a-body-row',
    '117-trojan-source-heading-ids-are-nfc-normalized-and-strip-invisible-controls',
    '118-trojan-source-rendered-text-and-code-strip-bidi-override-controls',
    '121-classes-are-deduplicated',
    '122-code-span-and-image-trailing-attributes-are-strict',
    '123-a-bare-attribute-block-on-its-own-line-is-literal',
    '124-a-backslash-in-a-link-destination-is-a-literal-character',
    '131-sublist-marker-interrupts-a-continuation-paragraph',
    '133-footnote-definition-separator-must-be-a-space',
    '140-table-row-closing-pipe',
    '147-fence-folds-as-lazy-inline-code-above-the-content-column',
    '151-attribute-block-after-a-mention-stays-literal',
    '56-table-cell-escaped-pipe',
    '207-a-reference-image-takes-a-caption',
    '209-an-unresolved-reference-image-takes-no-caption',
    '231-a-tab-after-a-heading-quote-or-caption-marker-leaves-the-line-as-prose',
    '244-the-same-column-written-with-four-spaces',
];

// Categories the tiptap serializer cannot round-trip, with the concrete reason.
// "unsupported X" = the converter has no faithful ProseMirror mapping for X (it
// throws). "lossy" = it converts but the re-parse differs from the original.
const TIPTAP_SKIP = new Map([
    ['254-colon-fence-separator-must-be-a-space', 'several invalid fence forms reparse differently, and the pipe-prefixed variants produce unsupported line blocks'],
    ['255-colon-fence-metadata-slots-must-be-a-space-too', 'the invalid tab-separated metadata forms reparse to a different AST after serialization'],
    ['256-table-cell-padding-must-be-a-space', 'several variants contain unsupported table span cells, and one padded-cell form reparses differently'],
    ['258-code-fence-metadata-slots-must-be-a-space-too', 'the invalid tab-separated and multi-space metadata forms are normalized and reparse to a different AST'],
    ['264-a-frontmatter-opener-takes-exactly-one-space', 'frontmatter is not modeled by the ProseMirror converter'],
    ['265-a-reference-definition-s-metadata-slots-take-exactly-one-space', 'invalid reference-definition metadata spacing is normalized and reparses differently'],
    ['266-a-reference-definition-is-anchored-at-end-of-line', 'the invalid trailing reference-definition forms are respelled and reparse to a different AST'],
    ['267-a-definition-marker-s-separator-is-a-space-and-it-is-a-run', 'abbreviation definitions are unsupported, and one remaining definition form reparses differently'],
    ['268-trailing-whitespace-on-a-content-line-is-dropped', 'some whitespace-sensitive forms reparse differently and others contain unsupported literal-inline or line-block nodes'],
    ['269-a-definition-body-continuation-indented-past-its-column-is-lazy-text', 'the definition continuation indentation is normalized and reparses to a different AST'],
    ['272-an-autolink-body-admits-non-ascii-and-excludes-format-characters', 'one variant produces unsupported smart punctuation and another reparses differently'],
    ['273-the-inline-attribute-interior-is-space-only-the-attribute-line-is-not', 'the whitespace-sensitive attribute form is normalized and reparses to a different AST'],
    ['274-a-quoted-attribute-value-stops-at-the-newline', 'the unterminated quoted attribute forms are respelled and reparse to a different AST'],
    ['275-a-collapsed-reference-reaches-a-heading-by-the-heading-s-rendered-text', 'collapsed heading references are not preserved faithfully and reparse to a different AST'],
    ['276-a-fence-opened-on-a-list-marker-line-body-below-the-content-column', 'list/fence indentation is normalized and all variants reparse to a different AST'],
    ['277-a-below-column-marker-after-a-comment-where-no-paragraph-is-open', 'comments are unsupported, and the non-comment variant reparses differently'],
    ['278-a-list-marker-at-the-content-column-inside-an-open-fence', 'the nested list/fence structure is normalized and reparses to a different AST'],
    ['279-a-boundary-line-inside-an-open-fence-does-not-end-the-container', 'comment variants are unsupported and the remaining container-boundary forms reparse differently'],
    ['280-a-container-a-lazy-line-folded-into-is-still-open', 'one lazy container continuation is normalized and reparses to a different AST'],
    ['281-a-caption-attaches-across-one-blank-line', 'figures are unsupported, while the non-figure caption forms reparse to a different AST'],
    ['246-the-continuation-marker-at-an-item-s-own-column-and-what-follows-it', 'the `+` continuation marker is not re-emitted, so the block it attached comes back as ordinary item content and the reparse differs'],
    ['248-an-attribute-name-admits-no-colon', 'a colon-bearing name is literal text, and the serializer either re-spells it as a smart_punctuation node it cannot convert or writes it back in a form that reparses differently'],
    ['249-trailing-whitespace-after-a-block-marker', 'trailing whitespace after a marker is what the sixth example pins, and the serializer normalizes it away, so the reparse loses the distinction the document exists to record'],
    ['241-a-multi-line-raw-block-is-placed-at-its-opening-and-verbatim-after-it', 'the converter has no node type for a raw block, so it throws'],
    ['181-a-div-does-not-define-an-abbreviation-either', 'the serializer escapes the `[` in the abbreviation-shaped line, so the div body reparses with a literal backslash'],
    ['197-a-comment-ends-the-paragraph-it-sits-under', 'the converter has no node type for `comment`, so it throws'],
    ['208-a-combined-bold-italic-span-may-cross-a-line', 'the combined `/*...*/` span is re-spelled per line, so a multi-line span becomes two single-line ones'],
    ['214-a-comment-fence-at-column-0-ends-the-item-a-line-does-not', 'the converter has no node type for `comment`, so it throws'],
    ['216-a-description-line-needs-a-term-above-it', 'the bare `:` line is escaped and a phantom empty definition is appended'],

    // Added when the corpus submodule was refreshed. Each reason was measured
    // by running the round trip, not guessed - the same rule the header states.
    ['69-opaque-spans-inside-a-container', 'the converter has no node type for `comment`, so a container holding one throws'],
    ['70-blocks-that-render-to-nothing', 'same `comment` gap, plus `abbreviation-def`, which the converter also does not model'],
    ['175-a-repeated-definition-which-one-wins', 'footnote definitions are dropped on serialize (`see [^f].` + two `[^f]:` bodies comes back as `see [^f].` alone), and one file also hits the `abbreviation-def` gap'],
    ['177-two-abbreviation-definitions', 'the converter has no node type for `abbreviation-def` and throws, the same gap as 70-blocks-that-render-to-nothing'],
    ['178-a-flush-left-line-needs-an-open-paragraph-to-fold-into', 'an empty block quote in a list item is not reconstructed and the paragraph after it folds onto the marker line, so `. >` + `X` comes back as `. > X`'],
    ['179-an-abbreviation-definition-is-recognized-only-at-document-level', 'the converter has no node type for `abbreviation-def` and throws, the same gap as 177-two-abbreviation-definitions'],
    ['180-a-list-item-does-not-define-an-abbreviation-either', 'same `abbreviation-def` gap - the definition that does NOT define is still an `abbreviation-def` node in the tree, so the converter throws before the case can be exercised'],
    ['181-openers-past-the-nesting-cap-are-one-paragraph', 'past the cap the over-cap openers degrade to ONE paragraph whose text is the raw source lines, and the serializer rewrites fence widths per nesting level, so that paragraph comes back holding different text (`:::: note` vs `:::: note x`) even though the tree shape is identical'],
    ['182-a-comment-is-recognized-at-any-column', 'the converter has no node type for `comment` and throws, the same gap as 69-opaque-spans-inside-a-container'],
    ['183-a-definition-below-every-content-column-folds-as-text', 'the fold is lost on serialize: `- - a` + ` [^f]: x` is item TEXT because the line sits below every content column, but it comes back as `-   - a` + a blank + a flush-left `[^f]: x`, which re-parses as a real document-level footnote definition - the opposite of what the category pins'],
    ['184-a-caret-is-a-reference-label-not-an-empty-footnote', 'the reference-link gap (#101) with the destination lost as well: `[^]: /u` plus `see [text][^].` comes back as `see [text]().` - an empty destination, not just an inlined one. The second example escapes instead: a bare `see [^].` re-serializes as `see \\[^].`'],
    ['185-an-invisible-line-does-not-cancel-a-blank-line-separation', 'the converter has no node type for `comment` and throws, the same gap as 69-opaque-spans-inside-a-container'],
    ['186-a-comment-fence-is-a-comment-at-any-column-too', 'same `comment` gap - the indented fence is still a comment node, so the converter throws before the column question is reached'],
    ['187-a-floating-attribute-stops-at-the-item-boundary', 'the floating attribute is dropped on serialize: `- a` / blank / `  {.c}` / `- b` comes back as `- a` / `- b`, so the case cannot be exercised - the attribute the category is about is gone before the boundary matters'],
    ['188-a-comment-under-a-nested-item-does-not-close-it', 'the converter has no node type for `comment` and throws, the same gap as 69-opaque-spans-inside-a-container'],
    ['189-a-definition-inside-a-comment-registers-nothing', 'same `comment` gap - the definition is INSIDE the comment, so the converter meets the comment node first and throws before the opacity the category is about can be exercised'],
    ['190-a-blank-after-a-comment-still-ends-the-item', 'the converter has no node type for `comment` and throws, the same gap as 69-opaque-spans-inside-a-container'],
    ['191-a-comment-fence-under-a-nested-item-does-not-close-it-either', 'same `comment` gap, fence form - the converter meets the comment node before the nesting question the category is about'],
    ['193-an-abbreviation-at-a-list-item-s-content-column-is-still-not-a-definition', 'two gaps at once. The abbreviation form loses BOTH its escaping and its column: `  *[HTML]: Hyper Text` comes back as `\\*\\[HTML]: Hyper Text` flush left, so the line is no longer at the content column the category is about. The `-2` form is the opposite - the link definition there IS collected (correctly, carve-rs#570 / carve-php#765), so the serializer writes `see [t](/u)` and the definition is gone'],
    ['194-a-definition-inside-a-container-is-collected-at-that-container-s-content-column', 'the reference-link gap (#101), and the first example shows its worst form: `> - a` plus a definition at the quoted item column comes back as `see [t]()` - an EMPTY destination. The third escapes instead, re-serializing the definition as `> \\[r]: /u` inside the quote'],
    ['195-trailing-attributes-on-a-link-reference-definition', 'the reference-link gap (#101) with the ATTRIBUTES lost as well: `[ex]: /u {.external}` plus `[Example][ex]` comes back as `[Example](https://example.com)` with no class, so the very thing the category pins - attributes reaching every link through the definition - is gone on reparse'],
    ['01-emphasis', 'bold-italic and critic-substitute inline nodes are not modeled by the serializer'],
    ['03-links', 'the converter models neither `heading_ref` (a crossref) nor `escaped_text`'],
    ['05-lists', 'figure (image-with-caption) blocks inside list items are not modeled'],
    ['07-blockquote-with-attribution', 'figure / caption blocks are not modeled'],
    ['08-image-with-caption', 'figure / caption blocks are not modeled'],
    ['09-tables', 'table captions (^ caption) are dropped on serialize'],
    ['10-tables-with-rowspan-and-colspan', 'rowspan/colspan filler cells are not reconstructed into ProseMirror spans'],
    ['11-fenced-code', 'a variant is lossy through the serializer'],
    ['13-attributes', 'headings/spans with key/value attributes are not fully represented'],
    ['14-frontmatter', 'front matter is not modeled by the serializer'],
    ['15-heading-ids', 'cross-reference links to heading ids are not modeled'],
    ['16-reference-link', 'reference-link definitions are not represented in the ProseMirror model'],
    ['19-smart-typography-dashes-and-quotes', 'smart-typography output is lossy on reparse (quote-context edge cases added with spec 750ddfa)'],
    ['20-smart-typography-arrows-and-symbols', 'smart-typography output is lossy on reparse'],
    ['22-footnotes', 'footnote definition blocks are not faithfully reconstructed'],
    ['23-inline-footnotes', 'inline footnote bodies are lossy through the serializer'],
    ['24-generic-divs', 'divs carrying a class and admonitions are not modeled'],
    ['25-definition-lists', 'definition lists are not modeled'],
    ['26-comments', 'comment blocks are not modeled'],
    ['223-an-abbreviation-term-is-one-ascii-alphanumeric-word', 'abbreviation definitions are not modeled, the same gap as 43-abbreviations - both files reparse to a different AST'],
    ['225-a-footnote-body-s-last-block-when-it-is-not-a-paragraph-gets-a-synthesized-paragraph-for-the-backlink', 'the `-5` file ends its body with a raw block, which is not modeled - the same gap as 27-raw-blocks. The other four files in the category do round-trip'],
    ['227-a-definition-inside-a-definition-list-dd-is-collected-and-the-entry-keeps-no-trace', 'both files reparse to a different AST: the entry is an EMPTY `dd`, and an empty description has no source spelling that reads back - the serializer writes a bare `:` and it rejoins the term (markup-carve/carve#805)'],
    ['228-a-line-at-a-footnote-definition-s-own-column-followed-by-non-blank-text-forms-its-own-tight-block', 'reparses to a different AST: the collected definition still decides the item looseness, so the round trip changes tight to loose (carve-js#732)'],
    ['229-an-empty-abbreviation-term-is-not-a-definition', 'reparses to a different AST: the line is prose because the term is empty, and the abbreviation-definition gap of 43-abbreviations reaches the literal form too'],
    ['232-two-dashes-are-not-a-thematic-break', 'unsupported smart_punctuation: `--` is an en dash inline node the converter has no type for, so the line cannot be rebuilt'],
    ['27-raw-blocks', 'raw blocks are not modeled'],
    ['29-non-breaking-space', 'the converter does not model the `smart_punctuation` node'],
    ['30-raw-inline', 'raw inline spans are not modeled'],
    ['33-editorial-markup', 'critic-substitute inline nodes are not modeled'],
    ['35-cross-reference', 'cross-reference inline nodes are not modeled'],
    ['36-autolinks', 'the converter does not model `smart_punctuation`, which one variant produces alongside the autolinks'],
    ['37-escapes', 'the converter does not model the `escaped_text` node'],
    ['39-inline-span', 'the empty and whitespace-only blocks round-trip now; what is left is `[x]{???}`, where the block is not a valid attribute block so the whole run is literal text - the serializer escapes the opening bracket and `\\[x]{???}` reparses with an `escaped_text` node the source did not have, the same gap as 37-escapes'],
    ['40-superscript-and-subscript', 'a BARE `^6^` is literal text (sup/sub are braced-only) and the serializer escapes only the leading caret, so `10^6^` comes back as `10\\^6^`'],
    ['252-a-tab-separates-two-attributes-and-pads-a-block-as-a-space-does', 'nothing to do with tabs: the serializer drops a trailing attribute block from strong entirely (`*x*{.a .b}` comes back as `*x*`), the same gap as 13-attributes. The empty-block half of this category (`[x]{\\t}`) round-trips as of carve-grammars#159'],
    ['41-line-blocks', 'line blocks (div with attrs) are not modeled'],
    ['42-admonitions', 'admonition blocks (:::warning) are not modeled'],
    ['43-abbreviations', 'abbreviation definitions are not modeled'],
    ['45-inline-extensions', 'inline extension calls are not modeled'],
    ['46-symbols', 'the converter does not model the `symbol` node'],
    ['47-numbered-cross-references', 'numbered cross-references and figures are not modeled'],
    ['48-table-column-alignment', 'per-column alignment markers are dropped on serialize'],
    ['49-table-per-cell-alignment-override', 'per-cell alignment markers are dropped on serialize'],
    ['50-headerless-table-alignment', 'alignment markers are dropped on serialize'],
    ['52-table-alignment-with-colspan', 'rowspan/colspan filler cells are not reconstructed'],
    ['53-table-doubled-alignment-marker', 'alignment markers are dropped on serialize'],
    ['55-blockquote-caption-after-a-blank-line', 'figure / caption blocks are not modeled'],
    ['58-abbreviation-matches-on-word-boundaries-only', 'abbreviation definitions are not modeled'],
    ['61-table-stacked-rowspan', 'rowspan filler cells are not reconstructed'],
    ['62-smart-typography-escapes-and-code', 'smart-typography output is lossy on reparse'],
    ['64-table-rowspan-with-multi-line-content', 'rowspan filler cells are not reconstructed'],
    ['69-attribute-edge-cases', 'key/value spans, div/heading attributes and extensions are not modeled'],
    ['70-escape-coverage', 'a variant is lossy through the serializer'],
    ['72-emphasis-edge-cases', 'an emphasis edge case is lossy through the serializer'],
    ['73-list-nesting-and-looseness', 'nested-list looseness differs on reparse'],
    ['75-nested-brackets-in-link-text', 'nested brackets in link text are lossy through the serializer'],
    ['78-trailing-attribute-block-edge-cases', 'trailing attribute-block edge cases are lossy'],
    ['79-paragraph-interruption', 'admonition/comment interruption cases are not modeled'],
    ['80-blockquote-lazy-continuation', 'blockquote lazy continuation differs on reparse'],
    ['84-list-lazy-continuation', 'list lazy continuation and admonitions are not modeled'],
    ['85-compact-list-blocks', 'a blockquote nested in a list item is dropped on serialize'],
    ['86-list-continuation-marker', 'list continuation markers differ on reparse'],
    ['87-block-attribute-lines', 'standalone block attribute lines are not modeled'],
    ['89-mention-and-tag-name-boundaries', 'mention/tag inline nodes are not modeled'],
    ['90-superscript-in-a-table-cell', 'the `-2` variant holds a BARE `^2^`, which is literal text (sup/sub are braced-only), and the serializer escapes only the leading caret - `\\^2^` in the cell'],
    ['91-nested-comment-fences', 'comment blocks are not modeled'],
    ['92-strong-emphasis-starting-with-a-link', 'a link-in-emphasis edge case is lossy on reparse'],
    ['93-abbreviation-definition-interrupts-a-paragraph', 'abbreviation definitions are not modeled'],
    ['95-boolean-attributes', 'boolean key/value attributes on spans are not modeled'],
    ['96-table-span-marker-in-first-column', 'rowspan/colspan filler cells are not reconstructed'],
    ['97-table-cell-attributes', 'per-cell attributes are lossy through the serializer'],
    ['98-table-row-attributes', 'per-row attributes are lossy through the serializer'],
    ['99-table-header-cell-rowspan', 'header-cell rowspan filler cells are not reconstructed'],
    ['101-heading-marker-column-zero', 'an indented (literal) # is re-emitted column-0 as a heading on reparse'],
    ['103-marker-line-nested-lists', 'marker-line nested lists (- - A) are lossy on reparse'],
    ['104-blocked-span-marker-renders-as-empty-cell', 'table span-marker cells are not modeled'],
    ['105-colspan-marker-scans-left-past-a-consumed-cell', 'table span-marker cells are not modeled'],
    ['107-link-destination-parentheses-balance', 'round-trips to a different AST'],
    ['108-empty-link-and-image-titles-are-preserved', 'empty link/image titles are dropped on serialize'],
    ['109-cross-references-resolve-inside-footnote-bodies', 'footnote definition bodies are lossy on reparse'],
    ['114-fence-opener-with-a-nested-list-body-inside-a-list-item', 'admonition blocks are not modeled'],
    ['115-footnote-definition-inside-a-container-is-collected', 'footnote definitions inside containers are lossy on reparse'],
    ['116-cyclic-cross-reference-resolves-to-one-level', 'cross-reference inline nodes are not modeled'],
    ['126-editorial-markup-takes-a-trailing-attribute', 'editorial markup with a trailing attribute is lossy on reparse'],
    ['127-emphasis-opener-slash-adjacency', 'the converter does not model the `emphasis` node'],
    ['128-bold-italic-delimiter-needs-content', 'the converter does not model the `emphasis` node'],
    ['129-emphasis-span-closes-before-a-following-delimiter', 'round-trips to a different AST'],
    ['130-thematic-break-requires-contiguous-markers', 'round-trips to a different AST'],
    ['135-abbreviation-definition-separator-must-be-a-space', 'round-trips to a different AST'],
    ['136-unclaimed-openers-stay-literal', 'the converter does not model the `symbol` node'],
    ['137-inline-literal', 'the converter does not model the `literal_inline` node'],
    ['138-all-space-verbatim-content', 'the converter does not model the `literal_inline` node'],
    ['139-trailing-whitespace-boundaries', 'the converter does not model the `literal_inline` node'],
    ['141-post-blank-list-continuation-content-column-model', 'round-trips to a different AST'],
    ['142-nested-item-looseness-does-not-propagate-to-the-outer-item', 'the converter does not model the `block_quote` node'],
    ['143-definition-list-as-a-first-class-block-opener', 'the converter does not model the `definition_list` node'],
    ['144-table-as-a-block-opener-in-a-list-item', 'the converter does not model the `soft_break` node'],
    ['145-adjacent-slash-and-underscore-emphasis-nest', 'the converter does not model the `emphasis` node'],
    ['146-colon-fence-as-a-block-opener-in-a-list-item', 'the converter does not model the `soft_break` node'],
    ['148-abbreviation-title-escapes-its-markup-characters', 'the converter does not model the `abbreviation_def` node'],
    ['149-indented-ordered-marker-content-column-includes-the-marker-indent', 'the converter does not model the `soft_break` node'],
    ['152-under-indented-definition-attaches-over-indented-definition-folds', 'the converter does not model the `definition_list` node'],
    ['153-image-trailing-attribute-is-strict-about-the-glue', 'round-trips to a different AST'],
    ['155-indented-attribute-line-stays-literal', 'the converter does not model the `soft_break` node'],
    ['156-indented-image-and-caption-stay-literal', 'the converter does not model the `soft_break` node'],
    ['157-indented-reference-and-footnote-definitions-stay-literal', 'the converter does not model the `smart_punctuation` node'],
    ['158-indented-colon-fence-blocks-stay-literal', 'the converter does not model the `soft_break` node'],
    ['159-below-content-column-div-body-in-a-list-item-stays-literal', 'the converter does not model the `soft_break` node'],
    ['160-outer-item-with-an-internal-blank-before-an-attached-block-is-loose', 'round-trips to a different AST'],
    ['161-unresolved-footnote-reference-with-a-trailing-attribute-stays-literal', 'round-trips to a different AST'],
    ['162-tight-list-item-keeps-trailing-text-after-a-block-bare', 'the converter does not model the `code_block` node'],
    ['163-quote-flanking-after-an-escaped-character', 'the converter does not model the `escaped_text` node'],
    ['164-comment-fence-with-trailing-text', 'the converter does not model the `comment` node'],
    ['165-unterminated-comment-fence', 'the converter does not model the `comment` node'],
    ['57-table-cell-pipe-inside-code-span', 'a code span holding a pipe reparses into different table cells'],
    ['166-widened-verbatim-fences', 'the converter does not model the `literal_inline` node'],
    ['168-headings-inside-containers-are-not-wrapped', 'a heading inside a quote or div reparses into a different AST'],
    ['170-attribute-braces-on-a-list-item-marker-line', 'headings with attributes are not represented (attrs only support id)'],
]);

export const COVERAGE = {
    prism: { covered: new Set(), skip: emptySkip() },
    highlightjs: { covered: new Set(), skip: emptySkip() },
    tiptap: { covered: new Set(TIPTAP_COVERED), skip: TIPTAP_SKIP },
};

/**
 * Check that a grammar's covered+skip sets partition the given category list.
 * @param {string} grammarName - 'prism' | 'highlightjs' | 'tiptap'.
 * @param {string[]} allCategories - the full corpus category list.
 * @returns {{unclassified: string[], overlap: string[]}}
 */
/**
 * A category's identity is its SLUG, not its numbered filename.
 *
 * The corpus is generated from docs/examples in document order, so the numeric
 * prefix is a position, and inserting one example anywhere renumbers every
 * category after it. Keyed by the full name, this matrix then reports the whole
 * tail as unclassified: bumping the corpus submodule across 33 commits produced
 * 106 unclassified categories for tiptap, of which 103 were the same constructs
 * under new numbers and only THREE were new.
 *
 * That is why the submodule sat behind - refreshing it meant re-keying a
 * hundred entries by hand for no information, so nobody did, and the three real
 * decisions waited behind the noise.
 */
/**
 * A corpus name's identity with the spec's ordering removed: `01-emphasis-10`
 * -> `emphasis-10`, `01-emphasis` -> `emphasis`. Shared with the snapshot
 * goldens, which are keyed the same way and for the same reason (#74).
 */
export const slugOf = (category) => category.replace(/^\d+-/, '');

export function assertPartition(grammarName, allCategories) {
    const entry = COVERAGE[grammarName];
    if (!entry) throw new Error(`Unknown grammar: ${grammarName}`);

    const skipSlugs = new Set([...entry.skip.keys()].map(slugOf));
    // For highlighters, an empty covered set means "everything is covered" only
    // if we also treat the full category list as covered. To keep the partition
    // meaningful (and snapshot-driven), prism/hljs cover every category that is
    // not explicitly skipped.
    const coveredSlugs = grammarName === 'tiptap'
        ? new Set([...entry.covered].map(slugOf))
        : new Set(allCategories.filter((c) => !skipSlugs.has(slugOf(c))).map(slugOf));

    const unclassified = [];
    const overlap = [];
    for (const cat of allCategories) {
        const slug = slugOf(cat);
        const inCovered = coveredSlugs.has(slug);
        const inSkip = skipSlugs.has(slug);
        if (inCovered && inSkip) overlap.push(cat);
        if (!inCovered && !inSkip) unclassified.push(cat);
    }
    return { unclassified, overlap };
}

/**
 * The effective covered category set for a grammar (highlighters cover all
 * non-skipped categories; tiptap covers only its explicit list).
 * @param {string} grammarName
 * @param {string[]} allCategories
 * @returns {Set<string>}
 */
export function coveredCategories(grammarName, allCategories) {
    return new Set(allCategories.filter((c) => isCovered(grammarName, c)));
}

/**
 * Slug-keyed lookups. Every consumer of this matrix MUST go through these.
 *
 * `assertPartition` compared by slug from the start, but `coveredCategories`
 * and the round-trip test read the raw Sets, so they kept matching by the
 * numbered name. One inserted corpus example then reclassified every covered
 * category as skipped - and a skipped category is only checked for whether it
 * COULD round-trip, so the real assertions stopped running and the failure
 * surfaced as a list of suggested promotions rather than an alarm.
 */
const slugCache = new Map();
const slugSet = (key, source) => {
    let set = slugCache.get(key);
    if (!set) {
        set = new Set([...source].map(slugOf));
        slugCache.set(key, set);
    }
    return set;
};

/** @returns {boolean} whether this grammar covers the category, by slug. */
export function isCovered(grammarName, category) {
    const entry = COVERAGE[grammarName];
    if (!entry) throw new Error(`Unknown grammar: ${grammarName}`);
    const slug = slugOf(category);
    if (slugSet(`${grammarName}:skip`, entry.skip.keys()).has(slug)) return false;
    // Highlighters cover everything not explicitly skipped; see assertPartition.
    if (grammarName !== 'tiptap') return true;
    return slugSet(`${grammarName}:covered`, entry.covered).has(slug);
}

/** @returns {string|undefined} the skip reason for this category, by slug. */
export function skipReason(grammarName, category) {
    const entry = COVERAGE[grammarName];
    if (!entry) throw new Error(`Unknown grammar: ${grammarName}`);
    const slug = slugOf(category);
    for (const [key, reason] of entry.skip) {
        if (slugOf(key) === slug) return reason;
    }
    return undefined;
}
