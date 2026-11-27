import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { covered, textmateLineTokenizer } from './lib/textmate-lines.js';

const tokenize = await textmateLineTokenizer(resolve('textmate/carve.tmLanguage.json'));
const definition = 'meta.snippet.definition.carve';
const use = 'meta.snippet.use.carve';
const name = 'variable.other.snippet.carve';
const include = 'meta.directive.include.carve';

const scopeOf = (source, text) => tokenize(source).find((leaf) => leaf.text === text)?.scope ?? '';

// C2-B-236: a definition line at column 0.
for (const [source, marker] of [
    ['{$ver}: 0.2.3\n', 'ver'],
    ['{$_v}: X\n', '_v'],
    ['{$9}: X\n', '9'],
    ['{$a_b-c}: X\n', 'a_b-c'],
    ['{$v .c}: X\n', 'v'],
    ['{$v  .c }: X\n', 'v'],
    ['{$v k="a}b"}: X\n', 'v'],
    ['{$v _k=1 :en}: X\n', 'v'],
    ['{$v}{.c}{e=1}: X\n', 'v'],
    ['{$v}:  X\n', 'v'],
    ['{$v}: \tX\n', 'v'],
    ['\u{FEFF}{$v}: X\n', 'v'],
    ['{.k}\n{$v .c}: X\n', 'v'],
]) {
    assert.equal(covered(tokenize, source, name), marker, `definition name in ${JSON.stringify(source)}`);
    const line = source.split('\n').find((text) => text.includes('{$'));
    assert.equal(covered(tokenize, source, definition), line, `definition line in ${JSON.stringify(source)}`);
}
const full = '{$brand .badge}{#x .q}: x\n';
assert.equal(covered(tokenize, full, definition), '', 'a glued block with an id makes no definition');
const parts = '{$brand .badge}{k=v}: *b* `c`\n';
assert.equal(covered(tokenize, parts, 'punctuation.definition.snippet.begin.carve'), '{$');
assert.equal(covered(tokenize, parts, 'punctuation.definition.snippet.end.carve'), '}');
assert.equal(covered(tokenize, parts, 'entity.other.attribute-name.class.carve'), '.badge');
assert.equal(covered(tokenize, parts, 'entity.other.attribute-name.carve'), 'k');
assert.equal(covered(tokenize, parts, 'punctuation.definition.attributes.carve'), '{}');
assert.equal(covered(tokenize, parts, 'punctuation.separator.carve'), ':');
assert.ok(scopeOf(parts, 'b').includes('markup.bold.carve'), 'the value is inline content');
assert.equal(covered(tokenize, parts, definition), parts.trimEnd(), 'the definition covers its line');
assert.equal(covered(tokenize, '{$v}: X\n  Y\n', definition), '{$v}: X', 'the line below never continues it');

// Near misses: no definition, and the line keeps its old reading.
for (const source of [
    '{$v}:\n', '{$v}: \n', '{$v}:x\n', '{$v}:\tX\n', '{$v}\n', '\\{$v}: X\n',
    '{$v }: X\n', '{$v.c}: X\n', '{$v #x}: a\n', '{$v .c}{#i}: X\n', '{$v}{.c} {.d}: X\n',
    '{$v _k}: X\n', '{$v %x}: X\n', '{$-v}: X\n', '{$v.x}: X\n', '{$vé}: X\n',
    '{#intro}: text\n', '{.c #v}: x\n',
    ' {$v}: X\n', 'text\n{$v}: X\n', '> {$v}: X\n', '- {$v}: X\n',
]) {
    assert.equal(covered(tokenize, source, definition), '', `no definition in ${JSON.stringify(source)}`);
}

// C2-I-128 and C2-B-237: a use, inline or alone on its line.
for (const [source, text] of [
    ['Version {{ $ver }}.\n', '$ver'],
    ['{{ $ver }}\n', '$ver'],
    ['{{ $ver }}  \n', '$ver'],
    ['a {{  $v-1  }} b\n', '$v-1'],
    ['# H {{ $v }}\n', '$v'],
    ['| {{ $v }} |\n', '$v'],
    ['[a {{ $v }}](u)\n', '$v'],
    ['*a {{ $v }} b*\n', '$v'],
    ['{*{{ $v }}*}\n', '$v'],
    ['> {{ $v }}\n', '$v'],
    ['- {{ $v }}\n', '$v'],
]) {
    assert.equal(covered(tokenize, source, name), text, `use name in ${JSON.stringify(source)}`);
    assert.equal(covered(tokenize, source, use), `{{${source.includes('{{  ') ? '  ' : ' '}${text}${source.includes('  }}') ? '  ' : ' '}}}`, `use in ${JSON.stringify(source)}`);
    assert.equal(covered(tokenize, source, 'string.other.link.include.carve'), '', `no include path in ${JSON.stringify(source)}`);
}

assert.equal(covered(tokenize, '{$w}: a {{ $v }}\n', use), '{{ $v }}', 'a use in a definition value');

// Near misses stay with the include rule or stay text.
for (const source of ['{{ $a.crv }}\n', '{{ $v @shift:1 }}\n', '{{ $v#s }}\n', '{{ $-v }}\n']) {
    assert.equal(covered(tokenize, source, use), '', `no use in ${JSON.stringify(source)}`);
    assert.notEqual(covered(tokenize, source, include), '', `include directive kept in ${JSON.stringify(source)}`);
}
for (const source of ['a {{$v}} b\n', 'a {{\t$v }} b\n', 'a {{ $v\t}} b\n', 'a \\{{ $v }} b\n', 'a `{{ $v }}` b\n', 'a {{ $vé }} b\n']) {
    assert.equal(covered(tokenize, source, use), '', `no use in ${JSON.stringify(source)}`);
}

// Text after a use reads normally; a glued attribute block is text (C2-I-128).
const after = 'a {{ $v }}{.c} *b* [l](u) `c`\n';
assert.equal(covered(tokenize, after, 'meta.attributes.carve'), '', 'a block glued to a use is text');
assert.ok(scopeOf(after, 'b').includes('markup.bold.carve'));
assert.ok(scopeOf(after, 'u').includes('markup.underline.link.carve'));
assert.ok(!scopeOf(after, 'b').includes(use), 'the use scope ends at its closer');
assert.ok(scopeOf('{{ $v }}\n\n# Next\n', 'Next').includes('markup.heading.carve'), 'a block use leaves the next block alone');

console.log('TextMate snippet scopes passed');
