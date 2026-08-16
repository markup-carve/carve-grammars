/**
 * The bridge hands back what the AUTHOR TYPED.
 *
 * Three losses of the same family, all of them invisible to the gates that
 * existed (markup-carve/carve-grammars#240):
 *
 *  1. An attribute run came back RESPELLED. ProseMirror attributes are an
 *     unordered map and the canonical shape splits one authored run into `id`,
 *     `class` and a `carveKeyValues` bag, so `{key=c .a #b}` returned
 *     `{#b .a key="c"}`. The AST keeps an `order` field for exactly this reason,
 *     and the bridge dropped it - so a formatter's contract, that an editor can
 *     hand back what the author wrote, was unmeetable.
 *  2. `` `code`{.cls} `` DROPPED the run entirely. The stock Code mark has no
 *     attribute slots, so the run had nowhere to go, and NOTHING reported it:
 *     the caller was told the document round-tripped.
 *  3. `[](https://example.com)` VANISHED. A mark needs text to attach to, so a
 *     file holding only an empty-label link came back as an empty document -
 *     the most severe shape a bridge can produce, delivered in silence.
 *
 * Every assertion here is on the round-tripped SOURCE SPELLING, deliberately.
 * The gate that would have caught 2 and 3 compares rendered HTML with its
 * attributes sorted (tests/mounted-roundtrip-test.js), and no HTML comparison
 * can see 1 at all: `{key=c .a #b}` and `{#b .a key="c"}` render identically.
 * That is precisely how all three survived.
 *
 * Both paths are measured. The plain JSON path proves the converter and the
 * serializer agree; the MOUNTED path proves the schema declares the slots -
 * ProseMirror silently drops any attribute a node or mark does not declare, so a
 * wire attribute nothing declares is lost the moment a real editor holds it.
 */
import assert from 'node:assert';
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const key of ['DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator', 'getComputedStyle', 'MutationObserver']) {
    if (globalThis[key] === undefined && win[key] !== undefined) {
        try { globalThis[key] = win[key]; } catch { /* read-only global - ignore */ }
    }
}

const { Editor } = await import('@tiptap/core');
const { CarveKit, carveToProseMirror, carveToProseMirrorWithReport, serializeToCarve } = await import('../tiptap/index.js');

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

/** source -> loader -> serializer, with no editor in between. */
function written(source) {
    return serializeToCarve(carveToProseMirror(source, { unsupported: 'throw' })).trim();
}

/** source -> loader -> REAL EDITOR -> serializer. */
function mounted(source) {
    const editor = new Editor({
        extensions: [CarveKit],
        content: carveToProseMirror(source, { unsupported: 'throw' }),
    });
    try {
        // Without the source envelope: with it the serializer replays the
        // stored source and would pass for any document shape at all.
        return serializeToCarve({ ...editor.getJSON(), attrs: undefined }).trim();
    } finally {
        editor.destroy();
    }
}

/** Find the first node of `type` anywhere in a ProseMirror document. */
function find(node, type) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === type) return node;
    for (const child of node.content || []) {
        const hit = find(child, type);
        if (hit) return hit;
    }

    return null;
}

/** Find the first mark of `type` anywhere in a ProseMirror document. */
function findMark(node, type) {
    if (!node || typeof node !== 'object') return null;
    for (const mark of node.marks || []) {
        if (mark.type === type) return mark;
    }
    for (const child of node.content || []) {
        const hit = findMark(child, type);
        if (hit) return hit;
    }

    return null;
}

console.log('authored spelling:');

/* ---------------------------------------------------------------- part 1 */

/*
 * Each row is a run whose slots are written in a different order. The last two
 * matter most: a "fix" that merely rebuilds runs in some FIXED canonical
 * sequence passes the first rows and fails these, because the two spell the
 * same attributes in opposite orders and both have to survive.
 */
const RUNS = [
    // All three slot kinds, in the issue's own order.
    ['[x]{key=c .a #b}', '[x]{key="c" .a #b}'],
    // Key/values only.
    ['[x]{k=1 j=2}', '[x]{k="1" j="2"}'],
    // A single class only.
    ['[x]{.a}', '[x]{.a}'],
    // An id only.
    ['[x]{#b}', '[x]{#b}'],
    // Canonical order, which must stay canonical.
    ['[x]{#b .a key=c}', '[x]{#b .a key="c"}'],
    // The exact reverse of the row above.
    ['[x]{key=c .a #b}', '[x]{key="c" .a #b}'],
    // Id between two key/values: neither "id first" nor "id last" writes this.
    ['[x]{k=1 #b j=2}', '[x]{k="1" #b j="2"}'],
    // A class between two key/values, same argument.
    ['[x]{k=1 .a j=2}', '[x]{k="1" .a j="2"}'],
    // Several classes stay contiguous where the FIRST one was written.
    ['[x]{k=1 .a .b #i}', '[x]{k="1" .a .b #i}'],
];

for (const [source, expected] of RUNS) {
    ok(`an inline run keeps its authored order: ${source}`, () => {
        assert.strictEqual(written(source), expected);
        assert.strictEqual(mounted(source), expected, 'lost through a real editor mount');
    });
}

ok('a BLOCK attribute run keeps its authored order too', () => {
    assert.strictEqual(written('{key=c .a #b}\npara'), '{key="c" .a #b}\npara');
    assert.strictEqual(mounted('{key=c .a #b}\npara'), '{key="c" .a #b}\npara');
    assert.strictEqual(written('{key=c .a #b}\n# Heading'), '{key="c" .a #b}\n# Heading');
    assert.strictEqual(mounted('{key=c .a #b}\n# Heading'), '{key="c" .a #b}\n# Heading');
});

ok('an image and a link keep theirs', () => {
    assert.strictEqual(written('![alt](/i.png){k=1 .a #i}'), '![alt](/i.png){k="1" .a #i}');
    assert.strictEqual(mounted('![alt](/i.png){k=1 .a #i}'), '![alt](/i.png){k="1" .a #i}');
    assert.strictEqual(written('[t](/u){k=1 .a #i}'), '[t](/u){k="1" .a #i}');
    assert.strictEqual(mounted('[t](/u){k=1 .a #i}'), '[t](/u){k="1" .a #i}');
});

ok('the order is on the WIRE, as the AST spells it', () => {
    // Not an implementation detail: `tiptap/schema-map.json` and
    // `tiptap/wire-fixtures.json` publish this shape, and carve-php and carve-rs
    // build against it. `#id` and `.class` are literal slot names; every other
    // slot is the author's own key.
    const doc = carveToProseMirror('[x]{key=c .a #b}', { unsupported: 'throw' });
    const span = findMark(doc, 'carveSpan');
    assert.deepStrictEqual(span.attrs.carveAttrOrder, ['key', '.class', '#id']);

    const block = carveToProseMirror('{#b .a key=c}\npara', { unsupported: 'throw' });
    assert.deepStrictEqual(block.content[0].attrs.carveAttrOrder, ['#id', '.class', 'key']);
});

ok('a run with no order attribute still writes the canonical spelling', () => {
    // What an editor produces when it ADDS attributes: no `carveAttrOrder` at
    // all. The canonical order is the fallback, not a failure.
    const doc = {
        type: 'doc',
        content: [{
            type: 'paragraph',
            attrs: { id: 'b', class: 'a', carveKeyValues: { key: 'c' } },
            content: [{ type: 'text', text: 'para' }],
        }],
    };
    assert.strictEqual(serializeToCarve(doc).trim(), '{#b .a key="c"}\npara');
});

ok('a slot the order names but the document no longer has is skipped', () => {
    // The id was deleted in the editor; the stale order still names it.
    const doc = {
        type: 'doc',
        content: [{
            type: 'paragraph',
            attrs: { class: 'a', carveKeyValues: { key: 'c' }, carveAttrOrder: ['key', '.class', '#id'] },
            content: [{ type: 'text', text: 'para' }],
        }],
    };
    assert.strictEqual(serializeToCarve(doc).trim(), '{key="c" .a}\npara');
});

ok('an attribute the order does not name is written after the ones it does', () => {
    // The editor added `data-new`, which no authored order can mention.
    const doc = {
        type: 'doc',
        content: [{
            type: 'paragraph',
            attrs: {
                id: 'b',
                class: 'a',
                carveKeyValues: { key: 'c', 'data-new': '1' },
                carveAttrOrder: ['key', '.class', '#id'],
            },
            content: [{ type: 'text', text: 'para' }],
        }],
    };
    assert.strictEqual(serializeToCarve(doc).trim(), '{key="c" .a #b data-new="1"}\npara');
});

ok('a fence title does not also become an attribute line', () => {
    /*
     * The title reaches the loader TWICE - as the fence's own `header`, and as
     * a `title` key derived from it - and both were written, so `` ```php "T" ``
     * came back with a `{title="T"}` line above the same fence: an attribute
     * run the author never wrote. It survived because the reparsed key/values
     * match either way; only the run's ORDER, which the reparse invents and the
     * original does not have, tells the two documents apart. Found the moment
     * `order` stopped being stripped as volatile.
     */
    assert.strictEqual(written('```php "T"\nx\n```'), '```php "T"\nx\n```');
    assert.strictEqual(mounted('```php "T"\nx\n```'), '```php "T"\nx\n```');
    assert.strictEqual(written('```php "T" [L]\nx\n```'), '```php "T" [L]\nx\n```');
    // An authored run above the fence is still written, in its own order.
    assert.strictEqual(written('{.c #i}\n```php "T"\nx\n```'), '{.c #i}\n```php "T"\nx\n```');
    // And a `title` key that is NOT the fence's title stays.
    assert.strictEqual(
        written('{title="other"}\n```php\nx\n```'),
        '{title="other"}\n```php\nx\n```',
    );
});

/* ---------------------------------------------------------------- part 2 */

ok('inline code KEEPS its attribute run', () => {
    assert.strictEqual(written('`code`{.cls}'), '`code`{.cls}');
    assert.strictEqual(mounted('`code`{.cls}'), '`code`{.cls}');
});

ok('inline code keeps a full run, in its authored order', () => {
    assert.strictEqual(written('`code`{k=v .cls #i}'), '`code`{k="v" .cls #i}');
    assert.strictEqual(mounted('`code`{k=v .cls #i}'), '`code`{k="v" .cls #i}');
    assert.strictEqual(written('`code`{#i .cls k=v}'), '`code`{#i .cls k="v"}');
    assert.strictEqual(mounted('`code`{#i .cls k=v}'), '`code`{#i .cls k="v"}');
});

ok('the run rides on the code MARK, where the wire says it does', () => {
    const doc = carveToProseMirror('`code`{#i .cls k=v}', { unsupported: 'throw' });
    const code = findMark(doc, 'code');
    assert.strictEqual(code.attrs.id, 'i');
    assert.strictEqual(code.attrs.class, 'cls');
    assert.deepStrictEqual(code.attrs.carveKeyValues, { k: 'v' });
});

ok('an attributed code span inside another mark keeps both', () => {
    assert.strictEqual(written('*`code`{.cls}*'), '*`code`{.cls}*');
    assert.strictEqual(mounted('*`code`{.cls}*'), '*`code`{.cls}*');
});

ok('a code span with no run still writes none', () => {
    assert.strictEqual(written('`code`'), '`code`');
    assert.strictEqual(mounted('`code`'), '`code`');
});

/* ---------------------------------------------------------------- part 3 */

ok('an empty-label link SURVIVES, rather than emptying the document', () => {
    assert.strictEqual(written('[](https://example.com)'), '[](https://example.com)');
    assert.strictEqual(mounted('[](https://example.com)'), '[](https://example.com)');
});

ok('an empty-label link keeps its title and its attribute run', () => {
    const source = '[](https://example.com "T"){.a #i}';
    assert.strictEqual(written(source), source);
    assert.strictEqual(mounted(source), source);
});

ok('it is a carrier NODE, not a blob of preserved source', () => {
    // The difference that matters to an application: the destination and the
    // attributes are readable and editable fields, and no `carveSource` blob is
    // involved. A preserved blob would round-trip just as well and be inert.
    const doc = carveToProseMirror('[](https://example.com "T"){.a #i}', { unsupported: 'throw' });
    const atom = find(doc, 'carveEmptyMark');
    assert.ok(atom, 'no carveEmptyMark node: ' + JSON.stringify(doc));
    assert.strictEqual(atom.attrs.markType, 'link');
    assert.strictEqual(atom.attrs.markAttrs.href, 'https://example.com');
    assert.strictEqual(atom.attrs.markAttrs.title, 'T');
    assert.strictEqual(atom.attrs.markAttrs.id, 'i');
    assert.strictEqual(atom.attrs.markAttrs.class, 'a');
    assert.strictEqual(find(doc, 'carveUnsupportedInline'), null, 'preserved as source instead of carried');
});

ok('an empty-label link inside another mark keeps the mark', () => {
    assert.strictEqual(written('*[](https://example.com)*'), '*[](https://example.com)*');
    assert.strictEqual(mounted('*[](https://example.com)*'), '*[](https://example.com)*');
});

// The same defect wearing three other faces: every one of these parses to a
// mark-producing node with no children, so all four vanished identically.
const EMPTY_MARKS = [
    ['an empty span', 'a []{.x} b', 'a []{.x} b'],
    // Values come back QUOTED, which is the canonical spelling everywhere in
    // this serializer: the AST records the value and not whether the author
    // quoted it, so `k=1` and `k="1"` are one document and one of them has to
    // be written. That is a real limit of the AST, not of the wire - unlike the
    // ORDER, which the AST does record and the bridge used to drop.
    ['an empty span with a full run', 'a []{k=1 .x #i} b', 'a []{k="1" .x #i} b'],
    ['an empty editorial insertion', 'a {++} b', 'a {++} b'],
    ['an empty editorial deletion', 'a {--} b', 'a {--} b'],
];
for (const [name, source, expected] of EMPTY_MARKS) {
    ok(`${name} survives too`, () => {
        assert.strictEqual(written(source), expected);
        assert.strictEqual(mounted(source), expected);
    });
}

ok('a lone empty-label link does not produce an EMPTY document', () => {
    // The headline symptom, stated as its own check: a document that comes back
    // empty is the most severe shape a bridge can produce.
    const doc = carveToProseMirror('[](https://example.com)', { unsupported: 'throw' });
    assert.ok(doc.content?.length, 'the document came back empty');
    assert.ok(doc.content[0].content?.length, 'the paragraph came back empty');
    assert.notStrictEqual(serializeToCarve(doc).trim(), '');
});

/* ------------------------------------------------- the gate, not the fix */

ok('none of the three needs the whole-document source envelope any more', () => {
    // `preserve` falls back to carrying the entire source when the rich
    // projection would not write the document back. All three used to need it -
    // which is what made them survivable: the fallback is correct and silent
    // about WHAT it saved. Carried properly, the report is empty.
    for (const source of ['[](https://example.com)\n', '`code`{.cls}\n', '[x]{key=c .a #b}\n']) {
        const { preserved, degraded } = carveToProseMirrorWithReport(source, { unsupported: 'preserve' });
        assert.deepStrictEqual(preserved, {}, `${source} still needs preservation`);
        assert.deepStrictEqual(degraded, {}, `${source} is still degraded`);
    }
});

ok('every mark the loader can put on a carrier has a spelling to write back', () => {
    /*
     * The carrier is only a carry if the serializer knows the construct. A
     * `markType` with no case writes NOTHING, which is the same silent drop
     * this issue is about, one level further in - so the set the loader can
     * produce and the set the serializer can spell have to be the same set.
     *
     * Driven from real source rather than from a hand-kept list: each of these
     * is a mark-producing construct with empty content, and the assertion is
     * that the atom the loader built writes back something, not that it writes
     * back a particular string (the round trips above pin that).
     */
    const EVERY_EMPTY = [
        '[](https://example.com)',
        '[]{.x}',
        '[]{abbr="expansion"}',
        '{++}',
        '{--}',
    ];
    for (const source of EVERY_EMPTY) {
        const doc = carveToProseMirror(source, { unsupported: 'throw' });
        const atom = find(doc, 'carveEmptyMark');
        assert.ok(atom, `${source} produced no carrier: ${JSON.stringify(doc)}`);
        assert.notStrictEqual(
            serializeToCarve(doc).trim(), '',
            `the serializer has no spelling for markType "${atom.attrs.markType}", so ${source} writes back as nothing`,
        );
    }
});

console.log(`\n${passed} passed`);
