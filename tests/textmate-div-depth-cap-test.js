import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Registry, INITIAL } from '@shikijs/vscode-textmate';
import { createOnigurumaEngine } from '@shikijs/engine-oniguruma';

const grammar = JSON.parse(readFileSync('textmate/carve.tmLanguage.json', 'utf8'));
const engine = await createOnigurumaEngine(import('shiki/wasm'));
const registry = new Registry({
    onigLib: {
        createOnigScanner: (patterns) => engine.createScanner(patterns),
        createOnigString: (source) => engine.createString(source),
    },
    loadGrammar: () => grammar,
});
const loaded = await registry.loadGrammar(grammar.scopeName);
const divScopes = new Set(['meta.admonition.carve', 'meta.figure-group.carve']);

function lastLine(source) {
    let state = INITIAL;
    let tokens;
    for (const line of source.trimEnd().split('\n')) {
        const result = loaded.tokenizeLine(line, state);
        state = result.ruleStack;
        tokens = result.tokens;
    }
    return tokens;
}
function depth(tokens) {
    return Math.max(...tokens.map(({ scopes }) => scopes.filter((scope) => divScopes.has(scope)).length));
}

const forms = [
    ['named', '::: note\n', '::: note\n'],
    ['anonymous', '::: *\n', '::: *\n'],
    ['titled', '::: "T"\n', '::: "T"\n'],
    ['labeled', '::: [label]\n', '::: [label]\n'],
    ['list marker', '- ::: note\n', '  ::: note\n'],
    ['figure group', '::: figure\n', '::: note\n'],
];
for (const [name, first, nested] of forms) {
    const prefix = first + nested.repeat(63);
    assert.equal(depth(lastLine(prefix)), 64, `${name}: the 64th opener retains its scope`);
    const after = lastLine(prefix + nested);
    assert.equal(depth(after), 64, `${name}: the 65th opener does not push a frame`);
    assert.ok(!after.some(({ scopes }) => scopes.includes('punctuation.definition.admonition.carve')),
        `${name}: the 65th opener is literal text`);
}

// The same limit applies when opener spellings alternate within a document.
const mixed = Array.from({ length: 65 }, (_, i) => ['::: note\n', '::: *\n', '::: "T"\n'][i % 3]);
assert.equal(depth(lastLine(mixed.slice(0, 64).join(''))), 64);
assert.equal(depth(lastLine(mixed.join(''))), 64);
console.log('TextMate div depth: six container paths and mixed openers stop at 64');
