/**
 * TextMate: three shapes the 0.2 text reads as plain text.
 *
 * - An unpartnered backtick run, with or without a `!`, `$` or `$$` sigil, is
 *   text, so a `%%` after it starts a comment (C2-I-017, carve-grammars#933).
 * - A frontmatter format word is ASCII letters and digits only (C2-B-164,
 *   carve-grammars#934).
 * - An attribute block that attaches to nothing is one literal atom: no tag
 *   inside it (C2-I-035, C2-I-036, carve-grammars#935).
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { covered, textmateLineTokenizer } from './lib/textmate-lines.js';

const tokenize = await textmateLineTokenizer(resolve('textmate/carve.tmLanguage.json'));
const verbatim = (source) => tokenize(source)
    .filter(({ scope }) => /\b(?:markup\.raw|markup\.math|punctuation\.definition\.(?:raw|math|literal))\b/.test(scope))
    .map(({ text }) => text)
    .join('');
const comment = (source) => covered(tokenize, source, 'comment.line.percent.carve');

// #933: unpartnered runs are text.
const hosts = ['', 'a ', '# a ', '![alt](x.png)\n^ cap ', '> a ', '> # a ', '- a ', '1. a ', '::: note\na '];
const open = ['`x %% b', '!`x %% b', '$`x %% b', '$$`x %% b', '``x ` y %% b', '` x `` y %% b', '\\\\`x %% b'];
let count = 0;
for (const host of hosts) {
    for (const body of open) {
        const source = host + body + '\n\nplain *tail*\n';
        assert.equal(verbatim(source), '', `no verbatim scope: ${JSON.stringify(source)}`);
        assert.equal(comment(source), '%% b', `comment after the run: ${JSON.stringify(source)}`);
        assert.equal(covered(tokenize, source, 'markup.bold.carve'), 'tail', `next paragraph: ${JSON.stringify(source)}`);
        count++;
    }
    for (const [body, code] of [
        ['`x %% b` c', 'x %% b'],
        ['``x %% b`` c', 'x %% b'],
        ['` a `` b ` c', ' a `` b '],
        ['``` a ` b ``` c', ' a ` b '],
        ['!`x %% b` c', 'x %% b'],
        ['$`x %% b` c', 'x %% b'],
        ['$$`x %% b` c', 'x %% b'],
        ['$` a `` b ` c', ' a `` b '],
        ['!` a `` b ` c', ' a `` b '],
    ]) {
        const source = host + body + '\n';
        assert.ok(verbatim(source).includes(code), `closed span stays verbatim: ${JSON.stringify(source)}`);
        assert.equal(comment(source), '', `no comment inside a closed span: ${JSON.stringify(source)}`);
        count++;
    }
    // A shorter run behind an unpartnered one still opens its own span.
    const source = host + '`` a `b` %% c\n';
    assert.equal(covered(tokenize, source, 'markup.raw.inline.carve'), '`b`', `later run opens: ${JSON.stringify(source)}`);
    assert.equal(comment(source), '%% c', `comment after the later span: ${JSON.stringify(source)}`);
    count++;
}

// #934: the format word is one word of ASCII letters and digits.
for (const opener of ['--- foo_bar', '---foo_bar', '--- x-y', '---x-y', '---é', '--- a b', '---  toml', '--- toml x', '---toml!']) {
    const source = `${opener}\na: 1\n---\n\n# H\n`;
    const leaked = tokenize(source).filter(({ scope }) => scope.includes('meta.frontmatter')).map(({ text }) => text);
    assert.deepEqual(leaked, [], `${opener} opens no frontmatter`);
    assert.equal(covered(tokenize, source, 'markup.heading.carve').trim(), '# H', `${opener}: heading after it`);
    count++;
}
for (const [opener, word] of [['---toml', 'toml'], ['--- toml', 'toml'], ['---JSON', 'JSON'], ['---1', '1'], ['---Yaml2', 'Yaml2'], ['---', ''], ['--- yaml', 'yaml']]) {
    const source = `${opener}\na: 1\n---\n# H\n`;
    assert.equal(covered(tokenize, source, 'punctuation.definition.frontmatter.begin.carve'), '---', `${opener} opens frontmatter`);
    assert.equal(covered(tokenize, source, 'entity.name.type.frontmatter.carve'), word, `${opener} format word`);
    assert.equal(covered(tokenize, source, 'punctuation.definition.frontmatter.end.carve'), '---', `${opener} closes`);
    count++;
}

// #935: an unattached attribute block holds no tag.
const tag = (source) => covered(tokenize, source, 'variable.other.tag.carve') + covered(tokenize, source, 'punctuation.definition.tag.carve');
for (const source of [
    'x {#id} y', 'Hi *bold* @mark {#id}', '{#id} x', 'x {.c #id} y', 'x {#id .c k=v}', 'x {#id}',
    '# Hi {#id}', '# Hi {#id} there', '> x {#id}', '- x {#id}', '1. x {#id}', '| a {#id} |', '::: note\nx {#id}\n:::',
    '![a](x.png)\n^ cap {#id}', '![a](x.png)\n^ cap {#id}``',
    'a *b* {#id}', 'a {#a} {#b}', 'x {_a_ #id}', '{=m {#id} m=}', '{_u {#id} u_}',
]) {
    assert.equal(tag(source), '', `no tag in an unattached block: ${JSON.stringify(source)}`);
    count++;
}
for (const [source, id] of [['see #id', 'id'], ['# A see #id', 'id'], ['a {#id} and #tag', 'tag'], ['> see #id', 'id']]) {
    assert.equal(covered(tokenize, source, 'variable.other.tag.carve'), id, `tag outside braces: ${JSON.stringify(source)}`);
    count++;
}
for (const source of ['[a]{#id}', '`c`{#id}', '*b*{#id}', '{=m=}{#id}', '# A [a]{#id}', '[a]{#id} and x {#id}']) {
    assert.match(covered(tokenize, source, 'meta.attributes.carve'), /^\{?#id\}?$/, `glued block keeps its scope: ${JSON.stringify(source)}`);
    count++;
}

// A raw-format span ends at its first closing run: `raw_inline` once tried every
// later closer on the line for a `{=`, which was quadratic in the line length.
assert.equal(covered(tokenize, 'a ``x`` b ``y``{=html}', 'markup.other.raw.inline.carve'), '``y``{=html}', 'raw span takes its own closer');
{
    const line = '`` a `` '.repeat(4000);
    const started = process.hrtime.bigint();
    tokenize(line);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(ms < 2000, `32 KB line of closed double-backtick spans took ${ms.toFixed(0)} ms`);
    count += 2;
}

console.log(`textmate text runs: ${count} assertion groups passed`);
