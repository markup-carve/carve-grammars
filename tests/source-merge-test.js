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

// The latest corpus and the payload writer leave 497 source envelopes: 495
// preserve an authored append and two use canonical output. Sections 539-544
// added the last eleven, all of them authored appends. Keep the exact remaining
// conflict set below, not just its size: the AST models neither the authored
// fence character (`~~~` re-emits as a backtick fence), the authored thematic
// marker (`***` re-emits as `---`), nor the over-indent column of a marker line
// inside an opaque quote, so a document hitting one of those projects to
// canonical spelling and the envelope carries the authored bytes back.
assert.strictEqual(envelopes, 497, 'source-envelope population changed; audit the new projection differences');
assert.strictEqual(authoredAppend, 495, 'an append normalized authored layout in additional documents');
assert.strictEqual(canonicalAppend, 2, 'the set of structurally unterminated append conflicts changed');
assert.deepStrictEqual(canonicalFiles, [
    '182-openers-past-the-nesting-cap-are-one-paragraph',
    '268-trailing-whitespace-on-a-content-line-is-dropped-8',
]);

const escaped = carveToProseMirror('a \\* b\n', { unsupported: 'preserve' });
escaped.content[0].content[0].text = 'edited';
assert.strictEqual(serializeToCarve(escaped), 'edited\n');

console.log(`source merge: ${envelopes} envelopes; ${authoredAppend} authored appends, ${canonicalAppend} editor-wins conflicts`);
