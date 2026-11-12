import assert from 'node:assert';
import { parse } from '@markup-carve/carve';
import { carveToProseMirror, carveToProseMirrorWithReport } from '../tiptap/carve-to-pm.js';
import { serializeToCarve } from '../tiptap/serializer.js';
import { listCorpusFiles } from './lib/corpus.js';
import { normalizeAst } from './lib/ast-normalize.js';

const stable = (source) => JSON.stringify(normalizeAst(parse(source)));
let envelopes = 0;
let authoredAppend = 0;
let canonicalAppend = 0;
const canonicalFiles = [];

for (const file of listCorpusFiles()) {
    const { doc, preserved } = carveToProseMirrorWithReport(file.source, { unsupported: 'preserve' });
    assert.deepStrictEqual(
        Object.keys(preserved).filter((type) => type !== 'document'),
        [],
        `${file.name} still contains an opaque construct: ${JSON.stringify(preserved)}`,
    );
    if (!doc.attrs?.carveSource) continue;
    envelopes++;

    const edited = structuredClone(doc);
    edited.content ||= [];
    edited.content.push({ type: 'paragraph', content: [{ type: 'text', text: 'release probe' }] });
    const actual = stable(serializeToCarve(edited));
    const authored = stable(file.source.replace(/[ \t\r\n]+$/, '') + '\n\nrelease probe');
    const canonicalDoc = structuredClone(edited);
    delete canonicalDoc.attrs;
    const canonical = stable(serializeToCarve(canonicalDoc));

    if (actual === authored) authoredAppend++;
    else if (actual === canonical) { canonicalAppend++; canonicalFiles.push(file.name); }
    else assert.fail(`${file.name}: merged output matches neither authored nor editor semantics`);
}

// Counts measured at the carve 0.1.14 tag (51c5631). The canonical projections
// below are mostly unterminated fences and runs, where the appended paragraph
// would land inside the open construct, so the editor's spelling wins.
assert.strictEqual(envelopes, 1471, 'source-envelope population changed; audit the new projection differences');
assert.strictEqual(authoredAppend, 1380, 'an append normalized authored layout in additional documents');
assert.strictEqual(canonicalAppend, 91, 'the set of structurally unterminated append conflicts changed');
assert.deepStrictEqual(canonicalFiles, [
    '182-openers-past-the-nesting-cap-are-one-paragraph',
    '268-trailing-whitespace-on-a-content-line-is-dropped-8',
    '276-a-fence-opened-on-a-list-marker-line-body-below-the-content-column-7',
    '279-a-boundary-line-inside-an-open-fence-does-not-end-the-container-7',
    '379-a-reference-definition-cannot-take-its-destination-from-the-next-line',
    '379-a-reference-definition-cannot-take-its-destination-from-the-next-line-3',
    '476-an-item-s-fence-is-read-once-whatever-block-it-follows',
    '476-an-item-s-fence-is-read-once-whatever-block-it-follows-2',
    '479-a-closer-below-the-container-s-column-does-not-count',
    '479-a-closer-below-the-container-s-column-does-not-count-2',
    '479-a-closer-below-the-container-s-column-does-not-count-3',
    '482-a-closer-does-not-rescue-a-marker-line-colon-opener-whose-body-folded-in-9',
    '509-a-fence-closer-below-a-nested-item-s-column-ends-containers-down-to-its-owner-3',
    '509-a-fence-closer-below-a-nested-item-s-column-ends-containers-down-to-its-owner-4',
    '509-a-fence-closer-below-a-nested-item-s-column-ends-containers-down-to-its-owner-5',
    '509-a-fence-closer-below-a-nested-item-s-column-ends-containers-down-to-its-owner-7',
    '509-a-fence-closer-below-a-nested-item-s-column-ends-containers-down-to-its-owner-10',
    '509-a-fence-closer-below-a-nested-item-s-column-ends-containers-down-to-its-owner-11',
    '509-a-fence-closer-below-a-nested-item-s-column-ends-containers-down-to-its-owner-12',
    '558-a-container-boundary-is-read-at-the-container-s-own-column-4',
    '558-a-container-boundary-is-read-at-the-container-s-own-column-5',
    '559-a-tab-inside-a-line-is-content-in-a-label-and-after-a-definition-marker-3',
    '583-a-comment-between-a-heading-and-a-colon-fence-leaves-the-fence-an-opener',
    '583-a-comment-between-a-heading-and-a-colon-fence-leaves-the-fence-an-opener-2',
    '584-a-fence-past-the-column-after-an-attribute-line-opens-on-its-authored-base',
    '584-a-fence-past-the-column-after-an-attribute-line-opens-on-its-authored-base-2',
    '606-an-unclosed-fence-after-an-attribute-line-in-a-container-ends-at-its-closer-4',
    '610-an-item-comment-or-attribute-line-closes-the-item-s-paragraph-2',
    '610-an-item-comment-or-attribute-line-closes-the-item-s-paragraph-4',
    '612-a-block-at-an-item-content-column-ends-its-paragraph-before-an-unclosed-fence-4',
    '612-a-block-at-an-item-content-column-ends-its-paragraph-before-an-unclosed-fence-5',
    '612-a-block-at-an-item-content-column-ends-its-paragraph-before-an-unclosed-fence-7',
    '614-a-quoted-item-comment-ends-the-quote-before-an-unclosed-fence-2',
    '616-a-line-is-read-in-the-container-whose-column-it-reaches-10',
    '616-a-line-is-read-in-the-container-whose-column-it-reaches-22',
    '619-a-fence-run-that-dedents-out-of-a-child-keeps-the-outer-item-tight',
    '619-a-fence-run-that-dedents-out-of-a-child-keeps-the-outer-item-tight-2',
    '619-a-fence-run-that-dedents-out-of-a-child-keeps-the-outer-item-tight-3',
    '619-a-fence-run-that-dedents-out-of-a-child-keeps-the-outer-item-tight-4',
    '619-a-fence-run-that-dedents-out-of-a-child-keeps-the-outer-item-tight-5',
    '619-a-fence-run-that-dedents-out-of-a-child-keeps-the-outer-item-tight-6',
    '619-a-fence-run-that-dedents-out-of-a-child-keeps-the-outer-item-tight-7',
    '619-a-fence-run-that-dedents-out-of-a-child-keeps-the-outer-item-tight-12',
    '619-a-fence-run-that-dedents-out-of-a-child-keeps-the-outer-item-tight-13',
    '619-a-fence-run-that-dedents-out-of-a-child-keeps-the-outer-item-tight-14',
    '621-a-fence-run-folded-into-a-child-paragraph-loosens-the-outer-item',
    '621-a-fence-run-folded-into-a-child-paragraph-loosens-the-outer-item-2',
    '621-a-fence-run-folded-into-a-child-paragraph-loosens-the-outer-item-3',
    '624-a-fence-run-folded-into-a-child-paragraph-loosens-the-outer-item-when-it-closes-at-the-outer-column',
    '624-a-fence-run-folded-into-a-child-paragraph-loosens-the-outer-item-when-it-closes-at-the-outer-column-2',
    '624-a-fence-run-folded-into-a-child-paragraph-loosens-the-outer-item-when-it-closes-at-the-outer-column-3',
    '624-a-fence-run-folded-into-a-child-paragraph-loosens-the-outer-item-when-it-closes-at-the-outer-column-5',
    '624-a-fence-run-folded-into-a-child-paragraph-loosens-the-outer-item-when-it-closes-at-the-outer-column-6',
    '625-a-fence-closer-outside-the-child-folds-and-leaves-the-child-open',
    '625-a-fence-closer-outside-the-child-folds-and-leaves-the-child-open-2',
    '625-a-fence-closer-outside-the-child-folds-and-leaves-the-child-open-3',
    '625-a-fence-closer-outside-the-child-folds-and-leaves-the-child-open-4',
    '625-a-fence-closer-outside-the-child-folds-and-leaves-the-child-open-5',
    '625-a-fence-closer-outside-the-child-folds-and-leaves-the-child-open-6',
    '625-a-fence-closer-outside-the-child-folds-and-leaves-the-child-open-7',
    '625-a-fence-closer-outside-the-child-folds-and-leaves-the-child-open-8',
    '625-a-fence-closer-outside-the-child-folds-and-leaves-the-child-open-10',
    '625-a-fence-closer-outside-the-child-folds-and-leaves-the-child-open-11',
    '639-a-folded-fence-run-leaves-a-later-paragraph-loose',
    '640-a-folded-child-fence-keeps-the-below-column-line-in-its-paragraph',
    '641-an-unclosed-fence-run-with-no-closer-in-its-item-does-not-hide-a-blank-line',
    '645-a-comment-line-leaves-a-description-s-list-item-open-for-a-fence',
    '763-a-note-claimed-fence-line-keeps-the-item-loose',
    '763-a-note-claimed-fence-line-keeps-the-item-loose-2',
    '782-a-first-block-plus-hands-its-block-to-the-host-as-the-host-reads-it-7',
    '782-a-first-block-plus-hands-its-block-to-the-host-as-the-host-reads-it-11',
    '806-a-description-body-in-an-item-refuses-a-column-zero-block-after-its-first-block-plus-5',
    '815-a-line-below-an-empty-div-after-a-first-block-plus-is-not-lazy',
    '850-an-unclosed-fence-opener-interrupts-a-quote-or-item-paragraph-2',
    '851-a-first-block-plus-shape-reads-the-one-attach-rule-3',
    '851-a-first-block-plus-shape-reads-the-one-attach-rule-4',
    '855-a-comment-block-in-a-line-block-leaves-nothing-3',
    '855-a-refused-plus-after-an-attached-block-ends-nothing-2',
    '871-a-first-block-plus-whose-next-line-misses-the-opener-s-marker-column-is-a-letter',
    '872-the-third-confirmation-round-s-model-findings-9',
    '911-a-fence-on-a-note-s-marker-line-item-reads-its-payload-at-the-item-s-content-column-2',
    '927-an-attached-colon-frame-stops-at-a-description-sibling-3',
    '930-a-line-that-misses-a-nested-host-ends-it-when-a-comment-closer-lies-ahead',
    '930-a-line-that-misses-a-nested-host-ends-it-when-a-comment-closer-lies-ahead-3',
    '930-a-line-that-misses-a-nested-host-ends-it-when-a-comment-closer-lies-ahead-4',
    '930-a-line-that-misses-a-nested-host-ends-it-when-a-comment-closer-lies-ahead-5',
    '930-a-line-that-misses-a-nested-host-ends-it-when-a-comment-closer-lies-ahead-6',
    '933-a-comment-closer-ahead-is-read-from-the-span-s-raw-lines-7',
    '1031-an-own-line-plus-fence-ends-before-a-shifted-run',
    '1068-a-comment-only-paragraph-loosens-a-list-as-a-comment-line-does',
    '1068-a-comment-only-paragraph-loosens-a-list-as-a-comment-line-does-2',
]);

const escaped = carveToProseMirror('a \\* b\n', { unsupported: 'preserve' });
escaped.content[0].content[0].text = 'edited';
assert.strictEqual(serializeToCarve(escaped), 'edited\n');

console.log(`source merge: ${envelopes} envelopes; ${authoredAppend} authored appends, ${canonicalAppend} editor-wins conflicts`);
