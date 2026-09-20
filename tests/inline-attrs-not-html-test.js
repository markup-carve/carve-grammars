/**
 * An attribute holding parsed nodes never travels through HTML.
 *
 * carve-grammars#504: a substitution's `old`/`new` halves and a citation's
 * `items` are arrays, and Tiptap rendered them into the HTML, where each entry
 * became the string `[object Object]`. Reading that HTML back crashed
 * `halfText` with `(half || []).map is not a function`, and the citation's
 * attribute-run slot wrote the stringified array into the Carve source as an
 * authored `{items="..."}` run.
 *
 * They are unrendered now, so through HTML a substitution comes back with empty
 * halves and a citation with no parsed items. HTML is not the interchange
 * format for either; the Carve source and the ProseMirror JSON are, and those
 * still carry everything.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { Editor } from '@tiptap/core';
import { CarveKit, carveToProseMirror, serializeToCarve } from '../tiptap/index.js';

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const key of ['DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator', 'getComputedStyle', 'MutationObserver']) {
    if (globalThis[key] === undefined && win[key] !== undefined) {
        try { globalThis[key] = win[key]; } catch { /* read-only global */ }
    }
}

let passed = 0;
function check(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

const mount = (content) => new Editor({ extensions: [CarveKit], content });
const fromCarve = (source) => mount(carveToProseMirror(source, { unsupported: 'preserve' }));
const written = (editor) => serializeToCarve({ ...editor.getJSON(), attrs: undefined });

const findNode = (node, type) => {
    if (node?.type === type) return node;
    for (const child of node?.content ?? []) {
        const hit = findNode(child, type);
        if (hit) return hit;
    }

    return null;
};

const PLAIN = 'A {~old~>new~} word.';
const MARKED = 'A {~*old* text~>_new_ text~} word.';

// The wire fixture is the only source of a populated `items`: it needs the
// engine's citations extension, which the corpus does not enable.
const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(resolve(here, '../tiptap/wire-fixtures.json'), 'utf8'));
const citationCase = (fixtures.cases ?? fixtures).find((entry) => entry.name === 'citation-group');
assert.ok(citationCase, 'wire-fixtures.json no longer carries the citation-group case');

console.log('carve-grammars parsed-node attributes stay out of HTML:');

check('a substitution writes neither half as an attribute', () => {
    for (const source of [PLAIN, MARKED]) {
        const editor = fromCarve(source);
        try {
            const html = editor.getHTML();
            assert.ok(html.includes('data-carve-substitution="true"'), `expected a substitution span for ${source}`);
            assert.ok(!/\bold=/.test(html), `old= leaked into the HTML for ${source}: ${html}`);
            assert.ok(!/\bnew=/.test(html), `new= leaked into the HTML for ${source}: ${html}`);
            assert.ok(!html.includes('[object Object]'), `[object Object] in the HTML for ${source}: ${html}`);
        } finally {
            editor.destroy();
        }
    }
});

check('reading a substitution back from HTML keeps the node and empties both halves', () => {
    const editor = fromCarve(PLAIN);
    try {
        editor.commands.setContent(editor.getHTML());
        const node = findNode(editor.getJSON(), 'carveSubstitution');
        assert.ok(node, 'the substitution node did not survive the HTML round trip');
        assert.deepStrictEqual(node.attrs.old, []);
        assert.deepStrictEqual(node.attrs.new, []);
    } finally {
        editor.destroy();
    }
});

check('the Carve round trip through a mount still carries both halves', () => {
    for (const source of [PLAIN, MARKED]) {
        const editor = fromCarve(source);
        try {
            assert.strictEqual(written(editor), source);
        } finally {
            editor.destroy();
        }
    }
});

check('the ProseMirror JSON through a mount still carries both halves', () => {
    const editor = fromCarve(MARKED);
    try {
        const node = findNode(editor.getJSON(), 'carveSubstitution');
        assert.ok(node, 'expected a carveSubstitution in the mounted document');
        assert.deepStrictEqual(node.attrs.old.map((n) => n.text ?? n.content?.[0]?.text), ['old', ' text']);
        assert.deepStrictEqual(node.attrs.new.map((n) => n.text ?? n.content?.[0]?.text), ['new', ' text']);
        assert.strictEqual(serializeToCarve(carveToProseMirror(MARKED, { unsupported: 'preserve' })), MARKED);
    } finally {
        editor.destroy();
    }
});

check('a citation writes no items attribute', () => {
    const editor = mount(citationCase.pm);
    try {
        const html = editor.getHTML();
        assert.ok(html.includes('data-carve-citation="true"'), `expected a citation span: ${html}`);
        assert.ok(!/\bitems=/.test(html), `items= leaked into the HTML: ${html}`);
        assert.ok(!html.includes('[object Object]'), `[object Object] in the HTML: ${html}`);
    } finally {
        editor.destroy();
    }
});

check('a mounted citation still carries its parsed items', () => {
    const editor = mount(citationCase.pm);
    try {
        const node = findNode(editor.getJSON(), 'carveCitation');
        assert.ok(node, 'expected a carveCitation in the mounted document');
        assert.deepStrictEqual(node.attrs.items, findNode(citationCase.pm, 'carveCitation').attrs.items);
        assert.strictEqual(written(editor), citationCase.carve.trimEnd());
    } finally {
        editor.destroy();
    }
});

console.log(`\n${passed} parsed-node attribute tests passed.`);
