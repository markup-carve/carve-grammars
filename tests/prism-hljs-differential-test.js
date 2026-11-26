/**
 * Prism and highlight.js: the gap classes a differential against the 0.2
 * clause cases found (the TextMate grammar has its own tests).
 *
 * - A quoted line and a table row hold the inline set a heading does
 *   (C2-B-147, C2-B-169).
 * - A line comment takes every closer on its line; an image's alt text is no
 *   inline content (C2-I-024, C2-I-077).
 * - An autolink takes any scheme (C2-I-073).
 * - A comment block closes at a bare run at least as long as its opener, and
 *   an unclosed one runs to the end of its container (C2-B-109 to C2-B-111).
 * - A quote, a term, an attribute line or an include directive under
 *   paragraph text is a lazy line (C2-B-024).
 * - A line comment in a line block is text (C2-B-135).
 */
import assert from 'node:assert/strict';

import Prism from 'prismjs';
import hljs from 'highlight.js';
import carve from '../highlightjs/carve.mjs';

globalThis.Prism = Prism;
await import('../prism/carve.js');
hljs.registerLanguage('carve', carve);

const KINDS = {
    link: { prism: ['url', 'image', 'reference-image'], hljs: ['link'] },
    verbatim: { prism: ['code', 'math', 'literal', 'raw-inline'], hljs: ['code', 'string'] },
    strong: { prism: ['bold'], hljs: ['strong'] },
    comment: { prism: ['comment'], hljs: ['comment'] },
    quote: { prism: ['blockquote'], hljs: ['quote'] },
    attribute: { prism: ['attributes'], hljs: ['attr'] },
    term: { prism: ['definition-term', 'punctuation'], hljs: ['title', 'punctuation'] },
    include: { prism: ['include-directive'], hljs: ['meta'] },
};

// The text a grammar wraps in one of `kinds`, nested tokens included.
function prismCovered(source, kinds) {
    let out = '';
    const visit = (node, inKind) => {
        if (typeof node === 'string') {
            if (inKind) out += node;
        } else if (Array.isArray(node)) node.forEach((child) => visit(child, inKind));
        else visit(node.content, inKind || kinds.includes(node.type) || [].concat(node.alias ?? []).some((alias) => kinds.includes(alias) && alias === 'comment'));
    };
    visit(Prism.tokenize(source, Prism.languages.carve), false);
    return out;
}
const unescape = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
function hljsCovered(source, kinds) {
    const html = hljs.highlight(source, { language: 'carve' }).value;
    const stack = [];
    let out = '';
    for (const [, open, text] of html.matchAll(/<span class="([^"]*)">|<\/span>|([^<]+)/g)) {
        if (open !== undefined) stack.push(open);
        else if (text === undefined) stack.pop();
        else if (stack.some((c) => kinds.some((kind) => c.split(' ').includes(`hljs-${kind}`)))) out += unescape(text);
    }
    return out;
}
const grammars = [['prism', prismCovered], ['hljs', hljsCovered]];
let count = 0;
// Each row: source, kind, the text that kind covers ('' for none).
const check = (rows) => {
    for (const [name, covered] of grammars) {
        for (const [source, kind, expected] of rows) {
            // Whitespace between tokens is scoped differently by each grammar.
            const squash = (text) => text.replace(/\s+/g, '');
            assert.equal(squash(covered(source, KINDS[kind][name])), squash(expected), `${name}: ${kind} in ${JSON.stringify(source)}`);
            count++;
        }
    }
};

// Quotes and table rows hold the inline set.
check([
    ['> a [l](u) b', 'link', '[l](u)'],
    ['> a $`x` b', 'verbatim', '$`x`'],
    ['> a ![i](p.png)', 'link', '![i](p.png)'],
    ['> a `c` %% x', 'comment', '%% x'],
    ['| [l](u) | b |', 'link', '[l](u)'],
    ['| a | $`x` |', 'verbatim', '$`x`'],
]);

// A line comment takes the closer; alt text is no inline content.
check([
    ['*a %% b*', 'strong', ''],
    ['*a %% b*', 'comment', '%% b*'],
    ['*a* %% b*', 'strong', '*a*'],
    ['[a %% b](u)', 'link', ''],
    ['![a %% b](p.png)', 'link', '![a %% b](p.png)'],
    ['[x][a %% b]', 'comment', '%% b]'],
]);

// Any autolink scheme.
check([
    ['see <ftp://host/f> now', 'link', '<ftp://host/f>'],
    ['see <urn:isbn:0451450523> now', 'link', '<urn:isbn:0451450523>'],
]);

// Comment block closers and unclosed blocks.
check([
    ['%%%\nx\n%%% end\ny', 'comment', '%%%\nx\n%%% end\ny'],
    ['%%%%\nx\n%%%%%\ny', 'comment', '%%%%\nx\n%%%%%'],
    ['%%%%\nx\n%%%\ny', 'comment', '%%%%\nx\n%%%\ny'],
    ['%%%\nx\n\ny', 'comment', '%%%\nx\n\ny'],
    ['x\n%%%\ny', 'comment', '%%%\ny'],
    ['::: note\n%%%\nx\n:::\ny', 'comment', '%%%\nx'],
    [':: t\n: %%%\n%%%\nx', 'comment', '%%%%%%'],
    ['a %%% b\nc', 'comment', '%%% b'],
]);

// Lazy lines under paragraph text.
check([
    ['a\n> b', 'quote', ''],
    ['a\n%% c\n> b', 'quote', ''],
    ['- a\n> b', 'quote', ''],
    ['a\n\n> b', 'quote', '> b'],
    ['# h\n> b', 'quote', '> b'],
    ['> a\n> b', 'quote', '> a> b'],
    ['a\n{.c}\nb', 'attribute', ''],
    ['a\n\n{.c}\nb', 'attribute', '{.c}'],
    ['a\n:: t\n: d', 'term', ''],
    [':: t\n: d', 'term', ':: t:'],
    [':: t\n: d\n:: u\n: e', 'term', ':: t::: u:'],
    ['a\n{{ x.crv }}', 'include', ''],
    ['a\n\n{{ x.crv }}', 'include', '{{ x.crv }}'],
]);

// Line comments in a line block are text; a comment block is not.
check([
    ['::: |\na %% b\n%% c\n:::', 'comment', ''],
    ['::: |\na\n%%%\nh\n%%%\n:::', 'comment', '%%%\nh\n%%%'],
]);

console.log(`Prism and highlight.js differential classes: ${count} assertions passed`);
