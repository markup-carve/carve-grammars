/**
 * A stock Tiptap mention (tiptap/extension-mention 3.29.2) serializes by the
 * rulings on markup-carve/carve-php#2154; the bytes match carve-php's.
 */
import assert from 'node:assert';
import { carveToProseMirror, serializeToCarve, serializeToCarveWithReport } from '../tiptap/index.js';

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

const LABEL_DROPPED = 'the mention name is its id, so a different display label is not carried';

function paragraph(type, attrs) {
    return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ping ' }, { type, attrs }] }] };
}

function inlineNodes(source) {
    return carveToProseMirror(source + '\n').content[0].content;
}

console.log('stock mention:');

const named = [
    ['a stock mention with a null label', 'mention', { id: 'alice', label: null, mentionSuggestionChar: '@' }, 'ping @alice', {}],
    ['a label equal to the id', 'mention', { id: 'alice', label: 'alice', mentionSuggestionChar: '@' }, 'ping @alice', {}],
    ['a label that differs from the id', 'mention', { id: 'u123', label: 'Alice', mentionSuggestionChar: '@' }, 'ping @u123', { label: LABEL_DROPPED }],
    ['a null id', 'mention', { id: null, label: 'Alice', mentionSuggestionChar: '@' }, 'ping @Alice', {}],
    ['the id alone', 'mention', { id: 'alice' }, 'ping @alice', {}],
    ['the label alone', 'mention', { label: 'Alice' }, 'ping @Alice', {}],
    ['a carveMention with a null id', 'carveMention', { id: null, label: 'alice', mentionSuggestionChar: '@' }, 'ping @alice', {}],
    ['a tag with a null label', 'carveTag', { id: 'release', label: null, mentionSuggestionChar: '#' }, 'ping #release', {}],
    ['a tag with a different label', 'carveTag', { id: 'release', label: 'Release', mentionSuggestionChar: '#' }, 'ping #release', { label: LABEL_DROPPED }],
    ['a stock mention whose suggestion char is #', 'mention', { id: 'alice', label: null, mentionSuggestionChar: '#' }, 'ping @alice', {}],
    ['a label that is not text', 'mention', { id: 'alice', label: ['Alice'], mentionSuggestionChar: '@' }, 'ping @alice',
        { label: 'a Carve attribute holds a string, and this value is of type array' }],
];

for (const [name, type, attrs, carve, dropped] of named) {
    ok(`${name} writes ${carve} and reads back as one node`, () => {
        const report = serializeToCarveWithReport(paragraph(type, attrs));
        assert.strictEqual(report.source, carve);
        assert.deepStrictEqual(report.dropped, dropped);
        assert.deepStrictEqual(report.degraded, {});
        assert.strictEqual(serializeToCarve(paragraph(type, attrs)), carve);
        const nodes = inlineNodes(carve);
        assert.strictEqual(nodes.length, 2, JSON.stringify(nodes));
        assert.deepStrictEqual(nodes[1], { type: type === 'carveTag' ? 'carveTag' : 'carveMention', attrs: { id: carve.slice(6) } });
    });
}

ok('the issue example keeps the mention between its text', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'hi ' },
        { type: 'mention', attrs: { id: 'alice', label: null, mentionSuggestionChar: '@' } },
        { type: 'text', text: ' bye' },
    ] }] };
    assert.strictEqual(serializeToCarve(doc), 'hi @alice bye');
});

for (const [name, id] of [['a name holding a space', 'Lea Thompson'], ['a name with a non-ASCII letter', 'jürgen']]) {
    ok(`${name} is escaped literal text, reported and never normalized`, () => {
        const report = serializeToCarveWithReport(paragraph('mention', { id, label: null }));
        assert.strictEqual(report.source, 'ping \\@' + id);
        assert.deepStrictEqual(report.degraded, { mention: 'the name has no Carve mention spelling, so it is written as literal text' });
        assert.deepStrictEqual(inlineNodes(report.source), [{ type: 'text', text: 'ping @' + id }]);
    });
}

ok('an attribute Carve cannot spell is reported', () => {
    const report = serializeToCarveWithReport(paragraph('mention', { id: 'alice', label: null, mentionSuggestionChar: '@', 'data-team': 'core' }));
    assert.strictEqual(report.source, 'ping @alice');
    assert.deepStrictEqual(report.dropped, { 'data-team': 'a mention has no Carve spelling for an attribute' });
});

console.log(`\n${passed} passed`);
