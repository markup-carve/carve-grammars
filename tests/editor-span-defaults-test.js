import assert from 'node:assert/strict';
import { carveToHtml } from '@markup-carve/carve';
import { carveToProseMirror, serializeToCarve } from '../tiptap/index.js';

const html = source => carveToHtml(source).replace(/\s+/g, ' ').trim();
const project = source => serializeToCarve({
    ...carveToProseMirror(source, { unsupported: 'preserve' }),
    attrs: undefined,
});

for (const source of [
    ':: a\n: b\n\t:: t\n  : zq\n',
    '|> Wide|<|~ Last|\n|:--|:--|:--|\n|a|b|c|\n',
    '{aligns=,left,}\n|= Wide|<|= Last|\n|a|b|c|\n',
]) {
    assert.equal(html(project(source)), html(source), source);
}

const table = {
    type: 'doc',
    content: [{
        type: 'table',
        content: [{ type: 'tableRow', content: [
            { type: 'tableCell', attrs: { textAlign: 'left' }, content: [{ type: 'paragraph' }] },
            { type: 'tableCell', attrs: { carveVerticalAlign: 'top' }, content: [{ type: 'paragraph' }] },
        ] }],
    }],
};
const written = serializeToCarve(table);
assert.doesNotMatch(written, /\|< *\|/, 'an empty left-aligned cell must not become a colspan marker');
assert.equal(html(written).includes('colspan='), false);
assert.match(html(written), /vertical-align: top/);

console.log('editor span defaults: 4 cases passed');
