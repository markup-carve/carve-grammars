import assert from 'node:assert';
import { carveToProseMirror } from '../tiptap/index.js';
import { serializeToCarve } from '../tiptap/serializer.js';
import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';

const prose = 'Prose flows {% a delimited comment %} around a hidden note.';
const nested = 'Even *bo{% hidden %}ld* stays one strong span.';
const surfaces = [
    ['prism', prismTokens, 'bold'],
    ['highlightjs', hljsTokens, 'strong'],
    ...(await textmateEngines()).map(([name, tokenize]) => [name, tokenize, 'markup.bold']),
];

for (const [name, tokenize, strongScope] of surfaces) {
    const proseTokens = await tokenize(prose);
    assert(proseTokens.some((token) => token.text.includes('{%') && token.scope?.includes('comment')), `${name}: prose comment is not scoped`);
    const nestedTokens = await tokenize(nested);
    assert(nestedTokens.find((token) => token.text.includes('{%'))?.scope?.includes('comment'), `${name}: nested comment is not scoped`);
    const visibleStrong = nestedTokens.filter((token) => token.text.includes('bo') || token.text.includes('ld'));
    assert(visibleStrong.length && visibleStrong.every((token) => token.scope?.includes(strongScope)), `${name}: comment split the strong span`);
}

const definition = {
    type: 'doc',
    content: [{
        type: 'definitionList',
        content: [
            { type: 'definitionTerm', content: [{ type: 'text', text: 'x' }] },
            { type: 'definitionDescription', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'y' }] }] },
        ],
    }],
};
assert.equal(serializeToCarve(definition), ':: x\n: y');

console.log(`latest syntax: ${surfaces.length} highlighters preserve nested comments; dd writes one space.`);
