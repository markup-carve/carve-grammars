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

element._editor.commands.setContent({
    type: 'doc',
    content: [
        { type: 'heading', attrs: { level: 1, id: 'target' }, content: [{ type: 'text', text: 'Target' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '2026 Review' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Target' }] },
        { type: 'paragraph', content: [
            { type: 'carveFootnote', attrs: { label: 'old' } },
            { type: 'text', text: ' ' },
            { type: 'carveCrossref', attrs: { target: 'old-target' } },
            { type: 'text', text: ' ' },
            { type: 'carveCitation', attrs: { raw: '[@old]' } },
        ] },
        { type: 'carveFootnoteDefinition', attrs: { label: 'note' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note.' }] }] },
        { type: 'carveCitationDefinition', attrs: { key: 'doe' }, content: [{ type: 'text', text: 'Doe.' }] },
        { type: 'carveAbbreviationDefinition', attrs: { abbr: 'HTML', expansion: 'Old' } },
        { type: 'carveLinkRefDef', attrs: { label: 'home', href: '/old', title: null } },
        { type: 'carveUnsupported', attrs: { carveType: 'future-block', carveSource: '::: future\nOld\n:::\n' } },
    ],
});
const footnotePicker = element.shadowRoot.querySelector('.carve-footnote-picker');
footnotePicker.querySelector('.carve-inline-control-trigger').click();
const footnoteInput = footnotePicker.querySelector('input');
assert.deepStrictEqual([...footnotePicker.querySelectorAll('option')].map(option => option.value), ['note'], 'footnote picker lists document definitions');
footnoteInput.value = 'note';
footnotePicker.querySelector('button:last-child').previousElementSibling.click();
assert.match(element.value, /\[\^note\]/, 'footnote picker changes its target');

const crossrefPicker = element.shadowRoot.querySelector('.carve-crossref-picker');
crossrefPicker.querySelector('.carve-inline-control-trigger').click();
assert.ok([...crossrefPicker.querySelectorAll('option')].some(option => option.value === 'target'), 'cross-reference picker lists heading ids');
assert.ok([...crossrefPicker.querySelectorAll('option')].some(option => option.value === 's-2026-Review'), 'cross-reference picker derives digit-leading heading ids');
assert.ok([...crossrefPicker.querySelectorAll('option')].some(option => option.value === 'Target'), 'cross-reference picker derives automatic heading ids');
const citationPicker = element.shadowRoot.querySelector('.carve-citation-picker');
citationPicker.querySelector('.carve-inline-control-trigger').click();
assert.deepStrictEqual([...citationPicker.querySelectorAll('option')].map(option => option.value), ['[@doe]'], 'citation picker lists bibliography keys');

const abbreviation = element.shadowRoot.querySelector('.carve-abbreviation-definition-card');
abbreviation.querySelector('.carve-definition-summary').click();
abbreviation.querySelector('[name="expansion"]').value = 'HyperText Markup Language';
abbreviation.querySelector('.carve-definition-save').click();
assert.match(element.value, /\*\[HTML\]: HyperText Markup Language/, 'abbreviation definition card applies edits');
const linkDefinition = element.shadowRoot.querySelector('.carve-link-definition-card');
linkDefinition.querySelector('.carve-definition-summary').click();
linkDefinition.querySelector('[name="href"]').value = 'https://example.com';
linkDefinition.querySelector('.carve-definition-save').click();
assert.match(element.value, /\[home\]: https:\/\/example\.com/, 'link definition card applies edits');

const unsupported = element.shadowRoot.querySelector('.carve-raw-atom:not(.carve-raw-atom-inline)');
unsupported.querySelector('.carve-raw-atom-summary').click();
unsupported.querySelector('textarea').value = '::: future\nEdited\n:::\n';
unsupported.querySelector('button:last-child').click();
assert.match(element.value, /future\nEdited/, 'unsupported block exposes exact source editing');
assert.strictEqual(element._editor.isEditable, true, 'removing readonly enables editing');

element.value = '---\ntitle: Original\nlang: en\nunknown: kept\n---\n\nBody.\n';
const metadata = element.shadowRoot.querySelector('.carve-frontmatter-card');
assert.ok(metadata, 'frontmatter renders as a metadata card');
const summary = metadata.querySelector('.carve-frontmatter-summary');
assert.match(summary.textContent, /Original.*en/, 'collapsed summary exposes title and language');
assert.strictEqual(summary.getAttribute('aria-controls'), metadata.querySelector('.carve-frontmatter-body').id, 'summary controls the metadata body');
summary.click();
assert.strictEqual(summary.getAttribute('aria-expanded'), 'true', 'summary expands accessibly');
const title = metadata.querySelector('input[name="title"]');
title.value = 'Edited';
title.dispatchEvent(new win.Event('change', { bubbles: true }));
assert.match(element.value, /title: "Edited"/, 'field edit updates frontmatter through a transaction');
assert.match(element.value, /unknown: kept/, 'field edit preserves unknown metadata');
summary.click();
assert.strictEqual(summary.getAttribute('aria-expanded'), 'false', 'summary collapses again');

element.value = '---\nbook:\n  title: Nested\n---\n\nBody.\n';
const nestedTitle = element.shadowRoot.querySelector('input[name="title"]');
assert.strictEqual(nestedTitle.value, '', 'nested metadata is not mistaken for a common top-level field');
nestedTitle.value = 'Top level';
nestedTitle.dispatchEvent(new win.Event('change', { bubbles: true }));
assert.match(element.value, /book:\n  title: Nested\ntitle: "Top level"/, 'adding a top-level field preserves a nested field');

element.value = '---toml\n[book]\nisbn = "1"\n---\n\nBody.\n';
const tomlTitle = element.shadowRoot.querySelector('input[name="title"]');
tomlTitle.value = 'Top level';
tomlTitle.dispatchEvent(new win.Event('change', { bubbles: true }));
assert.match(element.value, /title = "Top level"\n\[book\]/, 'new TOML fields are inserted before tables');

const raw = element.shadowRoot.querySelector('.carve-frontmatter-raw textarea');
const beforeInvalidRaw = element.value;
raw.value = 'title = "Unsafe"\n---\n# body';
raw.dispatchEvent(new win.Event('change', { bubbles: true }));
assert.strictEqual(element.value, beforeInvalidRaw, 'raw metadata rejects an embedded closing fence');

element.setAttribute('readonly', '');
assert.strictEqual(tomlTitle.disabled, true, 'readonly disables metadata controls');
tomlTitle.value = 'Bypass';
tomlTitle.dispatchEvent(new win.Event('change', { bubbles: true }));
assert.doesNotMatch(element.value, /Bypass/, 'readonly metadata cannot dispatch edits');
element.removeAttribute('readonly');

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
console.log('carve-editor custom element: 38 passed');
