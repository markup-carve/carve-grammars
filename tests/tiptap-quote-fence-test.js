/**
 * A `::: >` quote fence keeps its fence form through the Tiptap bridge.
 *
 * The engine marks the fenced quote `fenced: true` on its `block_quote`; the
 * bridge records it as `carveFenced` on the blockquote and the serializer
 * writes the colon fence back instead of `>` markers.
 */
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const key of ['DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator', 'getComputedStyle', 'MutationObserver']) {
    if (globalThis[key] === undefined && win[key] !== undefined) {
        try { globalThis[key] = win[key]; } catch { /* read-only global */ }
    }
}

const { Editor } = await import('@tiptap/core');
const { CarveKit, carveToProseMirror, serializeToCarve } = await import('../tiptap/index.js');

let passed = 0;
function check(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

const project = (src) => serializeToCarve({ ...carveToProseMirror(src, { unsupported: 'preserve' }), attrs: undefined });

function mount(content) {
    return new Editor({ extensions: [CarveKit], content });
}

const FENCED = '::: >\nQuote.\n:::';

console.log('carve-grammars quote fence:');

check('a quote fence round-trips as a fence', () => {
    assert.equal(project(FENCED), FENCED);
});

check('a marker quote stays a marker quote', () => {
    assert.equal(project('> Quote.'), '> Quote.');
});

check('several blocks and an attribute run survive', () => {
    const src = '{.c}\n::: >\nOne.\n\n- a\n- b\n:::';
    assert.equal(project(src), src);
});

check('a wider authored fence is written at the canonical width', () => {
    assert.equal(project('::::: >\nQuote.\n:::::'), FENCED);
});

check('a div inside the fence nests one colon wider', () => {
    const src = '::: >\n:::: note\nInner.\n::::\n:::';
    assert.equal(project(src), src);
});

check('a quote fence inside a div nests one colon wider', () => {
    const src = '::: note\n:::: >\nInner.\n::::\n:::';
    assert.equal(project(src), src);
});

check('a caption on a quote fence survives', () => {
    const src = '::: >\nQuote.\n:::\n^ Who';
    assert.equal(project(src), src);
});

check('the fence form survives a mount and an edit inside it', () => {
    const editor = mount(carveToProseMirror(FENCED, { unsupported: 'preserve' }));
    let textPos = null;
    editor.state.doc.descendants((node, pos) => {
        if (textPos === null && node.isText) textPos = pos + node.text.length;
    });
    editor.view.dispatch(editor.state.tr.insertText(' More.', textPos));
    assert.equal(serializeToCarve(editor.getJSON()), '::: >\nQuote. More.\n:::');
    editor.destroy();
});

check("the fence form survives the editor's own HTML", () => {
    const first = mount(carveToProseMirror(FENCED, { unsupported: 'preserve' }));
    const html = first.getHTML();
    first.destroy();
    const second = mount(html);
    assert.equal(serializeToCarve(second.getJSON()), FENCED);
    second.destroy();
});

check('a plain HTML blockquote loads as a marker quote', () => {
    const editor = mount('<blockquote><p>Quote.</p></blockquote>');
    assert.equal(serializeToCarve(editor.getJSON()), '> Quote.');
    editor.destroy();
});

console.log(`\n${passed} quote fence tests passed.`);
