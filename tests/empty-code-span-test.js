/**
 * An empty code span is an unclosed backtick run: it ends only at the end of
 * the block or at the braced closer of an enclosing mark (PART 3 UNCLOSED RUN).
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

const BRACED = [
    ['{~` ~}', '{~``~}'],
    ['a {~` ~} b', 'a {~``~} b'],
    ['{*`  *}', '{*``*}'],
    ['{~`~}', '{~``~}'],
    ['{/` /}', '{/``/}'],
    ['{_` _}', '{_``_}'],
    ['{=` =}', '{=``=}'],
    ['{^` ^}', '{^``^}'],
    ['{~y` ~} z', '{~y``~} z'],
    ['{*{~` ~}*}', '{*{~``~}*}'],
    ['[{~` ~}](u)', '[{~``~}](u)'],
    ['a ``', 'a ``'],
];
for (const [source, want] of BRACED) {
    assert.strictEqual(written(source), want, `written: ${source}`);
    assert.strictEqual(mounted(source), want, `mounted: ${source}`);
    assert.strictEqual(carveToHtml(want), carveToHtml(source), `${want} reads back differently from ${source}`);
}

assert.strictEqual(written('{~`a ~}'), '~`a`~', 'a filled span keeps the bare closer');

// Trees only an editor can build: content after the empty span. The run would
// swallow it, so the span is dropped instead.
const code = (...marks) => ({
    type: 'carveEmptyMark',
    attrs: { markType: 'code' },
    ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});
const text = (value, ...marks) => ({ type: 'text', text: value, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) });
const paragraph = (...content) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });

assert.strictEqual(serializeToCarve(paragraph(code('strike'), text('y', 'strike'))), '~y~');
assert.strictEqual(serializeToCarve(paragraph(code(), text(' b'))), 'b');
assert.strictEqual(serializeToCarve(paragraph(code('strike'), text(' b'))), '{~``~} b');
const cell = (...content) => ({ type: 'tableCell', content: [{ type: 'paragraph', content }] });
const table = { type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [cell(code()), cell(text('b'))] }] }] };
assert.strictEqual(carveToHtml(serializeToCarve(table)).includes('<td>b</td>'), true, 'the run swallowed the next cell');

console.log(`empty code span: ${BRACED.length} source shapes, 4 editor-built trees`);
