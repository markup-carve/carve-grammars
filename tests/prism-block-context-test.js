/**
 * Prism shapes where a construct depends on the lines around it, or where an
 * escape, an alias or a nested bracket changed the reading. Each row's
 * expectation was checked against `carveToHtml`, which is asserted alongside so
 * a parser change shows up here first.
 */
import assert from 'node:assert/strict';
import { carveToHtml } from '@markup-carve/carve';

import { prismTokens } from './lib/engines.js';

let passed = 0;
function scopeOf(source, text) {
    const leaf = prismTokens(source).find((token) => token.text.includes(text));
    assert.ok(leaf, `no leaf holds ${JSON.stringify(text)} in ${JSON.stringify(source)}`);
    return leaf.scope ?? '';
}
function row(name, source, html, check) {
    assert.ok(carveToHtml(source).replace(/\n\s*/g, '').includes(html), `${name}: parser no longer renders ${html}`);
    check(source);
    passed++;
    console.log(`  ✓ ${name}`);
}
const has = (pattern) => (scope) => pattern.test(scope);
const lacks = (pattern) => (scope) => !pattern.test(scope);
function expect(text, test) {
    return (source) => assert.ok(test(scopeOf(source, text)), `${JSON.stringify(text)} scoped ${scopeOf(source, text)}`);
}

// A fenced code block inside a quote keeps its body verbatim.
row('quote fence body is code', '> ```\n> a *b* /i/ %% c\n> ```\n', '<blockquote><pre><code>a *b* /i/ %% c',
    expect('a *b* /i/ %% c', has(/^blockquote>code-block$/)));
row('quote fence keeps its language', '> ```js\n> x\n> ```\n', 'language-js',
    expect('js', has(/language/)));

// An escape wins over the opener it precedes.
for (const [text, html] of [['`no', '`no`'], ['#tag', ' #tag '], ['@user', '@user'], ['<https://a>', '&lt;https://a&gt;']]) {
    row(`escaped ${text} is text`, '\\`no\\` \\#tag \\@user \\<https://a> x', html,
        (source) => assert.equal(prismTokens(source).find((t) => t.text.includes(text.slice(1)) && !t.text.startsWith('\\'))?.scope ?? null, null));
}
row('escaped brace leaves the bare run', '\\{*no*}', '{<strong>no</strong>}', expect('*no*', has(/^bold/)));
row('escaped backslash keeps the tag', '\\\\#t', '<span class="tag">', expect('#t', has(/^tag/)));

// A list marker does not interrupt a paragraph.
for (const marker of ['- ', '1. ', '- [ ] ']) {
    row(`${marker.trim()} after a paragraph line`, `para\n${marker}not item\n`, '<p>para', expect(marker.trim().slice(0, 1), lacks(/list/)));
}
row('second marker in the same paragraph', 'para\n- a\n- b\n', '<p>para- a- b</p>', (source) => {
    assert.ok(!prismTokens(source).some((t) => /list/.test(t.scope ?? '')));
});
row('item after a lazy line', '- a\nlazy\n- b\n', '<li>b</li>', (source) => {
    assert.equal(prismTokens(source).filter((t) => /list/.test(t.scope ?? '')).length, 2);
});
row('item after a heading', '# H\n- x\n', '<li>x</li>', expect('- ', has(/list/)));

// A caption needs a host.
for (const [host, html] of [['para text\n', '<p>para text^'], ['- item\n', '<p>^'], ['# H\n', '<p>^'], ['::: note\nx\n:::\n', '<p>^']]) {
    row(`no caption after ${JSON.stringify(host)}`, `${host}^ not caption\n`, html, expect('not caption', lacks(/caption/)));
}
for (const [host, html] of [['![a](u)\n', '<figcaption>'], ['| a |\n\n', '<caption>'], ['```\nx\n```\n', '<figcaption>'], ['> q\n', '<figcaption>'], ['::: figure\n![a](u)\n:::\n', '<figcaption>']]) {
    row(`caption after ${JSON.stringify(host)}`, `${host}^ cap\n`, html, expect(' cap', has(/caption/)));
}

// A container body is not painted with the tag colour.
row('container body carries no tag alias', '::: note\nbody text\n:::\n', 'body text', expect('body text', lacks(/tag/)));

// Bare emphasis crosses one soft break.
for (const [d, tag] of [['/', 'em'], ['*', 'strong'], ['_', 'u'], ['=', 'mark']]) {
    row(`${d} across a soft break`, `a ${d}b\nc${d} d`, `<${tag}>b`, expect(`${d}b\nc${d}`, has(/./)));
}
row('no emphasis across a blank line', 'a *b\n\nc* d', '<p>a *b</p>', (source) => {
    assert.ok(prismTokens(source).every((t) => !t.scope));
});

// A table row needs its closing pipe.
row('pipe line without a closer', '| a line *b*\n| another /i/\n', '<p>| a line', expect(' a line ', lacks(/table/)));

// A colon fence closes at its exact length, and a longer bare run inside an
// open container opens another one.
row('longer bare run does not close the inner container', ':::: outer\n::: inner\nx\n::::\nafter\n', '<div class="inner"><p>x</p><div>',
    expect('\nx\n', lacks(/div/)));

// An inline note holds a nested bracket and a soft break.
row('inline note with a link', 'a ^[see [a](u)] b', 'see <a href="u">a</a>', expect('](', has(/^inline-footnote>.*url/)));
row('inline note across a soft break', 'a ^[see\nmore] b', 'seemore', expect('see\nmore', has(/inline-footnote/)));

// Superscript and subscript are not painted bold.
row('superscript alias', '{^ ^} {, ,}', '<sup> </sup>', (source) => {
    assert.ok(prismTokens(source).every((t) => !/important|bold/.test(t.scope ?? '')));
});

// A fence info string's title and label carry scopes.
row('fence title and label', '```js "title" [label]\ncode\n```\n', 'title="title"', (source) => {
    assert.match(scopeOf(source, '"title"'), /string/);
    assert.match(scopeOf(source, '[label]'), /symbol/);
});

console.log(`${passed} passed`);
