import assert from 'node:assert/strict';
import { serializeToCarve, serializeToCarveWithReport } from '../tiptap/serializer.js';

const text = (value, marks) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });
const paragraph = (content) => ({ type: 'paragraph', content });
const doc = (content, attrs) => ({ type: 'doc', content, ...(attrs ? { attrs } : {}) });

for (const [name, input, expected] of [
    ['unknown block', doc([{ type: 'alien', content: [text('lost')] }]), /node at \$\.content\[0\]: alien/],
    ['unknown inline', doc([paragraph([{ type: 'alienInline', text: 'lost' }])]), /node at \$\.content\[0\]\.content\[0\]: alienInline/],
    ['unknown mark', doc([paragraph([text('kept', [{ type: 'alienMark' }])])]), /mark at \$\.content\[0\]\.content\[0\]\.marks\[0\]: alienMark/],
    ['unspellable bold attribute', doc([paragraph([text('kept', [{ type: 'bold', attrs: { applicationData: 'lost' } }])])]), /mark attribute at \$\.content\[0\]\.content\[0\]\.marks\[0\]\.attrs\.applicationData: bold/],
    ['unspellable false attribute', doc([paragraph([text('kept', [{ type: 'italic', attrs: { applicationFlag: false } }])])]), /mark attribute at \$\.content\[0\]\.content\[0\]\.marks\[0\]\.attrs\.applicationFlag: italic/],
    ['unspellable empty-mark attribute', doc([paragraph([{ type: 'carveEmptyMark', attrs: { markType: 'italic', markAttrs: { applicationData: 'lost' } } }])]), /mark attribute at \$\.content\[0\]\.content\[0\]\.attrs\.markAttrs\.applicationData: italic/],
    ['unspellable empty-code attribute', doc([paragraph([{ type: 'carveEmptyMark', attrs: { markType: 'code', markAttrs: { applicationData: 'lost' } } }])]), /mark attribute at \$\.content\[0\]\.content\[0\]\.attrs\.markAttrs\.applicationData: code/],
    ['unknown document attribute', doc([paragraph([text('kept')])], { applicationData: 'lost' }), /document attribute: applicationData/],
    ['unknown empty mark', doc([paragraph([{ type: 'carveEmptyMark', attrs: { markType: 'alienMark' } }])]), /empty mark at \$\.content\[0\]\.content\[0\]: alienMark/],
    ['unknown substitution child', doc([paragraph([{ type: 'carveSubstitution', attrs: { old: [{ type: 'alien' }], new: [text('new')] } }])]), /node at \$\.content\[0\]\.content\[0\]\.attrs\.old\[0\]: alien/],
]) {
    assert.throws(() => serializeToCarve(input), expected, name);
    assert.throws(() => serializeToCarveWithReport(input), expected, `${name} with report`);
}

assert.equal(serializeToCarve(doc([paragraph([text('kept', [{ type: 'bold' }])])])), '*kept*');
assert.equal(serializeToCarve(doc([paragraph([text('kept', [{ type: 'bold', attrs: { carveBoldItalic: null } }])])])), '*kept*');
assert.equal(serializeToCarve(doc([paragraph([text('kept', [{ type: 'bold', attrs: { carveBoldItalic: true } }])])])), '*kept*');
assert.equal(serializeToCarve(doc([paragraph([text('kept')])], { carveSource: null })), 'kept');
const foreign = doc([
    paragraph([text('visible', [{ type: 'alienMark' }])]),
    { type: 'alien', content: [text('lost')] },
], { applicationData: 'ignored' });
assert.equal(serializeToCarve(foreign, { unsupported: 'omit' }), 'visible');
assert.equal(serializeToCarveWithReport(foreign, { unsupported: 'omit' }).source, 'visible');
assert.equal(serializeToCarve(doc([paragraph([text('before'), { type: 'alienInline', text: 'lost' }, text('after')])]),
    { unsupported: 'omit' }), 'beforeafter');
assert.throws(() => serializeToCarve(foreign, { unsupported: 'ignore' }), /Unsupported serializer policy/);
console.log('unknown ProseMirror JSON fails closed');
