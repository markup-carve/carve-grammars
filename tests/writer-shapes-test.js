/**
 * Shapes the Tiptap writer has to spell itself, without the source envelope:
 * each source loads with no envelope and writes back to the same AST.
 */
import assert from 'node:assert/strict';
import { parse } from '@markup-carve/carve';
import { carveToProseMirror, serializeToCarve } from '../tiptap/index.js';
import { normalizeAst } from './lib/ast-normalize.js';

const SHAPES = {
    'an attribute line above a table': '{#t .wide k=v}\n|= a |\n| b |\n',
    'a blocked rowspan marker': '| a | < |\n| ^ | b |\n',
    'a blocked colspan marker': '| a | b |\n| ^ | < |\n',
    'a covered column written with `^`': '| a | < |\n| ^ | ^ |\n',
    'a span over a later span marker': '|= h |<|= x |\n| r | f | b |\n|^| s |<|\n|^|^|<|\n',
    'a footnote reference with attributes in link text': 'a [t[^1]{.x}](/u) c [^1] b\n\n[^1]: n\n',
    'a footnote reference with attributes': 'a [^1]{#i .x k=v} b\n\n[^1]: n\n',
    'the combined bold-italic delimiter': '/*a // b*/ and /*c*/\n',
    'a paragraph that starts like a row of blank cells': '\\| |\n',
    'a continuation row': '| a | b |\n+ x | y |\n+ z | |\n',
    'a continuation on a blocked marker': '| ^ | < |\n+ x | y |\n',
    'a continuation joining a cell from a later row': '| a | b |\n+   |   |\n| ^ | c |\n+ y |   |\n',
};

let passed = 0;
for (const [name, source] of Object.entries(SHAPES)) {
    const doc = carveToProseMirror(source, { unsupported: 'preserve' });
    assert.equal(doc.attrs?.carveSource ?? null, null, `${name}: still needs the source envelope`);
    const written = serializeToCarve(doc);
    assert.deepStrictEqual(normalizeAst(parse(written)), normalizeAst(parse(source)),
        `${name}: ${JSON.stringify(written)} reads back differently`);
    passed++;
    console.log(`  ✓ ${name}`);
}
console.log(`writer shapes: ${passed} passed`);
