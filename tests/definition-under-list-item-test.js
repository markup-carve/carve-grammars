/**
 * A definition line right under a list item whose open block is no paragraph
 * text stands, as carve-js main reads it (carve-grammars#990 rows 5-8, C2-B-081):
 * a term, a heading or a comment-only line on the marker line. Under paragraph
 * text or a description it stays a lazy line (C2-B-024).
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
// [lines above `[a]: /u`, stands, highlighters checked]
const rows = [
    ['- :: t', true, all],
    ['1. :: t', true, all],
    ['- [ ] :: t', true, all],
    ['- a\n- :: t', true, all],
    ['- a\n  - :: t', true, all],
    ['1. a\n2. :: t', true, all],
    ['- - :: t', true, all],
    ['- :: t\n  :: s', true, all],
    ['a. :: t', true, all],
    ['- a\n  i) :: t', true, all],
    ['- a\n  2. :: t', false, ['prism', 'hljs']],
    ['- :: t\n  %% c', true, all],
    ['- # h', true, all],
    ['1. ## h', true, all],
    ['- # h\n%% c', true, all],
    ['- %% c', true, all],
    ['- %% c\n%% d', true, all],
    ['- a', false, all],
    ['p\n- # h', false, all],
    ['p\n- %% c', false, all],
    ['p\n- :: t', false, all],
    ['p\n- a\n  - :: t', false, ['prism', 'hljs']],
    ['p\n- a\n- :: t', false, all],
    ['- z\n- a\n  - :: t', true, all],
    ['- a\n> - :: t', false, ['prism', 'hljs']],
    ['- a\n> - # h', false, ['prism', 'hljs']],
    ['> - a\n> - :: t', true, ['prism', 'hljs']],
    ['> - a\n>   - :: t', true, ['prism', 'hljs']],
    ['- :: s\n  > - # h', true, ['prism', 'hljs']],
    ['- # h\n  > - # g', true, ['prism', 'hljs']],
    ['- a\n  :: t', false, all],
    ['- :: t\n  : d', false, all],
    [':: t\n  : d', true, ['prism', 'hljs']],
    ['- :: t\n    : d', true, ['prism', 'hljs']],
    ['1. :: t\n   : d', false, ['prism', 'hljs']],
    ['- :: t\n  more', false, all],
    ['- :: t\n\tmore', true, ['prism', 'hljs']],
    ['- a\n- :: t\n   - x', false, ['prism', 'hljs']],
    ['- :: t\n   1. x', false, ['prism', 'hljs']],
    ['- :: t\n   2. x', true, ['prism', 'hljs']],
    [':: t\n  - x', true, ['prism', 'hljs']],
    [':: t\n  - :: t\n  more', true, ['prism', 'hljs']],
    ['- :: t\n  - :: u\n  more', false, ['prism', 'hljs']],
    ['  x\na. :: t', false, ['prism', 'hljs']],
    ['  x\n- :: t', false, ['prism', 'hljs']],
    ['- :: s\n> - :: t', true, ['prism', 'hljs']],
    ['- :: s\n  # h', true, ['prism', 'hljs']],
    ['- a\n  # h', false, ['prism', 'hljs']],
    [': d\n:: t', false, ['prism', 'hljs']],
    [': d\n:: t\n- # h', false, ['prism', 'hljs']],
    [':: a\n: d\n:: t', true, all],
    ['- # h\n  more', false, all],
    ['- %% c\n  more', false, all],
];
for (const [above, stands, names] of rows) {
    for (const line of ['[a]: /u', '*[A]: x', '[a]: /u "t"']) {
        for (const source of [`${above}\n${line}`, `${above}\n${line}`.replaceAll('\n', '\r\n')]) {
            for (const name of names) {
                assert.equal(definition[name](source), stands, `${name}: definition in ${JSON.stringify(source)}`);
            }
        }
    }
}
// The definition keeps no heading or term scope, and a definition run stands as a whole.
for (const source of ['- # h\n[a]: /u', '- :: t\n[a]: /u']) {
    assert.equal(covered(textmate, source, 'markup.heading.carve'), source.startsWith('- #') ? '# h' : '', `textmate: heading in ${JSON.stringify(source)}`);
    assert.equal(covered(textmate, source, 'entity.name.tag.definition.term.carve'), source.startsWith('- :') ? 't' : '', `textmate: term in ${JSON.stringify(source)}`);
}
assert.equal(covered(textmate, '- :: t\n[a]: /u\n[b]: /v', 'meta.link.reference.def.carve'), '[a]: /u[b]: /v');
console.log('definitions under list items: Prism, highlight.js and TextMate agree with carve-js');
