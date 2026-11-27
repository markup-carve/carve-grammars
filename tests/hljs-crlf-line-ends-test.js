/**
 * highlight.js: a CRLF document highlights like its LF copy (carve-grammars#995).
 * A CR directly before an LF is part of the line ending (C2-B-010). The rules
 * matched the LF alone and let `$` stop between the CR and the LF, which kept
 * the CR inside a scope or read one CRLF as two line ends.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import hljs from 'highlight.js';
import carve from '../highlightjs/carve.mjs';

hljs.registerLanguage('carve', carve);
const hl = (source) => hljs.highlight(source, { language: 'carve', ignoreIllegals: true }).value;

// The issue's three Expected sections.
assert.equal(hl('a\r\n%% c\r\n{#m}'), 'a\r\n<span class="hljs-comment">%% c</span>\r\n{#m}');
assert.equal(hl('{#a}{.b}\r\npara'), '<span class="hljs-attr">{#a}</span><span class="hljs-attr">{.b}</span>\r\npara');
assert.equal(hl('{={=\r\n\r\n\r\n{=}'), '{={=\r\n\r\n\r\n{=}');

// The 37 shapes the issue counted, then every 0.2 clause case and example.
const shapes = [
    "_{{ $w{=\n\n*a=}\n\"",
    "**{=$w\n\n\n\n:: {=}:: ",
    "1. ::::\n    >\n",
    "{#a}{.b}\npara",
    "- | a | b |\n---yaml\nk: v\n---\n",
    "{.a}{k=v}{#b}\n# Title\n\n- one\n\n  two\n- three",
    "- > a\n  > b",
    "a\n{#m}\n---yaml\nk: v\n---\n",
    "*a\n\nb* and `c\n\nd`",
    "a[^n]\n\n[^n]: x\n\n  ```\n  y\n  ```\n---yaml\nk: v\n---\n",
    "a[^n]\n\n[^n]: x\n---yaml\nk: v\n---\n",
    "- a\n  - %%%\n%%%\nx",
    "- > a\n  > \t::: |\n  > \tx\n  > \t:::",
    "- a\n---yaml\nk: v\n---\n",
    "a\n---yaml\nk: v\n---\n",
    "[a]: /u\n  \"T\" {.c}\n  {.d}\nPara\n\nSee [a].\n",
    "  c\n  > %%%\n",
    "*}`c`_\n\n*$w{=*{{ ",
    "- = H\n---yaml\nk: v\n---\n",
    "    i) > $$x$$\n   > ## H\n",
    "- ```js\n  x\n  ```\n\n- * inner",
    "{=*@lines:1\n:: a_a:: `c`",
    "\n{{ a@lines:1\n:: \"{{ a\n",
    "::: |\na\n%%%\nhidden\n:::",
    "\n\n{=@lines:1a\n\n_\"$w{=}",
    "{={=\n\n\n{=}",
    "{=*}\n\n{{ \n\n{=*@lines:1\n\n",
    "- %%%\n%%%\nx",
    "- ```\n  x\n  ```\n\n  b\n- c\n",
    " - ```\n   x\n   ```\n\n ---yaml\nk: v\n---\n",
    "- :::\n  x\n  :::\n---yaml\nk: v\n---\n",
    "- ```\n  x\n  ```\n---yaml\nk: v\n---\n",
    "- > q\n\n  p\n- ```\n  code\n  ```\n  p2",
    "- > q\n---yaml\nk: v\n---\n",
    ":: t\n: :: inner\n  : innerd",
    "- :: t\n  : ::::\n    :: u\n    : x\n   - y\n",
    "- x\n  - %%%\n%% c\n  y"
];
const spec = new URL('../spec/spec/0.2/', import.meta.url);
const inputs = [];
const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.input === 'string') inputs.push(node.input);
    if (typeof node.source === 'string') inputs.push(node.source);
    for (const value of Object.values(node)) walk(value);
};
walk(JSON.parse(readFileSync(new URL('conformance/clause-cases.json', spec), 'utf8')));
walk(JSON.parse(readFileSync(new URL('conformance/examples.json', spec), 'utf8')));

let checked = 0;
for (const source of [...shapes, ...inputs]) {
    if (!source.includes('\n') || source.includes('\r')) continue;
    const lf = hl(source);
    assert.equal(hl(source.replaceAll('\n', '\r\n')), lf.replaceAll('\n', '\r\n'), JSON.stringify(source.replaceAll('\n', '\r\n')));
    // A document may mix both line ends: every other line break is a CRLF.
    let n = 0;
    const mixed = source.replace(/\n/g, () => (n++ % 2 ? '\r\n' : '\n'));
    n = 0;
    assert.equal(hl(mixed), lf.replace(/\n/g, () => (n++ % 2 ? '\r\n' : '\n')), JSON.stringify(mixed));
    checked++;
}
console.log(`highlight.js CRLF line ends: ${checked} inputs read as their LF copy, all CRLF and mixed`);
