// A text node holds one carveSpan mark, so a span nested in another keeps the outermost one.
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Editor } from '@tiptap/core';
import { CarveKit, carveToProseMirror, serializeToCarve } from '../tiptap/index.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const key of ['DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator', 'getComputedStyle', 'MutationObserver']) {
    if (globalThis[key] === undefined && win[key] !== undefined) {
        try { globalThis[key] = win[key]; } catch { /* read-only global */ }
    }
}

const CASES = [
    ['[[x]{#in}]{#out}\n', '[x]{#out}'],
    ['[[x]{.a}]{.a}\n', '[x]{.a}'],
    ['[*[x]{.a}*]{.b}\n', '[*x*]{.b}'],
    ['[a [x]{.a} b]{.b}\n', '[a x b]{.b}'],
    [`${'['.repeat(40)}x${']{.a}'.repeat(40)}\n`, '[x]{.a}'],
];
for (const [source, want] of CASES) {
    const report = {};
    const editor = new Editor({ extensions: [CarveKit], content: carveToProseMirror(source, { unsupported: 'preserve', report }) });
    try {
        editor.state.doc.check();
        assert.equal(serializeToCarve({ ...editor.getJSON(), attrs: undefined }), want, JSON.stringify(source));
        assert.ok(report.degraded?.span, `the dropped span is reported: ${JSON.stringify(source)}`);
    } finally {
        editor.destroy();
    }
}
console.log(`nested spans: ${CASES.length} documents mount as a valid editor document`);
