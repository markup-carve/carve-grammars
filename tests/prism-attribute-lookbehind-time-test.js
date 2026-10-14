import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { assertThisFileRuns } from './lib/runs-in-ci.js';

// Prism's attribute rule checked its line-prefix lookbehinds before the `{`, so
// every space in a long table cell walked back to the line start: 1.2 s at 16 KB.
// The child has a deadline so a regression fails instead of stalling the suite.
const script = `
    import { prismTokens } from './tests/lib/engines.js';
    for (const source of [
        '| a %% ' + ' '.repeat(64000) + 'h | b |\\n',
        '| a ' + ' '.repeat(64000) + 'h | b |\\n',
        'x' + ' '.repeat(64000) + '{.c}\\n',
    ]) {
        const tokens = prismTokens(source);
        if (tokens.map((token) => token.text).join('') !== source) process.exit(1);
    }
    // The rule still fires at a line start and glued to a construct.
    for (const [source, block] of [['{.c}\\npara\\n', '{.c}'], ['*x*{.c}\\n', '{.c}']]) {
        const scoped = prismTokens(source).filter((token) => /attr/.test(token.scope ?? '')).map((token) => token.text).join('');
        if (scoped !== block) process.exit(2);
    }
`;
const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url),
    timeout: 10000,
    encoding: 'utf8',
});
assert.equal(result.error, undefined, 'prism: a long run of spaces exceeded ten seconds');
assert.equal(result.status, 0, `prism: ${result.stderr || `unexpected tokens (exit ${result.status})`}`);
assertThisFileRuns(import.meta.url);
console.log('  ✓ prism scans a long run of spaces in linear time');
