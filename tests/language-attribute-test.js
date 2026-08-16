/**
 * The `{:TAG}` language attribute, through the path a WYSIWYG actually runs.
 *
 * The grammars in this repo learned `{:TAG}` in markup-carve/carve-grammars#213, so a
 * highlighter colors it. But an editor does not read the highlighting grammar
 * to decide what a document contains - it calls `carveToProseMirror`, which
 * calls `parse` from the pinned `@markup-carve/carve`. Those are two different
 * readings of the same construct, and only one of them was tested here.
 *
 * That gap is how markup-carve/carve-wysiwyg#12 survived its own fix: the editor pinned
 * a carve-grammars build whose grammar knew `{:TAG}`, while this package's
 * nested `@markup-carve/carve` pin predated the engine production. npm installs
 * that nested, so no pin in the editor could move it. Typing `[bonjour]{:fr}`
 * produced one plain text node, and the source pane never grew a span.
 *
 * The highlight fixtures could not catch it. They ask the Prism, highlight.js
 * and TextMate grammars what a line looks like; none of them touches the parse
 * path, so all three stayed green while the construct did not exist for the
 * editor. The checks below therefore assert on the document the loader
 * produces, not on tokens and not on the round-tripped string.
 *
 * The round-tripped string specifically proves nothing on its own. An
 * unrecognized `[bonjour]{:fr}` is a single text node that the serializer
 * writes back verbatim, so `source -> loader -> serializer` is a fixed point in
 * BOTH readings. Only the presence of a `carveSpan` mark carrying `lang`
 * separates them, which is what every positive row asserts.
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
const { CarveKit, carveToProseMirror, serializeToCarve } = await import('../tiptap/index.js');

/**
 * Collect the language every `carveSpan` mark in a loader document carries.
 * The loader routes an attribute with a value through `carveKeyValues`; the mark's
 * dedicated `lang` attribute is what the HTML parse path fills in, so read
 * both rather than pinning today's routing.
 */
function spanLanguages(doc) {
    const found = [];
    const walk = (node) => {
        for (const mark of node.marks || []) {
            if (mark.type !== 'carveSpan') continue;
            const attrs = mark.attrs || {};
            const lang = attrs.carveKeyValues?.lang ?? attrs.lang;
            if (lang !== undefined && lang !== null) found.push(lang);
        }
        for (const child of node.content || []) walk(child);
    };
    walk(doc);
    return found;
}

const load = (source) => carveToProseMirror(source, { unsupported: 'preserve' });

/** Mount the document in a real editor, the way the editor's source pane does. */
function mount(source) {
    const editor = new Editor({ extensions: [CarveKit], content: load(source) });
    try {
        return {
            html: editor.getHTML(),
            // Drop the lossless source envelope: this is the editable
            // projection, which is what the pane writes back.
            written: serializeToCarve({ ...editor.getJSON(), attrs: undefined }).trim(),
        };
    } finally {
        editor.destroy();
    }
}

// Each row is a spelling the engine has to reach the loader with. `langs` is
// the whole point: an engine that does not know the production yields [].
const CASES = [
    { source: 'A [bonjour]{:fr} end.', langs: ['fr'], written: 'A [bonjour]{:fr} end.' },
    { source: '[Hallo]{:de-DE}', langs: ['de-DE'], written: '[Hallo]{:de-DE}' },
    // The empty shorthand is a language attribute too, and `''` is falsy - a
    // presence check written with `||` reports this row as unattributed.
    { source: '[x]{:}', langs: [''], written: '[x]{:}' },
    // A language alongside another attribute, so the row cannot pass by a
    // reading that only accepts `{:TAG}` as the entire attribute block.
    // ... and it comes back in the order it was WRITTEN. This row used to expect
    // `[y]{.note :fr}`: the run was split across unordered slots and rebuilt in a
    // canonical order, so the same document came back with a different spelling
    // (markup-carve/carve-grammars#240).
    { source: '[y]{:fr .note}', langs: ['fr'], written: '[y]{:fr .note}' },
    // The long spelling of the same attribute. It reaches the loader as the
    // same span, and the serializer writes the canonical short form back.
    { source: '[z]{lang="fr"}', langs: ['fr'], written: '[z]{:fr}' },
];

const fails = [];
let pass = 0;

for (const { source, langs, written } of CASES) {
    const got = spanLanguages(load(source));
    if (JSON.stringify(got) === JSON.stringify(langs)) {
        pass++;
    } else {
        fails.push(
            `loader: ${JSON.stringify(source)} carries ${JSON.stringify(got)}, ` +
            `expected ${JSON.stringify(langs)}`,
        );
    }

    const mounted = mount(source);
    if (mounted.written === written) {
        pass++;
    } else {
        fails.push(
            `mounted: ${JSON.stringify(source)} wrote ${JSON.stringify(mounted.written)}, ` +
            `expected ${JSON.stringify(written)}`,
        );
    }

    // A real editor has to show an element. Literal `{:` in the rendered HTML
    // is the reported symptom: the attribute stayed text in the pane.
    if (/<span[^>]*carve-span/.test(mounted.html) && !mounted.html.includes('{:')) {
        pass++;
    } else {
        fails.push(`mounted: ${JSON.stringify(source)} rendered no span: ${mounted.html}`);
    }
}

// The probe has to answer both ways. A `spanLanguages` that always reports a
// language would pass every row above without reading anything, which is the
// shape of control this repo has shipped green before.
assert.deepStrictEqual(spanLanguages(load('A plain sentence.')), [],
    'spanLanguages reports a language in a document that has none');
assert.deepStrictEqual(spanLanguages(load('[styled]{.note}')), [],
    'spanLanguages reports a language for a span that only carries a class');

if (fails.length) {
    console.error(`language attribute: ${fails.length} failing`);
    for (const f of fails) console.error(`  ${f}`);
    process.exit(1);
}

console.log(`language attribute: ${pass} checks pass across ${CASES.length} spellings`);
