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

// The latest corpus and the payload writer leave 496 source envelopes: 494
// preserve an authored append and two use canonical output. Sections 539-544
// added eleven, all of them authored appends; `line-blocks-2` left once a
// line block's indentation loaded as ASCII spaces, ten left once the quote
// fence kept its form and a quote's attribute run loaded, sections 550-552
// added five, keeping a rule's `*` or `_` marker retired four, and section
// 553 added ten (see the enveloped ledger accounting). Keep the exact remaining conflict set below, not just
// its size: the AST models neither the authored fence character (`~~~`
// re-emits as a backtick fence), nor the over-indent column of a marker line
// inside an opaque quote, so a document hitting one of those projects to
// canonical spelling and the envelope carries the authored bytes back.
assert.strictEqual(envelopes, 496, 'source-envelope population changed; audit the new projection differences');
assert.strictEqual(authoredAppend, 494, 'an append normalized authored layout in additional documents');
assert.strictEqual(canonicalAppend, 2, 'the set of structurally unterminated append conflicts changed');
assert.deepStrictEqual(canonicalFiles, [
    '182-openers-past-the-nesting-cap-are-one-paragraph',
    '268-trailing-whitespace-on-a-content-line-is-dropped-8',
]);

const escaped = carveToProseMirror('a \\* b\n', { unsupported: 'preserve' });
escaped.content[0].content[0].text = 'edited';
assert.strictEqual(serializeToCarve(escaped), 'edited\n');

console.log(`source merge: ${envelopes} envelopes; ${authoredAppend} authored appends, ${canonicalAppend} editor-wins conflicts`);
