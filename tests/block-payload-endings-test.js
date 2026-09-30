import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Editor } from '@tiptap/core';
import { parse } from '@markup-carve/carve';
import { CarveKit, carveToProseMirror, serializeToCarve } from '../tiptap/index.js';

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const key of ['DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator', 'getComputedStyle', 'MutationObserver']) {
    if (globalThis[key] === undefined && win[key] !== undefined) {
        try { globalThis[key] = win[key]; } catch { /* read-only global */ }
    }
}

let checked = 0;
for (const opener of ['```', '```js', '```=html']) {
    for (const body of ['', '\n', '\n\n', 'x\n', 'x\n\n', ' \n', '\t\n']) {
        const source = `${opener}\n${body}\`\`\`\n`;
        const original = parse(source).children[0];
        const doc = carveToProseMirror(source, { unsupported: 'preserve' });
        for (const mounted of [false, true]) {
            const editor = mounted ? new Editor({ extensions: [CarveKit], content: doc }) : null;
            try {
                const projected = editor ? editor.getJSON() : structuredClone(doc);
                delete projected.attrs;
                const actual = parse(serializeToCarve(projected)).children[0];
                assert.equal(actual.type, original.type);
                assert.equal(actual.content, original.content, `${opener}/${JSON.stringify(body)}/mounted=${mounted}`);
                checked++;
            } finally { editor?.destroy(); }
        }
    }
}
console.log(`Block payload endings: ${checked} mounted and unmounted empty, blank and nonempty bodies preserved.`);
