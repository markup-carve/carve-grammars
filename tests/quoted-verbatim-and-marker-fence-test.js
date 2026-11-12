// carve-grammars#858 and #859: Prism reads verbatim spans on quoted lines and
// quote fences on marker lines as carve-js does.
import assert from 'node:assert/strict';
import { carveToHtml } from '@markup-carve/carve';
import { prismTokens } from './lib/engines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const scopeOf = (src, text) => prismTokens(src).filter((t) => t.text.includes(text)).map((t) => t.scope ?? '').join(' | ');
const strong = (src) => /<strong>q<\/strong>|<em>q<\/em>/.test(carveToHtml(src));
const marked = (src) => prismTokens(src).some((t) => t.text.includes('q') && /bold|italic/.test(t.scope ?? '') && !/code|string|comment/.test(t.scope ?? ''));

console.log('#858: a verbatim span on a quoted line is not markup:');
ok('the ticket reproduction carries the code scope', () => {
    const src = '> a `x *b* y` c\n';
    assert.match(carveToHtml(src), /<code>x \*b\* y<\/code>/);
    assert.match(scopeOf(src, '`x *b* y`'), /blockquote>code/);
    assert.doesNotMatch(scopeOf(src, '*b*'), /bold/);
});
for (const src of [
    '> a ``x\n> /q/\n> y`` c\n',
    '> a `x *q*\n> c *d*\n',
    '> a $`x *q*\n> c\n',
    '> > a `x\n> b *q*\n',
    '> - a `x\n> *q*` b\n',
    '- > `x\n  > *q*` z\n',
    '> ::: |\n> a `x\n> *q*` c\n> :::\n',
]) {
    ok(`a span open on a quoted line runs over its paragraph: ${JSON.stringify(src)}`, () => {
        assert.equal(strong(src), false, 'carve-js reads it as code');
        assert.equal(marked(src), false, 'prism reads it as code');
    });
}
for (const src of [
    '> a `x\n> > b *q*\n',
    '> a `x\n> # *q*\n',
    '- > p\n  > `x\n> w *q*`\n',
    '> a `x\n> y` %% c\n> *q*\n',
    '> - `x\n> - *q*\n',
    '> - a `x\n> y ` z\n> *q*\n',
    '> - a ``x\n> y `` z\n> *q*\n',
]) {
    ok(`the span ends where the paragraph does: ${JSON.stringify(src)}`, () => {
        assert.equal(strong(src), true, 'carve-js reads markup');
        assert.equal(marked(src), true, 'prism reads markup');
    });
}
ok('a comment after a span closed on the next quoted line stays a comment', () => {
    assert.match(scopeOf('> a `x\n> y` %% hidden\n', '%%'), /comment/);
});

console.log('#859: a quote fence on a marker line ends at the content column:');
ok('the ticket reproduction reads the column-0 lines as a new quote', () => {
    const src = '- > ~~~\n> /x/\n> ~~~\n';
    assert.match(carveToHtml(src), /<em>x<\/em>/);
    assert.match(scopeOf(src, '/x/'), /italic/);
    assert.doesNotMatch(scopeOf(src, '/x/'), /code/);
    assert.match(prismTokens(src).filter((t) => t.text.includes('~~~')).at(-1).scope, /code-block/);
});
for (const [marker, inside, outside] of [['- ', '  ', ' '], ['1. ', '   ', '  '], ['10. ', '    ', '   '], ['- - ', '    ', '  '], ['- [ ] ', '  ', ' ']]) {
    for (const fence of ['```', '~~~']) {
        ok(`${JSON.stringify(marker + '> ' + fence)} keeps lines at the content column only`, () => {
            const held = `${marker}> ${fence}\n${inside}> *q*\n${inside}> ${fence}\n`;
            const left = `${marker}> ${fence}\n${outside}> *q*\n${outside}> ${fence}\n`;
            assert.equal(strong(held), false);
            assert.equal(marked(held), false);
            assert.equal(strong(left), true);
            assert.equal(marked(left), true);
        });
    }
}
ok('an unclosed quote fence ends with the quote', () => {
    assert.equal(marked('> ~~~\n> *q*\n'), false);
    assert.equal(marked('> ~~~\n> a\n\n*q*\n'), true);
});
ok('a fence line inside a quoted line block stays text', () => {
    const src = '> ::: |\n> ~~~\n> *q*\n> :::\n';
    assert.equal(strong(src), true);
    assert.equal(marked(src), true);
});

console.log(`\n${passed} passed`);
