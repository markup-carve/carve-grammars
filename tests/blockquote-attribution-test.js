/**
 * A quote's `^ …` attribution has to stay EDITABLE, and survive an edit.
 *
 * markup-carve/carve-js#1033 made a caption on a quote the quote's own
 * `attribution` field on `block_quote`, rather than a `figure`/`figcaption`
 * pair wrapped around it. Before that, `^ Steve Jobs` reached the editor as a
 * real `carveFigure`/`carveCaption` pair; after it, the loader read the field
 * nowhere and the line survived only inside the whole-document `carveSource`
 * envelope.
 *
 * That envelope is keyed to a fingerprint of the untouched document, so the
 * FIRST EDIT invalidates it and the serializer falls back to the editable
 * projection - which did not carry the attribution. Editing a quote silently
 * dropped its attribution. A load-only assertion cannot see that: the envelope
 * still holds the whole source at load time, so a check that only inspects the
 * loaded string passes while the user-visible bug is intact. Every row below
 * therefore mounts a real editor, makes an UNRELATED edit, and reads what the
 * pane would write back.
 *
 * The projection is `carveCaption`, the caption node this schema already has,
 * appended inside the quote - which is where the engine renders it, as a
 * `<footer>` within the `<blockquote>`. No node type is added or renamed and no
 * node's shape changes; `tiptap/schema-map.json` is a published contract.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { CORPUS_DIR } from './lib/corpus.js';

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const key of ['DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator', 'getComputedStyle', 'MutationObserver']) {
    if (globalThis[key] === undefined && win[key] !== undefined) {
        try { globalThis[key] = win[key]; } catch { /* read-only global - ignore */ }
    }
}

const { Editor } = await import('@tiptap/core');
const { CarveKit, carveToProseMirror, serializeToCarve } = await import('../tiptap/index.js');

const load = (source) => carveToProseMirror(source, { unsupported: 'preserve' });
const corpus = (name) => readFileSync(`${CORPUS_DIR}/${name}.crv`, 'utf8');

/**
 * The attribution text carried by an EDITABLE node: a `carveCaption` sitting
 * inside a `blockquote`. Deliberately narrow. Reading any `carveCaption`
 * anywhere would also count an ordinary figure caption, and reading the
 * document's `carveSource` attr would count the very envelope whose loss is
 * the bug.
 */
function editableAttributions(doc) {
    const found = [];
    const walk = (node) => {
        if (node.type === 'blockquote') {
            for (const child of node.content || []) {
                if (child.type === 'carveCaption') found.push(plainText(child));
            }
        }
        for (const child of node.content || []) walk(child);
    };
    walk(doc);
    return found;
}

function plainText(node) {
    if (node.type === 'text') return node.text || '';
    return (node.content || []).map(plainText).join('');
}

/**
 * Mount, edit something that is NOT the attribution, and serialize the whole
 * document - envelope included. The edit is the point: it invalidates the
 * `carveSource` fingerprint, so what comes back is the editable projection.
 */
function mountEditSerialize(source) {
    const editor = new Editor({ extensions: [CarveKit], content: load(source) });
    try {
        // Position 1 is inside the document's first block in every row here,
        // and never inside the trailing caption.
        editor.commands.insertContentAt(1, 'EDITED');
        return serializeToCarve(editor.getJSON());
    } finally {
        editor.destroy();
    }
}

/** Serialize the untouched editable projection, envelope stripped. */
function projection(source) {
    return serializeToCarve({ ...load(source), attrs: undefined });
}

// `written` is the exact editable projection. Two notes on it, both properties
// of the serializer at large rather than of this change:
//  - it never writes the document's final newline, so the corpus source is
//    matched against `written + '\n'`;
//  - a blank line between a quote and its attribution is source LAYOUT, not
//    document content: both spellings parse to the identical AST, and the
//    attached form is written back. 55 and 282 are the two rows where that
//    shows, and they are spelled out rather than normalized away.
const CASES = [
    {
        name: '05-lists-20',
        source: corpus('05-lists-20'),
        attributions: ['Steve Jobs'],
        written: 'Intro\n\n> Stay hungry\n^ Steve Jobs',
        byteIdentical: true,
    },
    {
        name: '07-blockquote-with-attribution',
        source: corpus('07-blockquote-with-attribution'),
        attributions: ['Steve Jobs'],
        written: '> Stay hungry, stay foolish.\n^ Steve Jobs',
        byteIdentical: true,
    },
    {
        name: '55-blockquote-caption-after-a-blank-line',
        source: corpus('55-blockquote-caption-after-a-blank-line'),
        attributions: ['Source: Someone'],
        written: '> quote text\n^ Source: Someone',
        // The source spells the attribution one blank line down. Same AST,
        // different layout; the projection writes the attached form.
        byteIdentical: false,
    },
    {
        name: '282-two-blank-lines-detach-a-caption-5',
        source: corpus('282-two-blank-lines-detach-a-caption-5'),
        attributions: ['Source: the cited work'],
        written: '> the cited line\n^ Source: the cited work',
        byteIdentical: false,
    },
    // An attribution carrying inline markup, so no row can pass by a reading
    // that only ever moves a bare string.
    {
        name: 'emphasized attribution',
        source: '> Quoted\n^ /Ada Lovelace/, 1843\n',
        attributions: ['Ada Lovelace, 1843'],
        written: '> Quoted\n^ /Ada Lovelace/, 1843',
        byteIdentical: true,
    },
];

const fails = [];
let pass = 0;

for (const { name, source, attributions, written, byteIdentical } of CASES) {
    const got = editableAttributions(load(source));
    if (JSON.stringify(got) === JSON.stringify(attributions)) {
        pass++;
    } else {
        fails.push(`loader: ${name} carries ${JSON.stringify(got)} in an editable node, expected ${JSON.stringify(attributions)}`);
    }

    const projected = projection(source);
    if (projected === written) {
        pass++;
    } else {
        fails.push(`projection: ${name} wrote ${JSON.stringify(projected)}, expected ${JSON.stringify(written)}`);
    }

    if (byteIdentical) {
        if (`${projected}\n` === source) {
            pass++;
        } else {
            fails.push(`byte identity: ${name} wrote ${JSON.stringify(`${projected}\n`)}, source is ${JSON.stringify(source)}`);
        }
    } else {
        // Not byte-identical by construction; assert the ONLY difference is the
        // blank line, so a real content loss cannot hide behind this branch.
        if (`${projected}\n` === source.replace(/\n\n\^/, '\n^')) {
            pass++;
        } else {
            fails.push(`layout normalization: ${name} wrote ${JSON.stringify(`${projected}\n`)}, which differs from ${JSON.stringify(source)} by more than the blank line`);
        }
    }

    // The regression itself: an edit elsewhere must not cost the attribution.
    const edited = mountEditSerialize(source);
    const expectedLine = `^ ${written.slice(written.lastIndexOf('^ ') + 2)}`;
    if (edited.includes('EDITED') && edited.includes(expectedLine)) {
        pass++;
    } else {
        fails.push(`after an unrelated edit: ${name} wrote ${JSON.stringify(edited)}, expected it to contain ${JSON.stringify(expectedLine)}`);
    }
}

// A quote whose ONLY child is the attribution is reachable in the editor by
// deleting the quoted paragraph, and it is the one shape where writing the
// caption the obvious way destroys it. `> ^ x` reparses as literal text inside
// the quote (the attribution is gone on the next load) and a bare `^ x` is a
// top-level paragraph (the quote is gone). Both preserve the bytes and lose the
// document, which is why this is asserted on the reparse rather than the string.
{
    const captionOnly = {
        type: 'doc',
        content: [{
            type: 'blockquote',
            content: [{ type: 'carveCaption', content: [{ type: 'text', text: 'Only an attribution' }] }],
        }],
    };
    const written = serializeToCarve(captionOnly);
    assert.strictEqual(written, '>\n^ Only an attribution',
        'a quote holding only its attribution is not written as an empty quote plus a `^ …` line');
    assert.deepStrictEqual(
        editableAttributions(load(`${written}\n`)),
        ['Only an attribution'],
        'a quote holding only its attribution does not survive its own round trip',
    );
    assert.strictEqual(serializeToCarve({ ...load(`${written}\n`), attrs: undefined }), written,
        'a quote holding only its attribution is not a fixed point');
}

// The probe has to answer both ways. One that always reports an attribution
// would pass every row above without reading anything.
assert.deepStrictEqual(editableAttributions(load('> Just a quote\n')), [],
    'editableAttributions reports an attribution for a quote that has none');
assert.deepStrictEqual(editableAttributions(load('A plain sentence.\n')), [],
    'editableAttributions reports an attribution in a document with no quote');
// A figure caption is a caption too, and it is NOT an attribution. If the probe
// counted it, the rows above would pass for the wrong reason.
assert.deepStrictEqual(editableAttributions(load('![Alt](x.png)\n^ A figure caption\n')), [],
    'editableAttributions counts an ordinary figure caption as a quote attribution');

if (fails.length) {
    console.error(`blockquote attribution: ${fails.length} failing`);
    for (const f of fails) console.error(`  ${f}`);
    process.exit(1);
}

console.log(`blockquote attribution: ${pass} checks pass across ${CASES.length} documents`);
