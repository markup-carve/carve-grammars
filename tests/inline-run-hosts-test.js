/**
 * Every place the engine renders an inline run scopes one: heading titles,
 * captions, link and span text, extension content, definition terms and
 * container titles and labels. Plus the raw inline format, math sigils on
 * widened or unclosed runs, the forced strike's delimiter name and a strong run
 * cut short by an inline comment. Each row was measured against carve-js and
 * the spec corpus named beside it.
 */
import assert from 'node:assert/strict';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';
import { textmateEngines } from './lib/surface-engines.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';

const [[, textmate]] = (await textmateEngines(textmateLineTokenizer)).filter(([id]) => id === 'textmate');
const SURFACES = { textmate, prism: prismTokens, highlightjs: hljsTokens };

function scopeAt(tokens, source, needle, last = false) {
    const at = last ? source.lastIndexOf(needle) : source.indexOf(needle);
    assert.ok(at >= 0, `${needle} not in ${source}`);
    let offset = 0;
    for (const token of tokens) {
        offset += token.text.length;
        if (offset > at) return token.scope || '';
    }
    assert.fail(`no token for ${needle}`);
}

// [source, needle, { surface: pattern the scope must match, or `!pattern` it must not }]
const ROWS = [
    // G1: `{=format}` after a code span.
    ['a `<b>`{=html} z', 'html', { textmate: /constant\.other\.raw\.format/, prism: /raw-inline/, highlightjs: /meta/ }],
    // G2: a title or caption is a full inline run.
    ['# H *b* z', 'b*', { textmate: /markup\.bold/, prism: /bold/, highlightjs: /strong/ }],
    ['# H [x](u) z', 'u)', { textmate: /markup\.underline\.link/, prism: /url/, highlightjs: /link/ }],
    ['# H [^1] z\n\n[^1]: n', '1]', { textmate: /footnote/, prism: /footnote/, highlightjs: /symbol/ }],
    ['# H @m z', 'm z', { textmate: /mention/, prism: /mention/, highlightjs: /symbol/ }],
    ['# A </#a>', 'a>', { textmate: /cross-reference/, prism: /cross-ref/, highlightjs: /link/ }],
    ['![a](b.png)\n^ cap *b* z', 'b* z', { textmate: /markup\.bold/, prism: /bold/, highlightjs: /strong/ }],
    // An opener whose closer is on the next line is text: `# H *a` renders `<h1>H *a</h1>`.
    ['# H *a\nb* c', 'b* c', { textmate: '!bold', prism: '!bold', highlightjs: '!strong' }],
    // Prism's document-level `{%` rule still reaches across the heading line, as it did before.
    ['# a {% x\nb %} c', 'b %}', { textmate: '!comment', highlightjs: '!comment' }],
    // A heading takes no attribute block, and `#id` is still a tag (corpus 213).
    ['# H {#id .c}', 'id .c', { textmate: /tag/, prism: /tag/, highlightjs: /symbol/ }],
    ['# H {#id .c}', '.c}', { textmate: '!attributes', prism: '!attr', highlightjs: '!attr' }],
    // F1: the sigil owns a widened run (corpus 168) and an unclosed one (corpus 331).
    ['Then $```a `` b``` ends.', '$', { textmate: /punctuation\.definition\.math/, prism: /math/, highlightjs: /string/ }],
    ['Then $```a `` b``` ends.', 'a ``', { textmate: /markup\.math/, prism: /math/, highlightjs: /string/ }],
    ['$$```x `` y```', 'y', { textmate: /markup\.math/, prism: /math/, highlightjs: /string/ }],
    ['::: |\na $`x\nc d\n:::', 'c d', { textmate: /markup\.math/, prism: /math/, highlightjs: /string/ }],
    ['::: |\na `x\nc d\n:::', 'c d', { textmate: /markup\.raw\.inline/ }],
    // F2: an unclosed sigil run in a forced span ends at the span's closer (corpus 12-inline-code-10).
    ['x{*$`a*} here', 'a*}', { textmate: /markup\.math/ }],
    ['x{*$`a*} here', '*}', { textmate: /punctuation\.definition\.bold/ }],
    ['x{~$$`b~} here', 'b~}', { textmate: /markup\.math/ }],
    ['x{/!`c/} here', 'c/}', { textmate: /markup\.raw\.inline\.content/ }],
    // F3: link and span text (corpus 310, 311, 193); an image's alt stays text, as carve-js renders it.
    ['[a *b* `c`](u)', 'b*', { textmate: /markup\.bold/, prism: /bold/ }],
    ['[a *b* `c`](u)', 'c`', { textmate: /markup\.raw\.inline/, prism: /code/ }],
    ['[t[^1]](/u)\n\n[^1]: n', '1]', { textmate: /footnote/, prism: /footnote/ }],
    ['[*bold*][]\n\n[*bold*]: /x', 'bold*', { textmate: /markup\.bold/, prism: /bold/ }],
    ['[x *y*]{.c}', 'y*', { textmate: /markup\.bold/, prism: /bold/ }],
    ['![alt *e*](i.png)', 'e*', { textmate: '!bold', prism: '!bold' }],
    // F4: container title and label (corpus 42-admonitions-6, 529).
    ['::: note "Install *now* via `npm`"\nx\n:::', 'now', { textmate: /markup\.bold/, prism: /bold/ }],
    ['::: note "Install *now* via `npm`"\nx\n:::', 'npm', { textmate: /markup\.raw\.inline/, prism: /code/ }],
    [':::[*b*]\nx\n:::', 'b*', { textmate: /markup\.bold/, prism: /bold/ }],
    // F5: extension content (corpus 299).
    [':code[*b*] x', 'b*', { textmate: /markup\.bold/, prism: /bold/ }],
    // F6: a definition term.
    [':: *t* `c`\n: d', 'c`', { textmate: /markup\.raw\.inline/, prism: /code/ }],
    // C1: the forced strike's delimiters carry the bare strike's name.
    ['{~x~}', '{~', { textmate: /punctuation\.definition\.strike\.carve/ }],
    // C2: `*a %% c*` renders `<p>*a</p>`; a closer before the comment still closes.
    ['*a %% c*', 'a %%', { textmate: '!bold' }],
    ['*a %% c*', '%% c', { textmate: /comment/ }],
    ['*a* %% c', 'a*', { textmate: /markup\.bold/ }],
];

let count = 0;
for (const [source, needle, expect] of ROWS) {
    for (const [surface, want] of Object.entries(expect)) {
        const scope = scopeAt(SURFACES[surface](source), source, needle, source.startsWith('::: |'));
        if (typeof want === 'string') {
            assert.doesNotMatch(scope, new RegExp(want.slice(1)), `${surface}: ${JSON.stringify(source)} at ${needle}`);
        } else {
            assert.match(scope, want, `${surface}: ${JSON.stringify(source)} at ${needle}`);
        }
        count++;
    }
}

// The line-block closer is no part of the unclosed run before it.
for (const source of ['::: |\na $`x\nc d\n:::', '::: |\na `x\nc d\n:::']) {
    assert.doesNotMatch(scopeAt(textmate(source), source, ':::', true), /math|raw/, `textmate: closer of ${JSON.stringify(source)}`);
    count++;
}

assertThisFileRuns(import.meta.url);
console.log(`${count} inline run host assertions passed`);
