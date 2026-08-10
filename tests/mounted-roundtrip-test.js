/** Real-editor corpus ratchet: schema defaults only appear after mounting. */
import assert from 'node:assert';
import { Window } from 'happy-dom';
import { Editor } from '@tiptap/core';
import { carveToHtml } from '@markup-carve/carve';
import { CarveKit, carveToProseMirror, serializeToCarve } from '../tiptap/index.js';
import { listCorpusFiles } from './lib/corpus.js';

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const key of ['DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator', 'getComputedStyle', 'MutationObserver']) {
    if (globalThis[key] === undefined && win[key] !== undefined) {
        try { globalThis[key] = win[key]; } catch { /* read-only global */ }
    }
}

function normalizeHtml(html) {
    return (html || '')
        .replace(/<([a-z0-9]+)((?:\s[^<>]*?)?)\s*(\/?)>/gi, (_match, tag, attrs, slash) => {
            const parts = (attrs.match(/[\w-]+(?:="[^"]*")?/g) || []).sort();
            return `<${tag.toLowerCase()}${parts.length ? ` ${parts.join(' ')}` : ''}${slash}>`;
        })
        .replace(/\s+/g, ' ')
        .trim();
}

const changed = [];
for (const file of listCorpusFiles()) {
    const editor = new Editor({
        extensions: [CarveKit],
        content: carveToProseMirror(file.source, { unsupported: 'preserve' }),
    });
    try {
        // Strip the lossless source envelope deliberately: this measures the
        // editable projection, which is the path wp-carve's warning gate tests.
        const written = serializeToCarve({ ...editor.getJSON(), attrs: undefined });
        if (normalizeHtml(carveToHtml(file.source)) !== normalizeHtml(carveToHtml(written))) {
            changed.push(file.name);
        }
    } finally {
        editor.destroy();
    }
}

const fixed = [
    '03-links-2',
    '03-links-10',
    '08-image-with-caption-2',
    '13-attributes-3',
    '23-inline-footnotes',
    '26-comments-5',
    '39-inline-span-2',
    '42-admonitions-4',
    '100-table-row-attributes',
];
for (const name of fixed) assert.ok(!changed.includes(name), `${name} regressed after editor mount`);
assert.strictEqual(changed.length, 163, `mounted rich projection changed for ${changed.length} corpus documents`);
console.log(`mounted Tiptap corpus: ${listCorpusFiles().length - changed.length}/${listCorpusFiles().length} render-equivalent; ${changed.length} protected fallbacks`);
