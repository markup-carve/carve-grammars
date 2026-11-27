/**
 * Include directives and definitions, read as carve-js main reads them, in
 * Prism, highlight.js and TextMate (carve-grammars#988, #989).
 *
 * Every part after an include's path is an `@` option (C2-B-156): a bare path
 * holds no `"` (C2-B-202), an option value may hold `{{` (C2-B-204), and a
 * word that is no option makes the line text. A definition stands right under
 * a term line or an attribute line, which are no paragraph text, and is a lazy
 * line under a description (C2-B-081, C2-B-024).
 */
import assert from 'node:assert/strict';

import Prism from 'prismjs';
import hljs from 'highlight.js';
import carve from '../highlightjs/carve.mjs';
import { textmateLineTokenizer, covered } from './lib/textmate-lines.js';

globalThis.Prism = Prism;
await import('../prism/carve.js');
hljs.registerLanguage('carve', carve);
const textmate = await textmateLineTokenizer('textmate/carve.tmLanguage.json');

function prismCovered(source, types) {
    let out = '';
    const visit = (node, inside) => {
        if (typeof node === 'string') {
            if (inside) out += node;
        } else if (Array.isArray(node)) node.forEach((child) => visit(child, inside));
        else visit(node.content, inside || types.includes(node.type));
    };
    visit(Prism.tokenize(source, Prism.languages.carve), false);
    return out;
}
const unescape = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
// The text under an outermost span of `kind`.
function hljsCovered(source, kind) {
    const html = hljs.highlight(source, { language: 'carve', ignoreIllegals: true }).value;
    const stack = [];
    let out = '';
    for (const [, open, text] of html.matchAll(/<span class="([^"]*)">|<\/span>|([^<]+)/g)) {
        if (open !== undefined) stack.push(open.replace(/^hljs-/, ''));
        else if (text === undefined) stack.pop();
        else if (stack.includes(kind)) out += unescape(text);
    }
    return out;
}

const include = {
    prism: (source) => prismCovered(source, ['include-directive']),
    hljs: (source) => hljsCovered(source, 'meta'),
    textmate: (source) => covered(textmate, source, 'meta.directive.include.carve'),
};
for (const [source, expected] of [
    ['{{ a.crv }}', '{{ a.crv }}'],
    ['{{ a #s }}', '{{ a #s }}'],
    ['{{ a#s@x:1@y }}', '{{ a#s@x:1@y }}'],
    ['{{ a @shift:1@lines:1-8 }}', '{{ a @shift:1@lines:1-8 }}'],
    ['{{ a @x:{{ }}', '{{ a @x:{{ }}'],
    ['{{ a @x:v{{y }}', '{{ a @x:v{{y }}'],
    ['{{ a @label:"x }} y" }}', '{{ a @label:"x }} y" }}'],
    ['{{ "q r.crv" #s @code }}', '{{ "q r.crv" #s @code }}'],
    ['{{ a"b }}', ''],
    ['{{ a b }}', ''],
    ['{{ a "x" }}', ''],
    ['{{ a @x {{ }}', ''],
    ['{{ a {{ b.crv }}', '{{ b.crv }}'],
    ['a {{ a {{ a {{ ', ''],
]) {
    for (const [name, read] of Object.entries(include)) {
        assert.equal(read(source), expected, `${name}: include in ${JSON.stringify(source)}`);
    }
}

const definition = {
    prism: (source) => prismCovered(source, ['reference-definition', 'abbreviation-definition']),
    hljs: (source) => hljsCovered(source, 'symbol'),
    textmate: (source) => covered(textmate, source, 'meta.link.reference.def.carve') + covered(textmate, source, 'meta.abbreviation.carve'),
};
// carve-grammars#990 tracks the TextMate rows that still differ.
const textmateGaps = new Set(['- :: t\n[a]: /u']);
for (const [source, expected] of [
    [':: t\n[a]: /u', '[a]: /u'],
    [':: t\n*[A]: x', '*[A]: x'],
    ['> :: t\n[a]: /u', '[a]: /u'],
    ['- :: t\n[a]: /u', '[a]: /u'],
    [':: s\n:: t\n[a]: /u', '[a]: /u'],
    [':: t\n  more\n[a]: /u', '[a]: /u'],
    [':: a\n: d\n:: t\n[a]: /u', '[a]: /u'],
    [':: t\n%% c\n[a]: /u', '[a]: /u'],
    ['{.c}\n[a]: /u', '[a]: /u'],
    ['{#x .c}\n*[A]: x', '*[A]: x'],
    [':: t\n{.c}\n[a]: /u', '[a]: /u'],
    [':: t\n: d\n[a]: /u', ''],
    ['p\n:: t\n[a]: /u', ''],
    ['p\n{.c}\n[a]: /u', ''],
    ['- a\n  :: t\n[a]: /u', ''],
    ['p\n[a]: /u', ''],
]) {
    for (const [name, read] of Object.entries(definition)) {
        if (name === 'textmate' && textmateGaps.has(source)) continue;
        assert.equal(read(source), expected, `${name}: definition in ${JSON.stringify(source)}`);
    }
}
// Prism's closer filter reads a CRLF as one line break, not as a blank line.
for (const [source, type] of [['*abc\r\ndef*', 'bold'], ['/abc\r\ndef/', 'italic'], ['*abc\r\n\r\ndef*', null]]) {
    assert.equal(prismCovered(source, ['bold', 'italic']), type ? source : '', `prism: ${JSON.stringify(source)}`);
}
console.log('include directives and definitions: Prism, highlight.js and TextMate agree with carve-js');
