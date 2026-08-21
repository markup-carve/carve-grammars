/**
 * The interactive bar on tab sets and code groups.
 *
 * Mounting is not behaviour. A bar that renders and does nothing would satisfy
 * a "the buttons exist" check, so every assertion here drives the real DOM the
 * NodeView built - a mousedown on a real button - and then reads the result
 * back out THROUGH THE SERIALIZER. That is the only thing that proves an edit
 * reached the document rather than only the view, and it is what would catch a
 * reorder that looks right on screen and writes the old order to disk.
 */
import assert from 'node:assert';
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const k of [
    'DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator', 'getComputedStyle',
    'MutationObserver', 'MouseEvent', 'KeyboardEvent', 'Event', 'FocusEvent',
]) {
    if (globalThis[k] === undefined && win[k] !== undefined) {
        try {
            globalThis[k] = win[k];
        } catch {
            /* read-only global - ignore */
        }
    }
}

// happy-dom has no requestAnimationFrame. Nothing in the bar needs it, but a
// missing global turns into a ReferenceError deep inside Tiptap rather than a
// legible failure, so it is stubbed rather than left to surprise the next
// person who adds a test here.
if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 0);
    globalThis.cancelAnimationFrame = id => clearTimeout(id);
}

const { Editor } = await import('@tiptap/core');
const { CarveKit, serializeToCarve, carveToProseMirror } = await import('../tiptap/index.js');
const { carveToHtml, parse } = await import('@markup-carve/carve');

console.log('carve-grammars panel bar:');
let passed = 0;
const failures = [];

function check(name, fn) {
    try {
        fn();
        passed += 1;
        console.log(`  ✓ ${name}`);
    } catch (error) {
        failures.push(`${name}: ${error.message}`);
        console.log(`  ✗ ${name}`);
        console.log(`      ${error.message.split('\n')[0]}`);
    }
}

function mount(carve) {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const editor = new Editor({ element, extensions: [CarveKit], content: carveToHtml(carve) });
    return {
        editor,
        element,
        carve: () => serializeToCarve(editor.getJSON()),
        destroy: () => {
            editor.destroy();
            element.remove();
        },
    };
}

// `/:: tab/` also matches the container's own `::: tabs` opener, so counting
// with it is always one too high - which is how the "adding a tab" assertion
// passed before anything was added. The trailing boundary is what separates a
// `tab` opener from a `tabs` one.
function countTabs(source) {
    return (source.match(/^:+ tab(?:\s|$)/gm) || []).length;
}

function press(node) {
    assert.ok(node, 'expected the control to exist');
    node.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

const TABS = [
    '::: tabs',
    ':::: tab [First]',
    'Alpha',
    '::::',
    '',
    ':::: tab [Second]',
    'Beta',
    '::::',
    ':::',
].join('\n');

const FENCE = '```';
const GROUP = [
    '::: code-group',
    `${FENCE} js [one.js]`,
    'a',
    FENCE,
    '',
    `${FENCE} php [two.php]`,
    'b',
    FENCE,
    ':::',
].join('\n');

// --- the bar exists at all -------------------------------------------------

check('a tab set renders a bar with one button per tab', () => {
    const doc = mount(TABS);
    const labels = [...doc.element.querySelectorAll('.carve-tabset-bar .carve-tabset-tab')].map(b => b.textContent);
    assert.deepStrictEqual(labels, ['First', 'Second']);
    doc.destroy();
});

check('a code group renders a bar, falling back to the language', () => {
    // carve-js's HTML for a code group does NOT carry the per-block `[label]`:
    // it emits bare <pre> children, so `one.js` is not recoverable from the
    // seed and the language is the only label there is. Asserting the label
    // here would be asserting something the input never contained.
    const doc = mount(GROUP);
    const labels = [...doc.element.querySelectorAll('.carve-codegroup-bar .carve-codegroup-tab')].map(b => b.textContent);
    assert.deepStrictEqual(labels, ['js', 'php']);
    doc.destroy();
});

check('a code group mounted from the AST shows its real labels', () => {
    // The AST path DOES carry them, as carveLabel - which is why labelOf reads
    // that first and only then falls back. This is the half of the behaviour
    // the HTML seed cannot exercise.
    const element = document.createElement('div');
    document.body.appendChild(element);
    const editor = new Editor({ element, extensions: [CarveKit], content: carveToProseMirror(GROUP, { unsupported: 'preserve' }) });
    const labels = [...element.querySelectorAll('.carve-codegroup-bar .carve-codegroup-tab')].map(b => b.textContent);
    assert.deepStrictEqual(labels, ['one.js', 'two.php']);
    editor.destroy();
    element.remove();
});

check('a div that is not a code group gets no bar', () => {
    // The nodeView is registered for every carveDiv, so this is the regression
    // that matters: an admonition must render exactly as it did before.
    const doc = mount('::: note "Title"\nBody.\n:::');
    assert.strictEqual(doc.element.querySelector('.carve-codegroup-bar'), null);
    assert.match(doc.element.innerHTML, /admonition/);
    assert.deepStrictEqual(parse(doc.carve()), parse('::: note "Title"\nBody.\n:::'));
    doc.destroy();
});

// --- switching is view-local ----------------------------------------------

check('switching a tab changes only the view, never the document', () => {
    const doc = mount(TABS);
    const before = doc.carve();
    const wrapper = doc.element.querySelector('.carve-tabset');
    assert.strictEqual(wrapper.getAttribute('data-active'), '0');
    press(doc.element.querySelectorAll('.carve-tabset-tab')[1]);
    assert.strictEqual(wrapper.getAttribute('data-active'), '1');
    assert.strictEqual(doc.carve(), before, 'switching a tab edited the document');
    doc.destroy();
});

// --- editing reaches the document -----------------------------------------

check('renaming a tab writes the new label to the source', () => {
    const doc = mount(TABS);
    const button = doc.element.querySelectorAll('.carve-tabset-tab')[0];
    button.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    const input = doc.element.querySelector('.carve-tabset-rename');
    assert.ok(input, 'double-click did not open a rename input');
    assert.strictEqual(input.value, 'First');
    input.value = 'Renamed';
    input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const out = doc.carve();
    assert.match(out, /\[Renamed\]/, `label not written: ${out}`);
    assert.doesNotMatch(out, /\[First\]/, `old label survived: ${out}`);
    doc.destroy();
});

check('escape abandons a rename', () => {
    const doc = mount(TABS);
    const button = doc.element.querySelectorAll('.carve-tabset-tab')[0];
    button.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    const input = doc.element.querySelector('.carve-tabset-rename');
    input.value = 'Discarded';
    input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const out = doc.carve();
    assert.doesNotMatch(out, /Discarded/, `escape still committed: ${out}`);
    assert.match(out, /\[First\]/);
    doc.destroy();
});

check('adding a tab adds one to the source', () => {
    const doc = mount(TABS);
    press(doc.element.querySelector('.carve-tabset-add'));
    const out = doc.carve();
    assert.strictEqual(countTabs(out), 3, `expected three tabs:\n${out}`);
    doc.destroy();
});

check('removing a tab removes one from the source', () => {
    const doc = mount(TABS);
    press(doc.element.querySelectorAll('.carve-tabset-tab')[1]);
    press(doc.element.querySelector('.carve-tabset-remove'));
    const out = doc.carve();
    assert.strictEqual(countTabs(out), 1, `expected one tab:\n${out}`);
    assert.match(out, /\[First\]/);
    assert.doesNotMatch(out, /\[Second\]/);
    doc.destroy();
});

check('the last tab cannot be removed', () => {
    // A tab set with no tabs is not a smaller tab set: the schema requires
    // carveTab+ and the serializer would write a fence around nothing.
    const doc = mount('::: tabs\n:::: tab [Only]\nA\n::::\n:::');
    press(doc.element.querySelector('.carve-tabset-remove'));
    assert.match(doc.carve(), /\[Only\]/, 'the last tab was removed');
    doc.destroy();
});

check('moving a tab right reorders the source', () => {
    // The direction that a naive implementation gets wrong: deleting then
    // re-inserting at the old target position puts the tab back where it was.
    const doc = mount(TABS);
    press(doc.element.querySelectorAll('.carve-tabset-tab')[0]);
    const [, right] = doc.element.querySelectorAll('.carve-tabset-move');
    press(right);
    const out = doc.carve();
    assert.ok(out.indexOf('[Second]') < out.indexOf('[First]'), `order unchanged:\n${out}`);
    doc.destroy();
});

check('moving a tab left reorders the source', () => {
    const doc = mount(TABS);
    press(doc.element.querySelectorAll('.carve-tabset-tab')[1]);
    const [left] = doc.element.querySelectorAll('.carve-tabset-move');
    press(left);
    const out = doc.carve();
    assert.ok(out.indexOf('[Second]') < out.indexOf('[First]'), `order unchanged:\n${out}`);
    doc.destroy();
});

check('moving past either end does nothing', () => {
    const doc = mount(TABS);
    const before = doc.carve();
    press(doc.element.querySelectorAll('.carve-tabset-tab')[0]);
    const [left, right] = doc.element.querySelectorAll('.carve-tabset-move');
    press(left);
    assert.strictEqual(doc.carve(), before, 'moving the first tab left changed the document');
    press(doc.element.querySelectorAll('.carve-tabset-tab')[1]);
    press(right);
    assert.strictEqual(doc.carve(), before, 'moving the last tab right changed the document');
    doc.destroy();
});

// --- the same, for code groups --------------------------------------------

check('renaming a code block writes its [label], not its language', () => {
    const doc = mount(GROUP);
    const button = doc.element.querySelectorAll('.carve-codegroup-tab')[0];
    button.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    const input = doc.element.querySelector('.carve-codegroup-rename');
    assert.ok(input, 'double-click did not open a rename input');
    input.value = 'renamed.js';
    input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const out = doc.carve();
    assert.match(out, /\[renamed\.js\]/, `label not written:\n${out}`);
    // The grammar must survive a rename: changing the tab's caption should not
    // silently restyle the code.
    assert.match(out, /```js/, `the language was lost:\n${out}`);
    doc.destroy();
});

check('reordering a code group reorders the source', () => {
    // Asserted on the languages, not the labels: this mounts from HTML, which
    // carries no `[label]`, so searching for `one.js` would compare -1 with -1
    // and pass whatever happened.
    const doc = mount(GROUP);
    press(doc.element.querySelectorAll('.carve-codegroup-tab')[0]);
    const [, right] = doc.element.querySelectorAll('.carve-codegroup-move');
    press(right);
    const out = doc.carve();
    assert.ok(out.indexOf('php') > -1 && out.indexOf('js') > -1, `languages missing:\n${out}`);
    assert.ok(out.indexOf('php') < out.indexOf('js'), `order unchanged:\n${out}`);
    doc.destroy();
});

check('every edit leaves a document the engine still parses', () => {
    // A bar that produces unparseable Carve is worse than no bar.
    const doc = mount(TABS);
    press(doc.element.querySelector('.carve-tabset-add'));
    press(doc.element.querySelectorAll('.carve-tabset-tab')[0]);
    const [, right] = doc.element.querySelectorAll('.carve-tabset-move');
    press(right);
    press(doc.element.querySelector('.carve-tabset-remove'));
    const out = doc.carve();
    assert.doesNotThrow(() => parse(out), `edited document does not parse:\n${out}`);
    doc.destroy();
});

if (failures.length > 0) {
    console.log(`\n${passed} passed, ${failures.length} FAILED`);
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exit(1);
}
console.log(`\n${passed} passed`);
