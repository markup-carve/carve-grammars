/**
 * TextMate findings from the grammar audit at 45436fd5, each checked against
 * the engine first so a row cannot pin a reading the parser does not hold.
 *
 * Driven through vscode-textmate line by line, because several rows turn on a
 * blank line that Shiki drops before the state machine sees it.
 */
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { carveToHtml } from '@markup-carve/carve';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tokenize = await textmateLineTokenizer(resolve(repoRoot, 'textmate/carve.tmLanguage.json'));

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

const html = (source) => carveToHtml(source);

/** The scope stack over the first occurrence of `text` at or after `from`. */
const scopeAt = (source, text, from = 0) => {
    const at = source.indexOf(text, from);
    assert.ok(at >= 0, `${JSON.stringify(text)} is not in ${JSON.stringify(source)}`);
    let offset = 0;
    for (const leaf of tokenize(source)) {
        const end = offset + leaf.text.length;
        if (offset <= at && at < end) return leaf.scope;
        offset = end;
    }
    throw new Error(`no leaf covers ${JSON.stringify(text)}`);
};

const has = (source, text, scope, from = 0) => scopeAt(source, text, from).split(' ').some((s) => s.startsWith(scope));

const assertScope = (source, text, scope, from = 0) => assert.ok(has(source, text, scope, from),
    `${JSON.stringify(source)}: ${JSON.stringify(text)} should carry ${scope}, got "${scopeAt(source, text, from)}"`);

const refuteScope = (source, text, scope, from = 0) => assert.ok(!has(source, text, scope, from),
    `${JSON.stringify(source)}: ${JSON.stringify(text)} should not carry ${scope}, got "${scopeAt(source, text, from)}"`);

console.log('front matter needs its closer:');

ok('an unclosed bare dash run does not turn the document into YAML', () => {
    const source = '---\n\nPara *b*\n\n# Heading';
    assert.match(html(source), /^<hr>/);
    refuteScope(source, 'Para', 'meta.frontmatter');
    assertScope(source, 'b*', 'markup.bold');
    assertScope(source, 'Heading', 'markup.heading');
});

ok('a closed block stays front matter, comments and nested values included', () => {
    const source = '---\ntitle: x\n# note\ntags:\n  - a\nNote: kept\n---\nBody';
    assert.doesNotMatch(html(source), /title/);
    for (const text of ['title', 'note', '- a', 'Note']) assertScope(source, text, 'meta.embedded.block.yaml');
    assertScope(source, '---', 'punctuation.definition.frontmatter.end', 4);
    refuteScope(source, 'Body', 'meta.frontmatter');
});

ok('a block holding only a boolean, null or number stays front matter', () => {
    for (const source of ['---\ntrue\n---\nBody', '---\n42\n---\nBody', '---\nnull\n---\nBody']) {
        assert.equal(html(source).trim(), '<p>Body</p>');
        assertScope(source, source.split('\n')[1], 'meta.embedded.block.yaml');
        assertScope(source, '---', 'punctuation.definition.frontmatter.end', 4);
        refuteScope(source, 'Body', 'meta.frontmatter');
    }
});

// RESIDUAL: any other plain line ends the block, since begin cannot see the closer,
// and a `# ` line before it reads as a YAML comment even when the block never closes.
ok('residual: a plain-text bare block and an unclosed comment line', () => {
    const plain = '---\nhello\n---\nBody';
    assert.equal(html(plain).trim(), '<p>Body</p>');
    refuteScope(plain, 'hello', 'meta.frontmatter');
    const heading = '---\n# Heading\n\npara';
    assert.match(html(heading), /<h1>Heading<\/h1>/);
    assertScope(heading, 'Heading', 'meta.embedded.block.yaml');
});

console.log('\nan unpartnered verbatim run closes on a later line:');

for (const [source, opener] of [
    ['a `c\nd` e *b*\nmore *b*', 'c'],
    ['a $`c\nd` e *b*\nmore *b*', 'c'],
    ['a !``c\nd`` e *b*\nmore *b*', 'c'],
]) {
    ok(JSON.stringify(source), () => {
        assert.equal((html(source).match(/<strong>/g) ?? []).length, 2);
        refuteScope(source, ' e ', 'markup.raw');
        refuteScope(source, ' e ', 'markup.math');
        assertScope(source, 'b*', 'markup.bold');
        assertScope(source, 'b*', 'markup.bold', source.indexOf('more'));
        assert.ok(/markup\.(?:raw|math)/.test(scopeAt(source, opener)));
    });
}

console.log('\nblocks inside a quote:');

ok('a fenced code block keeps its body verbatim', () => {
    const source = '> ```\n> a *b* /i/ %% c\n>\n> ```\nafter *b*';
    assert.match(html(source), /<blockquote>\s*<pre><code>a \*b\* \/i\/ %% c/);
    assertScope(source, '```', 'punctuation.definition.fenced');
    assertScope(source, 'a *b*', 'markup.raw.code');
    refuteScope(source, 'b* /i/', 'markup.bold');
    refuteScope(source, '%% c', 'comment');
    assertScope(source, '>', 'punctuation.definition.quote', source.indexOf('\n> a'));
    assertScope(source, '```', 'punctuation.definition.fenced', source.lastIndexOf('> ```'));
    assertScope(source, 'b*', 'markup.bold', source.indexOf('after'));
});

ok('a deeper quote marker before a fence run does not close the fence', () => {
    const source = '> ```\n> a\n> > ```\n> b\n> ```';
    assert.match(html(source), /<code>a\n&gt; ```/);
    assertScope(source, 'b', 'markup.raw.code', source.indexOf('> b'));
});

ok('a fence ends with its quote when no closer comes', () => {
    const source = '> ~~~py\n> x\nb *c*';
    assert.match(html(source), /<p>b <strong>c<\/strong><\/p>/);
    assertScope(source, 'py', 'fenced_code.block.language');
    refuteScope(source, 'b *c*', 'markup.raw');
    assertScope(source, 'c*', 'markup.bold');
});

ok('a table row, a container fence and a definition list are scoped', () => {
    const source = '> | a | *b* |\n>\n> ::: note\n> x\n> :::\n>\n> :: t\n> : d *e*';
    assert.match(html(source), /<table>/);
    assert.match(html(source), /<aside class="admonition note"/);
    assert.match(html(source), /<dt>t<\/dt>/);
    assertScope(source, '|', 'punctuation.separator.table');
    assertScope(source, 'b*', 'markup.bold');
    assertScope(source, ':::', 'punctuation.definition.admonition');
    assertScope(source, 'note', 'entity.name.tag.admonition');
    assertScope(source, ':: t', 'punctuation.definition.list.definition');
    assertScope(source, 't\n', 'entity.name.tag.definition.term');
    assertScope(source, ': d', 'punctuation.definition.list.definition');
    assertScope(source, 'e*', 'markup.bold');
});

for (const [source, opener, scope] of [
    ['> a `c\n> d` e *b*\n> more *b*', '`c', 'markup.raw'],
    ['> a $`c\n> d` e *b*\n> more *b*', '$`c', 'markup.math'],
    ['> a !``c\n> d`` e *b*\n> more *b*', '!``c', 'markup.raw'],
]) {
    ok(`a verbatim span carries over the quote prefix: ${JSON.stringify(source)}`, () => {
        assert.equal((html(source).match(/<strong>/g) ?? []).length, 2);
        assert.ok(has(source, 'd', scope, source.indexOf('\n')));
        assertScope(source, '>', 'punctuation.definition.quote', source.indexOf('\n'));
        refuteScope(source, ' e ', scope);
        assertScope(source, 'b*', 'markup.bold');
        assertScope(source, 'b*', 'markup.bold', source.indexOf('more'));
        assert.ok(has(source, opener.slice(-1), scope, source.indexOf(opener) + opener.length - 1));
    });
}

ok('the span ends with its paragraph, and an unclosed star after it stays on its line', () => {
    const blank = '> a `c\n>\n> d';
    assert.match(html(blank), /<code>c<\/code><\/p>\s*<p>d/);
    refuteScope(blank, 'd', 'markup.raw', blank.lastIndexOf('d'));
    const star = '> a `c\n> d` *e\n> f';
    assertScope(star, '>', 'punctuation.definition.quote', star.lastIndexOf('>'));
    refuteScope(star, 'f', 'markup.bold', star.lastIndexOf('f'));
});

ok('a lone quoted description with no term is quote text', () => {
    const source = '> : lone';
    assert.match(html(source), /<p>: lone<\/p>/);
    refuteScope(source, ':', 'punctuation.definition.list.definition');
});

console.log('\nlist and caption markers do not interrupt a paragraph:');

for (const line of ['- not item', '1. not', '- [ ] x', '* x', 'a) x', '^ not caption']) {
    ok(`para / ${line}`, () => {
        const source = `para\n${line}`;
        assert.match(html(source), /^<p>para\n/);
        for (const scope of ['punctuation.definition.list', 'punctuation.definition.checkbox', 'meta.caption']) {
            refuteScope(source, line, scope, 5);
        }
    });
}

ok('after a blank line the same markers open a list again', () => {
    const source = 'para\n\n- item\n1. one';
    assertScope(source, '-', 'punctuation.definition.list.unnumbered');
    assertScope(source, '1.', 'punctuation.definition.list.numbered');
});

ok('a block that interrupts a paragraph still does, and ends it', () => {
    const source = 'para\n# h\n- item';
    assert.match(html(source), /<li>item<\/li>/);
    assertScope(source, 'h', 'markup.heading', 5);
    assertScope(source, '- item', 'punctuation.definition.list.unnumbered');
});

for (const [source, why] of [
    ['![a](u)\n^ cap', 'an image'],
    ['$$`E`\n^ cap', 'display math'],
    ['| a |\n^ cap', 'a table'],
    ['```\nx\n```\n^ cap', 'a code block'],
    ['> q\n^ cap', 'a quote'],
    ['{.c}\n- x', 'an attribute line (the list after it)'],
]) {
    ok(`the line after ${why} is not swallowed`, () => {
        if (source.includes('^ cap')) {
            assert.match(html(source), /<figcaption>cap<\/figcaption>|<caption>cap<\/caption>/);
            assertScope(source, 'cap', 'meta.caption');
        } else {
            assertScope(source, '-', 'punctuation.definition.list.unnumbered');
        }
    });
}

console.log('\na caption needs a host:');

for (const source of ['# h\n^ cap', '# h\n\n^ cap', '# h\n^ cap\n- x', '::: note\nx\n:::\n^ cap', ':::\nx\n:::\n\n^ cap', '^ cap', '\uFEFF^ cap\nb']) {
    ok(`a caret line with no host is text: ${JSON.stringify(source)}`, () => {
        assert.doesNotMatch(html(source), /<figcaption>|<caption>/);
        refuteScope(source, 'cap', 'meta.caption');
        refuteScope(source, '^', 'punctuation.definition.caption');
    });
}

ok('a marker after such a line stays paragraph text', () => {
    const source = '# h\n^ cap\n- x';
    assert.match(html(source), /<p>\^ cap\n- x<\/p>/);
    refuteScope(source, '- x', 'punctuation.definition.list');
});

for (const source of ['::: >\nq\n:::\n^ cap', '::: figure\n![a](u)\n:::\n^ cap']) {
    ok(`a quote or figure group closer still takes its caption: ${JSON.stringify(source)}`, () => {
        assert.match(html(source), /<figcaption>cap<\/figcaption>/);
        assertScope(source, 'cap', 'meta.caption');
    });
}

console.log('\na lazy line keeps the list open:');

for (const [source, marker] of [['- a\nlazy\n- b', '- b'], ['1. a\nlazy\n2. b', '2.'], ['- a\n  - b\nlazy\n- c', '- c']]) {
    ok(`a sibling after a lazy line is a list item: ${JSON.stringify(source)}`, () => {
        assert.match(html(source), new RegExp(`lazy</li>[^]*<li>${source.at(-1)}</li>`));
        assertScope(source, marker, 'punctuation.definition.list');
        refuteScope(source, 'lazy', 'punctuation.definition.list');
    });
}

ok('a container inside the item ends at the lazy line', () => {
    const source = '- ::: note\n  x\nlazy *b*\n\n# h';
    refuteScope(source, 'lazy', 'meta.admonition');
    assertScope(source, 'b*', 'markup.bold');
    assertScope(source, 'h', 'markup.heading', source.indexOf('# h'));
});

for (const source of ['- a\n^ cap', '- a\n\n^ cap', '- a\nlazy\n^ cap', '- | a |\n^ cap']) {
    ok(`a caption line after a list is text: ${JSON.stringify(source)}`, () => {
        // Text either way: a lazy line in the item or a paragraph below the list.
        assert.match(html(source), /\^ cap<\/(?:p|li)>/);
        refuteScope(source, 'cap', 'meta.caption');
    });
}

// RESIDUAL: the list stays open across a paragraph after a blank line, so a
// marker straight after that paragraph reads as an item, not paragraph text.
ok('residual: a marker after a paragraph that follows a list', () => {
    const source = '- a\n\npara\n- x';
    assert.match(html(source), /<p>para\n- x<\/p>/);
    assertScope(source, '- x', 'punctuation.definition.list');
});

console.log('\ninline runs that had no inline patterns:');

ok('a quote opened on a list marker line', () => {
    const source = '- > q *b* /i/';
    assert.match(html(source), /<strong>b<\/strong> <em>i<\/em>/);
    assertScope(source, 'b*', 'markup.bold');
    assertScope(source, 'i/', 'markup.italic');
});

ok('an inline footnote, nested brackets and code included', () => {
    for (const source of ['x ^[inline *b*] y', 'x ^[see [a](u) *b*] y', 'x ^[a `]` *b*] y', 'x ^[a \\] *b*] y']) {
        assert.match(html(source), /<strong>b<\/strong>/, source);
        assertScope(source, 'b*', 'markup.bold');
        assertScope(source, ' y', 'source.carve');
        refuteScope(source, ' y', 'string.other.footnote');
    }
});

console.log('\na table row needs its closing pipe:');

ok('a pipe line with no closing pipe is a paragraph', () => {
    const source = '| a line *b*\n| another /i/';
    assert.match(html(source), /^<p>\| a line/);
    refuteScope(source, '|', 'punctuation.separator.table');
    assertScope(source, 'b*', 'markup.bold');
});

ok('a closed row, with a glued attribute block or a cell comment, is still a row', () => {
    for (const source of ['| a |', '| a |{.c}', '| %% x | b |', '| a |  ']) {
        assert.match(html(source), /<table>/, source);
        assertScope(source, '|', 'punctuation.separator.table');
    }
});

console.log('\nsmaller scope fixes:');

ok('an attribute block names its parts once, without nesting', () => {
    const source = '*x*{.c #id k=v q="a b" :en flag}';
    const expect = [['.c', 'entity.other.attribute-name.class'], ['#id', 'entity.other.attribute-name.id'],
        ['k=', 'entity.other.attribute-name'], ['=v', 'punctuation.separator.key-value'], ['v ', 'string.unquoted'],
        ['"a', 'string.quoted'], [':en', 'entity.other.attribute-name.language'], ['flag', 'entity.other.attribute-name']];
    for (const [text, scope] of expect) assertScope(source, text, scope);
    for (const text of ['.c', 'k=']) {
        assert.equal(scopeAt(source, text).split(' ').filter((s) => s === 'meta.attributes.carve').length, 1);
    }
});

ok('a task marker is an unnumbered list marker', () => {
    assertScope('- [ ] t', '-', 'punctuation.definition.list.unnumbered');
    assertScope('> - [x] t', '-', 'punctuation.definition.list.unnumbered');
});

ok('a checkbox after a glued attribute block', () => {
    const source = '-{.c} [x] done';
    assert.match(html(source), /<li[^>]* class="c"><input type="checkbox" checked/);
    assertScope(source, '[', 'punctuation.definition.checkbox');
    assertScope(source, 'x]', 'constant.language.checkbox');
    refuteScope(source, 'done', 'constant.language.checkbox');
});

ok('a list opening a description body', () => {
    for (const [source, marker, scope] of [
        [':: t\n:  - list', '-', 'punctuation.definition.list.unnumbered'],
        [':: t\n: 1. one', '1.', 'punctuation.definition.list.numbered'],
        [':: t\n: - [x] done', '[', 'punctuation.definition.checkbox'],
    ]) {
        assert.match(html(source), /<dd>\s*<[ou]l/, source);
        assertScope(source, marker, scope, 4);
    }
    refuteScope(':: t\n: plain', 'plain', 'punctuation.definition.list');
});

console.log(`\n${passed} passed`);
