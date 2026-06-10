/**
 * Serializer tests for carve-grammars.
 *
 * Validates that a Tiptap/ProseMirror JSON document serializes to the correct
 * Carve markup. The expected tokens mirror carve-php's HtmlToCarve mapping,
 * which is the canonical HTML-element to Carve-token reference:
 * The tokens target carve-php's parser (the contract):
 *   bold *..*  italic /../  code `..`  highlight ==..==
 *   strike ~..~ (<s>)  subscript ,,..,, (<sub>)  superscript ^..^  insert {+..+}
 */
import assert from 'node:assert';
import { serializeToCarve } from '../tiptap/serializer.js';

let passed = 0;
function check(name, doc, expected) {
    const actual = serializeToCarve(doc);
    assert.strictEqual(actual, expected, `${name}\n--- expected ---\n${expected}\n--- actual ---\n${actual}`);
    passed++;
    console.log(`  ✓ ${name}`);
}

const text = (t, ...markTypes) => ({ type: 'text', text: t, marks: markTypes.map(type => ({ type })) });
const para = (...content) => ({ type: 'paragraph', content });
const doc = (...content) => ({ type: 'doc', content });

console.log('carve-grammars serializer:');

check('heading + paragraph',
    doc(
        { type: 'heading', attrs: { level: 1 }, content: [text('Title')] },
        para(text('Hello.')),
    ),
    '# Title\n\nHello.');

check('inline marks map to Carve tokens',
    doc(para(
        text('a', 'bold'), text(' '),
        text('b', 'italic'), text(' '),
        text('c', 'code'), text(' '),
        text('d', 'highlight'), text(' '),
        text('e', 'strike'), text(' '),
        text('f', 'subscript'), text(' '),
        text('g', 'superscript'), text(' '),
        text('h', 'underline'),
    )),
    '*a* /b/ `c` ==d== ~e~ ,,f,, ^g^ _h_');

check('underline maps to _.._',
    doc(para(text('x', 'underline'))),
    '_x_');

check('insert maps to {+..+}',
    doc(para(text('x', 'carveInsert'))),
    '{+x+}');

check('link',
    doc(para({ type: 'text', text: 'site', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] })),
    '[site](https://example.com)');

check('bullet list',
    doc({ type: 'bulletList', content: [
        { type: 'listItem', content: [para(text('one'))] },
        { type: 'listItem', content: [para(text('two'))] },
    ] }),
    '- one\n- two');

check('ordered list',
    doc({ type: 'orderedList', attrs: { start: 1 }, content: [
        { type: 'listItem', content: [para(text('first'))] },
        { type: 'listItem', content: [para(text('second'))] },
    ] }),
    '1. first\n2. second');

check('blockquote',
    doc({ type: 'blockquote', content: [para(text('quoted'))] }),
    '> quoted');

check('code block with language',
    doc({ type: 'codeBlock', attrs: { language: 'php' }, content: [{ type: 'text', text: 'echo 1;' }] }),
    '```' + ' php\necho 1;\n```');

check('horizontal rule',
    doc(para(text('a')), { type: 'horizontalRule' }, para(text('b'))),
    'a\n\n---\n\nb');

console.log(`\n${passed} passed`);
