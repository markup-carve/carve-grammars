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
    '*a* /b/ `c` {=d=} ~e~ {,f,} {^g^} _h_');

check('underline maps to _.._',
    doc(para(text('x', 'underline'))),
    '_x_');

check('insert maps to {+..+}',
    doc(para(text('x', 'carveInsert'))),
    '{+x+}');

check('link',
    doc(para({ type: 'text', text: 'site', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] })),
    '[site](https://example.com)');

check('link with title',
    doc(para({ type: 'text', text: 'site', marks: [{ type: 'link', attrs: { href: 'https://example.com', title: 'Home' } }] })),
    '[site](https://example.com "Home")');

check('inline image with title',
    doc(para({ type: 'image', attrs: { alt: 'logo', src: 'a.png', title: 'Logo' } })),
    '![logo](a.png "Logo")');

// Escaping: literal Carve constructs in plain text must round-trip as text.
// (Verified against the carve-js reference parser.)
check('escapes literal inline code / link / footnote',
    doc(para(text('use `npm test`, see [a](http://b) and [^1]'))),
    'use \\`npm test\\`, see \\[a](http://b) and \\[^1]');

check('escapes literal critic / mention / tag / emoji',
    doc(para(text('apply {+x+} {-y-} for @bob #tag :wave:'))),
    'apply \\{+x+} \\{-y-} for \\@bob \\#tag \\:wave:');

check('leaves flanking-safe prose unescaped',
    doc(para(text('price * 2, x_1, C:\\path, mail a@b.com, 3:30'))),
    'price * 2, x_1, C:\\path, mail a@b.com, 3:30');

check('escapes the emphasis delimiter inside its own span',
    doc(para(text('a*b', 'bold'), text(' '), text('c/d', 'italic'))),
    '*a\\*b* /c\\/d/');

check('escapes a complete emphasis span sitting in plain text',
    doc(para(text('see *bold*, /em/, ==hi== and 2*3*4'))),
    'see \\*bold\\*, \\/em/, \\==hi== and 2\\*3*4');

check('does not escape an unpaired delimiter in plain text',
    doc(para(text('price * 2, exp 5^2, end~'))),
    'price * 2, exp 5^2, end~');

check('leaves doubled delimiters (literal in Carve) unescaped',
    doc(para(text('see **bold**, __u__ and a~~s~~b'))),
    'see **bold**, __u__ and a~~s~~b');

check('escapes quote and backslash in a link title',
    doc(para({ type: 'text', text: 'site', marks: [{ type: 'link', attrs: { href: 'http://x', title: 'A "q" \\ b' } }] })),
    '[site](http://x "A \\"q\\" \\\\ b")');

check('widens the code fence when content has a backtick',
    doc(para(text('a`b', 'code'))),
    '``a`b``');

check('pads the code fence when content touches a backtick',
    doc(para(text('`x`', 'code'))),
    '`` `x` ``');

check('escapes a closing bracket inside a link label',
    doc(para({ type: 'text', text: 'a]b', marks: [{ type: 'link', attrs: { href: 'http://x' } }] })),
    '[a\\]b](http://x)');

check('escapes edge delimiters that would pair across an inline mark boundary',
    doc(para(
        text('*'),
        { type: 'text', text: 'bold', marks: [{ type: 'link', attrs: { href: 'http://u' } }] },
        text('*'),
    )),
    '\\*[bold](http://u)\\*');

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

// Tables: header cells use `|=`; colspan/rowspan rebuild Carve filler cells.
const cell = (t, type = 'tableCell', attrs = {}) => ({ type, attrs, content: [para(text(t))] });
const row = (...cells) => ({ type: 'tableRow', content: cells });

check('table header row uses |=',
    doc({ type: 'table', content: [
        row(cell('H1', 'tableHeader'), cell('H2', 'tableHeader')),
        row(cell('a'), cell('b')),
    ] }),
    '|= H1 |= H2 |\n| a | b |');

check('table colspan emits a < filler cell',
    doc({ type: 'table', content: [
        row(cell('wide', 'tableCell', { colspan: 2 })),
        row(cell('a'), cell('b')),
    ] }),
    '| wide | < |\n| a | b |');

check('table rowspan emits a ^ filler cell',
    doc({ type: 'table', content: [
        row(cell('tall', 'tableCell', { rowspan: 2 }), cell('b')),
        row(cell('d')),
    ] }),
    '| tall | b |\n| ^ | d |');

// Attributes: span id/class, heading id, image class.
check('span serializes id and class',
    doc(para({ type: 'text', text: 'x', marks: [{ type: 'carveSpan', attrs: { class: 'note', id: 'me' } }] })),
    '[x]{#me .note}');

check('heading serializes an id on the preceding line (strict djot)',
    doc({ type: 'heading', attrs: { level: 2, id: 'slug' }, content: [text('Title')] }),
    '{#slug}\n## Title');

check('image serializes a class',
    doc(para({ type: 'image', attrs: { alt: 'a', src: 's.png', class: 'wide' } })),
    '![a](s.png){.wide}');

// Math: inline $`x`$, display $$`x`$$, backtick-safe fence.
check('inline math',
    doc(para({ type: 'carveMath', attrs: { src: 'E=mc^2' } })),
    '$`E=mc^2`$');

check('display math',
    doc(para({ type: 'carveMath', attrs: { src: 'a+b', display: true } })),
    '$$`a+b`$$');

check('math widens fence for an internal backtick',
    doc(para({ type: 'carveMath', attrs: { src: 'a`b' } })),
    '$``a`b``$');

// Footnote definition: [^label]: body
check('footnote definition',
    doc(
        para(text('see '), { type: 'carveFootnote', attrs: { label: '1' } }),
        { type: 'carveFootnoteDefinition', attrs: { label: '1' }, content: [para(text('the body'))] },
    ),
    'see [^1]\n\n[^1]: the body');

console.log(`\n${passed} passed`);
