/** Real-editor corpus ratchet: schema defaults only appear after mounting. */
import assert from 'node:assert';
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

function normalizeHtml(html) {
    return (html || '')
        .replace(/<([a-z0-9]+)((?:\s[^<>]*?)?)\s*(\/?)>/gi, (_match, tag, attrs, slash) => {
            const parts = (attrs.match(/[\w-]+(?:="[^"]*")?/g) || []).sort();
            return `<${tag.toLowerCase()}${parts.length ? ` ${parts.join(' ')}` : ''}${slash}>`;
        })
        .replace(/\s+/g, ' ')
        .trim();
}

const changed = [];
for (const file of listCorpusFiles()) {
    const editor = new Editor({
        extensions: [CarveKit],
        content: carveToProseMirror(file.source, { unsupported: 'preserve' }),
    });
    try {
        // Strip the lossless source envelope deliberately: this measures the
        // editable projection, which is the path wp-carve's warning gate tests.
        const written = serializeToCarve({ ...editor.getJSON(), attrs: undefined });
        if (normalizeHtml(carveToHtml(file.source)) !== normalizeHtml(carveToHtml(written))) {
            changed.push(file.name);
        }
    } finally {
        editor.destroy();
    }
}

const fixed = [
    '03-links-2',
    '03-links-10',
    '08-image-with-caption-2',
    '13-attributes-3',
    '23-inline-footnotes',
    '26-comments-5',
    '39-inline-span-2',
    '42-admonitions-4',
    '100-table-row-attributes',
    // The engine parses `{lang=de}` on a paragraph and the projection now
    // carries it, so this document became render-equivalent when the
    // `@markup-carve/carve` pin moved. Protected because it is the construct
    // that pin bump exists for.
    '296-a-language-attribute-and-lang-are-one-key-4',
    // A caption on a quote is a figure caption again (markup-carve/carve#1213),
    // so the loader builds a real `carveFigure`/`carveCaption` pair for these
    // four and they are render-equivalent through a mount. Protected because the
    // failure mode is silent content loss on the first edit rather than a
    // visible fallback: the caption would survive only inside the
    // whole-document `carveSource` envelope, which that edit invalidates.
    '05-lists-20',
    '07-blockquote-with-attribution',
    '55-blockquote-caption-after-a-blank-line',
    '282-two-blank-lines-detach-a-caption-5',
    // The three silent losses of markup-carve/carve-grammars#240. Protected
    // because each failed in SILENCE rather than through a visible fallback:
    // `03-links-8` is `[](https://example.com)` alone in a file, which came back
    // as an EMPTY DOCUMENT; `13-attributes-2` is `` `code`{.cls} ``, whose run
    // had no slot on the code mark; `307-...-3` is `x ^[]{.c}`, an empty span
    // the projection wrote back as a bare `x ^`.
    '03-links-8',
    '13-attributes-2',
    '307-an-empty-inline-note-is-literal-3',
];
for (const name of fixed) assert.ok(!changed.includes(name), `${name} regressed after editor mount`);
// 177 -> 173 when the `@markup-carve/carve` pin moved onto the withdrawal of
// PART 9 section 4a (markup-carve/carve#1213). Every mover was read:
//
// - Four came back: 05-lists-20, 07-blockquote-with-attribution,
//   55-blockquote-caption-after-a-blank-line and
//   282-two-blank-lines-detach-a-caption-5. carve-js#1033 had made a caption on
//   a quote the quote's own `attribution` field, which the loader read nowhere,
//   so the line survived only in the `carveSource` envelope and the first edit
//   dropped it. The engine emits a `figure` whose target is the quote again, so
//   the loader builds the `carveFigure`/`carveCaption` pair it always did and
//   the four are render-equivalent. They are in the protected list above.
// - Two are the language attribute reaching a place the projection cannot
//   carry it yet: a block-level `{:de}` on a blockquote
//   (294-a-language-attribute-is-exact-sugar-for-lang-3) and the boolean
//   attribute a padded sigil leaves behind (297-the-language-sigil-takes-no-
//   padding). Both were equivalent before only because the old engine read the
//   whole construct as literal text, so neither side knew the attribute
//   existed. Agreement by mutual ignorance is not round-trip fidelity.
// - Two moved the other way and are now equivalent:
//   288-heading-index-plain-text-covers-visible-leaves-and-rejects-an-empty-key
//   and 296-a-language-attribute-and-lang-are-one-key-4, the latter protected
//   above.
// 173 -> 191 when `spec/` moved from 988fdc8 to 49b8deb. The corpus grew by 316
// documents, so the count had to move; what matters is that NOTHING already in
// the corpus moved with it. Keyed by source text rather than by filename, all
// 918 documents present under both pins returned the same verdict - zero flips
// in either direction. The net +18 is 19 new movers minus one source the corpus
// dropped (the old `45-inline-extensions-9`, retired when upstream rewrote that
// category around semantic spans). Every one of the 19 was read:
//
// - Eight are one defect: a link or image whose TEXT holds another anchor. The
//   projection flattens the nesting and moves the inner anchor out behind the
//   outer one - `a [t^[n]](/u) b` comes back as `a [t](/u)[^1] b`, and
//   `a [x ![t[z]][r] y](/u) b` splits the link in two around the image. The
//   reference forms re-emit their definitions a second time on top of that.
//   `310`, `311` (x3), `312-3`, `313-4`, `314` (x3) and `316-3` / `316-8`.
// - Five are the semantic element name, which is authored as a value-less
//   attribute and dropped: `[Ctrl+C]{kbd}` comes back as `[Ctrl+C]{}`, so the
//   rendered element degrades from `kbd` to a plain span. Only the BOOLEAN name
//   is lost - `[x]{#k .key kbd}` keeps its id and class, and `{dfn="a term"}`
//   survives intact. `45-inline-extensions-2` / `-8` / `-10`, `71-attribute-
//   edge-cases-11` and `299-3`.
// - `307-an-empty-inline-note-is-literal-3`: `x ^[]{.c}` is literal text, and
//   the projection writes back a bare `x ^`, losing the run entirely.
// - `318-composite-figures-6`: a caption detached by TWO blank lines is
//   re-emitted after one, which re-attaches it to the group - the exact
//   distinction that document exists to pin.
//
// The other 81 new documents are render-equivalent through a mount, including
// the remaining ten of `318-composite-figures`: the loader builds real
// `carveFigureGroup` nodes holding `carveFigure` panels and a trailing
// `carveCaption`, and they survive the editor.
// 191 -> 184 when the eleven map-declared nodes the converter never built got
// producers (`carveFrontmatter`, `carveLinkRefDef`, `carveSymbol`,
// `carveLiteral`, `carveSubstitution`, `carveRawInline`,
// `carveInlineExtension`, `carveCitation`, `carveCrossref`, `carveInlineNote`,
// `carveSection`). Six documents moved OUT and none moved in:
//
// - `194-2`, `195`, `202`, `266-11`, `266-14`, `266-15`: a link reference
//   definition is a node now, written where the author put it and carrying its
//   own trailing attribute run, instead of being re-derived from the reference
//   that resolved it and appended at the end of the document.
// - one more moved out once an inline ATOM started carrying its marks: an
//   emphasis around a symbol, a math span, a mention or an inline note was
//   dropped entirely on the way back, because only the text path writes a
//   mark's delimiters.
//
// The rest of the list is unchanged, which is the point: every construct that
// gained a rich node kept its mounted projection render-equivalent.
// 184 -> 180 when a list started carrying whether the AUTHOR wrote it loose.
// The serializer could only derive looseness from an item holding more than one
// block, so `- a` / blank / `- b` came back tight - the paragraph inside each
// item lost, which the bridges page names as the first thing HTML cannot hold.
// 180 -> 177 when a `carveDiv` started saying HOW its class was written. One
// ProseMirror node serves both `div` and `admonition`, and nothing in the
// document said which was authored, so `{.sidebar}` above a bare `:::` came
// back as `::: sidebar` - a different document. The same pass writes a
// container's attribute run, which nothing wrote at all: a `{#s}` above a
// container was dropped in silence.
// 177 -> 174 when a mark with no content, and an attribute run on inline code,
// stopped vanishing (markup-carve/carve-grammars#240). Three moved out and none
// moved in:
//
// - `03-links-8` is the whole of `[](https://example.com)`. A ProseMirror mark
//   needs text to attach to, so the link had nowhere to land and the document
//   came back EMPTY. It is a `carveEmptyMark` atom now, written back with its
//   destination, title and attribute run.
// - `13-attributes-2` is `` `code`{.cls} ``. The stock Code mark declares no
//   attributes, so the run was dropped on the way in and the serializer had
//   nothing left to write. The mark carries the slots now.
// - `307-an-empty-inline-note-is-literal-3` is `x ^[]{.c}`, an EMPTY SPAN, the
//   same defect as the link: it came back as a bare `x ^`.
//
// Note what this gate could not see, which is why all three survived it for so
// long: it compares RENDERED HTML with its attributes sorted. That comparison is
// blind to the order an attribute run was written in - the third defect in the
// same issue - so `{key=c .a #b}` returning `{#b .a key="c"}` never showed up
// here and never could. The round-trip gates compare the reparsed AST, which
// used to strip `order` as volatile for the same reason. It does not any more.
// 174 -> 198 with the spec bump to carve b6917ab. Attributed before it was
// raised, the same way the envelope ratchet was: the fourteen categories the
// bump added (321 through 334) account for all 24, and the pre-existing
// categories still account for exactly 174. No document that used to render
// equivalently stopped doing so.
assert.strictEqual(changed.length, 198, `mounted rich projection changed for ${changed.length} corpus documents`);
console.log(`mounted Tiptap corpus: ${listCorpusFiles().length - changed.length}/${listCorpusFiles().length} render-equivalent; ${changed.length} protected fallbacks`);
