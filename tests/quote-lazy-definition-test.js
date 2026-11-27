/**
 * A definition line under open paragraph text is a lazy line of that paragraph
 * (C2-B-024, C2-B-081), also below a quote, a quoted list item, and across
 * comment-only lines (C2-B-137) and term-shaped text lines; carve-grammars#990
 * rows 1 to 4. Under a block that takes no lazy line it stands. Each row was
 * checked against carve-js.
 */
import assert from 'node:assert/strict';

import Prism from 'prismjs';
import hljs from 'highlight.js';
import carve from '../highlightjs/carve.mjs';
import { textmateLineTokenizer, covered } from './lib/textmate-lines.js';

globalThis.Prism = Prism;
await import('../prism/carve.js');
hljs.registerLanguage('carve', carve);
const textmate = await textmateLineTokenizer('textmate/carve.tmLanguage.json');

const has = (node, types) => typeof node !== 'string'
    && (Array.isArray(node) ? node.some((child) => has(child, types)) : types.includes(node.type) || has(node.content, types));
const definition = {
    prism: (source) => has(Prism.tokenize(source, Prism.languages.carve), ['reference-definition', 'abbreviation-definition']),
    hljs: (source) => /hljs-symbol/.test(hljs.highlight(source, { language: 'carve', ignoreIllegals: true }).value),
    textmate: (source) => covered(textmate, source, 'meta.link.reference.def.carve') + covered(textmate, source, 'meta.abbreviation.carve') !== '',
};
const all = Object.keys(definition);
// [lines above the definition, stands, highlighters checked]
const rows = [
    ['> a', false, all],
    ['> *a*', false, all],
    ['> > a', false, all],
    ['> a\n> b', false, all],
    ['> - a', false, all],
    ['> 1. a', false, all],
    ['> - [ ] a', false, all],
    ['> > - a', false, all],
    ['> - - b', false, all],
    ['> a\n> :: t', false, all],
    ['> a\n:: t', false, all],
    ['> a\n%% c', false, all],
    ['> a\n> %% c', false, all],
    ['> - a\n%% c', false, all],
    ['> - a\n> %% c', false, all],
    ['> - a\n:: t', false, all],
    ['> - a\n> b', false, all],
    ['> [x]: /y', false, all],
    ['p\n%% c', false, all],
    ['p\n%% c\n%% d', false, all],
    ['> = H', true, all],
    ['> :: t', true, all],
    ['> %% c', true, ['textmate']],
    ['> - = H', true, all],
    ['> - :: t', true, all],
    ['> - [ ] = H', true, all],
    ['> - %% c', true, all],
    ['p\n\n%% c', true, all],
];
for (const [above, stands, names] of rows) {
    for (const line of ['[a]: /u', '*[A]: x', '[a]: /u "t"']) {
        const source = `${above}\n${line}\n`;
        for (const name of names) assert.equal(definition[name](source), stands, `${name}: definition in ${JSON.stringify(source)}`);
    }
}
// The comment between a paragraph and its lazy line keeps its comment scope.
assert.equal(covered(textmate, 'p\n%% c\n[a]: /u\n', 'comment.line.percent.carve'), '%% c');
console.log(`quote lazy definitions: ${rows.length} rows agree with carve-js`);
