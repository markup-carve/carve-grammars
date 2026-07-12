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
    '*a* /b/ `c` =d= ~e~ ,f, ^g^ _h_');

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
    'see \\*bold\\*, \\/em/, ==hi== and 2\\*3*4');

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
    '```php\necho 1;\n```');

check('code block strips one trailing newline (no blank line before fence)',
    doc({ type: 'codeBlock', attrs: { language: 'php' }, content: [{ type: 'text', text: 'echo 1;\n' }] }),
    '```php\necho 1;\n```');

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

check('table cell escapes a literal pipe',
    doc({ type: 'table', content: [
        row(cell('a | b', 'tableHeader'), cell('c', 'tableHeader')),
        row(cell('1'), cell('2')),
    ] }),
    '|= a \\| b |= c |\n| 1 | 2 |');

// Definition list: `:: term` then `:  def` on the next line (no blank between).
check('definition list uses :: term / :  def',
    doc({ type: 'definitionList', content: [
        { type: 'definitionTerm', content: [text('Term A')] },
        { type: 'definitionDescription', content: [para(text('Def A.'))] },
        { type: 'definitionTerm', content: [text('Term B')] },
        { type: 'definitionDescription', content: [para(text('Def B.'))] },
    ] }),
    ':: Term A\n:  Def A.\n\n:: Term B\n:  Def B.');

// Bare == and ,, are literal in Carve (highlight is {= =}, sub {, ,}); do not escape.
check('literal == and ,, are not escaped',
    doc(para(text('a ==x== and ,,y,, b'))),
    'a ==x== and ,,y,, b');

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

// Abbreviation: the SemanticSpanExtension `abbr` attribute carries the
// expansion (-> <abbr title> when that extension is on); title escaped.
check('abbreviation serializes with the abbr semantic-span attribute',
    doc(para({ type: 'text', text: 'HTML', marks: [{ type: 'carveAbbreviation', attrs: { title: 'HyperText Markup Language' } }] })),
    '[HTML]{abbr="HyperText Markup Language"}');

// Math: inline $`x`, display $$`x`, backtick-safe fence (no trailing $).
check('inline math',
    doc(para({ type: 'carveMath', attrs: { src: 'E=mc^2' } })),
    '$`E=mc^2`');

check('display math',
    doc(para({ type: 'carveMath', attrs: { src: 'a+b', display: true } })),
    '$$`a+b`');

check('math widens fence for an internal backtick',
    doc(para({ type: 'carveMath', attrs: { src: 'a`b' } })),
    '$``a`b``');

// Media embeds: a stamped source round-trips verbatim (any provider, lossless).
check('embed: stamped carveSource wins over src',
    doc({ type: 'carveEmbed', attrs: { carveSource: ':twitch[monstercat]', src: '//player.twitch.tv/?channel=monstercat' } }),
    ':twitch[monstercat]');

check('embed: stamped :media[] source round-trips verbatim',
    doc({ type: 'carveEmbed', attrs: { carveSource: ':media[https://example.com/v/42]', src: '//embed.example.com/42' } }),
    ':media[https://example.com/v/42]');

// Media embeds: iframe src -> Carve media directive (fallback for un-stamped).
check('embed: youtube embed url -> :youtube[id]',
    doc({ type: 'carveEmbed', attrs: { src: '//www.youtube.com/embed/dQw4w9WgXcQ?wmode=transparent' } }),
    ':youtube[dQw4w9WgXcQ]');

check('embed: youtu.be short url -> :youtube[id]',
    doc({ type: 'carveEmbed', attrs: { src: 'https://youtu.be/dQw4w9WgXcQ' } }),
    ':youtube[dQw4w9WgXcQ]');

check('embed: vimeo player url -> :vimeo[id]',
    doc({ type: 'carveEmbed', attrs: { src: '//player.vimeo.com/video/123456?wmode=transparent' } }),
    ':vimeo[123456]');

check('embed: other provider -> :media[url]',
    doc({ type: 'carveEmbed', attrs: { src: '//www.dailymotion.com/embed/video/x7tgz2' } }),
    ':media[https://www.dailymotion.com/embed/video/x7tgz2]');

// Footnote definition: [^label]: body
check('footnote definition',
    doc(
        para(text('see '), { type: 'carveFootnote', attrs: { label: '1' } }),
        { type: 'carveFootnoteDefinition', attrs: { label: '1' }, content: [para(text('the body'))] },
    ),
    'see [^1]\n\n[^1]: the body');

const div = (cls, ...content) => ({ type: 'carveDiv', attrs: { class: cls }, content });

check('flat div keeps a 3-colon fence',
    doc(div('note', para(text('A note.')))),
    '::: note\nA note.\n:::');

check('a div containing a div widens the outer fence to ::::',
    doc(div('tabs',
        div('tab', para(text('First.'))),
        div('tab', para(text('Second.'))),
    )),
    ':::: tabs\n::: tab\nFirst.\n:::\n\n::: tab\nSecond.\n:::\n::::');

check('three levels of nesting widen fences 5/4/3',
    doc(div('outer', div('middle', div('inner', para(text('deep.')))))),
    '::::: outer\n:::: middle\n::: inner\ndeep.\n:::\n::::\n:::::');

check('sibling divs do not inflate each other (both stay 3)',
    doc(div('note', para(text('one.'))), div('tip', para(text('two.')))),
    '::: note\none.\n:::\n\n::: tip\ntwo.\n:::');

check('tab set widens its fence and emits canonical [label] openers',
    doc({ type: 'carveTabSet', content: [
        { type: 'carveTab', attrs: { label: 'First' }, content: [para(text('Alpha.'))] },
        { type: 'carveTab', attrs: { label: 'Second', selected: true }, content: [para(text('Beta.'))] },
    ] }),
    ':::: tabs\n::: tab [First]\nAlpha.\n:::\n\n{selected}\n::: tab [Second]\nBeta.\n:::\n::::');

check('a tab label containing ] falls back to the attribute line',
    doc({ type: 'carveTabSet', content: [
        { type: 'carveTab', attrs: { label: 'A]B' }, content: [para(text('X.'))] },
    ] }),
    ':::: tabs\n{label="A]B"}\n::: tab\nX.\n:::\n::::');

check('a tab with no label emits a bare ::: tab',
    doc({ type: 'carveTabSet', content: [
        { type: 'carveTab', content: [para(text('X.'))] },
    ] }),
    ':::: tabs\n::: tab\nX.\n:::\n::::');

console.log(`\n${passed} passed`);
