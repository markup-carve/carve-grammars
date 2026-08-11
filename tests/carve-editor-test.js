import assert from 'node:assert';
import { Window } from 'happy-dom';

// Importing the browser entry must itself be SSR-safe. Use a distinct module
// URL so the browser-realm import below still captures happy-dom's HTMLElement.
const ssrModule = await import('../tiptap/carve-editor.js?ssr');
assert.strictEqual(typeof ssrModule.CarveEditorElement, 'function');

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const key of ['CustomEvent', 'DOMParser', 'Node', 'Element', 'HTMLElement', 'customElements', 'navigator', 'getComputedStyle', 'MutationObserver']) {
    if (globalThis[key] === undefined && win[key] !== undefined) {
        try { globalThis[key] = win[key]; } catch { /* read-only global */ }
    }
}

const { CarveEditorElement, defineCarveEditor } = await import('../tiptap/carve-editor.js');

assert.strictEqual(defineCarveEditor(), CarveEditorElement);
assert.strictEqual(defineCarveEditor(), CarveEditorElement, 'registration is idempotent');

const element = document.createElement('carve-editor');
element.textContent = 'stale declarative source';
element.value = '';
document.body.appendChild(element);
assert.doesNotMatch(element.value, /stale/, 'an explicit empty value wins over light DOM');
element.remove();

element.value = 'A named note[^answer].\n\n[^answer]: Kept.\n';
document.body.appendChild(element);
assert.ok(element.shadowRoot.querySelector('.ProseMirror'), 'mounts a Tiptap surface');
assert.match(element.value, /\[\^answer\]/, 'loads through the AST without renumbering labels');

element.value = '---toml\ntitle = "Kept"\n---\n\nBody.\n';
assert.match(element.value, /title = "Kept"/, 'preserves unsupported source');

let detail = null;
element.addEventListener('input', event => { detail = event.detail; });
element._editor.commands.insertContent(' edited');
assert.match(detail?.value ?? '', /edited/, 'emits an input event with Carve source');

element.setAttribute('readonly', '');
assert.strictEqual(element._editor.isEditable, false, 'readonly disables editing');
element.removeAttribute('readonly');
assert.strictEqual(element._editor.isEditable, true, 'removing readonly enables editing');

let focusOptions = null;
const mountedEditor = element._editor;
element._editor = {
    commands: { focus: (_position, options) => { focusOptions = options; return true; } },
};
element.focus({ preventScroll: true });
element._editor = mountedEditor;
assert.deepStrictEqual(focusOptions, { scrollIntoView: false }, 'translates native focus options');

const beforeReconnect = element.value;
element.remove();
assert.strictEqual(element._editor, null, 'destroys its editor when disconnected');
document.body.appendChild(element);
assert.ok(element.shadowRoot.querySelector('.ProseMirror'), 'recreates its editor when reconnected');
assert.strictEqual(element.value, beforeReconnect, 'keeps source while reconnected');
console.log('carve-editor custom element: 13 passed');
