// carve-grammars#856: a line right after a quote reads as carve-js reads it, whatever the line alone suggests.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
const term = {
    textmate: (t) => /entity\.name\.abbreviation/.test(t.scope),
    prism: (t) => /abbreviation-definition/.test(t.scope),
    'highlight.js': (t) => /symbol/.test(t.scope) && t.text.includes('*['),
};

ok('the generated TextMate rules are current', () => {
    const check = spawnSync(process.execPath, [new URL('../scripts/generate-lazy-quote-rules.mjs', import.meta.url).pathname, '--check'], { encoding: 'utf8' });
    assert.equal(check.status, 0, check.stderr);
});

console.log('a lazy marker line after a quoted item defines nothing:');
for (const src of [
    '> - a\n- *[HTML]: X\nHTML\n',
    '> 1. a\n2. *[HTML]: X\nHTML\n',
    '> - [ ] a\n- [ ] *[HTML]: X\nHTML\n',
    '> - a\n-{#x} *[HTML]: X\nHTML\n',
    '> > - a\n- *[HTML]: X\nHTML\n',
    '> - a\n> b\n- *[HTML]: X\nHTML\n',
    '> - a\n- > *[HTML]: X\nHTML\n',
]) {
    ok(JSON.stringify(src), () => {
        assert.ok(!carveToHtml(src).includes('<abbr'), 'carve-js defines nothing');
        for (const grammar of Object.keys(leaves)) assert.ok(!some(src, grammar, term[grammar]), grammar);
    });
}
ok('the lazy item keeps its marker scope in TextMate', () => {
    assert.ok(some('> - a\n- *[HTML]: X\nHTML\n', 'textmate', (t) => t.text.startsWith('-') && /punctuation\.definition\.list/.test(t.scope)));
});
for (const src of [
    '> - a\n- *[A]: x\n- *[B]: y\nB\n',
    '> - a\n- *[A]: x\n  - *[B]: y\nB\n',
    '> - a\n- b\n- *[B]: y\nB\n',
    '> # h\n- *[B]: y\nB\n',
    '> - a\n\n- *[B]: y\nB\n',
]) {
    ok(`a sibling, nested or unrelated item still defines: ${JSON.stringify(src)}`, () => {
        assert.match(carveToHtml(src), /<abbr title="y">B<\/abbr>/);
        assert.ok(some(src, 'textmate', term.textmate), 'textmate');
    });
}

console.log('a verbatim run on a lazy line ends before a deeper quote:');
const italic = {
    textmate: (t) => t.text.includes('x') && /markup\.italic/.test(t.scope),
    prism: (t) => t.text.includes('x') && /italic/.test(t.scope),
};
for (const src of [
    '> p\n- > > ```\n  > > /x/\n  > > ```\n',
    '> p\n- > > ```\n  > > /x/\n',
    '> p\n- > > ``\n  > > /x/\n  > > ``\n',
    '> > p\n- > > > ```\n  > > > /x/\n  > > > ```\n',
    '> p\nq `a\n> > /x/ `\n',
]) {
    ok(JSON.stringify(src), () => {
        assert.match(carveToHtml(src), /<em>x<\/em>/);
        // highlight.js leaves a quoted line's inline run unscoped.
        for (const grammar of Object.keys(italic)) assert.ok(some(src, grammar, italic[grammar]), grammar);
    });
}
ok('a run still crosses the quoted lines of its own paragraph', () => {
    const src = '> a `x\n> /y/` b\n';
    assert.match(carveToHtml(src), /<code>x\n\/y\/<\/code>/);
    assert.ok(!some(src, 'textmate', (t) => t.text.includes('y') && /markup\.italic/.test(t.scope)));
});
ok('a quote line ends a paragraph and its paired span in Prism', () => {
    const src = 'p ```x\n> y``` z\n';
    assert.ok(!carveToHtml(src).includes('<code>x\n'));
    assert.ok(!some(src, 'prism', (t) => /code/.test(t.scope) && t.text.includes('\n')));
});

console.log(`lazy quote marker lines: ${passed} checks pass`);
