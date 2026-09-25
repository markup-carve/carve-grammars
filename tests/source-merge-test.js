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

// The three move together with the corpus. The conflict set is the number to
// watch.
//
// 370 -> 403 and 366 -> 399 came from the spec bump to carve `275425f3`, which
// added 112 corpus documents in categories 476-495. Exactly 33 of them get a
// source envelope, and all 33 take the authored-append path, so the +33 lands
// on both totals and the conflict set does not move: it is still the same four
// documents (182, 268-8, 291-2, 291-4), whose appends are structurally
// unterminated. A bump that changed the conflict set would show up here as a
// third number, which is the one worth auditing.
assert.strictEqual(envelopes, 403, 'source-envelope population changed; audit the new projection differences');
assert.strictEqual(authoredAppend, 399, 'an append normalized authored layout in additional documents');
assert.strictEqual(canonicalAppend, 4, 'the set of structurally unterminated append conflicts changed');

const escaped = carveToProseMirror('a \\* b\n', { unsupported: 'preserve' });
escaped.content[0].content[0].text = 'edited';
assert.strictEqual(serializeToCarve(escaped), 'edited\n');

console.log(`source merge: ${envelopes} envelopes; ${authoredAppend} authored appends, ${canonicalAppend} editor-wins conflicts`);
