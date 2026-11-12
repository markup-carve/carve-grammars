// carve-grammars#871, #872, #873, #874: a fence inside a container runs to its
// closer or to the end of its container, takes no lazy line, and opens behind
// a quote marker at any indent. One family per container type, in Prism,
// highlight.js and TextMate, every expectation checked against carve-js.
import assert from 'node:assert/strict';
import { carveToHtml } from '@markup-carve/carve';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

let passed = 0;
const ok = (name, fn) => { fn(); passed++; };
const textmate = await textmateLineTokenizer(new URL('../textmate/carve.tmLanguage.json', import.meta.url).pathname);

const VERBATIM = /code|comment|markup\.raw\.(?!inline)/;
const ENGINES = [
    ['prism', (src) => prismTokens(src).map((t) => [t.text, t.scope ?? ''])],
    ['highlightjs', (src) => hljsTokens(src).map((t) => [t.text, t.ancestors.join(' ')])],
    ['textmate', (src) => textmate(src).map((t) => [t.text, t.scope])],
];

function verbatimWords(tokens) {
    const words = new Map();
    for (const [text, scope] of tokens) {
        for (const w of text.match(/w\d+/g) ?? []) words.set(w, VERBATIM.test(scope));
    }
    return words;
}

function engineVerbatim(src, w) {
    const html = carveToHtml(src);
    const word = new RegExp(`\\b${w}\\b`);
    return !word.test(html) || [...html.matchAll(/<pre[\s\S]*?<\/pre>/g)].some((m) => word.test(m[0]));
}

// [container, lines before the fence, content prefix, prefix once the container ended]
const CONTAINERS = [
    ['list item', '- x\n\n', '  ', ''],
    ['ordered item', '1. x\n\n', '   ', ''],
    ['nested item', '- x\n\n  - y\n\n', '    ', '  '],
    ['quote', '', '> ', ''],
    ['nested quote', '', '> > ', '> '],
    ['quote in an item', '- x\n\n', '  > ', '  '],
    ['item in a quote', '> - x\n>\n', '>   ', '> '],
    ['note', '::: note\n- x\n\n', '  ', ''],
    ['quote in a note', '::: note\n', '> ', ''],
];
// TextMate has no item column inside a quote; the quote's markers are all it reads.
const TEXTMATE_SKIPS = new Set(['item in a quote']);

const shapes = (p, up, o, f) => [
    ['unclosed, to the end of the text', `${o}\n${p}w0\n${p}w1\n`],
    ['closed', `${o}\n${p}w0\n${p}${f}\n${p}w1\n`],
    ['ended by the container', `${o}\n${p}w0\n${up}w1\n`],
    ['no lazy line', `${o}\n${p}w0\nw1\n`],
    ['past a blank line', `${o}\n${p}w0\n\n${p}w1\n`],
    ['ended past a blank line', `${o}\n${p}w0\n\n${up}w1\n`],
];

for (const [name, before, p, up] of CONTAINERS) {
    let cases = 0;
    for (const f of ['```', '~~~', '%%%']) {
        for (const indent of ['', '  ']) {
            for (const [label, body] of shapes(p, up, p + indent + f, f)) {
                const src = before + body + (before.startsWith(':::') ? ':::\nw9\n' : '');
                const expected = new Map([...new Set(src.match(/w\d+/g))].map((w) => [w, engineVerbatim(src, w)]));
                for (const [engine, tokens] of ENGINES) {
                    if (engine === 'textmate' && TEXTMATE_SKIPS.has(name)) continue;
                    const got = verbatimWords(tokens(src));
                    for (const [w, verbatim] of expected) {
                        assert.equal(got.get(w), verbatim,
                            `${engine}, ${name}, ${f} ${label}: ${w} must ${verbatim ? '' : 'not '}be verbatim in ${JSON.stringify(src)}`);
                    }
                }
                cases++;
            }
        }
    }
    passed++;
    console.log(`  ✓ ${name}: ${cases} shapes agree with carve-js`);
}

// The ticket reproductions, as their Expected sections give them.
const TICKETS = [
    ['#871', '- x\n\n  ```\n  w2\n', ['w2'], []],
    ['#871 quoted', '- x\n\n  > ```\n  > w0\n', ['w0'], []],
    ['#872', '>   ```\n> w0\n> ```\n> w1\n', ['w0'], ['w1']],
    ['#873', '> %%%\n> w0\nw1\n', ['w0'], ['w1']],
    ['#874', '> ```\n> w0\n> ```\n> w1\n', ['w0'], ['w1']],
];
for (const [ticket, src, inside, outside] of TICKETS) {
    ok(ticket, () => {
        for (const [engine, tokens] of ENGINES) {
            const got = verbatimWords(tokens(src));
            for (const w of inside) assert.equal(got.get(w), true, `${engine} ${ticket}: ${w} is verbatim`);
            for (const w of outside) assert.equal(got.get(w), false, `${engine} ${ticket}: ${w} is text`);
        }
        for (const w of inside) assert.equal(engineVerbatim(src, w), true, `carve-js ${ticket}: ${w}`);
        for (const w of outside) assert.equal(engineVerbatim(src, w), false, `carve-js ${ticket}: ${w}`);
    });
    console.log(`  ✓ ${ticket}: ${JSON.stringify(src)}`);
}

console.log(`\n${passed} passed`);
