import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

import Prism from 'prismjs';
import hljs from 'highlight.js';
import carve2 from '../highlightjs/carve2.mjs';
import { covered, textmateLineTokenizer } from './lib/textmate-lines.js';

globalThis.Prism = Prism;
await import('../prism/carve2.js');
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
for (const source of ['- item\n= Heading\n', '- item\n# Heading\n', '1. item\n= Heading\n', 'a. item\n= Heading\n', '> quote\n= Heading\n', '> quote\n# Heading\n', '> - item\n= Heading\n', '> - item\n# Heading\n']) {
    assert.ok(!hasTextMate(source, 'markup.heading.carve'), `TextMate lazy heading: ${source}`);
}
for (const source of ['- item\n\n= Heading\n', '> quote\n\n= Heading\n']) {
    assert.ok(hasTextMate(source, 'markup.heading.carve'), `TextMate heading after blank line: ${source}`);
}

console.log(`Carve 0.2: ${cases.length} spec case snapshots and 138 scope assertions passed`);
