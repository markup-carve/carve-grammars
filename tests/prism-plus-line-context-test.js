import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { prismTokens } from './lib/engines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

// A lone `+` attaches only under an open list item, footnote, quote or
// description, and a `+ ... |` line is a row only directly under a row
// (pygments-carve#92). Each shape is how carve 0.1.11 renders it: true when
// every `+` is markup, false when every `+` stays in the text.
const SHAPES = [
    ['- item\n+\n```\nx\n```\n', true],
    ['- item\n\n+\n```\nx\n```\n', true],
    ['- a\n\n  para\n\n+\n```\nx\n```\n', true],
    ['- a\nlazy\n+\n```\nx\n```\n', true],
    ['- a\n+\n+\n```\nx\n```\n', true],
    ['- a\n%% c\n+\n```\nx\n```\n', true],
    ['- a\n%% c\n\n+\n```\nx\n```\n', true],
    ['- a\n\n  para\n%% c\n+\n```\nx\n```\n', true],
    ['- a\n  - b\n+\n```\nx\n```\n', true],
    ['- a\n  - b\n  +\n  c\n', true],
    ['- x\n  > q\n  +\n', true],
    ['- a\n+\n```\nx\n```\n+\n```\ny\n```\n', true],
    ['- x\n+\n| a |\n|---|\n| b |\n+\n| c |\n', true],
    ['- a\n' + '  line\n'.repeat(300) + '+\n```\nx\n```\n', true],
    ['> q\n+\n```\nx\n```\n', true],
    ['> q\nlazy\n+\n```\nx\n```\n', true],
    [':: t\n: d\n+\n```\nx\n```\n', true],
    ['[^n]: x\n+\n```\nc\n```\n', true],
    ['[^n]: x\n\n+\n```\nc\n```\n', true],
    ['+\n```\nx\n```\n', false],
    ['para\n\n+\n\nnext\n', false],
    ['para\n+\n', false],
    ['| a |\n+\n```\nx\n```\n', false],
    ['# H\n+\n```\nx\n```\n', false],
    ['> q\n\n+\n```\nx\n```\n', false],
    ['> q\n%% c\n+\n```\nx\n```\n', false],
    [':: t\n: d\n\n+\n```\nx\n```\n', false],
    [':: t\n+\n```\nx\n```\n', false],
    [':: A term that\n   wraps\n+\n: d\n', false],
    ['- a\n\npara\n+\n```\nx\n```\n', false],
    ['- a\n\npara\n\n+\n```\nx\n```\n', false],
    ['- a\n\n%% c\n+\n```\nx\n```\n', false],
    ['- a\n```\nx\n```\n+\n```\ny\n```\n', false],
    ['- a\n  +\n  ```\n  x\n  ```\n', false],
    ['- a\n\t+\n```\nx\n```\n', false],
    ['x\n- a\n+\n```\nx\n```\n', false],
    ['::: note\n+\n```\nx\n```\n:::\n', false],
    ['| a | b |\n+ x | y |\n', true],
    ['| a |{.r}\n+ b |\n+ c |\n', true],
    ['|= a |\n+ b |\n', true],
    ['- | a | b |\n  + x | y |\n', true],
    ['- a\n  | t |\n  + r |\n', true],
    [':: t\n:  | a |\n   + b |\ntail\n', true],
    ['+ x | y |\n', false],
    ['| a | b |\n\n+ x | y |\n', false],
    ['| a |\n|---|\n+ b |\n', false],
    ['| a |\n%% c\n+ b |\n', false],
    ['| a | %% c\n+ b |\n', false],
    ['| a |\n+ b |{.x}\n', false],
    ['# H |\n+ b |\n', false],
    ['- a\n  + b |\ntail\n', false],
];

const plusScopes = (source) => {
    const scopes = [];
    for (const token of prismTokens(source)) {
        for (const char of token.text) if (char === '+') scopes.push(token.scope ?? '');
    }
    return scopes;
};
for (const [source, markup] of SHAPES) {
    const scopes = plusScopes(source);
    assert.ok(scopes.length > 0, JSON.stringify(source));
    const scoped = scopes.map((scope) => /continuation/.test(scope));
    assert.ok(scoped.every((value) => value === markup),
        `prism: ${JSON.stringify(source)} should read every + as ${markup ? 'markup' : 'text'}, got ${JSON.stringify(scopes)}`);
}

// Each `+` line looks at the lines above it, so the lookback has to stay bounded:
// a document of `+` lines would otherwise rescan everything above every line.
const script = `
    import { prismTokens } from './tests/lib/engines.js';
    for (const source of [
        '+\\n'.repeat(40000),
        '+\\n\\n'.repeat(30000),
        '+\\nx\\n'.repeat(30000),
        '- a\\n' + '+\\nx\\n'.repeat(30000),
        '- a\\n' + '\\n  i\\n+\\n'.repeat(20000),
        '+ b |\\n'.repeat(30000),
    ]) {
        if (prismTokens(source).map((token) => token.text).join('') !== source) process.exit(1);
    }
`;
const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url),
    timeout: 15000,
    encoding: 'utf8',
});
assert.equal(result.error, undefined, 'prism: a document of + lines exceeded fifteen seconds');
assert.equal(result.status, 0, `prism: ${result.stderr || `unexpected tokens (exit ${result.status})`}`);
assertThisFileRuns(import.meta.url);
console.log(`  ✓ prism reads ${SHAPES.length} + line shapes as carve does, in linear time`);
