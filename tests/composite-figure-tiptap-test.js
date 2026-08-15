/**
 * A composite figure in the Tiptap layer (PART 9 §4c, markup-carve/carve#1122).
 *
 * `tests/composite-figure-test.js` asks whether the three HIGHLIGHTING grammars
 * tell a bare `::: figure` opener apart from a titled or labelled one. That
 * question is about one line of source. This file asks the other half: whether
 * the editor bridge builds the NODE - a container whose direct `figure` and
 * `table` children are ordered panels, whose caption is authored below the
 * closing fence, and which carries no `target`, no title and no label - and
 * whether the source survives the trip back out.
 *
 * WHY THE CONTROL IS REAL HERE. The pair "bare opener vs titled opener" is a
 * control that can pass while testing nothing: in a layer whose engine does not
 * implement §4c, both spellings produce the SAME generic container and the
 * assertion "these differ" is the only one that could have caught it. The
 * `@markup-carve/carve` pin this package builds against does implement §4c, and
 * the first case below asserts the two readings differ by node type - so if the
 * pin ever moves back to an engine without it, the control fails rather than
 * quietly agreeing with itself.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { Editor } from '@tiptap/core';
import { getSchema } from '@tiptap/core';
import { parse } from '@markup-carve/carve';
import { CarveKit, carveToProseMirror, serializeToCarve } from '../tiptap/index.js';
import { normalizeAst } from './lib/ast-normalize.js';

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

console.log('composite figures in the Tiptap bridge:');

const types = (node) => (node.content || []).map((child) => child.type);

/** parse -> ProseMirror -> serialize -> parse, as the corpus sweep runs it. */
function roundTrip(source) {
    const pm = carveToProseMirror(source);
    const written = serializeToCarve(pm);
    return {
        pm,
        written,
        idempotent:
            JSON.stringify(normalizeAst(parse(source)))
            === JSON.stringify(normalizeAst(parse(written))),
    };
}

const GROUP = '::: figure\n![one](a.png)\n^ One\n\n![two](b.png)\n^ Two\n:::\n^ Group caption\n';

ok('a BARE opener is a group and a TITLED one is not - and the two answers differ', () => {
    const group = carveToProseMirror(GROUP).content[0];
    const titled = carveToProseMirror('::: figure "Panel set"\n![one](a.png)\n^ One\n:::\n').content[0];
    const labelled = carveToProseMirror('::: figure [g]\nBody.\n:::\n').content[0];

    assert.strictEqual(group.type, 'carveFigureGroup');
    assert.strictEqual(titled.type, 'carveDiv', 'a quoted title stays a generic Tier-2 container');
    assert.strictEqual(labelled.type, 'carveDiv', 'a [label] stays a generic Tier-2 container');
    // The control that makes the two above worth asserting.
    assert.notStrictEqual(
        group.type, titled.type,
        'the bare and the titled opener read the SAME - the engine pin has no §4c, '
        + 'so the titled control is passing without testing anything',
    );
    // Metadata is preserved losslessly on the degraded reading, which is what
    // makes it a lossless degradation rather than a silent drop.
    assert.strictEqual(titled.attrs.title, 'Panel set');
    assert.strictEqual(labelled.attrs.label, 'g');
});

ok('a plain `::: note` is not a group either', () => {
    const note = carveToProseMirror('::: note\nBody text.\n:::\n').content[0];
    assert.strictEqual(note.type, 'carveDiv');
});

ok('the panels are the figure children, in source order', () => {
    const group = carveToProseMirror(GROUP).content[0];
    assert.deepStrictEqual(types(group), ['carveFigure', 'carveFigure', 'carveCaption']);
    const alts = group.content
        .filter((child) => child.type === 'carveFigure')
        .map((panel) => panel.content[0].content[0].attrs.alt);
    assert.deepStrictEqual(alts, ['one', 'two']);
});

ok('non-panel content is preserved in place between the panels', () => {
    const source = '::: figure\nSome prose.\n\n![one](a.png)\n^ One\n\n> quote\n:::\n^ Group caption\n';
    const group = carveToProseMirror(source).content[0];
    assert.deepStrictEqual(
        types(group),
        ['paragraph', 'carveFigure', 'blockquote', 'carveCaption'],
        'stray group content must keep its position, not be dropped or re-attached',
    );
});

ok('a table child is a panel and keeps its own caption', () => {
    const source = '::: figure\n| a | b |\n|---|---|\n| c | d |\n^ T\n:::\n^ Group caption\n';
    const group = carveToProseMirror(source).content[0];
    // A captioned table reaches the bridge as the generic captioned wrapper.
    assert.deepStrictEqual(types(group), ['carveFigure', 'carveCaption']);
    assert.deepStrictEqual(types(group.content[0]), ['table', 'carveCaption']);
});

ok('the group caption is the trailing child, and an uncaptioned group has none', () => {
    const captioned = carveToProseMirror(GROUP).content[0];
    const caption = captioned.content[captioned.content.length - 1];
    assert.strictEqual(caption.type, 'carveCaption');
    assert.strictEqual(caption.content[0].text, 'Group caption');

    const bare = carveToProseMirror('::: figure\n![one](a.png)\n^ One\n:::\n').content[0];
    assert.deepStrictEqual(
        types(bare), ['carveFigure'],
        'an uncaptioned group must not grow an empty caption node - it would write a bare `^ ` line',
    );
});

ok('the group carries no target, no title and no label', () => {
    // §4c and PART 12 §16: the group is discriminated by its TYPE. A consumer
    // that told the two apart by probing for the field a `figure` has and this
    // does not would break the day either shape grew a field, so the fields
    // must genuinely be absent rather than present-and-empty.
    const group = carveToProseMirror(GROUP).content[0];
    for (const field of ['target', 'title', 'label']) {
        assert.ok(!(field in (group.attrs || {})), `figure_group must not carry ${field}`);
    }
    // The other half: a `figure` panel DOES carry its target, so "absent" above
    // is a statement about the group and not about the bridge dropping targets.
    const panel = group.content[0];
    assert.strictEqual(panel.content[0].type, 'paragraph');
    assert.strictEqual(panel.content[0].content[0].type, 'image');
});

ok('group attributes ride the preceding attribute line', () => {
    const source = '{#g .columns-2 data-x="1"}\n::: figure\n![one](a.png)\n^ One\n:::\n^ Group caption\n';
    const { pm, written, idempotent } = roundTrip(source);
    assert.strictEqual(pm.content[0].attrs.id, 'g');
    assert.strictEqual(pm.content[0].attrs.class, 'columns-2');
    assert.ok(written.startsWith('{#g .columns-2 data-x="1"}\n::: figure\n'), written);
    assert.ok(idempotent, written);
});

ok('the caption is written BELOW the closing fence', () => {
    const { written } = roundTrip(GROUP);
    assert.strictEqual(
        written,
        '::: figure\n![one](a.png)\n^ One\n\n![two](b.png)\n^ Two\n:::\n^ Group caption',
    );
    // And the position is load-bearing, not incidental: a caption written
    // INSIDE the fence attaches to the last panel instead of the group.
    const inside = parse('::: figure\n![one](a.png)\n^ One\n^ Group caption\n:::\n');
    assert.notDeepStrictEqual(
        normalizeAst(inside),
        normalizeAst(parse(GROUP)),
    );
});

ok('every shape round-trips to the same AST', () => {
    const shapes = {
        'two captioned panels and a group caption': GROUP,
        'an uncaptioned group': '::: figure\n![one](a.png)\n^ One\n:::\n',
        'stray content between panels':
            '::: figure\nSome prose.\n\n![one](a.png)\n^ One\n\n> quote\n:::\n^ Group caption\n',
        'a table panel': '::: figure\n| a | b |\n|---|---|\n| c | d |\n^ T\n:::\n^ Group caption\n',
        // §4c: an uncaptioned quote is plain content, which is how a quotation
        // carries a figure number without a caption of its own.
        'a bare quote under a group caption': '::: figure\n> To be\n:::\n^ A pull quote\n',
        // The degenerate counts are lint findings over a valid parse, not
        // errors, so the bridge has to hold a zero-panel group.
        'an empty group': '::: figure\n:::\n^ Group caption\n',
        'an empty uncaptioned group': '::: figure\n:::\n',
        // Groups do not nest: the inner bare opener is a generic container.
        // The degradation has to survive the trip too, or an edit anywhere in
        // the document rewrites it.
        'a bare opener inside an open group':
            '::: figure\n:::: figure\n![x](x.png)\n^ X\n::::\n:::\n^ Outer\n',
        'a container inside the group': '::: figure\n:::: note\nBody.\n::::\n\n![x](x.png)\n^ X\n:::\n^ Cap\n',
        'a group followed by prose': '::: figure\n![a](a.png)\n^ A\n:::\n^ First\n\nAfter text.\n',
        'a group inside a container': '::: note\n:::: figure\n![x](x.png)\n^ X\n::::\n^ Inner group\n:::\n',
    };
    const broken = [];
    for (const [name, source] of Object.entries(shapes)) {
        let result;
        try {
            result = roundTrip(source);
        } catch (error) {
            broken.push(`${name}: threw ${error.message}`);
            continue;
        }
        if (!result.idempotent) broken.push(`${name}: reparsed differently\n      ${JSON.stringify(result.written)}`);
    }
    assert.deepStrictEqual(broken, [], `round-trip failures:\n    - ${broken.join('\n    - ')}`);
});

ok('the blank line between panels is what keeps them apart', () => {
    // The serializer separates a group's children with a blank line. Without
    // it the next panel's first line is a lazy continuation of the previous
    // panel's caption, so this is the assertion that would catch its removal
    // if the round-trip check above were ever loosened.
    const { written } = roundTrip(GROUP);
    assert.ok(written.includes('^ One\n\n![two]'), written);
    const mashed = written.replace('^ One\n\n![two]', '^ One\n![two]');
    assert.notDeepStrictEqual(
        normalizeAst(parse(mashed)),
        normalizeAst(parse(GROUP)),
        'the blank line makes no difference - this test is asserting nothing',
    );
});

ok('the published schema map names the node', () => {
    // tests/schema-map-test.js checks the map against the CarveKit schema and
    // against the pinned spec vocabulary. Neither can see a MISSING entry for a
    // type the pinned spec does not define yet, which is exactly this one, so
    // the map is checked here against the bridge that produces the node.
    const map = JSON.parse(readFileSync(new URL('../tiptap/schema-map.json', import.meta.url), 'utf8'));
    assert.strictEqual(map.types.figure_group?.kind, 'node');
    assert.strictEqual(map.types.figure_group?.pm, 'carveFigureGroup');
    assert.strictEqual(
        map.types.figure_group.pm,
        carveToProseMirror(GROUP).content[0].type,
        'the map names a ProseMirror node the loader does not build',
    );
    assert.ok(!('figure_group' in map.unmapped));
});

ok('CarveKit registers the node and a mounted editor keeps it', () => {
    const schema = getSchema([CarveKit]);
    assert.ok(schema.nodes.carveFigureGroup, 'CarveKit does not register carveFigureGroup');

    // Schema defaults and content-expression violations only surface once a
    // real editor mounts the document, which is why this is not left to the
    // detached JSON above.
    const win = new Window({ url: 'http://localhost/' });
    globalThis.window = win;
    globalThis.document = win.document;
    for (const key of ['DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator', 'getComputedStyle', 'MutationObserver']) {
        if (globalThis[key] === undefined && win[key] !== undefined) {
            try { globalThis[key] = win[key]; } catch { /* read-only global */ }
        }
    }
    const editor = new Editor({ extensions: [CarveKit], content: carveToProseMirror(GROUP) });
    try {
        const mounted = editor.getJSON();
        assert.strictEqual(mounted.content[0].type, 'carveFigureGroup');
        assert.deepStrictEqual(types(mounted.content[0]), ['carveFigure', 'carveFigure', 'carveCaption']);
        assert.deepStrictEqual(
            normalizeAst(parse(serializeToCarve(mounted))),
            normalizeAst(parse(GROUP)),
        );
    } finally {
        editor.destroy();
    }
});

console.log(`\n${passed} passed`);
