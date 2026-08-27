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
    else if (actual === canonical) canonicalAppend++;
    else assert.fail(`${file.name}: merged output matches neither authored nor editor semantics`);
}

assert.strictEqual(envelopes, 319, 'source-envelope population changed; audit the new projection differences');
assert.strictEqual(authoredAppend, 315, 'an append normalized authored layout in additional documents');
assert.strictEqual(canonicalAppend, 4, 'the set of structurally unterminated append conflicts changed');

const escaped = carveToProseMirror('a \\* b\n', { unsupported: 'preserve' });
escaped.content[0].content[0].text = 'edited';
assert.strictEqual(serializeToCarve(escaped), 'edited\n');

console.log(`source merge: ${envelopes} envelopes; ${authoredAppend} authored appends, ${canonicalAppend} editor-wins conflicts`);
