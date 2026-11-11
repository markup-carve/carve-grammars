// carve-grammars#842: a description body collects abbreviation definitions as the document does.
import assert from 'node:assert/strict';
import { carveToHtml } from '@markup-carve/carve';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { textmateTokenizer } from './lib/textmate-engine.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const textmate = await textmateTokenizer(new URL('../textmate/carve.tmLanguage.json', import.meta.url).pathname);
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const OPENER = '*[HTML]:';

const grammars = {
    textmate: (src) => textmate(src).some((t) => (t.scope ?? '').includes('entity.name.abbreviation') && t.text === 'HTML'),
    prism: (src) => prismTokens(src).some((t) => /abbreviation-definition>symbol/.test(t.scope ?? '') && t.text === 'HTML'),
    'highlight.js': (src) => hljsTokens(src).some((t) => t.scope === 'symbol' && t.text.trimStart().startsWith(OPENER)),
};

const DEFINES = [
    ':: t\n: d\n*[HTML]: HyperText\nHTML\n',
    ':: t\n: d\n  *[HTML]: HyperText\nHTML\n',
    ':: t\n: d\n    *[HTML]: HyperText\nHTML\n',
    ':: t\n: d\n  more\n  *[HTML]: HyperText\nHTML\n',
    ':: t\n: *[HTML]: HyperText\nHTML\n',
    ':: t\n:  - i\n    *[HTML]: HyperText\nHTML\n',
    ':: t\n: d\n*[HTML]: HyperText\n: d2\n',
    '- :: t\n  : d\n  *[HTML]: HyperText\nHTML\n',
];

// TextMate opens no definition list on an item's marker line, so it reads this as item text.
const DEFINES_EXCEPT_TEXTMATE = ['- :: t\n  : *[HTML]: HyperText\nHTML\n'];

const LITERAL = [
    ':: t\n: d *[HTML]: HyperText\n',
    ':: t\n: {.c} *[HTML]: HyperText\n',
    ':: t\n: {% c %} *[HTML]: HyperText\n',
    ':: t\n: d\n*[HTML]:HyperText\n',
    ':: *[HTML]: HyperText\n: d\n',
];

const collected = (src) => !carveToHtml(src).includes('*[HTML]');

console.log('abbreviation definition in a description body:');
for (const src of DEFINES) {
    ok(JSON.stringify(src), () => {
        assert.ok(collected(src), 'carve-js collects the definition');
        for (const [name, defines] of Object.entries(grammars)) assert.ok(defines(src), name);
    });
}
for (const src of DEFINES_EXCEPT_TEXTMATE) {
    ok(JSON.stringify(src), () => {
        assert.ok(collected(src), 'carve-js collects the definition');
        assert.ok(grammars.prism(src), 'prism');
        assert.ok(grammars['highlight.js'](src), 'highlight.js');
    });
}
for (const src of LITERAL) {
    ok(`${JSON.stringify(src)} stays text`, () => {
        assert.ok(!collected(src), 'carve-js keeps the line');
        for (const [name, defines] of Object.entries(grammars)) assert.ok(!defines(src), name);
    });
}

ok('a ": " line that is no marker keeps its inline markup in highlight.js', () => {
    for (const src of ['a\n: *[HTML]: /x/\n', '- a\n  : *[HTML]: /x/\n']) {
        assert.ok(hljsTokens(src).some((t) => t.scope === 'emphasis' && t.text === '/x/'), JSON.stringify(src));
    }
});

console.log(`description abbreviation: ${passed} checks pass`);
