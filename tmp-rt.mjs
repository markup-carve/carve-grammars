import { readFileSync, writeFileSync } from 'node:fs';
import { Window } from 'happy-dom';
const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const k of ['DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator', 'getComputedStyle', 'MutationObserver']) {
    if (globalThis[k] === undefined && win[k] !== undefined) { try { globalThis[k] = win[k]; } catch { /* ro */ } }
}
const { Editor } = await import('@tiptap/core');
const { CarveKit, serializeToCarve } = await import('./tiptap/index.js');
const html = readFileSync('/tmp/src.html', 'utf8');
const el = document.createElement('div');
document.body.appendChild(el);
const editor = new Editor({ element: el, extensions: [CarveKit], content: html });
writeFileSync('/tmp/rt.crv', serializeToCarve(editor.getJSON()));
console.log('wrote /tmp/rt.crv');
