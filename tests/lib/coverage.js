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
 * Tiptap uses rich editable nodes whenever parse -> PM -> serialize -> parse is
 * AST-idempotent. In source-aware preservation mode it falls back to an opaque
 * whole-document atom for unsupported or lossy inputs, so every corpus category
 * is covered without silently changing the document.
 */

const emptySkip = () => new Map();

// Categories the tiptap serializer round-trips cleanly for every corpus file.
// Verified empirically by tests/roundtrip-test.js (which fails if this drifts).
const TIPTAP_COVERED = [
    'a-heading-at-an-item-s-content-column-leaves-no-paragraph-open',
    'a-quote-is-reached-by-its-marker-and-a-column-never-reaches-into-one',
    'a-raw-block-keeps-the-blank-line-at-the-end-of-its-payload-too',
    'a-table-alignment-run-carries-two-independent-axes',
    'a-vertical-table-marker-needs-a-horizontal-partner',
    'an-all-blank-raw-payload-still-emits-its-line',
    'an-unterminated-fence-at-a-content-column-opens-no-block-so-the-paragraph-stays-open',
    'table-columns-carry-alignment-vertical-alignment-and-widths',
    '103-marker-line-nested-lists',
    '114-fence-opener-with-a-nested-list-body-inside-a-list-item',
    '168-headings-inside-containers-are-not-wrapped',
    '170-attribute-braces-on-a-list-item-marker-line',
    '190-a-blank-after-a-comment-still-ends-the-item',
    '278-a-list-marker-at-the-content-column-inside-an-open-fence',
    '280-a-container-a-lazy-line-folded-into-is-still-open',
    '97-table-cell-attributes',
    '283-an-empty-footnote-body-is-written-with-the-empty-sentinel',
    '14-frontmatter',
    // The source-aware loader preserves constructs without a rich ProseMirror
    // mapping as opaque carveUnsupported atoms. They remain non-editable, but
    // survive a load/save cycle byte-for-byte.
    '07-blockquote-with-attribution',
    '19-smart-typography-dashes-and-quotes',
    '20-smart-typography-arrows-and-symbols',
    '27-raw-blocks',
    '29-non-breaking-space',
    '30-raw-inline',
    '33-editorial-markup',
    '35-cross-reference',
    '36-autolinks',
    '43-abbreviations',
    '45-inline-extensions',
    '46-symbols',
    '55-blockquote-caption-after-a-blank-line',
    '58-abbreviation-matches-on-word-boundaries-only',
    '69-opaque-spans-inside-a-container',
    '81-paragraph-interruption',
    '91-mention-and-tag-name-boundaries',
    '93-nested-comment-fences',
    '95-abbreviation-definition-interrupts-a-paragraph',
    '138-unclaimed-openers-stay-literal',
    '140-all-space-verbatim-content',
    '141-trailing-whitespace-boundaries',
    '150-abbreviation-title-escapes-its-markup-characters',
    '165-quote-flanking-after-an-escaped-character',
    '166-comment-fence-with-trailing-text',
    '167-unterminated-comment-fence',
    '168-widened-verbatim-fences',
    '175-a-repeated-definition-which-one-wins',
    '177-two-abbreviation-definitions',
    '186-an-invisible-line-does-not-cancel-a-blank-line-separation',
    '190-a-definition-inside-a-comment-registers-nothing',
    '197-a-comment-ends-the-paragraph-it-sits-under',
    '232-two-dashes-are-not-a-thematic-break',
    '264-a-frontmatter-opener-takes-exactly-one-space',
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

    // Classified with the spec bump to 49b8deb. Each was MEASURED, not assumed:
    // every file in every one of these categories converts to rich ProseMirror
    // nodes (no whole-document fallback atom) and reparses to the same AST.
    // `318-composite-figures` is the one worth naming - all eleven documents
    // reach real `carveFigureGroup` nodes holding `carveFigure` panels and a
    // trailing `carveCaption`, which is what carve-grammars#225 built and what
    // no corpus document could exercise while the pin predated PART 9 §4c.
    //
    // Fourteen of these (`282` through `292`, and the language-attribute run)
    // predate this bump: they landed while the tiptap lists were classifying
    // nothing, because `coversAll` satisfies the partition on its own. The
    // check added below closes that, so the lists cannot drift again.
    '282-two-blank-lines-detach-a-caption',
    '284-a-ragged-table-keeps-each-row-s-cell-count',
    '285-adjacent-block-openers-in-an-attached-run-stay-separate',
    '286-a-caret-line-does-not-end-a-paragraph-it-cannot-caption',
    '287-a-column-zero-definition-ends-an-open-list-item',
    '288-heading-index-plain-text-covers-visible-leaves-and-rejects-an-empty-key',
    '289-a-structural-attribute-leads-the-author-s-own',
    '290-adjacent-sibling-lists-survive-the-round-trip',
    '291-a-fence-keeps-the-blank-line-at-the-end-of-its-content',
    '292-a-boolean-and-a-key-value-of-the-same-name-are-one-attribute',
    '293-a-semantic-name-renames-the-span-and-the-leftovers-ride-the-element',
    '294-a-language-attribute-is-exact-sugar-for-lang',
    '295-a-malformed-language-tag-leaves-the-whole-block-literal',
    '296-a-language-attribute-and-lang-are-one-key',
    '297-the-language-sigil-takes-no-padding',
    '298-a-boolean-lang-is-the-third-spelling-of-the-same-key',
    '299-the-semantic-registry-holds-no-element-carve-already-spells',
    '300-two-attributes-need-a-separator-between-them',
    '301-a-derived-title-yields-to-an-authored-one',
    '302-a-math-span-s-base-class-keeps-the-class-slot-in-place',
    '303-a-marker-glued-to-a-name-opens-nothing',
    '304-an-angle-bracket-is-escaped-only-where-it-opens-markup',
    '305-an-abbreviation-expands-inside-an-inline-container',
    '306-a-captioned-quote-holds-more-than-one-block',
    '307-an-empty-inline-note-is-literal',
    '308-a-multi-letter-ordered-marker-opens-no-list',
    '309-a-note-s-content-recognizes-no-note',
    '310-a-footnote-in-link-text-nests-the-anchors',
    '311-a-footnote-in-reference-link-text-nests-the-anchors-too',
    '312-a-note-body-s-own-references-resolve',
    '313-a-reference-link-s-text-survives-its-own-frame',
    '314-a-footnote-in-an-unresolved-reference-is-not-a-reference',
    '315-an-inline-note-s-content-resolves-after-the-note',
    '316-an-image-s-alt-text-closes-where-a-link-s-text-closes',
    '317-an-editorial-comment-s-bracket-is-content-not-the-close',
    '375-a-table-cell-can-inherit-horizontal-alignment',
    '318-composite-figures',
    '319-cell-attributes-bind-after-the-kind-and-alignment-markers',
    '320-the-canonical-writer-glues-a-code-fence-to-its-info-string',

    // Classified with the spec bump to b6917ab. Measured, not assumed: every
    // file in every one of these categories converts without the
    // whole-document fallback atom and reparses to the same AST. Several reach
    // the rich projection only under a SOURCE ENVELOPE (the projection is not
    // write-identical, so the source rides along) - that is still covered, and
    // the round-trip test's own enveloped accounting is what reports it.
    //
    // `321-delimited-comments` was covered for a reason worth stating plainly,
    // because the bare word "covered" would have flattered it: the engine
    // pinned at the time did not implement `{% ... %}` at all. It parsed
    // `foo {% bar %} baz` as one text run and rendered
    // `<p>foo {% bar %} baz</p>`, where the corpus fixture expects
    // `<p>foo  baz</p>`. So the category round-tripped because there was no
    // `comment` node in the tree to lose. That note ended by predicting the
    // category would "most likely move to fallback" once an engine shipped
    // delimited comments.
    //
    // The engine has now shipped them, and the prediction was WRONG. Measured
    // when the pin moved to carve-js main (2dc3232e): all eight documents still
    // convert without the whole-document fallback atom and still reparse to the
    // same AST, so the category stays covered on the evidence rather than on
    // the old reason. Six of the eight reach the rich projection under a SOURCE
    // ENVELOPE, which is what carries them, and the envelope is exactly the
    // mechanism the paragraph above says is still covered.
    //
    // What the new node did expose is a serializer defect, and it is recorded
    // here so the word "covered" is not read as "clean": `carveCommentInline`
    // carries a `delimited` attribute the serializer never branches on, so a
    // delimited comment is written back as the LINE comment `%%`, which
    // swallows the rest of the line. `foo {% bar %} baz` comes back as
    // `foo %% bar`. Four of the eight lose their mounted render-equivalence to
    // it, which tests/mounted-roundtrip-test.js records and attributes.
    '321-delimited-comments',
    '322-an-attribute-block-reaches-the-nested-list-it-precedes',
    '323-a-block-attached-after-an-invisible-line-leaves-the-item-tight',
    '324-an-abbreviation-definition-in-an-item-body-is-paragraph-text',
    '325-an-attribute-line-after-a-continuation-marker-attributes-the-attached-block',
    '326-a-column-0-line-after-a-container-s-last-block-when-that-block-left-no-paragraph-open',
    '327-a-continuation-marker-attaches-one-block-and-the-boundary-is-that-block-s-extent',
    '328-an-unclosed-verbatim-run-in-a-row-stops-at-the-closing-pipe',
    '329-a-floating-attribute-is-scoped-to-the-container-that-holds-it',
    '330-a-tab-after-a-fence-or-a-frontmatter-opener-depends-on-where-it-sits',
    '331-an-unclosed-inline-run-in-a-line-block-reaches-the-end-of-the-block',
    '332-which-inline-content-a-heading-id-is-derived-from',
    '333-a-continuation-row-s-open-run-and-an-escaped-closing-pipe',
    '334-a-label-beginning-with-an-at-sign-is-not-a-reference-label',
    // The seven documents markup-carve/carve#1311 added, pinning that a comment
    // fence hides its body at EVERY column and not only at column 0. Measured
    // one by one through the source-aware loader rather than assumed: all seven
    // are AST-idempotent, so covered is the only classification the round-trip
    // test would accept - a skip has to genuinely fail for at least one file.
    //
    // What the loader does with each, since "idempotent" alone does not say:
    //
    // - 335, 336, 338: the comment survives as an opaque run inside the item
    //   and the definition inside it stays unregistered on reparse. The
    //   serializer writes a blank line between the item's text and the fence,
    //   which loosens nothing the AST records.
    // - 337 needs the source envelope. The fence opens on the item's MARKER
    //   line, and the projection cannot place a block there, so the document
    //   rides along as source. It is the one document of the seven that moves
    //   the envelope ratchet (see tests/roundtrip-test.js).
    // - 339 is the wider `%%%%` fence. The serializer canonicalizes it back to
    //   `%%%`, which is safe: it widens on demand, so a fence whose body holds
    //   a `%%%` line is re-emitted at `%%%%` and still hides its body.
    // - 340 defines an abbreviation inside a column-0 comment; the loader
    //   builds a real `carveComment` and the definition never registers.
    // - 341 is the fence inside a colon container, which stays inside the
    //   `carveDiv` rather than escaping it.
    '335-a-comment-fence-at-an-item-s-content-column-registers-nothing-either',
    '336-a-footnote-definition-inside-an-item-s-comment-registers-nothing',
    '337-a-comment-fence-opened-on-an-item-s-marker-line-hides-its-body-too',
    '338-a-comment-fence-one-item-deeper-registers-nothing-either',
    '339-a-wider-comment-fence-inside-an-item-hides-its-body-the-same-way',
    '340-an-abbreviation-inside-a-comment-defines-nothing',
    '341-a-comment-fence-inside-a-colon-container-registers-nothing',
    // freeze bump 287b4b8 - measured, all round-trip
    '342-url-list-attributes-are-probed-token-wise',
    '343-an-escaped-hash-keeps-its-escape-at-a-container-s-content-position',
    '344-a-comment-only-line-in-a-line-block-is-removed-before-any-inline-run',
    '345-a-line-block-s-hard-break-keeps-its-backslash',
    '346-a-line-block-s-last-body-line-keeps-its-backslash',
    '347-a-comment-fence-reached-through-a-quote-registers-nothing-either',
    '348-a-closed-inline-construct-spanning-a-verse-boundary',
    '349-a-container-whose-table-ends-on-a-continuation-row',
    '350-a-definition-at-a-container-s-content-column',
    '351-a-bracketed-construct-spanning-a-line-boundary',
    '352-a-bracketed-construct-s-identifiers-stay-on-one-line',
    '353-a-bracketed-construct-spanning-a-verse-boundary',
    '354-a-continuation-row-joins-the-row-above-it-whatever-its-cells-hold',
    '355-a-container-whose-table-ends-on-a-joined-header-row',
    '356-a-quote-inside-a-quote-is-asked-what-it-ends-on',
    '357-a-block-at-a-container-s-content-column-ends-the-paragraph-whatever-it-renders',
    '358-what-a-content-column-block-does-not-reach',
    '359-a-footnote-definition-s-block-runs-to-the-end-of-its-body',
    '360-a-definition-behind-an-alternating-container-prefix-registers-at-the-innermost-content-column',

    // Classified with the spec bump to carve 22f7f47, which appends five
    // categories and fourteen documents and renumbers nothing. Measured, one
    // document at a time, not inferred from the category names: all fourteen
    // convert WITHOUT the whole-document fallback atom and all fourteen reparse
    // to the same AST, so every one of the five is covered and none needed a
    // protected fallback entry.
    //
    // Twelve of the fourteen reach the rich projection only under a SOURCE
    // ENVELOPE, which is still covered and is what the two ratchets report. The
    // shape behind almost all of them is one serializer habit: a block that the
    // author opened ON the marker line comes back indented to the item's
    // content column, `- ::: d` as `-   ::: d`, and once the opener moves the
    // body no longer sits where the container can see it. The two that need no
    // envelope are the two whose blocks are ordinary item content:
    // `363-a-task-item-s-checkbox-is-not-decided-by-its-first-block` and
    // `364-only-lazy-folding-demotes-a-marker-line-colon-opener-2`, the variant
    // whose colon opener is demoted to text by a lazy line and so has no
    // container to lose.
    '361-a-paragraph-opened-after-a-block-in-an-item-is-still-open-for-a-lazy-line',
    '362-an-unterminated-container-does-not-extend-the-item-past-a-blank-line',
    '363-a-task-item-s-checkbox-is-not-decided-by-its-first-block',
    '364-only-lazy-folding-demotes-a-marker-line-colon-opener',
    '365-a-blank-line-before-a-sibling-marker-separates-the-items-whatever-consumed-it',
    // Promoted out of `fallback` when the reverse check in
    // tests/roundtrip-test.js was added: every file in each of these is written
    // back faithfully, so the recorded reason had nothing left to explain.
    // Measured, not assumed - each was a real limitation when it was written,
    // and each was closed by a later mapping without its entry being removed.
    '08-image-with-caption',
    '09-tables',
    '10-tables-with-rowspan-and-colspan',
    '109-cross-references-resolve-inside-footnote-bodies',
    '11-fenced-code',
    '116-cyclic-cross-reference-resolves-to-one-level',
    '13-attributes',
    '142-nested-item-looseness-does-not-propagate-to-the-outer-item',
    '15-heading-ids',
    '153-image-trailing-attribute-is-strict-about-the-glue',
    '187-a-floating-attribute-stops-at-the-item-boundary',
    '195-trailing-attributes-on-a-link-reference-definition',
    '23-inline-footnotes',
    '24-generic-divs',
    '254-colon-fence-separator-must-be-a-space',
    '255-colon-fence-metadata-slots-must-be-a-space-too',
    '256-table-cell-padding-must-be-a-space',
    '258-code-fence-metadata-slots-must-be-a-space-too',
    '26-comments',
    '265-a-reference-definition-s-metadata-slots-take-exactly-one-space',
    '266-a-reference-definition-is-anchored-at-end-of-line',
    '281-a-caption-attaches-across-one-blank-line',
    '41-line-blocks',
    '48-table-column-alignment',
    '49-table-per-cell-alignment-override',
    '50-headerless-table-alignment',
    '52-table-alignment-with-colspan',
    '53-table-doubled-alignment-marker',
    '57-table-cell-pipe-inside-code-span',
    '61-table-stacked-rowspan',
    '64-table-rowspan-with-multi-line-content',
    '90-superscript-in-a-table-cell',
    '98-table-row-attributes',
    '99-table-header-cell-rowspan',

    // Arrived with the bump to bfec478 (carve 0.1.3-62). Measured with the
    // round-trip loop rather than classified by eye: every file in each of
    // these converts to rich ProseMirror nodes - none falls back to a
    // whole-document `carveUnsupported` atom - and reparses to the same AST.
    // Several ride the source envelope, which is a write-identity note and not
    // a coverage one, so they belong here rather than in `fallback`.
    '376-pipe-tables-can-state-head-and-foot-row-counts',
    '377-an-unclosed-inline-literal-reaches-the-end-of-its-block',
    '378-a-terminal-comment-in-a-quote-leaves-no-paragraph-open',
    '379-a-reference-definition-cannot-take-its-destination-from-the-next-line',
    '380-a-terminal-comment-line-still-leaves-an-empty-verse-line',
    '381-a-resumed-lazy-run-belongs-to-the-innermost-marker-line-item',
    '382-a-marker-line-link-definition-is-collected-where-no-paragraph-is-open',
    '383-a-lazy-marker-line-s-definition-defines-nothing-in-any-container',
    '384-a-continuation-marker-attaches-only-a-flush-left-block',
    '385-a-hyphen-run-opening-a-word-after-whitespace-is-a-flag',
    '386-the-doubled-run-is-the-canonical-arrow-in-both-families',
    '387-a-braced-hyphen-pair-is-an-en-dash',
    '388-an-empty-brace-pair-is-not-a-construct',
    '389-a-boolean-attribute-does-not-start-with-an-underscore',

    // Arrived with the bump to e88d6e3 (carve 0.1.3-110). Measured the same
    // way: the round-trip loop was run over every file in each category, and
    // all 25 convert to rich ProseMirror nodes - not one falls back to a
    // whole-document `carveUnsupported` atom - and reparse to the same AST.
    // None is a `fallback` entry, so none is written as one.
    '390-a-table-cell-s-marker-run-ends-at-a-space',
    '391-an-attribute-line-below-a-list-item-interrupts-it',
    '392-an-attributed-cell-keeps-its-attributes-and-its-literal-marker',
    '393-an-engine-written-shape-says-what-it-is-called',
    '394-a-leading-escaped-caret-keeps-its-escape',
    '395-a-longer-run-at-a-list-boundary-is-written-as-exactly-three-blank-lines',
    '396-an-idle-escape-does-not-spread-from-the-block-that-needed-one',
    '397-a-null-byte-is-replaced-before-the-document-is-read',
    '398-a-container-s-span-ends-at-its-last-placed-child',
    '399-a-definition-list-ends-at-its-last-placed-child-too',

    // Arrived with the bump to d0b6c92 (carve 0.1.3-139). Measured the same
    // way, one file at a time through the source-aware loader: all 12 files
    // across these 7 categories convert to rich ProseMirror nodes - not one
    // falls back to a whole-document `carveUnsupported` atom - and every one
    // reparses to the same AST. Covered is the only classification the
    // round-trip test would accept for them anyway, because a `fallback` entry
    // has to genuinely fail for at least one file and none of these does.
    //
    // Only `403` needs anything said beyond that: it is the single file of the
    // twelve that rides the SOURCE ENVELOPE, so its rich projection is kept but
    // is not write-identical and the source rides along. That is a write-
    // identity note rather than a coverage one, which is why it belongs here
    // and not in `fallback`.
    //
    // The two separator categories (`404`, `406`) are the ones this bump exists
    // for - a caption's and a heading's marker separator is a RUN, and none of
    // it is content (markup-carve/carve#1583, #1587). The serializer already
    // wrote a single space back and the parser already read the whole run, so
    // the rule cost the tiptap surface nothing; it is the TextMate side that
    // had drifted (markup-carve/vscode-carve#146).
    '400-a-container-starts-at-its-opening-markup-even-where-its-first-child-is-unplaced',
    '401-a-marker-at-an-item-content-column-opens-a-sublist-first-in-the-item-or-not',
    '402-a-container-ends-at-the-markup-that-closes-it-even-where-its-last-child-is-unplaced',
    '403-an-idle-escape-does-not-spread-from-the-occurrence-that-needed-one',
    '404-a-caption-s-marker-separator-is-a-run-and-none-of-it-is-content',
    '405-a-quote-holding-a-captioned-block-indents-it-like-any-other-nested-block',
    '406-a-heading-s-marker-separator-is-a-run-and-none-of-it-is-content',

    // Arrived with the bump to f7cf0b3 (carve 0.1.3-160). Measured the same
    // way, one file at a time through the source-aware loader: all 11 files
    // across these 4 categories convert to rich ProseMirror nodes - not one
    // falls back to a whole-document `carveUnsupported` atom - and every one
    // reparses to the same AST. `covered` is the only classification the
    // round-trip test would accept for `408` in any case, because a `fallback`
    // entry has to genuinely fail for at least one file and every file of
    // `408` is written back faithfully.
    //
    // Five of the eleven ride the SOURCE ENVELOPE - both files of `407`, the
    // second and third of `409`, and the fourth of `410`. That is a write-
    // identity note rather than a coverage one, which is why they belong here
    // and not in `fallback`. The shape is the one the four categories exist to
    // pin: which blank line inside an item is CONSUMED by a construct and which
    // one loosens the list. The projection keeps no record of who consumed a
    // blank run, so writing the item back respells the run and the source rides
    // along.
    '407-one-consumed-boolean-spells-the-looseness-no-blank-line-can',
    '408-the-writer-spells-looseness-only-where-a-blank-line-cannot',
    '409-a-blank-line-loosens-an-item-only-when-a-paragraph-follows-it',
    '410-a-footnote-continuation-survives-a-blank-run',
];

// Categories that require the whole-document fallback, with the concrete reason
// their structured conversion is not lossless. This remains an actionable map:
// fixing a rich mapping promotes the category out of fallback without changing
// the public preservation guarantee.
const TIPTAP_SKIP = new Map([
    ['374-a-collected-definition-closes-the-item-paragraph', 'collected definitions are not represented in the structured editor tree, so all four forms require the source envelope'],
    ['267-a-definition-marker-s-separator-is-a-space-and-it-is-a-run', 'abbreviation definitions are unsupported, and one remaining definition form reparses differently'],
    ['268-trailing-whitespace-on-a-content-line-is-dropped', 'some whitespace-sensitive forms reparse differently and others contain unsupported literal-inline or line-block nodes'],
    ['269-a-definition-body-continuation-indented-past-its-column-is-lazy-text', 'the definition continuation indentation is normalized and reparses to a different AST'],
    ['272-an-autolink-body-admits-non-ascii-and-excludes-format-characters', 'one variant produces unsupported smart punctuation and another reparses differently'],
    ['273-the-inline-attribute-interior-is-space-only-the-attribute-line-is-not', 'the whitespace-sensitive attribute form is normalized and reparses to a different AST'],
    ['274-a-quoted-attribute-value-stops-at-the-newline', 'the unterminated quoted attribute forms are respelled and reparse to a different AST'],
    ['275-a-collapsed-reference-reaches-a-heading-by-the-heading-s-rendered-text', 'collapsed heading references are not preserved faithfully and reparse to a different AST'],
    ['276-a-fence-opened-on-a-list-marker-line-body-below-the-content-column', 'list/fence indentation is normalized and all variants reparse to a different AST'],
    ['277-a-below-column-marker-after-a-comment-where-no-paragraph-is-open', 'comments are unsupported, and the non-comment variant reparses differently'],
    ['279-a-boundary-line-inside-an-open-fence-does-not-end-the-container', 'comment variants are unsupported and the remaining container-boundary forms reparse differently'],
    ['246-the-continuation-marker-at-an-item-s-own-column-and-what-follows-it', 'the `+` continuation marker is not re-emitted, so the block it attached comes back as ordinary item content and the reparse differs'],
    ['248-an-attribute-name-admits-no-colon', 'a colon-bearing name is literal text, and the serializer either re-spells it as a smart_punctuation node it cannot convert or writes it back in a form that reparses differently'],
    ['249-trailing-whitespace-after-a-block-marker', 'trailing whitespace after a marker is what the sixth example pins, and the serializer normalizes it away, so the reparse loses the distinction the document exists to record'],
    ['241-a-multi-line-raw-block-is-placed-at-its-opening-and-verbatim-after-it', 'the converter has no node type for a raw block, so it throws'],
    ['181-a-div-does-not-define-an-abbreviation-either', 'the serializer escapes the `[` in the abbreviation-shaped line, so the div body reparses with a literal backslash'],
    ['208-a-combined-bold-italic-span-may-cross-a-line', 'the combined `/*...*/` span is re-spelled per line, so a multi-line span becomes two single-line ones'],
    ['214-a-comment-fence-at-column-0-ends-the-item-a-line-does-not', 'the converter has no node type for `comment`, so it throws'],
    ['216-a-description-line-needs-a-term-above-it', 'the bare `:` line is escaped and a phantom empty definition is appended'],

    // Added when the corpus submodule was refreshed. Each reason was measured
    // by running the round trip, not guessed - the same rule the header states.
    ['70-blocks-that-render-to-nothing', 'same `comment` gap, plus `abbreviation-def`, which the converter also does not model'],
    ['178-a-flush-left-line-needs-an-open-paragraph-to-fold-into', 'an empty block quote in a list item is not reconstructed and the paragraph after it folds onto the marker line, so `. >` + `X` comes back as `. > X`'],
    ['179-an-abbreviation-definition-is-recognized-only-at-document-level', 'the converter has no node type for `abbreviation-def` and throws, the same gap as 177-two-abbreviation-definitions'],
    ['180-a-list-item-does-not-define-an-abbreviation-either', 'same `abbreviation-def` gap - the definition that does NOT define is still an `abbreviation-def` node in the tree, so the converter throws before the case can be exercised'],
    ['181-openers-past-the-nesting-cap-are-one-paragraph', 'past the cap the over-cap openers degrade to ONE paragraph whose text is the raw source lines, and the serializer rewrites fence widths per nesting level, so that paragraph comes back holding different text (`:::: note` vs `:::: note x`) even though the tree shape is identical'],
    ['182-a-comment-is-recognized-at-any-column', 'the converter has no node type for `comment` and throws, the same gap as 69-opaque-spans-inside-a-container'],
    ['183-a-definition-below-every-content-column-folds-as-text', 'the fold is lost on serialize: `- - a` + ` [^f]: x` is item TEXT because the line sits below every content column, but it comes back as `-   - a` + a blank + a flush-left `[^f]: x`, which re-parses as a real document-level footnote definition - the opposite of what the category pins'],
    ['184-a-caret-is-a-reference-label-not-an-empty-footnote', 'the reference-link gap (#101) with the destination lost as well: `[^]: /u` plus `see [text][^].` comes back as `see [text]().` - an empty destination, not just an inlined one. The second example escapes instead: a bare `see [^].` re-serializes as `see \\[^].`'],
    ['186-a-comment-fence-is-a-comment-at-any-column-too', 'same `comment` gap - the indented fence is still a comment node, so the converter throws before the column question is reached'],
    ['188-a-comment-under-a-nested-item-does-not-close-it', 'the converter has no node type for `comment` and throws, the same gap as 69-opaque-spans-inside-a-container'],
    ['191-a-comment-fence-under-a-nested-item-does-not-close-it-either', 'same `comment` gap, fence form - the converter meets the comment node before the nesting question the category is about'],
    ['193-an-abbreviation-at-a-list-item-s-content-column-is-still-not-a-definition', 'two gaps at once. The abbreviation form loses BOTH its escaping and its column: `  *[HTML]: Hyper Text` comes back as `\\*\\[HTML]: Hyper Text` flush left, so the line is no longer at the content column the category is about. The `-2` form is the opposite - the link definition there IS collected (correctly, carve-rs#570 / carve-php#765), so the serializer writes `see [t](/u)` and the definition is gone'],
    ['194-a-definition-inside-a-container-is-collected-at-that-container-s-content-column', 'the reference-link gap (#101), and the first example shows its worst form: `> - a` plus a definition at the quoted item column comes back as `see [t]()` - an EMPTY destination. The third escapes instead, re-serializing the definition as `> \\[r]: /u` inside the quote'],
    ['01-emphasis', 'bold-italic and critic-substitute inline nodes are not modeled by the serializer'],
    ['03-links', 'the converter models neither `heading_ref` (a crossref) nor `escaped_text`'],
    ['05-lists', 'figure (image-with-caption) blocks inside list items are not modeled'],
    ['16-reference-link', 'reference-link definitions are not represented in the ProseMirror model'],
    ['22-footnotes', 'footnote definition blocks are not faithfully reconstructed'],
    ['25-definition-lists', 'definition lists are not modeled'],
    ['223-an-abbreviation-term-is-one-ascii-alphanumeric-word', 'abbreviation definitions are not modeled, the same gap as 43-abbreviations - both files reparse to a different AST'],
    ['225-a-footnote-body-s-last-block-when-it-is-not-a-paragraph-gets-a-synthesized-paragraph-for-the-backlink', 'the `-5` file ends its body with a raw block, which is not modeled - the same gap as 27-raw-blocks. The other four files in the category do round-trip'],
    ['227-a-definition-inside-a-definition-list-dd-is-collected-and-the-entry-keeps-no-trace', 'both files reparse to a different AST: the entry is an EMPTY `dd`, and an empty description has no source spelling that reads back - the serializer writes a bare `:` and it rejoins the term (markup-carve/carve#805)'],
    ['228-a-line-at-a-footnote-definition-s-own-column-followed-by-non-blank-text-forms-its-own-tight-block', 'reparses to a different AST: the collected definition still decides the item looseness, so the round trip changes tight to loose (carve-js#732)'],
    ['229-an-empty-abbreviation-term-is-not-a-definition', 'reparses to a different AST: the line is prose because the term is empty, and the abbreviation-definition gap of 43-abbreviations reaches the literal form too'],
    ['37-escapes', 'the converter does not model the `escaped_text` node'],
    ['39-inline-span', 'the empty and whitespace-only blocks round-trip now; what is left is `[x]{???}`, where the block is not a valid attribute block so the whole run is literal text - the serializer escapes the opening bracket and `\\[x]{???}` reparses with an `escaped_text` node the source did not have, the same gap as 37-escapes'],
    ['40-superscript-and-subscript', 'a BARE `^6^` is literal text (sup/sub are braced-only) and the serializer escapes only the leading caret, so `10^6^` comes back as `10\\^6^`'],
    ['252-a-tab-separates-two-attributes-and-pads-a-block-as-a-space-does', 'nothing to do with tabs: the serializer drops a trailing attribute block from strong entirely (`*x*{.a .b}` comes back as `*x*`), the same gap as 13-attributes. The empty-block half of this category (`[x]{\\t}`) round-trips as of carve-grammars#159'],
    ['42-admonitions', 'admonition blocks (:::warning) are not modeled'],
    ['47-numbered-cross-references', 'numbered cross-references and figures are not modeled'],
    ['62-smart-typography-escapes-and-code', 'smart-typography output is lossy on reparse'],
    ['69-attribute-edge-cases', 'key/value spans, div/heading attributes and extensions are not modeled'],
    ['70-escape-coverage', 'a variant is lossy through the serializer'],
    ['72-emphasis-edge-cases', 'an emphasis edge case is lossy through the serializer'],
    ['73-list-nesting-and-looseness', 'nested-list looseness differs on reparse'],
    ['75-nested-brackets-in-link-text', 'nested brackets in link text are lossy through the serializer'],
    ['78-trailing-attribute-block-edge-cases', 'trailing attribute-block edge cases are lossy'],
    ['80-blockquote-lazy-continuation', 'blockquote lazy continuation differs on reparse'],
    ['84-list-lazy-continuation', 'list lazy continuation and admonitions are not modeled'],
    ['85-compact-list-blocks', 'a blockquote nested in a list item is dropped on serialize'],
    ['86-list-continuation-marker', 'list continuation markers differ on reparse'],
    ['87-block-attribute-lines', 'standalone block attribute lines are not modeled'],
    ['92-strong-emphasis-starting-with-a-link', 'a link-in-emphasis edge case is lossy on reparse'],
    ['95-boolean-attributes', 'boolean key/value attributes on spans are not modeled'],
    ['96-table-span-marker-in-first-column', 'rowspan/colspan filler cells are not reconstructed'],
    ['101-heading-marker-column-zero', 'an indented (literal) # is re-emitted column-0 as a heading on reparse'],
    ['104-blocked-span-marker-renders-as-empty-cell', 'table span-marker cells are not modeled'],
    ['105-colspan-marker-scans-left-past-a-consumed-cell', 'table span-marker cells are not modeled'],
    ['107-link-destination-parentheses-balance', 'round-trips to a different AST'],
    ['108-empty-link-and-image-titles-are-preserved', 'empty link/image titles are dropped on serialize'],
    ['115-footnote-definition-inside-a-container-is-collected', 'footnote definitions inside containers are lossy on reparse'],
    ['126-editorial-markup-takes-a-trailing-attribute', 'editorial markup with a trailing attribute is lossy on reparse'],
    ['127-emphasis-opener-slash-adjacency', 'the converter does not model the `emphasis` node'],
    ['128-bold-italic-delimiter-needs-content', 'the converter does not model the `emphasis` node'],
    ['129-emphasis-span-closes-before-a-following-delimiter', 'round-trips to a different AST'],
    ['130-thematic-break-requires-contiguous-markers', 'round-trips to a different AST'],
    ['135-abbreviation-definition-separator-must-be-a-space', 'round-trips to a different AST'],
    ['137-inline-literal', 'the converter does not model the `literal_inline` node'],
    ['141-post-blank-list-continuation-content-column-model', 'round-trips to a different AST'],
    ['143-definition-list-as-a-first-class-block-opener', 'the converter does not model the `definition_list` node'],
    ['144-table-as-a-block-opener-in-a-list-item', 'the converter does not model the `soft_break` node'],
    ['145-adjacent-slash-and-underscore-emphasis-nest', 'the converter does not model the `emphasis` node'],
    ['146-colon-fence-as-a-block-opener-in-a-list-item', 'the converter does not model the `soft_break` node'],
    ['149-indented-ordered-marker-content-column-includes-the-marker-indent', 'the converter does not model the `soft_break` node'],
    ['152-under-indented-definition-attaches-over-indented-definition-folds', 'the converter does not model the `definition_list` node'],
    ['155-indented-attribute-line-stays-literal', 'the converter does not model the `soft_break` node'],
    ['156-indented-image-and-caption-stay-literal', 'the converter does not model the `soft_break` node'],
    ['157-indented-reference-and-footnote-definitions-stay-literal', 'the converter does not model the `smart_punctuation` node'],
    ['158-indented-colon-fence-blocks-stay-literal', 'the converter does not model the `soft_break` node'],
    ['159-below-content-column-div-body-in-a-list-item-stays-literal', 'the converter does not model the `soft_break` node'],
    ['160-outer-item-with-an-internal-blank-before-an-attached-block-is-loose', 'round-trips to a different AST'],
    ['161-unresolved-footnote-reference-with-a-trailing-attribute-stays-literal', 'round-trips to a different AST'],
    ['162-tight-list-item-keeps-trailing-text-after-a-block-bare', 'the converter does not model the `code_block` node'],
]);

export const COVERAGE = {
    prism: { covered: new Set(), skip: emptySkip() },
    highlightjs: { covered: new Set(), skip: emptySkip() },
    // Source-aware preservation makes every category lossless. Rich mappings
    // are used where idempotent; the loader otherwise emits an opaque atom.
    tiptap: {
        covered: new Set(TIPTAP_COVERED),
        fallback: TIPTAP_SKIP,
        skip: emptySkip(),
        coversAll: true,
    },
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
    const coveredSlugs = entry.coversAll
        ? new Set(allCategories.map(slugOf))
        : grammarName === 'tiptap'
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
    if (grammarName !== 'tiptap' || entry.coversAll) return true;
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
