/**
 * The author's key/value pairs render as real HTML attributes, and nothing a
 * node renders itself comes back as one of them (#506, #507).
 *
 * Two failures this pins. A type that declared `carveKeyValues` by hand got
 * Tiptap's default rendering, so the map reached the DOM as the string
 * `[object Object]` and the pairs were gone on read-back. A type that renders
 * an attribute of its own without naming it in `attributeSlots` got it back as
 * an authored run: a citation came out of HTML spelled
 * `[@a2020]{raw="[@a2020]" integral="false"}`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(resolve(here, '../tiptap/wire-fixtures.json'), 'utf8'));

const editor = new Editor({ extensions: [CarveKit], content: '<p>x</p>' });
const schema = editor.schema;

const declared = new Map();
for (const entry of editor.extensionManager.attributes) {
    if (!declared.has(entry.type)) declared.set(entry.type, {});
    declared.get(entry.type)[entry.name] = entry.attribute;
}

// A value for every declared attribute, so each renderHTML that can emit
// something does. The exceptions are attributes whose renderHTML reads the
// value rather than passing it through.
function probeValue(name, spec) {
    if (name === 'checked') return true;
    if (name === 'level') return 2;
    if (name === 'carveAttrOrder') return ['#id'];
    if (name === 'colspan' || name === 'rowspan') return 2;
    if (name === 'colwidth') return null;
    if (name === 'textAlign' || name === 'carveInheritedTextAlign') return 'center';
    if (typeof spec.default === 'boolean') return true;
    if (typeof spec.default === 'number') return spec.default;
    if (Array.isArray(spec.default)) return spec.default;

    return `PROBE_${name}`;
}

function renderedAttributes(spec) {
    let current = spec;
    for (let depth = 0; Array.isArray(current) && depth < 10; depth++) {
        if (current.length > 1 && current[1] && typeof current[1] === 'object' && !Array.isArray(current[1])) {
            return current[1];
        }
        current = current[1];
    }

    return {};
}

let swept = 0;
for (const [kind, types] of [['node', schema.nodes], ['mark', schema.marks]]) {
    for (const [name, type] of Object.entries(types)) {
        const attributes = type.spec.attrs;
        if (!attributes || !('carveKeyValues' in attributes)) continue;

        const values = {};
        for (const [key, spec] of Object.entries(attributes)) values[key] = probeValue(key, spec);
        values.carveKeyValues = null;

        const rendered = renderedAttributes(kind === 'node'
            ? type.spec.toDOM(type.create(values))
            : type.spec.toDOM(type.create(values), true));
        const element = win.document.createElement('div');
        for (const [key, value] of Object.entries(rendered)) {
            if (value === null || value === undefined) continue;
            element.setAttribute(key, String(value));
        }

        const parse = declared.get(name)?.carveKeyValues?.parseHTML;
        assert.ok(parse, `${kind} ${name} declares carveKeyValues without a parseHTML, so an author's pairs are read from a "carvekeyvalues" attribute that no renderer writes`);
        assert.deepEqual(
            parse(element), null,
            `${kind} ${name} reads back its own rendered attributes as an authored run: ${Object.keys(parse(element) || {}).join(' ')}`,
        );
        swept++;
    }
}
assert.equal(swept, 33, `${swept} types declare carveKeyValues, not 33; a new one needs its own reserved list`);
console.log(`  ✓ ${swept} types keep their own rendered attributes out of the author's key/value slot`);

function htmlFor(doc) {
    const instance = new Editor({ extensions: [CarveKit], content: doc });
    try {
        return instance.getHTML();
    } finally {
        instance.destroy();
    }
}

function throughHtml(doc) {
    const instance = new Editor({ extensions: [CarveKit], content: doc });
    try {
        instance.commands.setContent(instance.getHTML());

        return serializeToCarve({ ...instance.getJSON(), attrs: undefined });
    } finally {
        instance.destroy();
    }
}

// #506 named these eight as the corpus documents that reach a hand-declared
// slot. Their pairs have to survive the HTML the editor itself writes.
const corpusPairs = [
    // The item's own attribute block widens its marker, so its second block
    // is written at the wider content column. Render-equivalent either way.
    ['413-an-item-s-attribute-block-moves-its-content-column-its-checkbox-does-not-9',
        '-{title="😀"} [x] a\n\n              # h'],
    ['89-block-attribute-lines-2', '{#id2 key="val2" .foo .bar .baz}\nOkay'],
    ['90-list-item-attributes-2', '3.{#x k="v"} A numbered item with id and key-value.'],
    ['289-a-structural-attribute-leads-the-author-s-own', '{k="v" .attr}\na. alpha'],
    ['11-fenced-code-6', '```php "src/Auth.php"\n$ok = true;\n```'],
    ['71-attribute-edge-cases-5', '![a](u){k="{y}"}'],
    ['42-admonitions-5', '{title="attr title"}\n::: note "opener title"\nBody.\n:::'],
    ['71-attribute-edge-cases-4', '[t](u){k="{y}"}'],
];
const byName = new Map(listCorpusFiles().map((file) => [file.name, file]));
for (const [name, expected] of corpusPairs) {
    const file = byName.get(name);
    assert.ok(file, `corpus document ${name} is gone; the case it pinned needs a new home`);
    const doc = carveToProseMirror(file.source, { unsupported: 'preserve' });
    assert.ok(!htmlFor(doc).includes('[object Object]'), `${name} renders an attribute map into HTML as [object Object]`);
    assert.equal(throughHtml(doc), expected, `${name} lost or invented an attribute run through HTML`);
}
console.log(`  ✓ ${corpusPairs.length} corpus documents keep their authored pairs through the editor's own HTML`);

// A name reserved on one node is still the author's on another. `scope` is
// engine plumbing on a header cell and an ordinary key/value anywhere else.
const authoredSources = [
    ['|{scope=row} x |', '|{scope="row"} x |'],
    ['| x |{scope=row}', '| x |{scope="row"}'],
    // Reserving a name kept it from being read back; it never kept it from
    // being WRITTEN, so an authored pair overwrote the node's own attribute
    // and the loss went past the pair itself (#519). The link lost its
    // destination and came back as bare text; the abbreviation read its
    // expansion out of the `title` the author had written.
    ['[safe](https://example.com){href="javascript:steal"}',
        '[safe](https://example.com){href="javascript:steal"}'],
    ['[x]{abbr="derived" title="authored"}', '[x]{abbr="derived" title="authored"}'],
    ['{aria-label="Mine"}\n::: note "Careful"\nBody.\n:::',
        '{aria-label="Mine"}\n::: note "Careful"\nBody.\n:::'],
    ['{align=right style="color: red"}\nAligned text.',
        '{align="right" style="color: red"}\nAligned text.'],
];
for (const [source, expected] of authoredSources) {
    assert.equal(throughHtml(carveToProseMirror(source, { unsupported: 'preserve' })), expected,
        `${source} lost its authored run through HTML`);
}
console.log(`  ✓ ${authoredSources.length} authored runs survive on a node that reserves the name elsewhere`);

// A cell's alignment marker renders as `text-align`, which Tiptap 3's own
// `align` attribute read back as an authored run (#532).
const alignedTables = [
    ['|= a |=> b |\n| c | d |', '|= a |=> b |\n| c | d |'],
    ['| a |{align=right} b |', '| a |{align="right"} b |'],
];
for (const [source, expected] of alignedTables) {
    assert.equal(throughHtml(carveToProseMirror(source, { unsupported: 'preserve' })), expected,
        `${source} changed through HTML`);
}
console.log(`  ✓ ${alignedTables.length} aligned tables keep their markers and runs through HTML`);

// A reference with no target renders `href=""`, which the stock link rule
// rejects, and a definition-resolved abbreviation read back as an authored
// run (#522). An inner link unwraps to text, so no `<a>` nests in an `<a>`.
const htmlShapes = [
    ['[t][nope]', '[t][nope]'],
    ['[t][]', '[t][]'],
    ['x [t][nope]{#i .c k=v} y', 'x [t][nope]{#i .c k=v} y'],
    ['[t][r]\n\n[r]: javascript:x', '[t][r]\n\n[r]: javascript:x'],
    ['*[HTML]: Hyper Text\n\nA HTML span.', '*[HTML]: Hyper Text\n\nA HTML span.'],
    ['A [HTML]{abbr="X"} span.', 'A [HTML]{abbr="X"} span.'],
    ['# a [x](/y) b\n\n[a [x](/y) b][]', '# a [x](/y) b\n\n[a x b][]'],
    ['# a <https://e.com> b\n\n[a <https://e.com> b][]', '# a <https://e.com> b\n\n[a https://e.com b][]'],
];
for (const [source, expected] of htmlShapes) {
    const doc = carveToProseMirror(source, { unsupported: 'preserve' });
    assert.ok(!/<a\b[^>]*>(?:(?!<\/a>).)*<a\b/.test(htmlFor(doc)), `${source} renders an <a> inside an <a>`);
    assert.equal(throughHtml(doc), expected, `${source} changed through HTML`);
}
console.log(`  ✓ ${htmlShapes.length} reference and abbreviation shapes survive the editor's own HTML`);

// carve-php and carve-js write plumbing of their own onto the elements this
// kit parses, and none of it is an author's key/value. These documents mount
// ENGINE-rendered HTML, which is the path wp-carve and the panel bar take.
const engineHtml = [
    // A fence title renders as `title`.
    ['11-fenced-code-6', '```php\n$ok = true;\n```'],
    // An admonition is labelled from its kind word.
    ['24-generic-divs-5', '::: outer\n:::: middle\n::::: note\nX\n:::::\n::::\n:::'],
    ['42-admonitions-2', '::: tip "Pro Tip"\nSave early, save often.\n:::'],
    // A header cell carries `scope`.
    ['09-tables', '| Fruit prices |\n|= Fruit |= Price |\n| Apple | $1 |\n| Pear | $2 |'],
    // An authored `{align=...}` renders as a computed `style`.
    ['420-text-block-alignment-renders-the-css-declaration', 'Aligned text.'],
    ['420-text-block-alignment-renders-the-css-declaration-2', '::: box\nAligned text.\n:::'],
    // What the engines DO carry comes back.
    ['89-block-attribute-lines-2', '{#id2 .foo .bar .baz key="val2"}\nOkay'],
];
for (const [name, expected] of engineHtml) {
    const file = byName.get(name);
    assert.ok(file, `corpus document ${name} is gone; the case it pinned needs a new home`);
    const instance = new Editor({ extensions: [CarveKit], content: carveToHtml(file.source) });
    try {
        assert.equal(serializeToCarve(instance.getJSON()), expected, `${name} reads engine-rendered HTML back wrongly`);
    } finally {
        instance.destroy();
    }
}
console.log(`  ✓ ${engineHtml.length} corpus documents keep engine plumbing out of the author's run`);

// The projection through HTML is lossy for reasons that have nothing to do
// with attribute runs. Every other fixture writes the same Carve either way.
const htmlProjectionLosses = new Map([
    // A heading id in rendered HTML may be generated, so importing one would
    // invent `{#slug}`; CarveHeading drops it deliberately.
    ['heading-with-attributes', '{.big}\n## A heading'],
    // The source is a RAGGED table, three body cells against two header ones.
    // ProseMirror's table parser rectangularizes on the way in, so the header
    // row comes back with a third, empty cell. Only a ragged table is affected.
    ['table-with-spans', '| a |  | b |\n|= h |= i |=  |'],
    // The halves ARE in the HTML, as the `<del>` and `<ins>` the node renders.
    // They are not read back because a half is inline content and reading it
    // as the flattened text would replace marked-up content rather than empty
    // it, and markup-carve/carve#2095 ruled that an empty half beats a wrong
    // one. The Carve source and the ProseMirror JSON are the interchange.
    ['substitution', 'A {~~>~} word.'],
    // Not a line block, which is `::: |`: this is a paragraph holding a SOFT
    // break, which HTML collapses to a space. The render is unchanged.
    ['line-block', '| one | two'],
]);
for (const fixture of fixtures.cases) {
    const direct = serializeToCarve(fixture.pm);
    const viaHtml = throughHtml(fixture.pm);
    assert.ok(!htmlFor(fixture.pm).includes('[object Object]'), `${fixture.name} renders an attribute map into HTML as [object Object]`);
    assert.equal(
        viaHtml, htmlProjectionLosses.get(fixture.name) ?? direct,
        `${fixture.name} serializes differently after a getHTML()/setContent() cycle`,
    );
}
console.log(`  ✓ ${fixtures.cases.length} wire fixtures survive a getHTML()/setContent() cycle`);

editor.destroy();
