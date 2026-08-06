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
import { parse, renderHtml } from '@markup-carve/carve';
import { astToProseMirror } from '../tiptap/index.js';
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
    '*a* /b/ `c` =d= ~e~ {,f,} {^g^} _h_');

// Sup/sub have no bare form: braced everywhere, including at a word boundary.
check('subscript and superscript are always braced',
    doc(para(text('x', 'subscript'), text(' '), text('y', 'superscript'))),
    '{,x,} {^y^}');

check('underline maps to _.._',
    doc(para(text('x', 'underline'))),
    '_x_');

check('insert maps to {+..+}',
    doc(para(text('x', 'carveInsert'))),
    '{+x+}');

check('editorial comment maps to {#..#}',
    doc(para(text('x', 'carveCriticComment'))),
    '{#x#}');

// The content is LITERAL - the parser does not resolve escapes inside it - so
// escaping it the way prose is escaped would put real backslashes in the
// comment. `*not markup*` has to come back out exactly as written.
check('an editorial comment does not escape its content',
    doc(para(text('a '), text(' note *not markup* ', 'carveCriticComment'), text(' b'))),
    'a {# note *not markup* #} b');

// A `]` inside a linked comment has no clean answer: escaping it keeps the
// link and silently corrupts the comment, since no escape is resolved inside
// `{# ... #}`. Content integrity wins - the label ends early and the link
// renders as literal text, which is at least visible. carve#403 tracks the
// engine fix (a label's scan already skips inline code; it should skip these
// too), after which this expectation changes to the escaped form.
check('a linked editorial comment keeps its content over its link',
    doc(para({ type: 'text', text: 'a]b', marks: [{ type: 'carveCriticComment' }, { type: 'link', attrs: { href: 'u' } }] })),
    '[{#a]b#}](u)');

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

// List items must keep every block child, indented to the content column.
// Regression: a non-paragraph, non-list child (code, quote, div) was dropped,
// and a second paragraph landed at column 0, dedenting out of the list
// (mirrors php-collective/djot-grammars#14, ported to Carve).
check('list item: two paragraphs (loose)',
    doc({ type: 'bulletList', content: [
        { type: 'listItem', content: [para(text('a')), para(text('b'))] },
    ] }),
    '- a\n\n  b');

check('list item: paragraph then code block',
    doc({ type: 'bulletList', content: [
        { type: 'listItem', content: [
            para(text('a')),
            { type: 'codeBlock', attrs: { language: '' }, content: [{ type: 'text', text: 'x=1' }] },
        ] },
    ] }),
    '- a\n\n  ```\n  x=1\n  ```');

check('list item: paragraph then block quote',
    doc({ type: 'bulletList', content: [
        { type: 'listItem', content: [
            para(text('a')),
            { type: 'blockquote', content: [para(text('b'))] },
        ] },
    ] }),
    '- a\n\n  > b');

// An ordered item's content column is the marker width (`1. ` -> 3), NOT a
// fixed 2. A block at 2 spaces sits below the column and dedents out of the
// item entirely (verified against carve-js).
check('ordered list item: paragraph then code block indents to the marker width',
    doc({ type: 'orderedList', attrs: { start: 1 }, content: [
        { type: 'listItem', content: [
            para(text('a')),
            { type: 'codeBlock', attrs: { language: '' }, content: [{ type: 'text', text: 'x=1' }] },
        ] },
    ] }),
    '1. a\n\n   ```\n   x=1\n   ```');

// Same column rule for a nested sublist marker: 2 spaces under `1. ` would be
// swallowed as lazy continuation text and the sublist lost.
check('ordered list item: nested sublist indents to the marker width',
    doc({ type: 'orderedList', attrs: { start: 1 }, content: [
        { type: 'listItem', content: [
            para(text('parent')),
            { type: 'orderedList', attrs: { start: 1 }, content: [
                { type: 'listItem', content: [para(text('child'))] },
            ] },
        ] },
    ] }),
    '1. parent\n   1. child');

// A two-digit marker is one column wider again (`10. ` -> 4).
check('ordered list item: multi-digit marker widens the content column',
    doc({ type: 'orderedList', attrs: { start: 9 }, content: [
        { type: 'listItem', content: [para(text('nine'))] },
        { type: 'listItem', content: [
            para(text('ten')),
            { type: 'bulletList', content: [
                { type: 'listItem', content: [para(text('child'))] },
            ] },
        ] },
    ] }),
    '9. nine\n10. ten\n    - child');

// A task item's `[ ]` is content of a plain `- ` bullet, so its content column
// stays 2 - the checkbox does not widen it.
check('task list item: nested sublist keeps the 2-space bullet column',
    doc({ type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: false }, content: [
            para(text('parent')),
            { type: 'taskList', content: [
                { type: 'taskItem', attrs: { checked: true }, content: [para(text('child'))] },
            ] },
        ] },
    ] }),
    '- [ ] parent\n  - [x] child');

// A nested sublist stays tight (no blank line): Carve nests a content-column
// marker without one, and a blank line would render the list loose.
check('list item: paragraph then nested sublist stays tight',
    doc({ type: 'bulletList', content: [
        { type: 'listItem', content: [
            para(text('parent')),
            { type: 'bulletList', content: [
                { type: 'listItem', content: [para(text('child'))] },
            ] },
        ] },
    ] }),
    '- parent\n  - child');

// The list-indent expectations above are hand-written strings, so assert the
// emitted markup against the reference parser too: a block that lands below the
// item's content column still LOOKS plausible but reparses outside the item.
function checkListItemBlocks(name, pmDoc, expectedTypes) {
    const carve = serializeToCarve(pmDoc);
    const ast = parse(carve);
    const item = ast.children?.[0]?.items?.[0];
    const got = (item?.children || []).map((b) => b.type);
    assert.deepStrictEqual(
        got,
        expectedTypes,
        `${name}\n--- carve ---\n${carve}\n--- item blocks ---\n${got.join(', ')}`,
    );
    passed++;
    console.log(`  ✓ ${name}`);
}

const orderedWithSublist = doc({ type: 'orderedList', attrs: { start: 1 }, content: [
    { type: 'listItem', content: [
        para(text('parent')),
        { type: 'orderedList', attrs: { start: 1 }, content: [
            { type: 'listItem', content: [para(text('child'))] },
        ] },
    ] },
] });

checkListItemBlocks('reparse: ordered sublist stays inside its parent item',
    orderedWithSublist, ['paragraph', 'list']);

checkListItemBlocks('reparse: ordered continuation code block stays inside its item',
    doc({ type: 'orderedList', attrs: { start: 1 }, content: [
        { type: 'listItem', content: [
            para(text('a')),
            { type: 'codeBlock', attrs: { language: '' }, content: [{ type: 'text', text: 'x=1' }] },
        ] },
    ] }),
    // `code_block`, not `code-block`: the node vocabulary is snake_case, and
    // the engine bump in this commit is where this spelling reached us.
    ['paragraph', 'code_block']);

checkListItemBlocks('reparse: task sublist stays inside its parent item',
    doc({ type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: false }, content: [
            para(text('parent')),
            { type: 'taskList', content: [
                { type: 'taskItem', attrs: { checked: true }, content: [para(text('child'))] },
            ] },
        ] },
    ] }),
    ['paragraph', 'list']);

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

// A span with NOTHING to write still has to write something: bare `[x]` is not
// a span on the next parse, it is literal brackets. The empty block `{}` is
// that something - valid Carve, and the explicit "make this a span" hook. The
// fallback used to invent `{.class}`, putting a class named "class" on a
// document that never had one.
check('a span with no attributes writes the blessed empty block',
    doc(para({ type: 'text', text: 'x', marks: [{ type: 'carveSpan', attrs: {} }] })),
    '[x]{}');

check('a span with no attrs object at all writes the blessed empty block',
    doc(para({ type: 'text', text: 'x', marks: [{ type: 'carveSpan' }] })),
    '[x]{}');

// UNCHANGED BEHAVIOR, pinned deliberately. `custom` is CarveSpan's schema
// default, so by the time the serializer sees it, an editor-created span and an
// authored `[x]{.custom}` are indistinguishable. It keeps being written, which
// preserves the authored spelling; deciding the other way needs a schema change
// (a null default), not a serializer branch. This case fails if the fallback is
// made an unconditional `{}`.
check('a span whose only class is the schema placeholder still writes it',
    doc(para({ type: 'text', text: 'x', marks: [{ type: 'carveSpan', attrs: { class: 'custom' } }] })),
    '[x]{.custom}');

// The placeholder is suppressed once there is a real attribute beside it, so
// `placeholderClass` stays load-bearing above.
check('the schema placeholder is suppressed beside a real attribute',
    doc(para({ type: 'text', text: 'x', marks: [{ type: 'carveSpan', attrs: { class: 'custom', id: 'me' } }] })),
    '[x]{#me}');

// A round trip can pass for the WRONG REASON: if both directions are broken the
// same way, `serialize(convert(x))` still comes back equal to `x`. So assert the
// INTERMEDIATE ProseMirror shape and the RENDERED html either side of it, not
// only that the source survived. Here the intermediate is the load-bearing
// half - it was already correct (a `carveSpan` mark carrying no attributes at
// all) while the text coming out of the serializer said `.class`, so a check
// that only compared source to source would have been reading the serializer's
// own invention back as though the document contained it.
function checkSpanPipeline(name, source, expectedCarve) {
    const astA = parse(source);
    const pm = astToProseMirror(astA);
    const marks = pm.content?.[0]?.content?.[0]?.marks || [];
    const span = marks.find((m) => m.type === 'carveSpan');
    assert.ok(span, `${name}: no carveSpan mark in the intermediate document`);
    assert.deepStrictEqual(span.attrs || {}, {},
        `${name}: the intermediate span carries attributes the source never had:`
        + ` ${JSON.stringify(span.attrs)}`);
    const carve = serializeToCarve(pm);
    assert.strictEqual(carve, expectedCarve, `${name}\n--- expected ---\n${expectedCarve}\n--- actual ---\n${carve}`);
    const htmlA = renderHtml(astA).trim();
    const htmlB = renderHtml(parse(carve)).trim();
    assert.strictEqual(htmlB, htmlA, `${name}: rendered output changed\n--- before ---\n${htmlA}\n--- after ---\n${htmlB}`);
    assert.strictEqual(htmlB, '<p><span>x</span></p>',
        `${name}: expected a bare span, got ${htmlB}`);
    passed++;
    console.log(`  ✓ ${name}`);
}

checkSpanPipeline('an empty attribute block survives the whole round trip', '[x]{}\n', '[x]{}');
checkSpanPipeline('a whitespace-only attribute block survives it too', '[x]{ }\n', '[x]{}');
checkSpanPipeline('a tab-only attribute block survives it too', '[x]{\t}\n', '[x]{}');

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
    '::: tabs\n:::: tab\nFirst.\n::::\n\n:::: tab\nSecond.\n::::\n:::');

check('three levels of nesting widen fences 5/4/3',
    doc(div('outer', div('middle', div('inner', para(text('deep.')))))),
    '::: outer\n:::: middle\n::::: inner\ndeep.\n:::::\n::::\n:::');

check('sibling divs do not inflate each other (both stay 3)',
    doc(div('note', para(text('one.'))), div('tip', para(text('two.')))),
    '::: note\none.\n:::\n\n::: tip\ntwo.\n:::');

check('tab set widens its fence and emits canonical [label] openers',
    doc({ type: 'carveTabSet', content: [
        { type: 'carveTab', attrs: { label: 'First' }, content: [para(text('Alpha.'))] },
        { type: 'carveTab', attrs: { label: 'Second', selected: true }, content: [para(text('Beta.'))] },
    ] }),
    '::: tabs\n:::: tab [First]\nAlpha.\n::::\n\n{selected}\n:::: tab [Second]\nBeta.\n::::\n:::');

check('a tab label containing ] falls back to the attribute line',
    doc({ type: 'carveTabSet', content: [
        { type: 'carveTab', attrs: { label: 'A]B' }, content: [para(text('X.'))] },
    ] }),
    '::: tabs\n{label="A]B"}\n:::: tab\nX.\n::::\n:::');

check('a tab with no label emits a bare ::: tab',
    doc({ type: 'carveTabSet', content: [
        { type: 'carveTab', content: [para(text('X.'))] },
    ] }),
    '::: tabs\n:::: tab\nX.\n::::\n:::');

// --- list marker metadata (markup-carve/carve-grammars#116) -------------------
// Everything below was modeled in the AST and dropped by this bridge, so a
// round trip through an editor silently rewrote the author's document.

const listItem = (attrs, ...content) => (attrs ? { type: 'listItem', attrs, content } : { type: 'listItem', content });

check('a marker attribute is written with no space before the brace',
    doc({ type: 'bulletList', content: [listItem({ class: 'c' }, para(text('A classed item.')))] }),
    '-{.c} A classed item.');

check('a marker attribute on a task item precedes the checkbox',
    doc({ type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: false, class: 'c' }, content: [para(text('t'))] },
    ] }),
    '-{.c} [ ] t');

check('a continuation block is indented to the attributed content column',
    doc({ type: 'bulletList', content: [
        listItem({ class: 'c' }, para(text('item')), para(text('para'))),
    ] }),
    '-{.c} item\n\n      para');

check('an alphabetic marker keeps its style and its ordinal',
    doc({ type: 'orderedList', attrs: { start: 2, olType: 'a', delim: '.' }, content: [
        listItem(null, para(text('x'))),
        listItem(null, para(text('y'))),
    ] }),
    'b. x\nc. y');

check('a roman marker keeps its style',
    doc({ type: 'orderedList', attrs: { start: 4, olType: 'i', delim: '.' }, content: [
        listItem(null, para(text('x'))),
    ] }),
    'iv. x');

check('an UPPERCASE roman marker stays uppercase',
    doc({ type: 'orderedList', attrs: { start: 4, olType: 'I', delim: ')' }, content: [
        listItem(null, para(text('x'))),
    ] }),
    'IV) x');

// The two styles overlap on single letters and the parser disambiguates by
// looking at the NEXT marker, so a one-item list has no writable token: roman 5
// written `v.` reads back as alphabetic 22. The decimal token keeps the ordinal.
check('an ambiguous single-letter roman token falls back to the decimal form',
    doc({ type: 'orderedList', attrs: { start: 5, olType: 'i', delim: '.' }, content: [
        listItem(null, para(text('x'))),
    ] }),
    '5. x');

check('the same token is written when a second item disambiguates it',
    doc({ type: 'orderedList', attrs: { start: 5, olType: 'i', delim: '.' }, content: [
        listItem(null, para(text('x'))),
        listItem(null, para(text('y'))),
    ] }),
    'v. x\nvi. y');

check('a bare-dot marker keeps its bare form',
    doc({ type: 'orderedList', attrs: { start: 1, delim: '.', bareMarker: true }, content: [
        listItem(null, para(text('x'))),
    ] }),
    '. x');

// --- link metadata -----------------------------------------------------------

const linked = (t, attrs) => ({ type: 'text', text: t, marks: [{ type: 'link', attrs }] });

check('an autolink is written in its own form, not as an inline link',
    doc(para(linked('https://e.com', { href: 'https://e.com', autolink: true }))),
    '<https://e.com>');

check('an email autolink carries the mailto the parser added',
    doc(para(linked('a@b.com', { href: 'mailto:a@b.com', autolink: true }))),
    '<a@b.com>');

// An autolink's content is LITERAL, so the escaped label must not be what the
// target is compared against - `*` in a URL used to downgrade the form.
check('an autolink containing an emphasis character keeps its form',
    doc(para(linked('https://e.com/a*b*', { href: 'https://e.com/a*b*', autolink: true }))),
    '<https://e.com/a*b*>');

check('an autolink whose text no longer matches its target writes the link form',
    doc(para(linked('edited', { href: 'https://e.com', autolink: true }))),
    '[edited](https://e.com)');

check('an attribute run on an autolink survives too',
    doc(para(linked('https://e.com', { href: 'https://e.com', autolink: true, id: 'id', class: 'c' }))),
    '<https://e.com>{#id .c}');

// The autolink form is decided before any mark wrapper, so emphasis wraps it
// rather than replacing it.
check('an autolink inside emphasis keeps both',
    doc(para({ type: 'text', text: 'https://e.com', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://e.com', autolink: true } }] })),
    '*<https://e.com>*');

check("a link's attribute run survives",
    doc(para(linked('t', { href: '/u', id: 'id', class: 'c' }))),
    '[t](/u){#id .c}');

check('an attribute run on a reference link follows the label',
    doc(para(linked('t', { href: '/u', ref: 'r', keyValues: { 'data-x': '1' } })), para(text(''))),
    '[t][r]{data-x="1"}\n\n[r]: /u');

// --- marks that had no reachable producer ------------------------------------

check('superscript and subscript write their braced forms',
    doc(para(text('a', 'superscript'), text('b', 'subscript'))),
    '{^a^}{,b,}');

check('insert and delete write their braced forms',
    doc(para(text('a', 'carveInsert'), text('b', 'carveDelete'))),
    '{+a+}{-b-}');

// The engines publish U+E000 for a no-break space they RESOLVED from `\ `, and
// `carve fmt` writes it back as that escape (markup-carve/carve#721). Asserted on the
// SOURCE, because the AST comparison cannot see this: `\ ` parses back to the
// same sentinel, so a serializer that emitted the raw codepoint round-tripped
// cleanly while writing a private-use character into the document.
check('a resolved no-break space is written as the escape, not the sentinel',
    doc(para(text('a\uE000b'))),
    'a\\ b');

check('a no-break space the author typed stays itself',
    doc(para(text('a\u00A0b'))),
    'a\u00A0b');

// A trailing backslash at the END of a block is a hard break, so the escape has
// no spelling in that one position - a real no-break space goes out instead.
check('a resolved no-break space at the end of a block becomes a real one',
    doc(para(text('a\uE000'))),
    'a\u00A0');

// Anywhere else the escape is what the engines parse back, including where the
// next thing is a space or a sibling span.
check('a resolved no-break space before a space keeps the escape',
    doc(para(text('a\uE000 b'))),
    'a\\  b');

// Inside a MARKED run the mark's closing delimiter follows, and a resolved space
// before it kills the span - so that position takes a real no-break space even
// though a sibling follows.
check('a resolved no-break space at the end of a bold run keeps the span',
    doc(para(text('a\uE000', 'bold'))),
    '*a\u00A0*');

check('a resolved no-break space before a sibling span keeps the escape',
    doc(para(text('a\uE000'), text('b', 'bold'))),
    'a\\ *b*');

// `String.prototype.trim` eats U+00A0. It is content, not layout.
check('a no-break space at either edge survives the final trim',
    doc(para(text('\u00A0a\u00A0'))),
    '\u00A0a\u00A0');

console.log(`\n${passed} passed`);
