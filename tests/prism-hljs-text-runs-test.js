/**
 * Prism and highlight.js: three shapes the 0.2 text reads as plain text
 * (carve-grammars#936; the TextMate side is tests/textmate-text-runs-test.js).
 *
 * - An unpartnered backtick run, with or without a `!`, `$` or `$$` sigil, is
 *   text, so a `%%` after it starts a comment (C2-I-017).
 * - A frontmatter format word is ASCII letters and digits only (C2-B-164).
 * - An attribute block that attaches to nothing is one literal atom: no tag
 *   inside it (C2-I-035, C2-I-036).
 */
import assert from 'node:assert/strict';

import Prism from 'prismjs';
import hljs from 'highlight.js';
import carve from '../highlightjs/carve.mjs';

globalThis.Prism = Prism;
await import('../prism/carve.js');
hljs.registerLanguage('carve', carve);

const VERBATIM = { prism: ['code', 'math', 'literal', 'raw-inline'], hljs: ['code', 'string'] };
const COMMENT = { prism: ['comment'], hljs: ['comment'] };
const TAG = { prism: ['tag'], hljs: ['symbol'] };

// The text a grammar wraps in one of `kinds`, nested tokens included.
function prismCovered(source, kinds) {
    let out = '';
    const visit = (node, inKind) => {
        if (typeof node === 'string') {
            if (inKind) out += node;
        } else if (Array.isArray(node)) node.forEach((child) => visit(child, inKind));
        else visit(node.content, inKind || kinds.includes(node.type));
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

// Unpartnered runs are text.
const hosts = ['', 'a ', '# a ', '- a ', '1. a ', '::: note\na '];
const open = ['`x %% b', '!`x %% b', '$`x %% b', '$$`x %% b', '``x ` y %% b', '` x `` y %% b', '\\\\`x %% b', '$````x %% b', '$`` x ` %% b'];
for (const [name, covered] of grammars) {
    for (const host of hosts) {
        for (const body of open) {
            const source = host + body + '\n\nplain `tail`\n';
            assert.equal(covered(source, VERBATIM[name]), '`tail`', `${name}: no verbatim before the break: ${JSON.stringify(source)}`);
            assert.equal(covered(source, COMMENT[name]).trim(), '%% b', `${name}: comment after the run: ${JSON.stringify(source)}`);
            count++;
        }
        for (const [body, code] of [
            ['`x %% b` c', '`x %% b`'],
            ['``x %% b`` c', '``x %% b``'],
            ['` a `` b ` c', '` a `` b `'],
            ['!`x %% b` c', '!`x %% b`'],
            ['$`x %% b` c', '$`x %% b`'],
            ['$$`x %% b` c', '$$`x %% b`'],
            ['$` a `` b ` c', '$` a `` b `'],
        ]) {
            const source = host + body + '\n';
            assert.equal(covered(source, VERBATIM[name]), code, `${name}: closed span stays verbatim: ${JSON.stringify(source)}`);
            assert.equal(covered(source, COMMENT[name]), '', `${name}: no comment inside a closed span: ${JSON.stringify(source)}`);
            count++;
        }
        const later = host + '`` a `b` %% c\n';
        assert.equal(covered(later, VERBATIM[name]), '`b`', `${name}: a later run opens: ${JSON.stringify(later)}`);
        assert.equal(covered(later, COMMENT[name]).trim(), '%% c', `${name}: comment after the later span: ${JSON.stringify(later)}`);
        count++;
    }
    // Both grammars see the whole paragraph, so a closer on a later line of it pairs.
    for (const [source, code] of [['a `x\nb` c %% d\n', '`x\nb`'], ['a $`x\nb` c %% d\n', '$`x\nb`'], ['a !`x\nb` c %% d\n', '!`x\nb`']]) {
        assert.equal(covered(source, VERBATIM[name]), code, `${name}: span across a soft break: ${JSON.stringify(source)}`);
        assert.equal(covered(source, COMMENT[name]).trim(), '%% d', `${name}: comment after it: ${JSON.stringify(source)}`);
        count++;
    }
    for (const source of ['a `x\n\nb` c %% d\n', 'a $`x\n\nb` c %% d\n', '# a `x\nb` c %% d\n']) {
        assert.equal(covered(source, VERBATIM[name]), '', `${name}: no span past the block: ${JSON.stringify(source)}`);
        assert.equal(covered(source, COMMENT[name]).trim(), '%% d', `${name}: comment on the next block: ${JSON.stringify(source)}`);
        count++;
    }
}

// The format word is one word of ASCII letters and digits.
const frontMatter = {
    prism: (source) => Prism.tokenize(source, Prism.languages.carve).some((token) => token.type === 'front-matter'),
    hljs: (source) => hljs.highlight(source, { language: 'carve' }).value.includes('class="hljs-meta"'),
};
for (const [name, opens] of Object.entries(frontMatter)) {
    for (const opener of ['--- foo_bar', '---foo_bar', '--- x-y', '---x-y', '---é', '--- a b', '---  toml', '--- toml x', '---toml!']) {
        assert.equal(opens(`${opener}\na: 1\n---\n\n# H\n`), false, `${name}: ${opener} opens no front matter`);
        count++;
    }
    for (const opener of ['---toml', '--- toml', '---JSON', '---1', '---Yaml2', '---', '--- yaml']) {
        assert.equal(opens(`${opener}\na: 1\n---\n# H\n`), true, `${name}: ${opener} opens front matter`);
        count++;
    }
}

// An unattached attribute block holds no tag.
for (const [name, covered] of grammars) {
    for (const source of [
        'x {#id} y', 'Hi *bold* @mark {#id}', '{#id} x', 'x {.c #id} y', 'x {#id .c k=v}', 'x {#id}',
        '# Hi {#id}', '# Hi {#id} there', '- x {#id}', '1. x {#id}', '::: note\nx {#id}\n:::',
        'a *b* {#id}', 'a {#a} {#b}', '{=m {#id} m=}', '*a {#id} b*', 'x {k="#v" #id} y',
    ]) {
        // hljs scopes a mention as `symbol` too, so the check is for the `#`.
        assert.ok(!covered(source, TAG[name]).includes('#'), `${name}: no tag in an unattached block: ${JSON.stringify(source)}`);
        count++;
    }
    // An unquoted value holds no pipe or backslash (C2-I-032), and an escaped brace opens no block.
    for (const [source, tag] of [['x {k=a|#id} y', '#id'], ['x {k=a\\b #id} y', '#id'], ['see #id', '#id'], ['# A see #id', '#id'], ['a {#id} and #tag', '#tag'], ['a \\{#id} b', '#id'], ['x {_a_ #id}', '#id']]) {
        assert.ok(covered(source, TAG[name]).endsWith(tag), `${name}: tag outside a block: ${JSON.stringify(source)}`);
        count++;
    }
}
for (const source of ['[a]{#id}', '`c`{#id}', '*b*{#id}', '{#id}\npara']) {
    assert.ok(prismCovered(source, ['attributes']).includes('#id'), `prism: glued block keeps its scope: ${JSON.stringify(source)}`);
    assert.ok(hljsCovered(source, ['attr']).includes('#id'), `hljs: glued block keeps its scope: ${JSON.stringify(source)}`);
    count++;
}

// No quadratic walk: 32 KB lines of unpartnered runs, widening runs and unattached blocks.
for (const line of ['a `x '.repeat(6600), 'a $`x '.repeat(5500), Array.from({ length: 2000 }, (_, i) => '`'.repeat(i % 120 + 1) + 'x ').join('').slice(0, 32768), 'x {#id} '.repeat(4100), '# ' + 'a `x %% '.repeat(4000)]) {
    for (const [name, run] of [['prism', () => Prism.tokenize(line, Prism.languages.carve)], ['hljs', () => hljs.highlight(line, { language: 'carve' })]]) {
        const started = process.hrtime.bigint();
        run();
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        assert.ok(ms < 5000, `${name}: ${line.length}-byte line took ${ms.toFixed(0)} ms`);
        count++;
    }
}

console.log(`prism and highlight.js text runs: ${count} assertion groups passed`);
