/**
 * Configurable quick fields on the frontmatter node view.
 *
 * Rendering is not behaviour: an input that exists and writes nowhere would
 * satisfy a "the field is there" check. So every field assertion here drives
 * the real control and reads the result back THROUGH THE SERIALIZER, and the
 * rejection assertions drive the rejected shape rather than asserting the
 * allowlist's contents.
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
if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 0);
    globalThis.cancelAnimationFrame = id => clearTimeout(id);
}

const { Editor } = await import('@tiptap/core');
const { CarveKit, serializeToCarve } = await import('../tiptap/index.js');

console.log('carve-grammars frontmatter fields:');
let passed = 0;
const failures = [];

// Teardown is the harness's job, not the check's. A failed assertion that left
// its editor mounted made the NEXT mount hang instead of failing - so a broken
// implementation showed up as a suite that never returns rather than a red row.
const mounted = [];

function check(name, fn) {
    try {
        fn();
        passed += 1;
        console.log(`  ✓ ${name}`);
    } catch (error) {
        failures.push(`${name}: ${error.message}`);
        console.log(`  ✗ ${name}`);
        console.log(`      ${error.message.split('\n')[0]}`);
    } finally {
        while (mounted.length) mounted.pop()();
    }
}

const SOURCE = 'title: Original\nlang: en\nunknown: kept\n';

function doc(content = SOURCE, format = 'yaml') {
    return {
        type: 'doc',
        content: [
            { type: 'carveFrontmatter', attrs: { content, format } },
            { type: 'paragraph', content: [{ type: 'text', text: 'Body.' }] },
        ],
    };
}

function mount(options, content = SOURCE, format = 'yaml') {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const kit = options === undefined ? CarveKit : CarveKit.configure({ carveFrontmatter: options });
    mounted.push(() => element.remove());
    const editor = new Editor({ element, extensions: [kit], content: doc(content, format) });
    mounted.push(() => {
        editor.destroy();
        element.remove();
    });
    return {
        editor,
        element,
        fields: () => [...element.querySelectorAll('.carve-frontmatter-fields label')],
        control: key => element.querySelector(`.carve-frontmatter-fields [name="${key}"]`),
        toggle: () => element.querySelector('.carve-frontmatter-summary'),
        carve: () => serializeToCarve(editor.getJSON()),
    };
}

function change(node, value) {
    assert.ok(node, 'expected the control to exist');
    node.value = value;
    node.dispatchEvent(new win.Event('change', { bubbles: true }));
}

// --- the default is unchanged ----------------------------------------------

check('omitting the option keeps the four documented fields', () => {
    const view = mount(undefined);
    assert.deepStrictEqual(
        view.fields().map(label => label.querySelector('[name]').name),
        ['title', 'lang', 'author', 'description'],
    );
});

check('omitting the option keeps the capitalized default labels', () => {
    const view = mount(undefined);
    assert.deepStrictEqual(
        view.fields().map(label => label.firstChild.textContent),
        ['Title', 'Lang', 'Author', 'Description'],
    );
});

check('omitting the option keeps description as the one multiline control', () => {
    const view = mount(undefined);
    assert.deepStrictEqual(
        view.fields().map(label => label.querySelector('[name]').tagName),
        ['INPUT', 'INPUT', 'INPUT', 'TEXTAREA'],
    );
});

check('omitting the option still reads a value out of the document', () => {
    const view = mount(undefined);
    assert.strictEqual(view.control('title').value, 'Original');
});

// --- a configured list replaces it -----------------------------------------

check('a configured list replaces the rendered fields entirely', () => {
    const view = mount({ fields: [{ key: 'title' }, { key: 'summary' }] });
    assert.deepStrictEqual(
        view.fields().map(label => label.querySelector('[name]').name),
        ['title', 'summary'],
    );
});

check('a descriptor label overrides the derived one', () => {
    const view = mount({ fields: [{ key: 'title', label: 'Note title' }] });
    assert.strictEqual(view.fields()[0].firstChild.textContent, 'Note title');
});

check('a descriptor placeholder reaches the control', () => {
    const view = mount({ fields: [{ key: 'title', placeholder: 'Optional title' }] });
    assert.strictEqual(view.control('title').placeholder, 'Optional title');
});

check('multiline picks a textarea for a key that is not description', () => {
    const view = mount({ fields: [{ key: 'summary', multiline: true }] });
    assert.strictEqual(view.control('summary').tagName, 'TEXTAREA');
});

check('a configured field reads its own key out of the document', () => {
    const view = mount({ fields: [{ key: 'unknown' }] }, SOURCE);
    assert.strictEqual(view.control('unknown').value, 'kept');
});

check('a configured field writes through to the serialized document', () => {
    const view = mount({ fields: [{ key: 'summary' }] });
    change(view.control('summary'), 'A short description');
    assert.match(view.carve(), /summary: "A short description"/);
});

check('a configured field preserves metadata it does not name', () => {
    const view = mount({ fields: [{ key: 'summary' }] });
    change(view.control('summary'), 'Added');
    assert.match(view.carve(), /unknown: kept/);
});

check('a key carrying a regex metacharacter is matched literally', () => {
    // Keys became consumer data with this option. Unescaped, `a.b` would read
    // `axb` - a wrong value shown as if it were the field's own.
    const view = mount({ fields: [{ key: 'a.b' }] }, 'axb: wrong\na.b: right\n');
    assert.strictEqual(view.control('a.b').value, 'right');
});

// --- input attributes -------------------------------------------------------

check('an allowlisted input attribute reaches the control', () => {
    const view = mount({ fields: [{ key: 'title', inputAttributes: { required: true, maxlength: 120 } }] });
    const input = view.control('title');
    assert.strictEqual(input.getAttribute('required'), '');
    assert.strictEqual(input.getAttribute('maxlength'), '120');
});

check('a false input attribute is not set at all', () => {
    const view = mount({ fields: [{ key: 'title', inputAttributes: { required: false } }] });
    assert.strictEqual(view.control('title').hasAttribute('required'), false);
});

check('an event-handler attribute is refused, not dropped', () => {
    assert.throws(
        () => mount({ fields: [{ key: 'title', inputAttributes: { onclick: 'steal()' } }] }),
        /may not set the "onclick" attribute/,
    );
});

check('an attribute the component owns is refused', () => {
    assert.throws(
        () => mount({ fields: [{ key: 'title', inputAttributes: { disabled: true } }] }),
        /may not set the "disabled" attribute/,
    );
});

check('the same key configured twice is refused', () => {
    // The controls are held by key, so a second one would render blank and
    // write nowhere - a field that looks live and is not.
    assert.throws(
        () => mount({ fields: [{ key: 'title' }, { key: 'title', label: 'Again' }] }),
        /title is configured twice/,
    );
});

check('a value violating a configured constraint does not reach the document', () => {
    // Nothing submits these controls, so `required` and `pattern` only bind if
    // the change handler asks. Without the check they are decoration.
    const view = mount({ fields: [{ key: 'title', inputAttributes: { pattern: '[A-Z].*' } }] });
    change(view.control('title'), 'lowercase');
    assert.match(view.carve(), /title: Original/);
});

check('a value satisfying a configured constraint does reach the document', () => {
    const view = mount({ fields: [{ key: 'title', inputAttributes: { pattern: '[A-Z].*' } }] });
    change(view.control('title'), 'Uppercase');
    assert.match(view.carve(), /title: "Uppercase"/);
});

check('a descriptor without a key is refused', () => {
    assert.throws(
        () => mount({ fields: [{ label: 'No key' }] }),
        /needs a non-empty string key/,
    );
});

check('a non-array fields option is refused', () => {
    assert.throws(() => mount({ fields: 'title' }), /must be an array of field descriptors/);
});

// --- the empty list ---------------------------------------------------------

check('an empty list renders no quick-field block', () => {
    const view = mount({ fields: [] });
    assert.strictEqual(view.element.querySelector('.carve-frontmatter-fields'), null);
});

check('an empty list keeps the raw frontmatter editor', () => {
    const view = mount({ fields: [] });
    const raw = view.element.querySelector('.carve-frontmatter-raw textarea');
    assert.ok(raw, 'raw editor is gone');
    assert.strictEqual(raw.value, SOURCE);
});

check('an empty list keeps the summary reading title and lang', () => {
    const view = mount({ fields: [] });
    assert.match(view.toggle().textContent, /Original.*en/);
});

// --- focus ------------------------------------------------------------------

check('expanding focuses the first configured field, not a hard-coded title', () => {
    const view = mount({ fields: [{ key: 'summary' }, { key: 'title' }] });
    view.toggle().click();
    assert.strictEqual(document.activeElement, view.control('summary'));
});

check('expanding with no quick fields focuses the raw editor', () => {
    const view = mount({ fields: [] });
    view.toggle().click();
    assert.strictEqual(document.activeElement, view.element.querySelector('.carve-frontmatter-raw textarea'));
});

if (failures.length > 0) {
    console.log(`\n${passed} passed, ${failures.length} FAILED`);
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exit(1);
}
console.log(`\n${passed} passed`);
