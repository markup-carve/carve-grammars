/**
 * An unquoted attribute value holds no space, tab, quote, backslash, pipe or
 * closing brace (C2-I-032, carve-grammars#938), in every host a block can
 * glue to.
 *
 * The TextMate JSON has no shared regex variable, so the value class is
 * spelled out in every pattern that embeds an attribute block. The guard below
 * keeps every spelling, in all three grammars, free of `|`, `\` and `}`; the
 * host matrix checks each grammar against the pinned carve-js.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

let count = 0;

// Guard: every unquoted-value class (`[^\s"'...]`) excludes the pipe, the backslash and the closing brace.
const strings = [];
(function walk(node) {
    if (typeof node === 'string') strings.push(node);
    else if (node && typeof node === 'object') Object.values(node).forEach(walk);
})(JSON.parse(readFileSync('textmate/carve.tmLanguage.json', 'utf8')));
for (const [name, source] of [
    ['textmate', strings.join('\n')],
    ['prism', readFileSync('prism/carve.js', 'utf8')],
    ['hljs', readFileSync('highlightjs/carve.js', 'utf8')],
]) {
    const classes = [...source.matchAll(/\[\^\\s"'((?:[^\]\\]|\\.)*)\]/g)];
    assert.ok(classes.length > 0, `${name}: finds its unquoted-value classes`);
    for (const [spelled, members] of classes) {
        for (const excluded of ['|', '\\\\', '}']) {
            assert.ok(members.includes(excluded), `${name}: ${spelled} must exclude ${excluded}`);
        }
        count++;
    }
}

// Host matrix: the grammar scopes a glued block as attributes exactly when carve-js attaches it.
const textmateAttr = (source) => tokenize(source).filter(({ scope }) => /\battributes?\b/.test(scope)).map(({ text }) => text).join('');
function prismAttr(source) {
    let out = '';
    const visit = (node, inside) => {
        if (typeof node === 'string') {
            if (inside) out += node;
        } else if (Array.isArray(node)) node.forEach((child) => visit(child, inside));
        else visit(node.content, inside || node.type === 'attributes' || node.alias === 'attr-value');
    };
    visit(Prism.tokenize(source, Prism.languages.carve), false);
    return out;
}
function hljsAttr(source) {
    const html = hljs.highlight(source, { language: 'carve' }).value;
    const stack = [];
    let out = '';
    for (const [, open, text] of html.matchAll(/<span class="([^"]*)">|<\/span>|([^<]+)/g)) {
        if (open !== undefined) stack.push(open);
        else if (text === undefined) stack.pop();
        else if (stack.some((c) => c.split(' ').includes('hljs-attr'))) out += text;
    }
    return out;
}
const hosts = [
    '[a]{ATTR}', '[a](u){ATTR}', '![a](u){ATTR}', '*a*{ATTR}', '`c`{ATTR}', '$`m`{ATTR}',
    '{=m=}{ATTR}', '{_u_}{ATTR}', '{+i+}{ATTR}', '{-d-}{ATTR}', '{^s^}{ATTR}', '{~s~}{ATTR}',
    '<http://x.y>{ATTR}', '[^n]{ATTR}\n\n[^n]: f', '{ATTR}\npara', '-{ATTR} x', '1.{ATTR} x',
    '| a |{ATTR}', '|{ATTR} a |', '|{< ATTR} a |',
    '# A [a]{ATTR}', '> [a]{ATTR}', '- x [a]{ATTR}', '1. x [a]{ATTR}', '| [a]{ATTR} |',
    '![a](x.png)\n^ cap [a]{ATTR}', '::: note\n[a]{ATTR}\n:::', 'x *a*{ATTR} y',
];
const grammars = [['textmate', textmateAttr], ['prism', prismAttr], ['hljs', hljsAttr]];
for (const host of hosts) {
    for (const value of ['a.b:c', 'a|b', 'a\\b', 'a|', '\\b']) {
        const block = `k=${value}`;
        const source = host.replace('ATTR', block);
        const attached = render(source).includes(' k="');
        assert.equal(attached, !/[|\\]/.test(value), `carve-js reads C2-I-032: ${JSON.stringify(source)}`);
        for (const [name, scoped] of grammars) {
            if (!attached) {
                const leaked = scoped(source);
                assert.ok(name === 'textmate' ? leaked === '' : !leaked.includes(block), `${name}: no attribute scope: ${JSON.stringify(source)}`);
            } else if (name === 'textmate') {
                // Prism and highlight.js do not scope every host; TextMate does.
                assert.notEqual(scoped(source), '', `${name}: attribute scope: ${JSON.stringify(source)}`);
            }
            count++;
        }
    }
}

// No backtracking added: a 32 KB attribute-dense document stays linear.
{
    const line = '[a]{#i .c k=a.b:c} *b*{k=a|b} `c`{k=a\\b} [^n]{k="q"} ';
    const source = `${line.repeat(Math.ceil(32768 / line.length / 8))}\n`.repeat(8);
    for (const [name, run] of [['textmate', tokenize], ['prism', prismAttr], ['hljs', hljsAttr]]) {
        const started = process.hrtime.bigint();
        run(source);
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        assert.ok(ms < 3000, `${name}: 32 KB attribute-dense document took ${ms.toFixed(0)} ms`);
        count++;
    }
}

console.log(`attribute value class: ${count} assertion groups passed`);
