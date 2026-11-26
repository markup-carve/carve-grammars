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
 * - A nested list marker ends a term opened on an item's marker line (C2-B-234).
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

console.log(`textmate differential gaps: ${count} assertions passed`);
