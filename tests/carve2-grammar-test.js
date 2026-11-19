import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

import Prism from 'prismjs';
import hljs from 'highlight.js';
import carve2 from '../highlightjs/carve2.mjs';
import { covered, textmateLineTokenizer } from './lib/textmate-lines.js';

globalThis.Prism = Prism;
await import('../prism/carve.js');
const v1ContainerMatcher = Prism.languages.carve['code-block-in-container'].pattern;
const v1ContainerExec = v1ContainerMatcher.exec;
const v1QuoteMatchers = Prism.languages.carve.blockquote
    .filter(rule => rule?.pattern?.source === '(?:)' && Object.hasOwn(rule.pattern, 'exec'))
    .map(rule => [rule.pattern, rule.pattern.exec]);
const v1FenceSource = '- item\n  ~~~\n  *x*\n  ~~~\n';
const v1TokensBefore = JSON.stringify(Prism.tokenize(v1FenceSource, Prism.languages.carve));
await import('../prism/carve2.js');
assert.strictEqual(v1ContainerMatcher.exec, v1ContainerExec, '0.1 container matcher stays unchanged');
for (const [pattern, exec] of v1QuoteMatchers) {
    assert.strictEqual(pattern.exec, exec, '0.1 quote matcher stays unchanged');
}
assert.equal(JSON.stringify(Prism.tokenize(v1FenceSource, Prism.languages.carve)), v1TokensBefore,
    '0.1 nested tilde fence stays unchanged after loading 0.2');
hljs.registerLanguage('carve2', carve2);
const tokenizeTextMate = await textmateLineTokenizer(resolve('textmate/carve2.tmLanguage.json'));
const cases = JSON.parse(readFileSync(new URL('./carve2-spec-cases.json', import.meta.url), 'utf8'));
execFileSync(process.execPath, ['scripts/build-carve2-textmate.mjs', '--check']);

function prismLeaves(source) {
    const out = [];
    const visit = (node, scope = 'text') => {
        if (typeof node === 'string') {
            if (node) out.push([scope, node]);
        } else if (Array.isArray(node)) node.forEach(child => visit(child, scope));
        else visit(node.content, scope === 'text' ? node.type : `${scope}>${node.type}`);
    };
    visit(Prism.tokenize(source, Prism.languages.carve2));
    return out;
}

const snapshots = Object.fromEntries(cases.map(({ id, input }) => [id, {
    prism: prismLeaves(input),
    highlightjs: hljs.highlight(input, { language: 'carve2' }).value,
    textmate: tokenizeTextMate(input).map(({ scope, text }) => [scope, text]),
}]));
const snapshotPath = new URL('./snapshots/carve2.json', import.meta.url);
const serialized = JSON.stringify(snapshots, null, 2) + '\n';
if (process.env.UPDATE_CARVE2_SNAPSHOTS === '1') writeFileSync(snapshotPath, serialized);
else assert.equal(serialized, readFileSync(snapshotPath, 'utf8'), '0.2 spec case token snapshots');

function hasPrism(source, type) {
    return prismLeaves(source).some(([scope]) => scope.split('>').includes(type));
}
function hasHljs(source, scope) {
    return hljs.highlight(source, { language: 'carve2' }).value.includes(`class="hljs-${scope}"`);
}
function hasTextMate(source, scope) {
    return covered(tokenizeTextMate, source, scope).length > 0;
}

for (const [source, prism, highlight, textmate] of [
    ['= Heading\n', 'title', 'section', 'markup.heading.carve'],
    ['***\n', 'thematic-break', 'meta', 'meta.separator.thematic-break.carve'],
    ['```js\nx\n```\n', 'code-block', 'code', 'markup.fenced_code.block.carve'],
    ['%% #region name\n', 'region-marker', 'comment', 'comment.line.percent.carve'],
    ['a {_underlined_} b', 'forced-underline', 'emphasis', 'markup.underline.text.carve'],
    ['{~struck~}', 'forced-strike', 'deletion', 'markup.strikethrough.carve'],
    ['{=marked=}', 'highlight', 'addition', 'markup.highlight.carve'],
    ['{^sup^}', 'superscript', 'built_in', 'markup.superscript.carve'],
    ['{,sub,}', 'subscript', 'built_in', 'markup.subscript.carve'],
]) {
    assert.ok(hasPrism(source, prism), `Prism ${prism}: ${source}`);
    assert.ok(hasHljs(source, highlight), `highlight.js ${highlight}: ${source}`);
    assert.ok(hasTextMate(source, textmate), `TextMate ${textmate}: ${source}`);
}

for (const [source, prism, highlight, textmate] of [
    ['a\n\n---\n', 'thematic-break', 'meta', 'meta.separator.thematic-break.carve'],
    ['~~~js\nx\n~~~\n', 'code-block', 'code', 'markup.fenced_code.block.carve'],
    ['_underlined_', 'underline', 'emphasis', 'markup.underline.text.carve'],
    ['~struck~', 'strike', 'deletion', 'markup.strikethrough.carve'],
    ['=marked=', 'highlight', 'addition', 'markup.highlight.carve'],
]) {
    assert.ok(!hasPrism(source, prism), `Prism removed ${prism}: ${source}`);
    assert.ok(!hasHljs(source, highlight), `highlight.js removed ${highlight}: ${source}`);
    assert.ok(!hasTextMate(source, textmate), `TextMate removed ${textmate}: ${source}`);
}
assert.ok(!hasPrism('| a | b |\n|---|---|\n', 'table-separator'));
assert.ok(!hasTextMate('|=> a | b |', 'keyword.operator.table.alignment.carve'));
assert.ok(!hasHljs('|=> a | b |', 'table-alignment'));
assert.ok(!hasPrism('+\n', 'continuation-marker'));
assert.ok(!hasHljs('- first\n+\n> second\n', 'punctuation'));
assert.ok(!hasTextMate('- first\n+\n> second\n', 'punctuation.definition.list.continuation.carve'));
assert.ok(!hasPrism('{.a\n .b}\np', 'attributes'));
assert.ok(!hasHljs('{.a\n .b}\np', 'attr'));
assert.ok(!hasTextMate('{.a\n .b}\np', 'meta.attributes.carve'));
assert.ok(hasPrism('{.a}\np', 'attributes'));
assert.ok(hasHljs('{.a}\np', 'attr'));
assert.ok(!hasTextMate('text\n# Heading', 'markup.heading.carve'));
assert.ok(hasTextMate('text\n\n# Heading', 'markup.heading.carve'));
assert.ok(!hasTextMate('|=a|', 'keyword.operator.table.header.carve'));
assert.ok(hasTextMate('|= a|', 'keyword.operator.table.header.carve'));
assert.ok(hasPrism('a. one\nb. two\n', 'letter-list-marker'));
assert.ok(hasHljs('a. one\nb. two\n', 'bullet'));
assert.ok(hasTextMate('a. one\nb. two\n', 'punctuation.definition.list.numbered.carve'));
assert.ok(hasPrism('|={>} a |', 'attributes'));
assert.ok(hasHljs('|={>} a |', 'table-alignment'));
assert.ok(hasTextMate('|={>} a |', 'keyword.operator.table.alignment.carve'));
const commentWithFalseCloser = '%%%\nhidden\n%%% visible?\nafter\n%%%\n';
assert.ok(prismLeaves(commentWithFalseCloser).some(([scope, text]) => scope === 'comment' && text.includes('after')));
assert.ok(hljs.highlight(commentWithFalseCloser, { language: 'carve2' }).value.includes('after\n%%%'));
assert.ok(covered(tokenizeTextMate, commentWithFalseCloser, 'comment.block.carve').includes('after'));
for (const source of ['{:fr}\np', '{.a :fr}\np']) {
    assert.ok(hasPrism(source, 'attributes'), `Prism language attributes: ${source}`);
    assert.ok(hasHljs(source, 'attr'), `highlight.js language attributes: ${source}`);
}
for (const source of ['{:a--b}\np', '{:abcdefghij}\np', 'hello {foo} world', 'hello {.a} world']) {
    assert.ok(!hasPrism(source, 'attributes'), `Prism refused attributes: ${source}`);
    assert.ok(!hasHljs(source, 'attr'), `highlight.js refused attributes: ${source}`);
}
assert.ok(hasPrism('```js\nx\n````\n*bold*\n', 'bold'));
assert.ok(!hasPrism('````js\nx\n```\n*bold*\n````\n', 'bold'));
assert.ok(hasPrism('```\n*bold*\n', 'code-block-unclosed'));
assert.ok(!hasPrism('```\n*bold*\n', 'bold'));
for (const [source, scope] of [
    ['\uFEFF# Heading\n', 'title'],
    ['\uFEFF= Heading\n', 'title'],
    ['\uFEFF***\n', 'thematic-break'],
    ['\uFEFF%% #region name\n', 'region-marker'],
    ['\uFEFFa. one\n', 'letter-list-marker'],
]) {
    assert.ok(hasPrism(source, scope), `Prism document-start BOM ${scope}: ${source}`);
    assert.ok(!hasPrism(`text\n\n${source}`, scope), `Prism later BOM ${scope}: ${source}`);
}
assert.ok(!prismLeaves('{=open\n\n# Heading\ntext=}').some(([scope, text]) =>
    scope.includes('highlight') && text.includes('# Heading')));
assert.ok(hasPrism('{=open\ncontinued=}', 'highlight'));
assert.ok(prismLeaves('= Heading\n').some(([scope, text]) => scope === 'title>punctuation' && text === '='));
for (const [source, scope] of [
    ['\uFEFF= Heading\n', 'section'],
    ['\uFEFF***\n', 'meta'],
    ['\uFEFFa. one\n', 'bullet'],
    ['\uFEFF%% #region name\n', 'comment'],
]) {
    assert.ok(hasHljs(source, scope), `highlight.js document-start BOM ${scope}: ${source}`);
    assert.ok(!hasHljs(`text\n\n${source}`, scope), `highlight.js later BOM ${scope}: ${source}`);
}
assert.ok(hasTextMate('\uFEFFa. one\n', 'punctuation.definition.list.numbered.carve'));
assert.ok((await import('@markup-carve/carve-grammars/highlightjs/carve2.mjs')).default);
assert.ok(hasTextMate('text\n%%%\nhidden\n%%%\n', 'comment.block.carve'));
assert.ok(hasTextMate('text\n%% note\n', 'comment.line.percent.carve'));
const textmateGrammar = JSON.parse(readFileSync('textmate/carve2.tmLanguage.json', 'utf8'));
assert.ok(JSON.stringify(textmateGrammar).includes('source.carve2'));
assert.ok(!JSON.stringify(textmateGrammar).includes('"include":"source.carve"'));
const letterItemWithFence = 'a. one\n   ```\n   code\n   ```\nafter\n';
assert.ok(!tokenizeTextMate(letterItemWithFence).some(({ scope, text }) =>
    text.includes('after') && scope.includes('markup.raw.code.carve')));
const quotedCommentWithFalseCloser = '> %%%\n> hidden\n> %%% visible?\n> after\n> %%%\n';
assert.ok(tokenizeTextMate(quotedCommentWithFalseCloser).some(({ scope, text }) =>
    text.includes('after') && scope.includes('comment.block.carve')));
assert.ok(!tokenizeTextMate('```\nx\n```\nafter\n').some(({ scope, text }) =>
    text.includes('after') && scope.includes('markup.raw.code.carve')));
assert.ok(tokenizeTextMate('= H\n  cont\n').some(({ scope, text }) =>
    text.includes('cont') && scope.includes('markup.heading.carve')));
assert.ok(!tokenizeTextMate('= H\nplain\n').some(({ scope, text }) =>
    text.includes('plain') && scope.includes('markup.heading.carve')));
assert.ok(tokenizeTextMate('= H\n%% note\n  cont\n').some(({ scope, text }) =>
    text.includes('cont') && scope.includes('markup.heading.carve')));
assert.ok(!tokenizeTextMate('= H\n%% #region x\n  cont\n').some(({ scope, text }) =>
    text.includes('cont') && scope.includes('markup.heading.carve')));
assert.ok(hasTextMate('= H\n  ***\nafter\n', 'meta.separator.thematic-break.carve'));
const falseQuotedCommentCloser = '> %%%\n> hidden\n> %%% visible?\n> after\n> %%%\n';
assert.ok(prismLeaves(falseQuotedCommentCloser).some(([scope, text]) =>
    scope.includes('comment') && text.includes('after')));
assert.ok(!hasPrism('text\n= Heading\n', 'title'));
assert.ok(!hasHljs('text\n= Heading\n', 'section'));
assert.ok(hasPrism('text\n\n= Heading\n', 'title'));
assert.ok(hasHljs('text\n\n= Heading\n', 'section'));
assert.ok(prismLeaves('# First\n= Second\n').some(([scope, text]) =>
    scope.startsWith('title') && text.includes('Second')));
assert.ok(hljs.highlight('# First\n= Second\n', { language: 'carve2' }).value.includes('<span class="hljs-section">= Second</span>'));
assert.ok(!hasPrism('text\n= fake\n= fake2\n', 'title'));
assert.ok(!hasHljs('text\n= fake\n= fake2\n', 'section'));
assert.ok(prismLeaves('= First\n= Second\n').some(([scope, text]) =>
    scope.startsWith('title') && text.includes('Second')));
assert.ok(hljs.highlight('= First\n= Second\n', { language: 'carve2' }).value.includes('<span class="hljs-section">= Second</span>'));
for (const source of ['- item\n= Heading\n', '- item\n# Heading\n', '- item\n== Heading\n', '- item\n## Heading\n', '1. item\n= Heading\n', 'a. item\n= Heading\n', '> quote\n= Heading\n', '> quote\n# Heading\n', '> - item\n= Heading\n', '> - item\n# Heading\n', '> - item\n== Heading\n', '> - item\n## Heading\n']) {
    assert.ok(!hasTextMate(source, 'markup.heading.carve'), `TextMate lazy heading: ${source}`);
}
for (const source of ['- item\n\n= Heading\n', '> quote\n\n= Heading\n']) {
    assert.ok(hasTextMate(source, 'markup.heading.carve'), `TextMate heading after blank line: ${source}`);
}
for (const eol of ['\r', '\r\n']) {
    const paragraph = `text${eol}= Heading${eol}`;
    const separated = `text${eol}${eol}= Heading${eol}`;
    assert.ok(!hasPrism(paragraph, 'title'), `Prism paragraph with ${JSON.stringify(eol)}`);
    assert.ok(!hasHljs(paragraph, 'section'), `highlight.js paragraph with ${JSON.stringify(eol)}`);
    assert.ok(hasPrism(separated, 'title'), `Prism heading with ${JSON.stringify(eol)}`);
    assert.ok(hasHljs(separated, 'section'), `highlight.js heading with ${JSON.stringify(eol)}`);
}
assert.ok(prismLeaves('text\n= fake\n\n= real\n').some(([scope, text]) =>
    scope.startsWith('title') && text.includes('real')));
assert.ok(hljs.highlight('text\n= fake\n\n= real\n', { language: 'carve2' }).value.includes('<span class="hljs-section">= real</span>'));
for (const source of ['- item\n  ~~~js\n  code\n  ~~~\n', '> ~~~js\n> code\n> ~~~\n']) {
    assert.ok(!hasPrism(source, 'code-block-in-container'), `Prism removed tilde container fence: ${source}`);
}
for (const source of ['- item\n  ```js\n  code\n  ```\n', '> ```js\n> code\n> ```\n']) {
    assert.ok(hasPrism(source, 'code-block-in-container') || hasPrism(source, 'code-block'), `Prism backtick container fence: ${source}`);
}
for (const source of [' # H\n', ' = H\n']) {
    assert.ok(hasTextMate(source, 'markup.heading.carve'), `TextMate indented 0.2 heading: ${source}`);
}
assert.ok(!hasPrism('text\n# Heading\n', 'title'));
assert.ok(!hasHljs('text\n# Heading\n', 'section'));
assert.ok(hasPrism('text\n\n# Heading\n', 'title'));
assert.ok(hasHljs('text\n\n# Heading\n', 'section'));
assert.ok(prismLeaves('# First\n# Second\n').some(([scope, text]) =>
    scope.startsWith('title') && text.includes('Second')));
assert.ok(hljs.highlight('# First\n# Second\n', { language: 'carve2' }).value.includes('<span class="hljs-section"># Second</span>'));
const theme = readFileSync('themes/carve-code.css', 'utf8');
assert.ok(theme.includes(':where(code.language-carve2, .language-carve2 > code) > .hljs-title'));
assert.ok(theme.includes(':where(.language-carve2) .token.caption'));

// C2-B-081: a definition stands at column 0 outside every container.
let definitionAssertions = 0;
const definitionScope = /meta\.link\.reference\.def\.carve|meta\.abbreviation\.carve/;
const scoped = (source, pattern) => tokenizeTextMate(source).some(({ scope, text }) => pattern.test(scope) && text.trim());
for (const source of [
    '- a\n\n  [r]: /u\n', ' [a]: /u\n', '  *[HTML]: Hyper\n', '- a\n\n  *[HTML]: Hyper\n', '- *[HTML]: Hyper\n',
    '- a\n[r]: /u\n', '- a\n  [r]: /u\n', '1. a\n\n   [r]: /u\n', '- [ ] a\n[r]: /u\n', '- a\n\n  b\n[r]: /u\n',
    '> *[HTML]: Hyper\n', '::: note\n[r]: /u\n:::\n', '[^n]: x\n\n    [r]: /u\n', 'text\n[r]: /u\n',
]) {
    assert.ok(!scoped(source, definitionScope), `TextMate definition in a container is text: ${JSON.stringify(source)}`);
    definitionAssertions++;
}
for (const source of ['[r]: /u\n', '*[HTML]: Hyper\n', '- a\n\n[r]: /u\n', '- a\n\n  b\n\n[r]: /u\n', '- [ ] a\n\n[r]: /u\n', '1. a\n\n*[HTML]: Hyper\n']) {
    assert.ok(scoped(source, definitionScope), `TextMate document definition: ${JSON.stringify(source)}`);
    definitionAssertions++;
}
assert.ok(!scoped('- a\n\n  [^n]: x\n', /punctuation\.separator\.carve/), 'TextMate footnote definition in an item is text');
assert.ok(scoped('- a\n\n[^n]: x\n', /punctuation\.separator\.carve/), 'TextMate footnote definition after a list');
definitionAssertions += 2;
// A footnote body is a container too: a nested footnote definition is body text.
const lineScoped = (source, line, pattern) => {
    const lines = [[]];
    for (const leaf of tokenizeTextMate(source)) {
        if (leaf.scope === '' && /^[\r\n]+$/.test(leaf.text)) lines.push([]);
        else lines.at(-1).push(leaf);
    }
    return lines[line].some(({ scope, text }) => pattern.test(scope) && text.trim());
};
for (const [source, line] of [['[^m]: x\n\n    [^n]: note\n', 2], ['[^m]: x\n\n  [^n]: note\n', 2], ['[^m]: x\n  [^n]: note\n', 1]]) {
    assert.ok(lineScoped(source, 0, /punctuation\.separator\.carve/), `TextMate footnote host: ${JSON.stringify(source)}`);
    assert.ok(!lineScoped(source, line, /punctuation\.separator\.carve/), `TextMate footnote definition in a footnote body is text: ${JSON.stringify(source)}`);
    definitionAssertions += 2;
}
for (const [source, text] of [['- a\n\n  [r]: /u\n', true], ['- [r]: /u\n', true], ['- *[A]: b\n', true], ['::: note\n[r]: /u\n:::\n', true], ['text\n[r]: /u\n', true], ['- a\n\n[r]: /u\n', false], ['[r]: /u\n[s]: /v\n', false]]) {
    const prismHit = hasPrism(source, 'reference-definition') || hasPrism(source, 'abbreviation-definition');
    const html = hljs.highlight(source, { language: 'carve2' }).value;
    const hljsHit = html.includes('hljs-symbol">[') || html.includes('hljs-symbol">*[');
    assert.equal(prismHit, !text, `Prism definition placement: ${JSON.stringify(source)}`);
    assert.equal(hljsHit, !text, `highlight.js definition placement: ${JSON.stringify(source)}`);
    definitionAssertions += 2;
}
assert.ok(prismLeaves('[r]: /u\n[s]: /v\n').filter(([scope]) => scope.startsWith('reference-definition')).length > 1);
definitionAssertions++;

// A star break on a marker line or after a blank line in an item is a break.
for (const source of ['- ***\n', '1. ***\n', '- - ***\n', '- [ ] ***\n', '- a\n\n  ***\n', '- a\n\n  - b\n\n    ***\n']) {
    assert.ok(hasTextMate(source, 'meta.separator.thematic-break.carve'), `TextMate break in an item: ${JSON.stringify(source)}`);
    definitionAssertions++;
}
for (const source of ['- ***x\n', '- a ***\n']) {
    assert.ok(!hasTextMate(source, 'meta.separator.thematic-break.carve'), `TextMate no break: ${JSON.stringify(source)}`);
    definitionAssertions++;
}
// C2-B-159: a star break behind a quote prefix of any depth, with or without item markers.
for (const source of [
    '> ***\n', '> > ***\n', '> > > ****  \n', ' > ***\n', '>  ***\n', '> - ***\n', '> 1. ***\n', '> A.  ***\n', '> - [ ] ***\n',
    '> - - ***\n', '> a\n> ***\n', '> > a\n> > ***\n', '> - a\n> ***\n', '> - a\n>   ***\n', '> - a\n>\n>   ***\n',
    '- > ***\n', '1. > ***\n', '- [ ] > ***\n', '> - > ***\n', '- a\n\n  > ***\n', '> # H\n> ***\n',
]) {
    assert.ok(hasTextMate(source, 'meta.separator.thematic-break.carve'), `TextMate break in a quote: ${JSON.stringify(source)}`);
    definitionAssertions++;
}
for (const source of ['> ***x\n', '> *** x\n', '> * * *\n', '> a ***\n', '>> ***\n', '>\t***\n', '> ---\n', '> ___\n', '> **\n', '> ```\n> ***\n> ```\n']) {
    assert.ok(!hasTextMate(source, 'meta.separator.thematic-break.carve'), `TextMate no break in a quote: ${JSON.stringify(source)}`);
    definitionAssertions++;
}
assert.equal(covered(tokenizeTextMate, '> - [ ] ***\n', 'punctuation.definition.quote.carve'), '>');
definitionAssertions++;
// A description list after a blank line in an item keeps its marks.
for (const source of ['- outer\n\n  :: t\n  : x\n', '- outer\n\n  :: t\n  : ```js\n    code\n    ```\n', '1. outer\n\n   :: t\n\n   : x\n', '- a\n\n:: t\n: x\n']) {
    const marks = covered(tokenizeTextMate, source, 'punctuation.definition.list.definition.carve');
    assert.ok(marks.includes('::') && marks.includes(':'), `TextMate description marks: ${JSON.stringify(source)}`);
    definitionAssertions++;
}
for (const source of ['- a\n:: t\n: x\n', '- [ ] a\n:: t\n: x\n']) {
    assert.ok(!hasTextMate(source, 'punctuation.definition.list.definition.carve'), `TextMate lazy description marks are text: ${JSON.stringify(source)}`);
    definitionAssertions++;
}
assert.ok(hasTextMate('- a\n\n  ```js\n  x\n  ```\n', 'markup.fenced_code.block.carve'));
definitionAssertions++;

// C2-B-040: an uppercase marker with a dot needs two spaces, every other marker one.
const markerScope = 'punctuation.definition.list.numbered.carve';
for (const [source, marker] of [
    ['J. R. R. Tolkien wrote it\n', false], ['A. Smith went home.\n', false], ['II. Background\n', false], ['A.{.c} x\n', false], ['> A. x\n', false],
    ['A.  Smith\n', true], ['IV.  x\n', true], ['iv. one space\n', true], ['a. alpha\n', true], ['A) one\n', true], ['a.{.c} x\n', true], ['A.{.c}  x\n', true], ['> a. x\n', true], ['> A.  x\n', true],
]) {
    assert.equal(hasTextMate(source, markerScope), marker, `TextMate marker: ${JSON.stringify(source)}`);
    if (!source.startsWith('>') && !source.includes('{') && !source.includes(')')) {
        assert.equal(hasPrism(source, 'letter-list-marker'), marker, `Prism marker: ${JSON.stringify(source)}`);
        assert.equal(hasHljs(source, 'bullet'), marker, `highlight.js marker: ${JSON.stringify(source)}`);
        definitionAssertions += 2;
    }
    definitionAssertions++;
}
assert.ok(!hasTextMate('- a\n\n  B. x\n', markerScope));
definitionAssertions++;

console.log(`Carve 0.2: ${cases.length} spec case snapshots and ${166 + definitionAssertions} scope assertions passed`);
