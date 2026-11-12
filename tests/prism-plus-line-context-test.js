import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { prismTokens } from './lib/engines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

// A lone `+` attaches only under an open list item, footnote, quote or
// description, and a `+ ... |` line is a row only directly under a row
// (pygments-carve#92). Each shape is how the carve spec model renders it since
// the relative-column ruling (markup-carve/carve#3445): true when every `+` is
// markup, false when every `+` stays in the text.
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
    ['- x\n  > q\n  +\n', false],
    ['- a\n+\n```\nx\n```\n+\n```\ny\n```\n', true],
    ['- x\n+\n| a |\n|---|\n| b |\n+\n| c |\n', true],
    ['- a\n' + '  line\n'.repeat(300) + '+\n```\nx\n```\n', true],
    ['> q\n+\n```\nx\n```\n', true],
    ['> q\nlazy\n+\n```\nx\n```\n', true],
    [':: t\n: d\n+\n```\nx\n```\n', true],
    ['[^n]: x\n+\n```\nc\n```\n', true],
    ['[^n]: x\n\n+\n```\nc\n```\n', false],
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
    // Behind a quote prefix, and a table indented at the top level.
    ['> | a |\n> + b |\ntail\n', true],
    ['> |= a |\n> + b |\ntail\n', true],
    ['> > | a |\n> > + b |\ntail\n', true],
    ['> > > | a |\n> > > + b |\ntail\n', true],
    [':: t\n:  > | a |\n   > + b |\ntail\n', true],
    ['> - | a |\n>   | b |\n> +\n> | c |\n> | d |\n', true],
    ['> - a\n> +\n> ```\n> x\n> ```\n', true],
    // A quote's first-line `+` is the marker whatever follows (0.1.14 layout readings).
    ['> +\n> ```\n> x\n> ```\n', true],
    ['> para\n> +\n> ```\n> x\n> ```\n', false],
    ['> - a\n>\n> +\n> ```\n> x\n> ```\n', true],
    ['> | a |\n> |---|\n> + b |\n', false],
    ['> | a |\n>\n> + b |\n', false],
    ['> + b |\n', false],
    ['> > | a |\n> + b |\n', false],
    ['> | a |\n> > + b |\n', false],
    ['> | a |\n> + b |\n> + c |\n', true],
    ['> > q\n> +\n> ```\n> x\n> ```\n', true],
    ['> [^n]: x\n> +\n> ```\n> x\n> ```\n', true],
    ['> :: t\n> : d\n> +\n> ```\n> x\n> ```\n', true],
    ['> # H\n> +\n> ```\n> x\n> ```\n', false],
    ['> - a\n>   - b\n> +\n> ```\n> x\n> ```\n', true],
    ['> - a\n> lazy\n> +\n> ```\n> x\n> ```\n', true],
    ['> - a\n>\n> para\n> +\n> ```\n> x\n> ```\n', false],
    ['  | a |\n  + b |\n', false],
    [' | a |\n + b |\n', false],
    ['- a\n  | t |\n  + r |\n', true],
    ['- a\n\n  | t |\n  + r |\n', true],
    [':: t\n:  a\n\n   | t |\n   + r |\n', true],
    ['  - a\n    | t |\n    + r |\n', true],
    ['> - a\n> +\n> | t |\n> +\n> ```\n> y\n> ```\n', true],
    ['> | a |\n> + b |{.x}\n', false],
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
// The check is the growth from a tenth to half of each size (5x if linear, 25x if
// quadratic), not wall clock, which a loaded runner moves by 50% (#879).
const script = `
    import { prismTokens } from './tests/lib/engines.js';
    const time = (source, runs) => {
        let best = Infinity;
        for (let run = 0; run < runs; run++) {
            const started = performance.now();
            if (prismTokens(source).map((token) => token.text).join('') !== source) process.exit(1);
            best = Math.min(best, performance.now() - started);
        }
        return Math.max(best, 1);
    };
    const growth = [];
    for (const [make, size] of [
        [(n) => '+\\n'.repeat(n), 20000],
        [(n) => '+\\n\\n'.repeat(n), 15000],
        [(n) => '+\\nx\\n'.repeat(n), 15000],
        [(n) => '- a\\n' + '+\\nx\\n'.repeat(n), 15000],
        [(n) => '- a\\n' + '\\n  i\\n+\\n'.repeat(n), 10000],
        [(n) => '+ b |\\n'.repeat(n), 15000],
        [(n) => '> +\\n'.repeat(n), 15000],
        [(n) => '> - a\\n' + '> +\\n> x\\n'.repeat(n), 10000],
        [(n) => '> + b |\\n'.repeat(n), 15000],
        [(n) => '  | a |\\n  + b |\\n'.repeat(n), 10000],
    ]) {
        const small = make(size / 10);
        time(small, 1);
        growth.push([make(1), time(make(size / 2), 2) / time(small, 3)]);
    }
    console.log(JSON.stringify(growth));
`;
const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url),
    timeout: 120000,
    encoding: 'utf8',
});
assert.equal(result.error, undefined, 'prism: a document of + lines did not finish in two minutes');
assert.equal(result.status, 0, `prism: ${result.stderr || `unexpected tokens (exit ${result.status})`}`);
for (const [shape, factor] of JSON.parse(result.stdout)) {
    assert.ok(factor < 10, `prism: ${JSON.stringify(shape)} took ${factor.toFixed(1)}x as long for 5x the lines`);
}
assertThisFileRuns(import.meta.url);
console.log(`  ✓ prism reads ${SHAPES.length} + line shapes as carve does, in linear time`);
