/**
 * An escape keeps the next construct from opening, an unclosed fence ends at
 * its container's closer, a footnote body is inline content, and the `{empty}`
 * sentinel is an attribute block. Every expectation is checked against the
 * parser alongside the surfaces.
 */
import assert from 'node:assert/strict';
import { carveToHtml, parse } from '@markup-carve/carve';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';
import { textmateEngines } from './lib/surface-engines.js';

assertThisFileRuns(import.meta.url);

const B = '\\';
const T = '`';
const FENCE = T.repeat(3);
const html = (source) => carveToHtml(source).replace(/\n\s*/g, '');
const inlineTypes = (source) => parse(source).children[0].children.map((node) => node.type);

const surfaces = [
    ['prism', prismTokens],
    ['highlightjs', hljsTokens],
    ...await textmateEngines(),
];

/** The token covering the first occurrence of `needle` at or after `from`. */
async function tokenAt(tokenize, source, needle, from = 0) {
    const at = source.indexOf(needle, from);
    assert.ok(at >= 0, `${JSON.stringify(needle)} is in ${JSON.stringify(source)}`);
    let offset = 0;
    return (await tokenize(source)).find((t) => (offset += t.text.length) > at);
}

const is = {
    math: { prism: /math/, highlightjs: /^string$/, textmate: /math/ },
    symbol: { prism: /(^|>)symbol(>|$)/, highlightjs: /^symbol$/, textmate: /symbol/ },
    directive: { prism: /include|attr/, highlightjs: /^(meta|string|attr)$/, textmate: /include|attributes/ },
    attributes: { prism: /attr/, highlightjs: /^attr$/, textmate: /meta\.attributes/ },
    bold: { prism: /bold/, highlightjs: /^strong$/, textmate: /markup\.bold/ },
    code: { prism: /code/, highlightjs: /code/, textmate: /fenced_code|raw/ },
};
const matches = (kind, surface, scope) => (is[kind][surface] ?? is[kind].textmate).test(scope ?? '');

// [source, text whose token is checked, construct kind, opens, parser check]
const rows = [
    [`${B}$${T}x${T}`, 'x', 'math', false, (s) => assert.equal(html(s), '<p>$<code>x</code></p>')],
    [`${B}${B}$${T}x${T}`, 'x', 'math', true, (s) => assert.ok(html(s).includes('class="math inline"'))],
    [`${B}${B}${B}$${T}x${T}`, 'x', 'math', false, (s) => assert.ok(!html(s).includes('class="math'))],
    [`${B}$$${T}x${T}`, 'x', 'math', true, (s) => assert.ok(html(s).includes('class="math inline"'))],
    [`${B}:smile:`, 'smile', 'symbol', false, (s) => assert.deepEqual(inlineTypes(s), ['escaped_text', 'text'])],
    [`a ${B}:smile: b`, 'smile', 'symbol', false, (s) => assert.ok(!inlineTypes(s).includes('symbol'))],
    [`${B}${B}:smile:`, 'smile', 'symbol', true, (s) => assert.deepEqual(inlineTypes(s), ['escaped_text', 'symbol'])],
    [`${B}{{ x }}`, 'x', 'directive', false, (s) => assert.deepEqual(parse(s).children[0].children[0].value, '{')],
    [`${B}{{ x }} b`, 'x', 'directive', false, (s) => assert.equal(html(s), '<p>{{ x }} b</p>')],
    [`${B}${B}{{ x }}`, 'x', 'directive', true, (s) => assert.deepEqual(parse(s).children[0].children[0].value, B)],
    [`x${B}]{.c} y`, '.c', 'attributes', false, (s) => assert.equal(html(s), '<p>x]{.c} y</p>')],
    [`x${B.repeat(5)}]{.c} y`, '.c', 'attributes', false, (s) => assert.equal(html(s), `<p>x${B}${B}]{.c} y</p>`)],
    [`*a*${B}*{.c} y`, '.c', 'attributes', false, (s) => assert.equal(html(s), '<p><strong>a</strong>*{.c} y</p>')],
    [`a ${B}{{.c} b`, '.c', 'attributes', false, (s) => assert.equal(html(s), '<p>a {{.c} b</p>')],
    ['*a*{.c} y', '.c', 'attributes', true, (s) => assert.ok(html(s).includes('<strong class="c">'))],
];

let checked = 0;
for (const [source, needle, kind, opens, parser] of rows) {
    parser(source);
    for (const [name, tokenize] of surfaces) {
        const token = await tokenAt(tokenize, `${source}\n`, needle, source.indexOf(needle));
        assert.equal(matches(kind, name, token.scope), opens,
            `${name}: ${JSON.stringify(source)} ${opens ? 'opens' : 'does not open'} ${kind} (scope ${token.scope})`);
        checked++;
    }
}

// An unclosed fence ends at the closer of its own container, of the same width.
const fences = [
    [['::: note', FENCE, 'code', ':::', '*after*'], 'after', true],
    [[':::', FENCE, 'code', ':::', '*after*'], 'after', true],
    [['::: note', '~~~', 'code', ':::', '*after*'], 'after', true],
    [['::: figure', FENCE, 'code', ':::', '*after*'], 'after', true],
    [[':::: note', FENCE, 'code', ':::', 'more', '::::', '*after*'], 'after', true],
    [['::: a', ':::: b', FENCE, 'x', '::::', 'y', ':::', '*after*'], 'after', true],
];
for (const [lines, needle, bold] of fences) {
    const source = `${lines.join('\n')}\n`;
    assert.equal(html(source).includes(`<strong>${needle}</strong>`), bold, `parser: ${JSON.stringify(source)}`);
    for (const [name, tokenize] of surfaces) {
        const token = await tokenAt(tokenize, source, needle);
        assert.equal(matches('bold', name, token.scope), bold, `${name}: ${JSON.stringify(source)} scopes ${needle} (scope ${token.scope})`);
        checked++;
    }
}

// TextMate also keeps a colon line of another width inside the fence.
const textmate = surfaces.filter(([name]) => name !== 'prism' && name !== 'highlightjs');
const kept = [
    [[':::: note', FENCE, 'code', ':::', 'more', '::::'], 'more'],
    [['::: note', FENCE, 'code', '::::', '*after*'], 'after'],
];
for (const [lines, needle] of kept) {
    const source = `${lines.join('\n')}\n`;
    assert.ok(html(source).includes(`${needle}`) && html(source).includes('<pre><code>'), `parser: ${JSON.stringify(source)}`);
    assert.ok(new RegExp(`<code>[^<]*${needle}`).test(html(source)), `parser keeps ${needle} in the code block`);
    for (const [name, tokenize] of textmate) {
        const token = await tokenAt(tokenize, source, needle);
        assert.ok(matches('code', name, token.scope), `${name}: ${JSON.stringify(source)} keeps ${needle} as code (scope ${token.scope})`);
        checked++;
    }
}

// A footnote body is inline content; a block-attribute line as a whole body is an attribute block.
const bodies = [
    ['a[^1]\n\n[^1]: some *bold* text\n', 'bold', 'bold', true, (s) => assert.ok(html(s).includes('<p>some <strong>bold</strong> text'))],
    ['a[^1]\n\n[^1]: {empty}\n', 'empty', 'attributes', true, (s) => assert.ok(!html(s).includes('empty'))],
    [':: term\n: {empty}\n', 'empty', 'attributes', true, (s) => assert.ok(html(s).includes('<dd></dd>'))],
    ['a[^1]\n\n[^1]: {.c} text\n', '.c', 'attributes', false, (s) => assert.ok(html(s).includes('<p>{.c} text'))],
    [':: term\n: {.c} text\n', '.c', 'attributes', false, (s) => assert.ok(html(s).includes('<dd>{.c} text</dd>'))],
];
for (const [source, needle, kind, scoped, parser] of bodies) {
    parser(source);
    for (const [name, tokenize] of surfaces) {
        const token = await tokenAt(tokenize, source, needle, source.lastIndexOf('[^1]') + 1);
        assert.equal(matches(kind, name, token.scope), scoped, `${name}: ${JSON.stringify(source)} scopes ${needle} as ${kind}: ${scoped} (scope ${token.scope})`);
        checked++;
    }
}

console.log(`escapes, container fences and note bodies: ${checked} checks across ${surfaces.length} surfaces`);
