// carve-grammars#852: an abbreviation definition is a definition in every container, divs included (markup-carve/carve#4874).
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
    ':::\n*[HTML]: Hyper Text\n\nThe HTML spec.\n:::\n',
    '::: note\n*[HTML]: HyperText\n:::\nHTML\n',
    '::: warning "T"\nq\n*[HTML]: HyperText\n:::\nHTML\n',
    '::: figure\n*[HTML]: HyperText\n:::\nHTML\n',
    '::::\n:::\n*[HTML]: HyperText\n:::\n::::\nHTML\n',
    '- ::: note\n  *[HTML]: HyperText\n  :::\nHTML\n',
];

const LITERAL = [
    '::: note\nq *[HTML]: HyperText\n:::\n',
    '::: note\n*[HTML]: \n:::\n',
];

const collected = (src) => !carveToHtml(src).includes('*[HTML]');

console.log('abbreviation definition in a div:');
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

console.log(`div abbreviation: ${passed} checks pass`);
