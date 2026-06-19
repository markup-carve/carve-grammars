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
    '04-images',
    '06-task-lists',
    '23-table-without-alignment',
    '26-fenced-code-shorter-inner-fence',
    '29-table-cell-pipe-inside-code-span',
    '37-smart-typography-dashes-and-quotes',
    '40-table-multi-line-cell-continuation',
    '48-hard-line-breaks',
    '49-non-breaking-space',
    '52-ordered-list-start-and-delimiter',
    '54-ordered-marker-vs-prose',
    '57-thematic-breaks',
    '60-escapes',
    '61-empty-delimiters',
    '62-bare-urls-stay-literal',
    '67-superscript-and-subscript',
    '71-doubled-emphasis-delimiters',
    '74-two-char-delimiter-runs',
    '78-fenced-code-language-with-punctuation',
    '90-superscript-in-a-table-cell',
    '94-literal-less-than-in-prose',
    '100-block-quote-continuation-marker',
    '102-paragraph-trailing-whitespace',
];

// Categories the tiptap serializer cannot round-trip, with the concrete reason.
// "unsupported X" = the converter has no faithful ProseMirror mapping for X (it
// throws). "lossy" = it converts but the re-parse differs from the original.
const TIPTAP_SKIP = new Map([
    ['01-emphasis', 'bold-italic and critic-substitute inline nodes are not modeled by the serializer'],
    ['02-headings', 'headings carrying attributes/tags are not represented (attrs only support id)'],
    ['03-links', 'autolinks, crossrefs and key/value spans are not modeled'],
    ['05-lists', 'figure (image-with-caption) blocks inside list items are not modeled'],
    ['07-blockquote-with-attribution', 'figure / caption blocks are not modeled'],
    ['08-image-with-caption', 'figure / caption blocks are not modeled'],
    ['09-tables', 'table captions (^ caption) are dropped on serialize'],
    ['10-tables-with-rowspan-and-colspan', 'rowspan/colspan filler cells are not reconstructed into ProseMirror spans'],
    ['11-fenced-code', 'a variant is lossy through the serializer'],
    ['12-inline-code', 'a variant is lossy through the serializer'],
    ['13-admonitions', 'admonition blocks (:::warning) are not modeled'],
    ['14-abbreviations', 'abbreviation definitions are not modeled'],
    ['15-mentions-and-tags', 'mention and tag inline nodes are not modeled'],
    ['16-inline-extensions', 'inline extension calls are not modeled'],
    ['17-attributes', 'headings/spans with key/value attributes are not fully represented'],
    ['18-frontmatter', 'front matter is not modeled by the serializer'],
    ['19-heading-ids', 'cross-reference links to heading ids are not modeled'],
    ['20-table-column-alignment', 'per-column alignment markers are dropped on serialize'],
    ['21-table-per-cell-alignment-override', 'per-cell alignment markers are dropped on serialize'],
    ['22-headerless-table-alignment', 'alignment markers are dropped on serialize'],
    ['24-table-alignment-with-colspan', 'rowspan/colspan filler cells are not reconstructed'],
    ['25-table-doubled-alignment-marker', 'alignment markers are dropped on serialize'],
    ['27-blockquote-caption-after-a-blank-line', 'figure / caption blocks are not modeled'],
    ['28-table-cell-escaped-pipe', 'a variant is lossy through the serializer'],
    ['30-abbreviation-matches-on-word-boundaries-only', 'abbreviation definitions are not modeled'],
    ['31-mention-ignores-email-addresses', 'mention inline nodes are not modeled'],
    ['32-tag-requires-a-word-boundary', 'tag inline nodes are not modeled'],
    ['33-table-stacked-rowspan', 'rowspan filler cells are not reconstructed'],
    ['34-reference-link', 'reference-link definitions are not represented in the ProseMirror model'],
    ['35-collapsed-reference-link', 'reference-link definitions are not represented'],
    ['36-unresolved-reference-link', 'unresolved reference syntax is not represented'],
    ['38-smart-typography-arrows-and-symbols', 'smart-typography output is lossy on reparse'],
    ['39-smart-typography-escapes-and-code', 'smart-typography output is lossy on reparse'],
    ['41-table-rowspan-with-multi-line-content', 'rowspan filler cells are not reconstructed'],
    ['42-math', 'a delimiter-less math form does not round-trip (serializer always emits closing $)'],
    ['43-footnotes', 'footnote definition blocks are not faithfully reconstructed'],
    ['44-generic-divs', 'divs carrying a class and admonitions are not modeled'],
    ['45-definition-lists', 'definition lists are not modeled'],
    ['46-comments', 'comment blocks are not modeled'],
    ['47-raw-blocks', 'raw blocks are not modeled'],
    ['50-raw-inline', 'raw inline spans are not modeled'],
    ['51-emoji', 'emoji inline nodes are not modeled'],
    ['53-ordered-list-dialects', 'a list dialect variant is lossy through the serializer'],
    ['55-footnote-with-multiple-blocks', 'multi-block footnote definitions are not faithfully reconstructed'],
    ['56-editorial-markup', 'critic-substitute inline nodes are not modeled'],
    ['58-cross-reference', 'cross-reference inline nodes are not modeled'],
    ['59-autolinks', 'autolink inline nodes are not modeled'],
    ['63-nested-containers', 'admonition containers are not modeled'],
    ['64-attribute-edge-cases', 'key/value spans, div/heading attributes and extensions are not modeled'],
    ['65-escape-coverage', 'a variant is lossy through the serializer'],
    ['66-inline-span', 'a span variant is lossy through the serializer'],
    ['68-parenthesized-ordered-marker', 'the parenthesized ordered marker is not preserved on serialize'],
    ['69-emphasis-edge-cases', 'an emphasis edge case is lossy through the serializer'],
    ['70-list-nesting-and-looseness', 'nested-list looseness differs on reparse'],
    ['72-nested-brackets-in-link-text', 'nested brackets in link text are lossy through the serializer'],
    ['73-reference-labels-are-case-sensitive', 'reference-link definitions are not represented'],
    ['75-trailing-attribute-block-edge-cases', 'trailing attribute-block edge cases are lossy'],
    ['76-paragraph-interruption', 'admonition/comment interruption cases are not modeled'],
    ['77-blockquote-lazy-continuation', 'blockquote lazy continuation differs on reparse'],
    ['79-multi-line-headings', 'multi-line heading folding is lossy through the serializer'],
    ['80-blockquote-lazy-continuation-stops-at-a-fenced-block', 'blockquote/fence interaction is lossy on reparse'],
    ['81-list-lazy-continuation', 'list lazy continuation and admonitions are not modeled'],
    ['82-compact-list-blocks', 'a blockquote nested in a list item is dropped on serialize'],
    ['83-list-continuation-marker', 'list continuation markers differ on reparse'],
    ['84-block-attribute-lines', 'standalone block attribute lines are not modeled'],
    ['85-numbered-cross-references', 'numbered cross-references and figures are not modeled'],
    ['86-inline-footnotes', 'inline footnote bodies are lossy through the serializer'],
    ['87-list-item-attributes', 'list-item attributes are not represented'],
    ['88-line-blocks', 'line blocks (div with attrs) are not modeled'],
    ['89-mention-and-tag-name-boundaries', 'mention/tag inline nodes are not modeled'],
    ['91-nested-comment-fences', 'comment blocks are not modeled'],
    ['92-strong-emphasis-starting-with-a-link', 'a link-in-emphasis edge case is lossy on reparse'],
    ['93-abbreviation-definition-interrupts-a-paragraph', 'abbreviation definitions are not modeled'],
    ['95-boolean-attributes', 'boolean key/value attributes on spans are not modeled'],
    ['96-table-span-marker-in-first-column', 'rowspan/colspan filler cells are not reconstructed'],
    ['97-table-cell-attributes', 'per-cell attributes are lossy through the serializer'],
    ['98-table-row-attributes', 'per-row attributes are lossy through the serializer'],
    ['99-table-header-cell-rowspan', 'header-cell rowspan filler cells are not reconstructed'],
    ['101-heading-marker-column-zero', 'an indented (literal) # is re-emitted column-0 as a heading on reparse'],
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
export function assertPartition(grammarName, allCategories) {
    const entry = COVERAGE[grammarName];
    if (!entry) throw new Error(`Unknown grammar: ${grammarName}`);

    // For highlighters, an empty covered set means "everything is covered" only
    // if we also treat the full category list as covered. To keep the partition
    // meaningful (and snapshot-driven), prism/hljs cover every category that is
    // not explicitly skipped.
    const coveredAll = grammarName === 'tiptap'
        ? entry.covered
        : new Set(allCategories.filter((c) => !entry.skip.has(c)));

    const unclassified = [];
    const overlap = [];
    for (const cat of allCategories) {
        const inCovered = coveredAll.has(cat);
        const inSkip = entry.skip.has(cat);
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
    const entry = COVERAGE[grammarName];
    if (grammarName === 'tiptap') return new Set(entry.covered);
    return new Set(allCategories.filter((c) => !entry.skip.has(c)));
}
