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

console.log(`Carve 0.2: ${cases.length} spec case snapshots and 66 scope assertions passed`);
