/**
 * The highlight.js grammar against the engine on block context it reads:
 * front matter needs its closer, a list marker does not interrupt a paragraph
 * outside a list item, a caption needs a captionable host, a bare colon fence
 * closes only the container of its width, and a pipe-led line without a
 * closing pipe is a paragraph. Every row also asks the engine, so a row that
 * stops describing the language fails here rather than pinning a misreading.
 */
import assert from 'node:assert/strict';

import { carveToHtml } from '@markup-carve/carve';

import carveDefinition from '../highlightjs/carve.mjs';
import { hljsTokens } from './lib/engines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

let count = 0;
const check = (name, fn) => {
    fn();
    count++;
    console.log(`  ✓ ${name}`);
};
const scoped = (source, pattern) => hljsTokens(source).filter((t) => t.ancestors.some((a) => pattern.test(a)));
const scopeOf = (source, needle) => {
    const tokens = hljsTokens(source);
    let at = 0;
    const index = source.indexOf(needle);
    for (const token of tokens) {
        if (index >= at && index < at + token.text.length) return token.ancestors.join('>') || null;
        at += token.text.length;
    }
    throw new Error(`${JSON.stringify(needle)} not in ${JSON.stringify(source)}`);
};

console.log('front matter:');
check('an opener with no closer is a thematic break, not front matter', () => {
    const source = '---\n\nPara *b*\n\n# Heading\n';
    assert.match(carveToHtml(source), /^<hr>/);
    assert.equal(scoped(source, /^language-/).length, 0);
    assert.equal(scopeOf(source, '# Heading'), 'section');
    assert.equal(scopeOf(source, '*b*'), 'strong');
});
check('the closing dash line is the envelope, not the payload', () => {
    for (const source of ['---toml\na = 1\n---\n\nx\n', '---\ntitle: x\n---\nbody\n', '---json\n{"a": 1}\n---\nx\n']) {
        assert.doesNotMatch(carveToHtml(source), /<hr>/);
        const tokens = hljsTokens(source);
        const closer = tokens.filter((t) => t.text.includes('---')).at(-1);
        assert.equal(closer.ancestors.join('>'), 'meta', JSON.stringify(source));
        assert.ok(tokens.some((t) => t.ancestors.some((a) => a.startsWith('language-'))), JSON.stringify(source));
    }
});

console.log('list markers:');
const LITERAL_MARKERS = ['para\n- not item\n', 'para\n1. no\n', 'para\n- [ ] no\n', 'para\n- x\n- y\n', '> q\n- a\n', ':: t\n: d\n- a\n', '::: note\npara\n- x\n:::\n'];
const ITEM_MARKERS = ['- a\nlazy\n- b\n', '- a\n  more\n- b\n', '# H\n- a\n', 'x\n\n- a\n', '- x\n\n  > q\n- z\n', '- first\n\n  second\n  - nested\n', '> # h\n- item\n', '- a\n+\n> x\n- next\n'];
check('a marker on a paragraph line outside a list item is text', () => {
    for (const source of LITERAL_MARKERS) {
        assert.doesNotMatch(carveToHtml(source).replace(/<\/?ul>|<\/?ol>/g, ''), /<li>(?:not item|no|x|y|a)\b/, `engine: ${JSON.stringify(source)}`);
        assert.ok(!hljsTokens(source).some((t) => t.scope === 'bullet'), `hljs: ${JSON.stringify(source)}`);
    }
});
check('a marker that opens a list or the next item stays a bullet', () => {
    for (const source of ITEM_MARKERS) {
        const lines = source.trimEnd().split('\n');
        const text = lines.at(-1).replace(/^\s*(?:[-*]|\d+\.)\s+/, '');
        assert.match(carveToHtml(source), new RegExp(`<li>${text}`), `engine: ${JSON.stringify(source)}`);
        assert.equal(hljsTokens(source).filter((t) => t.scope === 'bullet').length, (source.match(/^\s*(?:[-*]|\d+\.) /gm) || []).length,
            `hljs: ${JSON.stringify(source)}`);
    }
});

console.log('captions:');
const NO_HOST = ['para text\n^ not caption\n', '- item\n^ no\n', '# H\n^ no\n', '::: note\nx\n:::\n^ no\n', '^ no\n', 'text\n![a](b.png)\n^ no\n', 'text\n$$`x`\n^ no\n'];
const HOSTED = ['![a](b.png)\n^ cap\n', '| a |\n^ cap\n', '```\nc\n```\n^ cap\n', '> q\n^ cap\n', '$$`x`\n^ cap\n', '![a](b.png)\n\n^ cap\n', '::: figure\n![a](b)\n:::\n^ cap\n', '::: >\nq\n:::\n^ cap\n'];
check('a caret line with no captionable host is paragraph text', () => {
    for (const source of NO_HOST) {
        assert.doesNotMatch(carveToHtml(source), /<figcaption>|<caption>/, `engine: ${JSON.stringify(source)}`);
        assert.equal(scopeOf(source, source.slice(source.lastIndexOf('^'))) ?? '', '', `hljs: ${JSON.stringify(source)}`);
    }
});
check('a caption on a host keeps its scope', () => {
    for (const source of HOSTED) {
        assert.match(carveToHtml(source), /<figcaption>cap|<caption>cap/, `engine: ${JSON.stringify(source)}`);
        assert.equal(scopeOf(source, '^ cap'), 'title', `hljs: ${JSON.stringify(source)}`);
    }
});

console.log('colon fences:');
check('a bare fence of the open width closes the container', () => {
    const source = '::: note\nx\n:::\n\n*[A]: x\n';
    assert.equal(scopeOf(source, '*[A]'), 'symbol');
});
check('a bare fence of another width opens a nested container', () => {
    const source = ':::: outer\n::: inner\nx\n::::\ny\n::::\n:::\n::::\n\n*[A]: z\n';
    assert.equal((carveToHtml(source).match(/<div/g) || []).length, 3);
    assert.equal(scopeOf(source, '*[A]'), 'symbol');
    assert.equal(scopeOf(':::: outer\n::: inner\nx\n::::\n*[A]: z\n', '*[A]'), null);
    const typeless = ':::\nOuter\n\n::::\nInner\n::::\n:::\n\n*[A]: x\n';
    assert.equal(hljsTokens(typeless).filter((t) => t.scope === 'keyword').length, 4);
    assert.equal(scopeOf(typeless, '*[A]'), 'symbol');
    assert.equal(scopeOf('::: figure\n![a](b)\n:::\n', ':::\n'), 'section');
});

console.log('pipes and cells:');
check('a pipe-led line without a closing pipe is a paragraph with inline runs', () => {
    const source = '| a line *b*\n| another /i/\n';
    assert.match(carveToHtml(source), /^<p>/);
    assert.equal(scopeOf(source, '| a'), null);
    assert.equal(scopeOf(source, '*b*'), 'strong');
    assert.equal(scopeOf(source, '/i/'), 'emphasis');
});
check('a table cell is an inline run that ends at its pipe', () => {
    const source = '|= H *b* |\n| /i/ `c` |\n+ *d* |\n';
    assert.match(carveToHtml(source), /<th[^>]*>H <strong>b<\/strong>/);
    assert.equal(scopeOf(source, '*b*'), 'strong');
    assert.equal(scopeOf(source, '/i/'), 'emphasis');
    assert.equal(scopeOf(source, '*d*'), 'strong');
    assert.equal(scopeOf('| *a | b* |\n', '*a'), null);
});

console.log('labels:');
check('link, span and extension labels are inline runs; image alt text is not', () => {
    assert.equal(scopeOf('[a *b*](u)\n', '*b*'), 'link>strong');
    assert.equal(scopeOf('[a /b/][r]\n', '/b/'), 'link>emphasis');
    assert.equal(scopeOf('[s *b*]{.c}\n', '*b*'), 'string>strong');
    assert.equal(scopeOf(':kbd[Ctrl *x*]\n', '*x*'), 'function>strong');
    assert.equal(scopeOf('![alt *b*](i.png)\n', '*b*'), 'link');
    assert.match(carveToHtml('![alt *b*](i.png)\n'), /alt="alt \*b\*"/);
});

console.log('no on:begin veto:');
// highlight.js resumes a scan after `ignoreMatch()` at a rule position that its
// cached slice matchers share, so once a mode has resumed from two places it
// can skip text or loop. No `on:begin` may veto; a refused match keeps its text.
check('no on:begin hook calls ignoreMatch()', () => {
    const seen = new Set();
    const vetoes = [];
    const visit = (mode) => {
        if (!mode || typeof mode !== 'object' || seen.has(mode)) return;
        seen.add(mode);
        if (/ignoreMatch/.test(String(mode['on:begin'] ?? ''))) vetoes.push(String(mode.begin).slice(0, 80));
        for (const child of mode.contains || []) visit(child);
        visit(mode.starts);
    };
    visit(carveDefinition());
    assert.deepEqual(vetoes, []);
});
check('a folding marker-line opener keeps its comment, an inner fence of another width ends nothing', () => {
    const folded = '- ::: note %% comment\nlazy *b*\n';
    assert.equal(scopeOf(folded, '::: note'), null);
    assert.equal(scopeOf(folded, '%% comment'), 'comment');
    assert.equal(scopeOf(folded, '*b*'), 'strong');
    const held = '- ::: note\n  body\n  ::::\n  :::\n*[A]: x\n';
    assert.equal(scopeOf(held, '::: note'), 'keyword');
    assert.equal(scopeOf(held, '::::'), 'keyword');
    assert.equal(scopeOf(held, '*[A]'), 'symbol');
});
check('a quoted heading or caption line scopes code and comments, other quoted lines leave the comment', () => {
    assert.equal(scopeOf('> # h `x` %% c\n', '`x`'), 'quote>code');
    assert.equal(scopeOf('> # h `x` %% c\n', '%% c'), 'quote>comment');
    assert.equal(scopeOf('> ^ cap %% c\n', '%% c'), 'quote>comment');
    assert.equal(scopeOf('> a # b `x`\n', '`x`'), 'quote');
});

assertThisFileRuns(import.meta.url);
console.log(`${count} block context checks passed`);
