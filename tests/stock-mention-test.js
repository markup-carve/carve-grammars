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
    ['a label that differs from the id', 'mention', { id: 'u123', label: 'Alice', mentionSuggestionChar: '@' }, 'ping @u123', {}, { label: LABEL_DROPPED }],
    ['a null id', 'mention', { id: null, label: 'Alice', mentionSuggestionChar: '@' }, 'ping @Alice', {}],
    ['the id alone', 'mention', { id: 'alice' }, 'ping @alice', {}],
    ['the label alone', 'mention', { label: 'Alice' }, 'ping @Alice', {}],
    ['a carveMention with a null id', 'carveMention', { id: null, label: 'alice', mentionSuggestionChar: '@' }, 'ping @alice', {}],
    ['a tag with a null label', 'carveTag', { id: 'release', label: null, mentionSuggestionChar: '#' }, 'ping #release', {}],
    ['a tag with a different label', 'carveTag', { id: 'release', label: 'Release', mentionSuggestionChar: '#' }, 'ping #release', {}, { label: LABEL_DROPPED }],
    ['a stock mention whose suggestion char is #', 'mention', { id: 'alice', label: null, mentionSuggestionChar: '#' }, 'ping @alice', {}],
    ['an id that already carries its sigil', 'mention', { id: '@alice', label: null }, 'ping @alice', {}],
    ['a tag id that already carries its sigil', 'carveTag', { id: '#release', label: null, mentionSuggestionChar: '#' }, 'ping #release', {}],
    ['a label that is not text', 'mention', { id: 'alice', label: ['Alice'], mentionSuggestionChar: '@' }, 'ping @alice', {},
        { label: 'a Carve attribute holds a string, and this value is of type array' }],
    ['an attribute Carve cannot spell', 'mention', { id: 'alice', label: null, mentionSuggestionChar: '@', 'data-team': 'core' }, 'ping @alice',
        { 'data-team': 'a mention has no Carve spelling for an attribute' }],
    ['a tag attribute Carve cannot spell', 'carveTag', { id: 'release', label: null, 'data-team': 'core' }, 'ping #release',
        { 'data-team': 'a tag has no Carve spelling for an attribute' }],
];

for (const [name, type, attrs, carve, dropped, degraded = {}] of named) {
    ok(`${name} writes ${carve} and reads back as one node`, () => {
        const report = serializeToCarveWithReport(paragraph(type, attrs));
        assert.strictEqual(report.source, carve);
        assert.deepStrictEqual(report.dropped, dropped);
        assert.deepStrictEqual(report.degraded, degraded);
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

const MENTION_AS_TEXT = 'the name has no Carve mention spelling, so it is written as literal text';
const TAG_AS_TEXT = 'the name has no Carve tag spelling, so it is written as literal text';
const ATTRIBUTE_AS_TEXT = 'the mention is written as text, which holds no attribute';

for (const [name, id] of [['a name holding a space', 'Lea Thompson'], ['a name with a non-ASCII letter', 'jürgen']]) {
    ok(`${name} is escaped literal text, reported and never normalized`, () => {
        const report = serializeToCarveWithReport(paragraph('mention', { id, label: null }));
        assert.strictEqual(report.source, 'ping \\@' + id);
        assert.deepStrictEqual(report.dropped, {});
        assert.deepStrictEqual(report.degraded, { id: MENTION_AS_TEXT });
        assert.deepStrictEqual(inlineNodes(report.source), [{ type: 'text', text: 'ping @' + id }]);
    });
}

// The report is keyed on the field that held the name, and the text is what
// the editor showed (markup-carve/carve-php#2154, markup-carve/carve-php#2167).
const asText = [
    ['a name that lives in the label alone', 'mention', { id: null, label: 'Lea Thompson' }, 'ping \\@Lea Thompson', {}, { label: MENTION_AS_TEXT }],
    ['an unspellable id beside a spellable label', 'mention', { id: 'u 1', label: 'Lea' }, 'ping \\@Lea', {}, { id: MENTION_AS_TEXT }],
    ['an unspellable name carrying an attribute', 'mention', { id: 'Lea Thompson', label: null, 'data-team': 'core' }, 'ping \\@Lea Thompson',
        { 'data-team': ATTRIBUTE_AS_TEXT }, { id: MENTION_AS_TEXT }],
    ['an unspellable name that carries its sigil', 'mention', { id: '@Lea Thompson', label: null }, 'ping \\@Lea Thompson', {}, { id: MENTION_AS_TEXT }],
    ['an unspellable tag name', 'carveTag', { id: 'big release', label: null, mentionSuggestionChar: '#' }, 'ping \\#big release', {}, { id: TAG_AS_TEXT }],
    ['an unspellable tag name carrying an attribute', 'carveTag', { id: 'big release', label: null, 'data-team': 'core' }, 'ping \\#big release',
        { 'data-team': 'the tag is written as text, which holds no attribute' }, { id: TAG_AS_TEXT }],
];

for (const [name, type, attrs, carve, dropped, degraded] of asText) {
    ok(`${name} writes ${carve}`, () => {
        const report = serializeToCarveWithReport(paragraph(type, attrs));
        assert.strictEqual(report.source, carve);
        assert.deepStrictEqual(report.dropped, dropped);
        assert.deepStrictEqual(report.degraded, degraded);
    });
}

console.log(`\n${passed} passed`);
