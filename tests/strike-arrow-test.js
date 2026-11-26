/**
 * Carve 0.2 has no substitution: `~>` is text and the braced tilde is always
 * strike (C2-I-062, carve-grammars#964). An attribute block glued to such a
 * strike attaches to it, as to any braced span.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import Prism from 'prismjs';
import hljs from 'highlight.js';
import { render } from '@markup-carve/carve';
import carve from '../highlightjs/carve.mjs';
import { textmateLineTokenizer } from './lib/textmate-lines.js';

globalThis.Prism = Prism;
await import('../prism/carve.js');
hljs.registerLanguage('carve', carve);
const tokenize = await textmateLineTokenizer(resolve('textmate/carve.tmLanguage.json'));

function prismLeaves(source) {
    const out = [];
    const visit = (node, scope = 'text') => {
        if (typeof node === 'string') {
            if (node) out.push([scope, node]);
        } else if (Array.isArray(node)) node.forEach(child => visit(child, scope));
        else visit(node.content, scope === 'text' ? node.type : `${scope}>${node.type}`);
    };
    visit(Prism.tokenize(source, Prism.languages.carve));
    return out;
}

let count = 0;
for (const [source, html, struck] of [
    ['a {~old~>new~} b', '<p>a <s>old~&gt;new</s> b</p>', '{~old~>new~}'],
    ['{~a~>~}', '<p><s>a~&gt;</s></p>', '{~a~>~}'],
    ['{~~>b~}', '<p><s>~&gt;b</s></p>', '{~~>b~}'],
    ['x {~*a*~>b~} y', '<p>x <s><strong>a</strong>~&gt;b</s> y</p>', null],
    ['= H {~old~>new~}', '<section id="H-old-new">\n  <h1>H <s>old~&gt;new</s></h1>\n</section>', null],
    ['| {~old~>new~} |', null, null],
]) {
    if (html) assert.equal(render(source).trim(), html, `carve-js: ${source}`);
    const arrow = source.indexOf('~>');

    const leaves = prismLeaves(source);
    assert.ok(leaves.every(([scope]) => !/inserted|deleted|changed/.test(scope)),
        `Prism has no substitution scopes: ${source} ${JSON.stringify(leaves)}`);
    let at = 0;
    const arrowLeaf = leaves.find(([, text]) => {
        const hit = at <= arrow && arrow < at + text.length;
        at += text.length;
        return hit;
    });
    assert.match(arrowLeaf[0], /(?:^|>)forced-strike$/, `Prism scopes the arrow as strike text: ${source}`);
    if (struck) assert.ok(leaves.some(([scope, text]) => scope === 'forced-strike' && text === struck), `Prism strike: ${source}`);

    const highlighted = hljs.highlight(source, { language: 'carve' }).value;
    assert.ok(!/hljs-(?:addition|punctuation)/.test(highlighted), `highlight.js has no substitution scopes: ${highlighted}`);
    assert.match(highlighted, /<span class="hljs-deletion">\{~[^]*~&gt;[^]*~\}<\/span>/, `highlight.js strike: ${source}`);

    const tokens = tokenize(source);
    at = 0;
    const arrowToken = tokens.find(({ text }) => {
        const hit = at <= arrow && arrow < at + text.length;
        at += text.length;
        return hit;
    });
    assert.match(arrowToken.scope, /markup\.strikethrough\.carve/, `TextMate scopes the arrow as strike: ${source}`);
    assert.ok(tokens.every(({ scope }) => !/changed|inserted|deleted/.test(scope)), `TextMate has no substitution scopes: ${source}`);
    count += 1;
}

// The attribute block attaches to the strike, arrow or not.
const attached = 'x {~a~>b~}{.c} y';
assert.equal(render(attached).trim(), '<p>x <s class="c">a~&gt;b</s> y</p>');
assert.ok(prismLeaves(attached).some(([scope, text]) => scope === 'attributes>class-name' && text === '.c'), 'Prism attaches {.c}');
assert.match(hljs.highlight(attached, { language: 'carve' }).value, /<span class="hljs-attr">\{\.c\}<\/span>/, 'highlight.js attaches {.c}');
assert.ok(tokenize(attached).some(({ scope, text }) => scope.includes('entity.other.attribute-name.class.carve') && text === '.c'),
    'TextMate attaches {.c}');
count += 1;

// A replacement is a deletion followed by an insertion.
const replaced = '{-old-}{+new+}';
assert.deepEqual(prismLeaves(replaced), [['deleted', '{-old-}'], ['inserted', '{+new+}']]);
assert.equal(hljs.highlight(replaced, { language: 'carve' }).value,
    '<span class="hljs-deletion">{-old-}</span><span class="hljs-addition">{+new+}</span>');
assert.ok(tokenize(replaced).some(({ scope }) => scope.includes('markup.deleted.carve')));
assert.ok(tokenize(replaced).some(({ scope }) => scope.includes('markup.inserted.carve')));
count += 1;

console.log(`strike arrow: ${count} assertion groups passed`);
