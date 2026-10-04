/** A kind word survives invalid metadata; a missing kind still opens nothing. */
import assert from 'node:assert/strict';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

console.log('colon-fence recovery after a trailing comment:');

const scopeOfKind = (tokens, source, kind) => {
    const at = source.indexOf(kind);
    let offset = 0;
    for (const token of tokens) {
        const end = offset + token.text.length;
        if (offset <= at && at < end) return token.scope;
        offset = end;
    }
    return undefined;
};

const dead = [
    ['::: %% h\nbody\n:::', '%%'],
];

const surfaces = [['prism', prismTokens], ['highlightjs', hljsTokens], ...(await textmateEngines())];

for (const [source, kind] of dead) {
    for (const [name, tokenize] of surfaces) {
        ok(`${name} paints no container for ${JSON.stringify(source.split('\n')[0])}`, () => {
            const scope = scopeOfKind(tokenize(source), source, kind) ?? '';
            assert.ok(
                !/div|admonition|class-name|keyword/.test(scope),
                `expected no container scope over ${JSON.stringify(kind)}, got ${JSON.stringify(scope)}`,
            );
        });
    }
}

for (const [name, tokenize] of surfaces) {
    ok(`${name} keeps a named container with trailing comment metadata`, () => {
        const source = '::: note %% h\nbody\n:::';
        const scope = scopeOfKind(tokenize(source), source, 'note') ?? '';
        assert.match(scope, /div|admonition|keyword/);
    });
}

// The live opener must keep everything it had.
ok('prism still paints a real opener', () => {
    const source = '::: note\nbody\n:::';
    const scope = scopeOfKind(prismTokens(source), source, 'note');
    assert.equal(scope, 'div>tag>div-delimiter>class-name');
});

ok('prism still paints an opener carrying a quoted title', () => {
    const source = '::: note "T"\nbody\n:::';
    const scope = scopeOfKind(prismTokens(source), source, '"T"');
    assert.equal(scope, 'div>tag>div-delimiter>string');
});

console.log(`\n${passed} passed`);
