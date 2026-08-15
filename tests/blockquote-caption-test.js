/**
 * A quote's `^ …` caption has to stay EDITABLE, and survive an edit.
 *
 * markup-carve/carve#1213 withdrew the attribution model: a caption on a quote
 * is a caption like any other, so the engine emits a `figure` whose target is
 * the quote and the loader projects that onto `carveFigure` + `carveCaption`,
 * the pair this schema already has.
 *
 * The property this file pins is older than either model and survives both. The
 * whole-document `carveSource` envelope is keyed to a fingerprint of the
 * untouched document, so the FIRST EDIT invalidates it and the serializer falls
 * back to the editable projection. If the caption reaches the editor only inside
 * that envelope, editing anything at all silently drops it. A load-only
 * assertion cannot see that - the envelope still holds the whole source at load
 * time - so every row below mounts a real editor, makes an UNRELATED edit, and
 * reads what the pane would write back.
 *
 * This replaces `blockquote-attribution-test.js`, which pinned the same property
 * against the withdrawn `attribution` field. Its four extra cases were about a
 * `carveCaption` sitting INSIDE a `blockquote`, a shape this projection does not
 * produce, so they went with the field.
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
 * The caption text of a figure WHOSE TARGET IS A QUOTE, carried by editable
 * nodes. Deliberately narrow: counting any `carveCaption` anywhere would also
 * count an ordinary image caption, and reading the document's `carveSource`
 * attr would count the very envelope whose loss is the bug.
 */
function editableQuoteCaptions(doc) {
    const found = [];
    const walk = (node) => {
        if (node.type === 'carveFigure') {
            const children = node.content || [];
            const quoted = children.some((child) => child.type === 'blockquote');
            if (quoted) {
                for (const child of children) {
                    if (child.type === 'carveCaption') found.push(plainText(child));
                }
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
 * Mount, edit something that is NOT the caption, and serialize the whole
 * document - envelope included. The edit is the point: it invalidates the
 * `carveSource` fingerprint, so what comes back is the editable projection.
 */
function mountEditSerialize(source) {
    const editor = new Editor({ extensions: [CarveKit], content: load(source) });
    try {
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
//  - a blank line between a quote and its caption is source LAYOUT, not document
//    content: both spellings parse to the identical AST, and the attached form
//    is written back. 55 and 282 are the two rows where that shows.
const CASES = [
    {
        name: '05-lists-20',
        source: corpus('05-lists-20'),
        captions: ['Steve Jobs'],
        written: 'Intro\n\n> Stay hungry\n^ Steve Jobs',
        byteIdentical: true,
    },
    {
        name: '07-blockquote-with-attribution',
        source: corpus('07-blockquote-with-attribution'),
        captions: ['Steve Jobs'],
        written: '> Stay hungry, stay foolish.\n^ Steve Jobs',
        byteIdentical: true,
    },
    {
        name: '55-blockquote-caption-after-a-blank-line',
        source: corpus('55-blockquote-caption-after-a-blank-line'),
        captions: ['Source: Someone'],
        written: '> quote text\n^ Source: Someone',
        byteIdentical: false,
    },
    {
        name: '282-two-blank-lines-detach-a-caption-5',
        source: corpus('282-two-blank-lines-detach-a-caption-5'),
        captions: ['Source: the cited work'],
        written: '> the cited line\n^ Source: the cited work',
        byteIdentical: false,
    },
    // A caption carrying inline markup, so no row can pass by a reading that
    // only ever moves a bare string.
    {
        name: 'emphasized caption',
        source: '> Quoted\n^ /Ada Lovelace/, 1843\n',
        captions: ['Ada Lovelace, 1843'],
        written: '> Quoted\n^ /Ada Lovelace/, 1843',
        byteIdentical: true,
    },
];

const fails = [];
let pass = 0;

for (const { name, source, captions, written, byteIdentical } of CASES) {
    const got = editableQuoteCaptions(load(source));
    if (JSON.stringify(got) === JSON.stringify(captions)) {
        pass++;
    } else {
        fails.push(`loader: ${name} carries ${JSON.stringify(got)} in an editable node, expected ${JSON.stringify(captions)}`);
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

    // The regression itself: an edit elsewhere must not cost the caption.
    const edited = mountEditSerialize(source);
    const expectedLine = `^ ${written.slice(written.lastIndexOf('^ ') + 2)}`;
    if (edited.includes('EDITED') && edited.includes(expectedLine)) {
        pass++;
    } else {
        fails.push(`after an unrelated edit: ${name} wrote ${JSON.stringify(edited)}, expected it to contain ${JSON.stringify(expectedLine)}`);
    }
}

// The probe has to answer both ways. One that always reports a caption would
// pass every row above without reading anything.
assert.deepStrictEqual(editableQuoteCaptions(load('> Just a quote\n')), [],
    'editableQuoteCaptions reports a caption for a quote that has none');
assert.deepStrictEqual(editableQuoteCaptions(load('A plain sentence.\n')), [],
    'editableQuoteCaptions reports a caption in a document with no quote');
// An image caption is a caption too, and its figure targets no quote. If the
// probe counted it, the rows above would pass for the wrong reason.
assert.deepStrictEqual(editableQuoteCaptions(load('![Alt](x.png)\n^ A figure caption\n')), [],
    'editableQuoteCaptions counts an ordinary image caption as a quote caption');

if (fails.length) {
    console.error(`blockquote caption: ${fails.length} failing`);
    for (const f of fails) console.error(`  ${f}`);
    process.exit(1);
}

console.log(`blockquote caption: ${pass} checks pass across ${CASES.length} documents`);
