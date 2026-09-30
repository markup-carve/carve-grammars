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

// Carve JS 0.1.9, the latest corpus and the payload writer leave 486 source
// envelopes: 484 preserve an authored append and two use canonical output.
// The former EOF fence conflicts (291-2 and 291-4) now preserve authored appends.
// Section 535 added the last ten. The AST models neither the authored fence
// character (`~~~` re-emits as a backtick fence), the authored thematic marker
// (`***` re-emits as `---`), nor the over-indent column of a marker line inside
// an opaque quote, so each of the ten projects to canonical spelling and the
// envelope carries the authored bytes back. Keep the exact remaining conflict
// set below, not just its size.
assert.strictEqual(envelopes, 486, 'source-envelope population changed; audit the new projection differences');
assert.strictEqual(authoredAppend, 484, 'an append normalized authored layout in additional documents');
assert.strictEqual(canonicalAppend, 2, 'the set of structurally unterminated append conflicts changed');
assert.deepStrictEqual(canonicalFiles, [
    '182-openers-past-the-nesting-cap-are-one-paragraph',
    '268-trailing-whitespace-on-a-content-line-is-dropped-8',
]);

const escaped = carveToProseMirror('a \\* b\n', { unsupported: 'preserve' });
escaped.content[0].content[0].text = 'edited';
assert.strictEqual(serializeToCarve(escaped), 'edited\n');

console.log(`source merge: ${envelopes} envelopes; ${authoredAppend} authored appends, ${canonicalAppend} editor-wins conflicts`);
