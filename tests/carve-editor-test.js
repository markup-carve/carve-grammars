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
assert.deepStrictEqual([...footnotePicker.querySelectorAll('.carve-inline-choice')].map(option => option.textContent), ['note'], 'footnote picker lists document definitions');
footnoteInput.value = 'note';
footnotePicker.querySelector('.carve-control-primary').click();
assert.match(element.value, /\[\^note\]/, 'footnote picker changes its target');

const crossrefPicker = element.shadowRoot.querySelector('.carve-crossref-picker');
crossrefPicker.querySelector('.carve-inline-control-trigger').click();
assert.ok([...crossrefPicker.querySelectorAll('.carve-inline-choice')].some(option => option.textContent === 'target'), 'cross-reference picker lists heading ids');
assert.ok([...crossrefPicker.querySelectorAll('.carve-inline-choice')].some(option => option.textContent === 's-2026-Review'), 'cross-reference picker derives digit-leading heading ids');
assert.ok([...crossrefPicker.querySelectorAll('.carve-inline-choice')].some(option => option.textContent === 'Target'), 'cross-reference picker derives automatic heading ids');
const crossrefInput = crossrefPicker.querySelector('input');
crossrefInput.value = '2026';
crossrefInput.dispatchEvent(new window.Event('input', { bubbles: true }));
assert.deepStrictEqual([...crossrefPicker.querySelectorAll('.carve-inline-choice')].map(option => option.textContent), ['s-2026-Review'], 'reference choices filter as the user types');
crossrefInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
assert.strictEqual(element.shadowRoot.activeElement?.textContent, 's-2026-Review', 'ArrowDown moves from the search field to its first result');
element.shadowRoot.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
assert.strictEqual(crossrefPicker.querySelector('.carve-inline-control-editor').hidden, true, 'Escape closes a picker while a result has focus');
const citationPicker = element.shadowRoot.querySelector('.carve-citation-picker');
citationPicker.querySelector('.carve-inline-control-trigger').click();
assert.deepStrictEqual([...citationPicker.querySelectorAll('.carve-inline-choice')].map(option => option.textContent), ['[@doe]'], 'citation picker lists bibliography keys');

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

element._editor.commands.setContent({ type: 'doc', content: [{
    type: 'codeBlock', attrs: { language: 'javascript' },
    content: [{ type: 'text', text: 'const answer = 42;' }],
}] });
const codeBlock = element.shadowRoot.querySelector('.carve-code-block');
assert.ok(codeBlock, 'code block renders dedicated editor chrome');
assert.ok(codeBlock.querySelector('.carve-code-block-chrome'), 'language chrome stays outside the editable code content');
assert.strictEqual(codeBlock.querySelector('.carve-code-block-chrome').contentEditable, 'false', 'language chrome cannot become editable document content');
assert.strictEqual(codeBlock.querySelector('pre').textContent, 'const answer = 42;', 'code starts at the full-width first line');
assert.strictEqual(element._editor.isEditable, true, 'removing readonly enables editing');

element.value = '| Name | Value |\n| :--- | ----: |\n| First | 1 |\n';
const alignedCells = [...element.shadowRoot.querySelectorAll('td')];
assert.deepStrictEqual(
    alignedCells.map(cell => cell.style.textAlign || null),
    ['left', 'right'],
    'GFM table body cells visibly inherit header column alignment',
);

element.value = '- [ ] first\n- [x] second\n';
assert.strictEqual(element.shadowRoot.querySelector('ul[data-type="taskList"]').getAttribute('data-type'), 'taskList', 'task list exposes its structural styling hook');
assert.strictEqual(element.shadowRoot.querySelectorAll('ul[data-type="taskList"] > li[data-checked]').length, 2, 'task items use the checkbox layout rather than ordinary bullets');

element._editor.commands.setContent({ type: 'doc', content: [
    { type: 'carveComment', attrs: { block: true }, content: [{ type: 'text', text: 'Block note' }] },
    { type: 'paragraph', content: [
        { type: 'carveLiteral', content: [{ type: 'text', text: 'literal' }] },
        { type: 'text', text: ' ' },
        { type: 'carveRawInline', attrs: { format: 'html' }, content: [{ type: 'text', text: '<b>' }] },
        { type: 'text', text: ' ' },
        { type: 'carveMention', attrs: { id: 'ada' } },
        { type: 'text', text: ' ' },
        { type: 'carveTag', attrs: { id: 'review' } },
        { type: 'text', text: ' ' },
        { type: 'carveSymbol', attrs: { name: 'rocket' } },
        { type: 'text', text: ' ' },
        { type: 'carveMath', attrs: { src: 'x^2', display: false } },
        { type: 'text', text: ' ' },
        { type: 'carveSubstitution', attrs: { oldText: 'old', newText: 'new' } },
    ] },
    { type: 'paragraph', content: [
        { type: 'text', text: 'Text ' },
        { type: 'carveCommentInline', content: [{ type: 'text', text: 'inline note' }] },
        { type: 'text', text: ' editorial', marks: [{ type: 'carveCriticComment' }] },
    ] },
] });
assert.ok(element.shadowRoot.querySelector('pre[data-carve-comment]'), 'block comments expose their annotation styling hook');
const inlineComment = element.shadowRoot.querySelector('span[data-carve-comment-inline]');
assert.ok(inlineComment, 'inline comments expose their compact annotation styling hook');
assert.strictEqual(inlineComment.textContent, 'inline note', 'inline comment text renders as directly editable content');
let inlineCommentPos = null;
element._editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'carveCommentInline') inlineCommentPos = pos;
});
element._editor.commands.insertContentAt(inlineCommentPos + 1 + 'inline note'.length, ' revised');
assert.match(element.value, /%% inline note revised/, 'typing inside an inline comment updates its source');
assert.ok(element.shadowRoot.querySelector('.critic-comment'), 'editorial comments expose their review styling hook');
assert.strictEqual(element.shadowRoot.querySelector('code[data-carve-literal]').textContent, 'literal', 'literal payload is directly editable text');
assert.strictEqual(element.shadowRoot.querySelector('code[data-carve-raw-inline]').textContent, '<b>', 'raw-inline payload is directly editable text');
for (const className of ['carve-mention-editor', 'carve-tag-editor', 'carve-symbol-editor', 'carve-math-editor', 'carve-substitution-editor']) {
    assert.ok(element.shadowRoot.querySelector(`.${className} .carve-inline-control-trigger`), `${className} exposes a focused inline editor`);
}
const mentionEditor = element.shadowRoot.querySelector('.carve-mention-editor');
mentionEditor.querySelector('.carve-inline-control-trigger').click();
mentionEditor.querySelector('input[name="id"]').value = 'grace';
mentionEditor.querySelector('.carve-control-primary').click();
assert.match(element.value, /@grace/, 'inline field editors apply attribute changes');

element._editor.commands.setContent({ type: 'doc', content: [{
    type: 'paragraph', content: [
        { type: 'carveCommentInline', attrs: { content: 'legacy comment', delimited: true } },
        { type: 'text', text: ' ' },
        { type: 'carveLiteral', attrs: { content: 'legacy literal' } },
        { type: 'text', text: ' ' },
        { type: 'carveRawInline', attrs: { content: '<i>', format: 'html' } },
    ],
}] });
const migratedLegacyNodes = [];
element._editor.state.doc.descendants(node => {
    if (['carveCommentInline', 'carveLiteral', 'carveRawInline'].includes(node.type.name)) {
        migratedLegacyNodes.push(node);
    }
});
assert.deepStrictEqual(
    migratedLegacyNodes.map(node => node.textContent),
    ['legacy comment', 'legacy literal', '<i>'],
    'legacy attribute payloads migrate to directly editable child text',
);
assert.ok(migratedLegacyNodes.every(node => node.attrs.content === null), 'legacy payload migration clears the compatibility attribute');
assert.match(element.value, /legacy comment.*legacy literal.*<i>/, 'migrated legacy JSON keeps its serialized source');

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
assert.ok(element.shadowRoot.querySelector('.carve-frontmatter-highlight code.language-toml'), 'raw metadata exposes its format to a syntax highlighter');
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
console.log('carve-editor custom element: 50 passed');
