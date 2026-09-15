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

    const unreachableCloser = await tokenize('~{/x/}{/y~/}');
    const strikeScope = name === 'highlightjs' ? 'deletion' : name === 'prism' ? 'strike' : 'markup.strikethrough';
    const italicScope = name === 'highlightjs' ? 'emphasis' : 'italic';
    assert(!unreachableCloser.find((token) => token.text.startsWith('~'))?.scope?.includes(strikeScope), `${name}: a closer inside a forced span reached an outer strike`);
    assert(unreachableCloser.some((token) => token.text.includes('x') && token.scope?.includes(italicScope)), `${name}: first forced italic was lost`);
    assert(unreachableCloser.some((token) => token.text.includes('y~') && token.scope?.includes(italicScope)), `${name}: second forced italic was split by its inner strike marker`);

    const strikeAcrossInsert = await tokenize('~a{+b~+} c~');
    assert(strikeAcrossInsert.some((token) => token.text.includes(' c') && token.scope?.includes(strikeScope)), `${name}: strike closed inside an insertion`);

    const boldAcrossUnderline = await tokenize('*a {_b* c_} d*');
    assert(boldAcrossUnderline.some((token) => token.text.includes(' d') && token.scope?.includes(strongScope)), `${name}: bold closed inside a forced underline`);

    const slashAdjacentUnderline = await tokenize('/x/_y_');
    assert(slashAdjacentUnderline.some((token) => token.text.includes('x') && token.scope?.includes(name === 'highlightjs' ? 'emphasis' : name === 'prism' ? 'italic' : 'markup.italic')), `${name}: italic before an underscore was lost`);
    assert(!slashAdjacentUnderline.some((token) => token.text.includes('y') && token.scope?.includes('underline')), `${name}: underscore after an italic closer opened underline`);

    const whitespaceForced = await tokenize('{~ ~}');
    assert(whitespaceForced.some((token) => token.text.includes(' ') && token.scope?.includes(name === 'highlightjs' ? 'deletion' : name === 'prism' ? 'forced-strike' : 'markup.strikethrough')), `${name}: whitespace-only forced strike was not scoped`);
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

console.log(`latest syntax: ${surfaces.length} highlighters preserve braced-inline boundaries; dd writes one space.`);
