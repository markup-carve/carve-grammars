/**
 * highlight.js: a highlight() call depends only on its input, not on what the
 * same instance highlighted before (carve-grammars#992). Each input is
 * highlighted once on its own fresh instance, then in shuffled orders on one
 * shared instance; every call must give the fresh instance's output.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import hljs from 'highlight.js';
import carve from '../highlightjs/carve.mjs';

const options = { language: 'carve', ignoreIllegals: true };
const fresh = (source) => {
    const instance = hljs.newInstance();
    instance.registerLanguage('carve', carve);
    return instance.highlight(source, options).value;
};

const conformance = new URL('../spec/spec/0.2/conformance/', import.meta.url);
const examples = JSON.parse(readFileSync(new URL('examples.json', conformance), 'utf8')).examples
    .filter((example) => typeof example.input === 'string')
    .map((example) => example.input);
const specCases = JSON.parse(readFileSync(new URL('./carve-spec-cases.json', import.meta.url), 'utf8'))
    .map((entry) => entry.input);
const inputs = [
    // The #992 reproduction: a refused label begin, then a document whose
    // `{#m}` is refused by two attribute rules in a row.
    '![a][b %% c]\n^ cap',
    'a\r{#m}\r---yaml\rk: v\r---\r',
    'a\n{#m}\n---yaml\nk: v\n---\n',
    '[a][b %% c] and [x]{.c}\n',
    ...specCases,
    // Every third example keeps the run short; each needs its own fresh instance.
    ...examples.filter((_, index) => index % 3 === 0),
];

const expected = inputs.map(fresh);

let seed = 992;
const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
};
const shared = hljs.newInstance();
shared.registerLanguage('carve', carve);
let calls = 0;
for (let round = 0; round < 3; round++) {
    const order = inputs.map((_, index) => index);
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    for (const index of order) {
        calls++;
        assert.equal(shared.highlight(inputs[index], options).value, expected[index],
            `${JSON.stringify(inputs[index])} after other inputs on one instance (round ${round + 1})`);
    }
}
// The reproduction's own order, repeated.
for (let i = 0; i < 3; i++) {
    shared.highlight(inputs[0], options);
    assert.equal(shared.highlight(inputs[1], options).value, expected[1]);
    assert.equal(shared.highlight(inputs[1], options).value, expected[1]);
    calls += 3;
}
assert.doesNotMatch(expected[1], /hljs-symbol/);
console.log(`highlight.js call order: ${calls} calls on one instance match a fresh instance`);
