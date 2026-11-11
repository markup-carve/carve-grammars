/**
 * An empty code span is an unclosed backtick run: it takes the rest of the
 * block, an enclosing mark's braced closer included (carve#3973 X5).
 */
import { carveToHtml } from '@markup-carve/carve';
import assert from 'node:assert';
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const key of ['DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator', 'getComputedStyle', 'MutationObserver']) {
    if (globalThis[key] === undefined && win[key] !== undefined) {
        try { globalThis[key] = win[key]; } catch { /* read-only global - ignore */ }
    }
}

const { Editor } = await import('@tiptap/core');
const { CarveKit, carveToProseMirror, serializeToCarve } = await import('../tiptap/index.js');

const canonical = (doc) => serializeToCarve({ ...doc, attrs: undefined });

function written(source) {
    return canonical(carveToProseMirror(source, { unsupported: 'throw' }));
}

function mounted(source) {
    const editor = new Editor({ extensions: [CarveKit], content: carveToProseMirror(source, { unsupported: 'throw' }) });
    try {
        return canonical(editor.getJSON());
    } finally {
        editor.destroy();
    }
}

// Each source's backtick run takes the rest of the block, so the writer only
// has to keep that reading: the `{~` before it is text, not a strike.
const BRACED = [
    '{~` ~}',
    'a {~` ~} b',
    '{*`  *}',
    '{~`~}',
    '{/` /}',
    '{_` _}',
    '{=` =}',
    '{^` ^}',
    '{~y` ~} z',
    '[{~` ~}](u)',
    'a ``',
    '{*{~` ~}*}',
    '{*{_{~` ~}_}*}',
    'a {*{~` ~}*} b',
    'x{*{~` ~}*}',
    '{*{~` ~}*}x',
    '{={~` ~}=}',
];
for (const source of BRACED) {
    assert.match(carveToHtml(source), /<code>/, `the run is code: ${source}`);
    assert.strictEqual(carveToHtml(written(source)), carveToHtml(source), `written: ${source}`);
    assert.strictEqual(carveToHtml(mounted(source)), carveToHtml(source), `mounted: ${source}`);
}

// Trees only an editor can build. Inside a mark, or with content after it, the
// run would swallow what follows, so the span is dropped instead.
const code = (...marks) => ({
    type: 'carveEmptyMark',
    attrs: { markType: 'code' },
    ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});
const text = (value, ...marks) => ({ type: 'text', text: value, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) });
const paragraph = (...content) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });

assert.strictEqual(serializeToCarve(paragraph(code('strike'), text('y', 'strike'))), '~y~');
assert.strictEqual(serializeToCarve(paragraph(code(), text(' b'))), 'b');
assert.strictEqual(serializeToCarve(paragraph(code('strike'), text(' b'))), 'b');
assert.strictEqual(serializeToCarve(paragraph(text('a '), code('strike'))), 'a');
assert.strictEqual(serializeToCarve(paragraph(text('a '), code())), 'a ``');
const cell = (...content) => ({ type: 'tableCell', content: [{ type: 'paragraph', content }] });
const table = { type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [cell(code()), cell(text('b'))] }] }] };
assert.strictEqual(carveToHtml(serializeToCarve(table)).includes('<td>b</td>'), true, 'the run swallowed the next cell');

console.log(`empty code span: ${BRACED.length} source shapes, 6 editor-built trees`);
