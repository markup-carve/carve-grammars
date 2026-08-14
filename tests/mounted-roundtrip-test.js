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
    // A quote's `^ …` attribution, projected onto `carveCaption`. Protected
    // because the failure mode is silent content loss on the first edit, not a
    // visible fallback.
    '05-lists-20',
    '07-blockquote-with-attribution',
    '55-blockquote-caption-after-a-blank-line',
    '282-two-blank-lines-detach-a-caption-5',
];
for (const name of fixed) assert.ok(!changed.includes(name), `${name} regressed after editor mount`);
// 177 -> 173: the four documents the projection now carries, which the
// `@markup-carve/carve` pin bump had dropped. markup-carve/carve-js#1033 made a caption on a
// quote the quote's `attribution` field instead of a `<figure>`/`<figcaption>`
// pair wrapped around it, and the loader read that field nowhere, so the line
// survived only in the whole-document `carveSource` envelope - which the first
// edit invalidates. The loader now projects `attribution` onto `carveCaption`,
// appended inside the quote where the engine renders it, and the serializer
// writes that trailing caption back unprefixed. Recovered:
//   05-lists-20, 07-blockquote-with-attribution,
//   55-blockquote-caption-after-a-blank-line and
//   282-two-blank-lines-detach-a-caption-5.
// The set difference against the previous projection is exactly those four;
// nothing else moved in either direction. See tests/blockquote-attribution-test.js.
//
// The remaining known movers from that pin bump are unchanged and still stand:
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
assert.strictEqual(changed.length, 173, `mounted rich projection changed for ${changed.length} corpus documents`);
console.log(`mounted Tiptap corpus: ${listCorpusFiles().length - changed.length}/${listCorpusFiles().length} render-equivalent; ${changed.length} protected fallbacks`);
