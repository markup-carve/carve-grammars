/**
 * TextMate: gaps a character-level differential against the carve-js next2
 * tree found, one group per class.
 *
 * - A code fence opens with further words, a glued brace block or a wide
 *   language word behind its run (C2-B-117, C2-B-118, C2-B-122).
 * - A task box stands after an ordered marker as after a bullet (C2-B-046).
 * - A line comment in a line block body is text (C2-B-135).
 * - A backslash before trailing spaces is a hard break (C2-I-011, C2-I-102).
 * - An inline link may have empty text, and its title quotes are scoped (C2-I-067).
 * - A link definition needs a destination (C2-B-083).
 * - A div title reads escapes (C2-B-120).
 * - A caption attaches below an include line (C2-B-156).
 * - A nested list marker ends a term opened on an item's marker line (C2-B-234),
 *   in a quote too.
 * - A line comment in a bracket or braced form takes its closer (C2-I-023, C2-I-024).
 * - A footnote or description marker line opens a fence, a heading or a term
 *   (C2-B-087, C2-B-057).
 * - `[^` opens a footnote reference or text, never a span or a link (C2-I-087),
 *   and inside an inline note it is an ordinary bracket (C2-I-089).
 * - A closer of an outer form inside a later braced form closes the outer form.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { covered, textmateLineTokenizer } from './lib/textmate-lines.js';

const tokenize = await textmateLineTokenizer(resolve('textmate/carve.tmLanguage.json'));
const has = (source, scope) => covered(tokenize, source, scope);
let count = 0;
const check = (actual, expected, label) => { assert.equal(actual, expected, label); count++; };

// Fence openers: the block opens, so the body is code and the closer is no opener.
for (const [opener, language] of [
    ['```js {.c}', 'js'],
    ['```js{.c}', 'js'],
    ['```js b', 'js'],
    ['```python title', 'python'],
    ['```js "T" junk', 'js'],
    ['```js "a\\"b"', 'js'],
    ['```=html{.x}', '=html'],
    ['```=html~', '=html'],
    ['```c++', 'c++'],
    ['```text/plain', 'text/plain'],
    ['```  b', ''],
    ['```\tjs', ''],
]) {
    const source = `${opener}\nx *a*\n\`\`\`\n\nafter *b*\n`;
    check(has(source, 'markup.raw.code.carve'), 'x *a*', `body is code: ${JSON.stringify(opener)}`);
    check(has(source, 'fenced_code.block.language.carve'), language, `language: ${JSON.stringify(opener)}`);
    check(has(source, 'markup.bold.carve'), 'b', `text after the block: ${JSON.stringify(opener)}`);
}
// A language rule takes its whole word: `jsx` is not `js` with further words.
check(has('```jsx\nx\n```\n', 'meta.embedded.block.javascript'), '', '```jsx is no js block');
// A backtick in the info string opens nothing (C2-B-118).
check(has('```js `x`\ny\n```\n', 'markup.raw.code.carve'), '', 'backtick in the info string');
check(has('```js "T"\nx\n```\n', 'string.quoted.double.fenced.title.carve'), '"T"', 'title after a language');

// Task boxes on ordered markers.
for (const marker of ['1.', '2)', '.', 'a)', 'II)']) {
    const source = `${marker} [x] task\n`;
    check(has(source, 'punctuation.definition.checkbox.carve'), '[]', `box after ${marker}`);
    check(has(source, 'constant.language.checkbox.carve'), 'x', `box state after ${marker}`);
}
check(has('1. [x]\n', 'punctuation.definition.checkbox.carve'), '', 'a box with nothing behind it is text');

// Line block bodies.
{
    const source = '::: |\na %% b\n%% c\n%% #region x\n%%%\nhidden\n%%%\n:::\n';
    check(has(source, 'comment.line.percent.carve'), '', 'no line comment in a line block');
    check(has(source, 'comment.block.carve').includes('hidden'), true, 'a block comment stays hidden');
}

// Hard breaks.
check(has('a\\  \nb\n', 'constant.character.escape.hard-break.carve'), '\\', 'backslash before trailing spaces');
check(has('a\\ b\n', 'constant.character.escape.hard-break.carve'), '', 'a backslash space inside a line is no break');

// Inline links.
check(has('[](/u) x\n', 'markup.underline.link.carve'), '/u', 'empty link text');
check(has('[a](/u "T") x\n', 'punctuation.definition.string.begin.carve'), '"', 'title opening quote');
check(has("[a](/u 'T') x\n", 'punctuation.definition.string.end.carve'), "'", 'title closing quote');
check(has('[a](/u "T") x\n', 'string.other.link.description.carve'), 'T', 'title text');

// Link definitions.
for (const source of ['[a]:\n', '[a]:   \n', '[ ]:\n']) {
    check(has(source, 'meta.link.reference.def.carve'), '', `no definition: ${JSON.stringify(source)}`);
}
check(has('[a]: /u\n', 'markup.underline.link.carve'), '/u', 'a definition with a destination');

// Div titles.
{
    const source = '::: note "a \\"c\\""\nx\n:::\n';
    check(has(source, 'invalid.illegal.container-metadata.carve'), '', 'escaped quote in a title');
    check(has(source, 'string.quoted.double.admonition.title.carve'), '"a \\"c\\""', 'the whole title');
}

// Include captions.
for (const include of ['{{ a.crv }}', '{{ a.crv @code }}', '{{ t.csv @code:csv }}']) {
    check(has(`${include}\n^ Cap\n`, 'markup.caption.carve'), 'Cap', `caption below ${include}`);
}
check(has('{.x}\n^ Cap\n', 'markup.caption.carve'), '', 'a caption below an attribute line is text');

// Terms on an item's marker line.
check(has('- :: t\n     - x\n', 'entity.name.tag.definition.term.carve'), 't', 'nested bullet ends the term');
check(has('1. :: t\n      1. x\n', 'entity.name.tag.definition.term.carve'), 't', 'nested ordered marker ends the term');
check(has('- :: t\n     2. x\n', 'entity.name.tag.definition.term.carve'), 't     2. x', 'an ordered marker of another value continues the term (C2-B-015)');
check(has('- :: t\n     more\n', 'entity.name.tag.definition.term.carve'), 't     more', 'other lines continue the term');
check(has(':: t\n  - x\n', 'entity.name.tag.definition.term.carve'), 't  - x', 'outside an item the marker line continues the term');

// A quoted term on an item's marker line.
check(has('> - :: t\n>      - x\n', 'entity.name.tag.definition.term.carve'), 't', 'nested bullet ends a quoted term');
check(has('> - :: t\n>      more\n', 'entity.name.tag.definition.term.carve'), 't     more', 'other lines continue a quoted term');

// A line comment in a bracket or braced form takes its closer, so the form does not close.
for (const [source, scope] of [
    ['[a %% b](/u) z\n', 'markup.underline.link.carve'],
    ['[a %% b][r] z\n', 'constant.other.reference.link.carve'],
    ['[x][a %% b] z\n', 'constant.other.reference.link.carve'],
    ['![a][b %% c] z\n', 'constant.other.reference.link.carve'],
    ['[a %% b]{.c} z\n', 'punctuation.definition.span.carve'],
    ['^[a %% c] z\n', 'string.other.footnote.inline.carve'],
    ['[^a %% b] z\n', 'constant.other.footnote.carve'],
    [':foo[a %% c] z\n', 'entity.name.function.extension.carve'],
    ['{_a %% b_} z\n', 'markup.underline.text.carve'],
    ['{*a %% b*} z\n', 'markup.bold.carve'],
    ['{=a %% b=} z\n', 'markup.highlight.carve'],
    ['/a %% b/ z\n', 'markup.italic.carve'],
    ['{/a %% b/} z\n', 'markup.italic.carve'],
]) {
    check(has(source, scope), '', `no form: ${JSON.stringify(source)}`);
    check(has(source, 'comment.line.percent.carve'), source.slice(source.indexOf('%%'), -1), `comment to the line end: ${JSON.stringify(source)}`);
}
check(has('[a `x %% y` b](/u)\n', 'markup.underline.link.carve'), '/u', 'a %% in a code span is code');
check(has('[a `]` b](/u)\n', 'markup.underline.link.carve'), '/u', 'a ] in a code span is code');
check(has('[a %%b](/u)\n', 'markup.underline.link.carve'), '', 'a comment needs no space behind the %%');
check(has('[%% b](/u)\n', 'markup.underline.link.carve'), '/u', 'a %% right behind the opener is text');
check(has('![a %% b](/u)\n', 'markup.underline.link.image.carve'), '/u', 'image alt text holds no comment');

// Blocks on a footnote marker line.
check(has('[^1]: ```js\n      let a\n      ```\n\nx\n', 'markup.raw.code.carve'), '      let a', 'a fence on a footnote marker line');
check(has('[^1]: ```\n  a\nb\n', 'markup.raw.code.carve'), '  a', 'the fence ends with the note');
check(has('[^1]: ```\n  a\n```\nb\n', 'fenced_code.block.language.carve'), '', 'a closer left of the body is no closer');
check(has('[^2]: = Head\n  more\n', 'entity.name.section.carve'), 'Head', 'a heading on a footnote marker line ends with its line');
check(has('[^3]: :: t\n  more\n', 'entity.name.tag.definition.term.carve'), 't', 'a term on a footnote marker line ends with its line');

// Blocks on a description marker line.
check(has(':: term\n: ```js\n  let a\n  ```\n\nx\n', 'markup.raw.code.carve'), '  let a', 'a fence on a description marker line');
check(has(':: term\n: ```\n  a\nb\n', 'markup.raw.code.carve'), '  a', 'the fence ends with the description');
check(has(':: term\n:   ```\n    a\n b\n', 'markup.raw.code.carve'), '    a b', 'any indented line continues the fence');
check(has('[^1]: ```\n a\nb\n', 'markup.raw.code.carve'), ' a', 'a line indented one column continues a fence in a note');
check(has(':: term\n: = H\n', 'entity.name.section.carve'), 'H', 'a heading on a description marker line');
check(has(':: term\n: :: t\n', 'entity.name.tag.definition.term.carve'), 'termt', 'a term on a description marker line');

// Footnote references.
check(has('a [^n]{.c} b\n', 'punctuation.definition.span.carve'), '', 'no span at [^');
check(has('a [^n]{.c} b\n', 'constant.other.footnote.carve'), 'n', 'a footnote reference with attributes');
check(has('a [^n](/u) b\n', 'markup.underline.link.carve'), '', 'a footnote reference takes no link tail');
check(has('a [^ ]{.c} b\n', 'punctuation.definition.span.carve'), '', 'a blank label is text and opens no span');
check(has('^[a [^1](u) c]\n', 'markup.underline.link.carve'), 'u', 'in an inline note [^ is an ordinary bracket');
check(has('[^[b]\\]][]\n', 'constant.other.footnote.carve'), '', 'a footnote label holds no bracket');

// Crossing closers.
check(has('*a {/b*/} c\n', 'markup.bold.carve'), 'a {/b', 'a strong closer inside a braced italic closes the strong span');
check(has('*a {/b*/} c\n', 'markup.italic.carve'), '', 'and leaves the braced opener text');
check(has('*a {=b*=} c\n', 'markup.highlight.carve'), '', 'the same for highlight');
check(has('*a {/b `*` c/} d*\n', 'markup.italic.carve'), 'b `*` c', 'a closer in code does not cross');
check(has('*a {/b*c/} d*\n', 'markup.italic.carve'), 'b*c', 'a non-flanking star does not cross');
check(has('*a {/b {*c*} d/} e*\n', 'markup.italic.carve'), 'b {*c*} d', 'a closer of a nested braced strong does not cross');
check(has('/a {*b/*} c\n', 'markup.italic.carve'), 'a {*b', 'a slash closer inside a braced strong closes the italic');
check(has('{*a {/b*} c/}\n', 'markup.bold.carve'), 'a {/b', 'a braced closer crosses a later braced form');
check(has('{/a/ b\n', 'markup.italic.carve'), '', 'a slash behind a brace opens no bare italic');
check(has('{*a* b\n', 'markup.bold.carve'), '', 'a star behind a brace opens no bare strong');

console.log(`textmate differential gaps: ${count} assertions passed`);
