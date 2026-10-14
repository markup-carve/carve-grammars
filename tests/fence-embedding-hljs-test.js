/**
 * The highlight.js grammar highlights a fenced code body in the language its
 * info string names when highlight.js has that language registered, and
 * leaves it inert text otherwise. The word list follows
 * fence-languages/fence-languages.json: every word highlight.js resolves must
 * reach the language it resolves to.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import carve from '../highlightjs/carve.mjs';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

const require = createRequire(import.meta.url);
const hljs = require('highlight.js');
hljs.registerLanguage('carve', carve);
const table = JSON.parse(readFileSync(new URL('../fence-languages/fence-languages.json', import.meta.url), 'utf8'));
let count = 0;

const html = (instance, source) => instance.highlight(source, { language: 'carve' }).value;
const keyOf = (word) => {
    const language = hljs.getLanguage(word);
    return language && hljs.listLanguages().find((key) => hljs.getLanguage(key) === language);
};

// Every table word highlight.js knows reaches its language.
for (const { words, language } of table.languages) {
    // A row means one language: the first of its names highlight.js resolves.
    const rowKey = language === 'carve' ? 'carve' : [language, ...words].map(keyOf).find(Boolean);
    for (const word of words) {
        const key = rowKey;
        const out = html(hljs, `\`\`\`${word}\nx = 1\n\`\`\`\n`);
        if (key) assert.match(out, new RegExp(`class="language-${key}"`), `${word} -> ${key}`);
        else assert.doesNotMatch(out, /class="language-/, `${word} names no registered language`);
        count++;
    }
}

const ROWS = [
    // Case-insensitive words, the title and label scoped apart.
    ['```PY "t" [l]\nx = 1\n```\n', /<span class="hljs-title">PY<\/span> <span class="hljs-string">&quot;t&quot;<\/span> <span class="hljs-symbol">\[l\]<\/span><span class="language-python">/],
    ['```=html\n<b>x</b>\n```\n', /<span class="hljs-keyword">=html<\/span><span class="language-xml">/],
    ['```=latex\n\\x\n```\n', /class="language-latex"/],
    ['{.diff}\n```\n+ added\n```\n', /<span class="language-diff">\n<span class="hljs-addition">\+ added<\/span>/],
    ['{.c .diff}\n```python\nx = 1\n```\n', /class="language-python"/],
    ['```carve\n*b* c\n```\n', /class="language-carve">\n<span class="hljs-strong">\*b\*<\/span>/],
    // The block ends at its own closer, whatever the embedded grammar left open.
    ['```python\ns = """open\n```\n\nafter *b*\n', /<\/span><span class="hljs-keyword">```<\/span><\/span>\n\nafter <span class="hljs-strong">\*b\*<\/span>/],
    ['````js\n```\nx\n````\n*b*\n', /<span class="hljs-keyword">````<\/span><\/span>\n<span class="hljs-strong">/],
];
for (const [source, want] of ROWS) {
    assert.match(html(hljs, source), want, JSON.stringify(source));
    count++;
}

// An unknown word, and a language highlight.js has not registered, keep the body inert.
const bare = hljs.newInstance();
bare.registerLanguage('carve', carve);
for (const [instance, source] of [[hljs, '```nolang\nx *b* y\n```\n'], [bare, '```python\nx *b* y\n```\n']]) {
    const out = html(instance, source);
    assert.doesNotMatch(out, /class="language-|hljs-strong/, JSON.stringify(source));
    assert.match(out, /^<span class="hljs-code">.*\nx \*b\* y\n<span class="hljs-keyword">```<\/span><\/span>/s, JSON.stringify(source));
    count++;
}

assertThisFileRuns(import.meta.url);
console.log(`${count} highlight.js fence embedding assertions passed`);
