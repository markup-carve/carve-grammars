import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { textmateTokenizer } from './lib/textmate-engine.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);
const path = fileURLToPath(new URL('../textmate/carve.tmLanguage.json', import.meta.url));
const tokenizers = [await textmateLineTokenizer(path), await textmateTokenizer(path)];
for (const tokenize of tokenizers) {
    for (const [marker, indent] of [['- ', '  '], ['1. ', '   '], ['- [ ] ', '  '], ['- - ', '    ']]) {
        for (const [kind, scope] of [['note', 'meta.admonition.carve'], ['figure', 'meta.figure-group.carve'], ['figure "Title"', 'meta.admonition.carve']]) {
            const source = `${marker}::: ${kind}\n${indent}Body\n${indent}:::\n\nAfter.\n`;
            for (const input of [source, source.replace('\n\n', '\n')]) {
                const tokens = tokenize(input);
                assert.equal(tokens.map(t => t.text).join('').replace(/\n$/, ''), input.replace(/\n$/, ''));
                const opener = tokens.filter(t => t.text.includes(kind.split(' ')[0]));
                assert.ok(opener.length && opener.every(t => (t.scope ?? '').includes(scope)), source);
                assert.ok(tokens.some(t => t.text.includes('Body')), input);
                assert.ok(tokens.some(t => t.text.includes('After.')), input);
                assert.ok(tokens.filter(t => t.text.includes('Body')).every(t => (t.scope ?? '').includes(scope)), source);
                const closer = tokens.filter(t => t.text.includes(':::')).at(-1);
                assert.ok(closer?.scope.includes(scope), input);
                assert.ok(tokens.filter(t => t.text.includes('After.')).every(t => !(t.scope ?? '').includes('meta.admonition') && !(t.scope ?? '').includes('meta.figure-group')), source);
            }
        }
    }
    for (const kind of ['note', 'figure']) {
        const source = `- a\n  - ::: ${kind}\n    body\n  - sibling\n  tail`;
        const tokens = tokenize(source);
        assert.equal(tokens.map(t => t.text).join(''), source);
        for (const text of ['sibling', 'tail']) {
            const leaves = tokens.filter(t => t.text.includes(text));
            assert.ok(leaves.length, source);
            assert.ok(leaves.every(t => !(t.scope ?? '').includes('meta.admonition') && !(t.scope ?? '').includes('meta.figure-group')), source);
        }
    }
    const consecutive = tokenize('- ::: note\n  text\n  :::\n\n- ::: figure\n  ![a](b.png)\n  :::\n\nAfter.');
    assert.ok(consecutive.filter(t => t.text.includes('figure')).every(t => (t.scope ?? '').includes('meta.figure-group.carve') && !(t.scope ?? '').includes('meta.admonition.carve')));
    for (const source of ['- ::: note\nAfter.', '- ::: figure\nAfter.']) {
        assert.ok(tokenize(source).filter(t => t.text.includes('After.')).every(t => !(t.scope ?? '').includes('meta.admonition') && !(t.scope ?? '').includes('meta.figure-group')), source);
    }
    for (const source of ['- prose ::: note\n  body', '- :::note\n  body', '- :::\tnote\n  body']) {
        assert.ok(tokenize(source).every(t => !(t.scope ?? '').includes('meta.admonition') && !(t.scope ?? '').includes('meta.figure-group')), source);
    }
    const nested = tokenize('- ::: note\n  1. para text\n  :::\n\nAfter.');
    assert.ok(nested.some(t => (t.scope ?? '').includes('punctuation.definition.list.numbered') && (t.scope ?? '').includes('meta.admonition')));
}
console.log('container marker lines: opener, body, closer and following text retain their scopes');
