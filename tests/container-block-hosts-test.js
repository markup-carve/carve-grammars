// carve-grammars#849 #850 #851 #853: a block opens where carve-js opens it, behind a quote, an item marker or both.
import assert from 'node:assert/strict';
import { carveToHtml } from '@markup-carve/carve';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { textmateTokenizer } from './lib/textmate-engine.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const textmate = await textmateTokenizer(new URL('../textmate/carve.tmLanguage.json', import.meta.url).pathname);
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const leaves = {
    textmate: (src) => textmate(src).map((t) => ({ text: t.text, scope: t.scope ?? '' })),
    prism: (src) => prismTokens(src).map((t) => ({ text: t.text, scope: t.scope ?? '' })),
    'highlight.js': (src) => hljsTokens(src).map((t) => ({ text: t.text, scope: t.ancestors.join('>') })),
};
const some = (src, grammar, pred) => leaves[grammar](src).some(pred);

console.log('a quoted fence behind an indent or an item marker (#849):');
const fenced = {
    textmate: (t) => t.text.includes('/x/') && !/markup\.italic/.test(t.scope) && /markup\.raw\.code/.test(t.scope),
    prism: (t) => t.text.includes('/x/') && /code-block/.test(t.scope),
    'highlight.js': (t) => t.text.includes('/x/') && !/emphasis/.test(t.scope),
};
const italic = { textmate: /markup\.italic/, prism: /italic/ };
for (const src of [
    '- > ```\n  > /x/ *[HTML]: X\n  > ```\n',
    '> - ```\n>   /x/\n>   ```\n',
    '  > ```\n  > /x/\n  > ```\n',
    '> 1. ```js\n>    /x/\n>    ```\n',
]) {
    ok(JSON.stringify(src), () => {
        assert.match(carveToHtml(src), /<pre><code[^>]*>\/x\//);
        for (const grammar of Object.keys(leaves)) {
            assert.ok(some(src, grammar, fenced[grammar]), `${grammar} reads the body as code`);
            assert.ok(!some(src, grammar, (t) => /abbreviation/.test(t.scope)), `${grammar} defines nothing in the body`);
        }
    });
}
ok('a line back at the quote column ends the item and the fence', () => {
    const src = '> - ```\n> /x/\n';
    assert.match(carveToHtml(src), /<em>x<\/em>/);
    // highlight.js leaves a quoted line's inline run unscoped.
    for (const grammar of ['textmate', 'prism']) {
        assert.ok(some(src, grammar, (t) => t.text.includes('x') && italic[grammar].test(t.scope)), grammar);
    }
});

console.log('a definition or term on an item marker line in a nested or glued host (#850):');
const term = {
    textmate: (t) => /entity\.name\.abbreviation/.test(t.scope) && t.text.includes('HTML'),
    prism: (t) => /abbreviation-definition>symbol/.test(t.scope) && t.text === 'HTML',
    'highlight.js': (t) => /symbol/.test(t.scope) && t.text.startsWith('*[HTML]:'),
};
for (const src of ['- *[HTML]: X\nHTML\n', '-{#x} *[HTML]: X\nHTML\n', '> -{#x} *[HTML]: X\nHTML\n', '> - > *[HTML]: X\nHTML\n', '1.{#x} *[HTML]: X\nHTML\n']) {
    ok(JSON.stringify(src), () => {
        assert.match(carveToHtml(src), /<abbr title="X">HTML<\/abbr>/);
        for (const grammar of Object.keys(leaves)) assert.ok(some(src, grammar, term[grammar]), grammar);
    });
}
const entry = {
    textmate: (t) => /definition/.test(t.scope) && t.text.includes('::'),
    prism: (t) => /definition-term/.test(t.scope) && t.text.includes('::'),
    'highlight.js': (t) => /punctuation/.test(t.scope) && t.text.includes('::'),
};
for (const src of ['> - :: t\n>   : d\n', '- > :: t\n  > : d\n']) {
    ok(JSON.stringify(src), () => {
        assert.match(carveToHtml(src), /<dt>t<\/dt>/);
        for (const grammar of Object.keys(leaves)) assert.ok(some(src, grammar, entry[grammar]), grammar);
    });
}

console.log('a quoted item marker after paragraph text is text (#851):');
const marker = { textmate: /punctuation\.definition\.list/, prism: /list/, 'highlight.js': /bullet/ };
const quote = { textmate: /markup\.quote/, prism: /blockquote/, 'highlight.js': /quote/ };
for (const src of ['> p\n> - *[HTML]: X\nHTML\n', 'p\n- > q\n', '> p\n- x\n', '> > p\n> - x\n']) {
    ok(JSON.stringify(src), () => {
        assert.ok(!carveToHtml(src).includes('<li'), 'carve-js keeps the paragraph');
        for (const grammar of Object.keys(leaves)) {
            assert.ok(!some(src, grammar, term[grammar]), `${grammar} defines nothing`);
            assert.ok(!some(src, grammar, (t) => marker[grammar].test(t.scope)), `${grammar} opens no item`);
            if (src.startsWith('p')) assert.ok(!some(src, grammar, (t) => quote[grammar].test(t.scope)), `${grammar} opens no quote`);
        }
    });
}
ok('a deeper quote interrupts the paragraph', () => {
    const src = '> p\n> > - *[HTML]: X\nHTML\n';
    assert.match(carveToHtml(src), /<abbr/);
    for (const grammar of Object.keys(leaves)) assert.ok(some(src, grammar, term[grammar]), grammar);
});

console.log('a line block reads its lines as inline text (#853):');
const block = {
    textmate: (t) => /markup\.heading|entity\.name\.section|punctuation\.definition\.list|meta\.link\.reference|meta\.abbreviation/.test(t.scope),
    prism: (t) => /title|list|reference-definition|abbreviation-definition/.test(t.scope),
    'highlight.js': (t) => /section|bullet|symbol/.test(t.scope),
};
for (const src of [
    '::: |\n# h\n- x\n[r]: /u\n*[HTML]: X\n:::\n',
    '- ::: |\n  # h\n  - x\n  :::\n',
    '::: note\n::: |\n# h\n:::\n:::\n',
    ':::: |\n::: |\n# h\n:::\n::::\n',
    '> ::: |\n> # h\n> - x\n> :::\n',
    '- > ::: |\n  > # h\n  > :::\n',
]) {
    ok(JSON.stringify(src), () => {
        assert.ok(!/<h1|<li>x/.test(carveToHtml(src).replace(/<ul>\s*<li>\s*<div/, '<div')), 'carve-js keeps the lines');
        // The opener line keeps its own item marker.
        const body = (t) => !t.text.includes(':::') && t.text.trim() !== '-';
        for (const grammar of Object.keys(leaves)) assert.ok(!some(src, grammar, (t) => body(t) && block[grammar](t)), grammar);
    });
}
ok('inline markup and a comment block still read in a line block', () => {
    const src = '::: |\n*b* `c`\n%%%\nhidden\n%%%\n:::\n';
    for (const grammar of Object.keys(leaves)) {
        assert.ok(some(src, grammar, (t) => /^\*?b\*?$/.test(t.text) && /bold|strong/.test(t.scope)), `${grammar} bold`);
        assert.ok(some(src, grammar, (t) => t.text.includes('hidden') && /comment/.test(t.scope)), `${grammar} comment`);
    }
});
ok('a colon line of another width in a quoted line block is text', () => {
    const src = '> ::: |\n> :::: \n> :::\n';
    assert.match(carveToHtml(src), /<p>::::/);
    const colons = { textmate: /admonition/, prism: /div-delimiter/, 'highlight.js': /keyword/ };
    for (const grammar of Object.keys(leaves)) assert.ok(!some(src, grammar, (t) => t.text.includes('::::') && colons[grammar].test(t.scope)), grammar);
});
ok('the block closes on its exact colon run and the document reads on', () => {
    const src = '::: |\na\n:::\n# after\n';
    for (const grammar of Object.keys(leaves)) assert.ok(some(src, grammar, (t) => t.text.includes('after') && block[grammar](t)), grammar);
});

console.log(`container block hosts: ${passed} checks pass`);
