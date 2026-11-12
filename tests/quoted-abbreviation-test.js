// carve-grammars#844 and #845: a quoted line and a description list on an item's marker line collect abbreviation definitions.
import assert from 'node:assert/strict';
import { carveToHtml } from '@markup-carve/carve';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { textmateTokenizer } from './lib/textmate-engine.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const textmate = await textmateTokenizer(new URL('../textmate/carve.tmLanguage.json', import.meta.url).pathname);
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const grammars = {
    textmate: (src) => textmate(src).some((t) => (t.scope ?? '').includes('entity.name.abbreviation') && t.text === 'HTML'),
    prism: (src) => prismTokens(src).some((t) => /abbreviation-definition>symbol/.test(t.scope ?? '') && t.text === 'HTML'),
    'highlight.js': (src) => hljsTokens(src).some((t) => t.scope === 'symbol' && t.text.trimStart().startsWith('*[HTML]:')),
};

const DEFINES = [
    '> q\n> *[HTML]: HyperText\nHTML\n',
    '> *[HTML]: HyperText\nHTML\n',
    '> > q\n> > *[HTML]: HyperText\nHTML\n',
    '>  *[HTML]: HyperText\nHTML\n',
    '  > *[HTML]: HyperText\nHTML\n',
    '> # h\n> *[HTML]: HyperText\nHTML\n',
    '> - *[HTML]: HyperText\nHTML\n',
    '> - i\n>   *[HTML]: HyperText\nHTML\n',
    '- > *[HTML]: HyperText\nHTML\n',
    '1. > q\n   > *[HTML]: HyperText\nHTML\n',
    '> :: t\n> : d\n> *[HTML]: HyperText\nHTML\n',
    '> :: t\n> : *[HTML]: HyperText\nHTML\n',
    '- :: t\n  : *[HTML]: HyperText\nHTML\n',
    '1. :: t\n   : *[HTML]: HyperText\nHTML\n',
    '- [ ] :: t\n      : d\n      *[HTML]: HyperText\nHTML\n',
];

const LITERAL = [
    '> q *[HTML]: HyperText\n',
    '> *[HTML]:HyperText\n',
    '> *[HTML]: \n',
    '*[HTML]: \n',
    '> >*[HTML]: HyperText\n',
    '> ```\n> *[HTML]: HyperText\n> ```\n',
    '> :: *[HTML]: HyperText\n> : d\n',
];

const collected = (src) => !carveToHtml(src).includes('*[HTML]');

console.log('abbreviation definition behind a quote or on a marker-line description:');
for (const src of DEFINES) {
    ok(JSON.stringify(src), () => {
        assert.ok(collected(src), 'carve-js collects the definition');
        for (const [name, defines] of Object.entries(grammars)) assert.ok(defines(src), name);
    });
}
for (const src of LITERAL) {
    ok(`${JSON.stringify(src)} stays text`, () => {
        assert.ok(!collected(src), 'carve-js keeps the line');
        for (const [name, defines] of Object.entries(grammars)) assert.ok(!defines(src), name);
    });
}

ok('TextMate scopes a term opened on an item marker line, and its marker', () => {
    const tokens = textmate('- :: t\n  : *[HTML]: HyperText\nHTML\n');
    assert.ok(tokens.some((t) => t.text === 't' && (t.scope ?? '').includes('entity.name.tag.definition.term')));
    assert.ok(tokens.some((t) => t.text === ':' && (t.scope ?? '').includes('punctuation.definition.list.definition')));
});

ok('a quoted definition keeps its quote prefix scoped', () => {
    assert.ok(textmate('> *[HTML]: HyperText\n').some((t) => t.text.startsWith('>') && (t.scope ?? '').includes('punctuation.definition.quote')));
    assert.ok(prismTokens('> - *[HTML]: HyperText\n').some((t) => t.scope === 'blockquote>list>punctuation'));
});

// Prism's quoted list token takes no glued attribute block, as at the document level.
ok('a glued attribute block on a quoted item marker in TextMate and highlight.js', () => {
    for (const src of ['> -{#x} *[HTML]: HyperText\nHTML\n', '> 1.{.c} *[HTML]: HyperText\nHTML\n']) {
        assert.ok(collected(src), 'carve-js collects the definition');
        assert.ok(grammars.textmate(src), `textmate ${JSON.stringify(src)}`);
        assert.ok(grammars['highlight.js'](src), `highlight.js ${JSON.stringify(src)}`);
    }
});

console.log(`quoted abbreviation: ${passed} checks pass`);
