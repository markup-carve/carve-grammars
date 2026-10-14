import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { assertThisFileRuns } from './lib/runs-in-ci.js';

// Prism's cell-comment and continuation-comment rules tested the line prefix at
// every `%%` on the line, so a line of many runs was quadratic: 0.8 s and 2.1 s
// at 128 KB. The child has a deadline so a regression fails instead of stalling.
const script = `
    import { prismTokens } from './tests/lib/engines.js';
    for (const source of [
        'x' + ' %%'.repeat(64000) + '\\n',
        '| ' + 'a %%c |'.repeat(8000) + '\\n',
        '# h' + ' %%'.repeat(64000) + '\\n',
        '# h' + ' %%'.repeat(64000) + '\\r\\n',
    ]) {
        const tokens = prismTokens(source);
        if (tokens.map((token) => token.text).join('') !== source) process.exit(1);
    }
    const scoped = (source) => prismTokens(source).filter((token) => /comment/.test(token.scope ?? '')).map((token) => token.text);
    // A row keeps one comment per cell; a paragraph line takes the rest of the line.
    if (JSON.stringify(scoped('| a %% h | b %% c |\\n')) !== JSON.stringify(['%% h', '%% c'])) process.exit(2);
    if (JSON.stringify(scoped('p\\nx %% c %% d\\n')) !== JSON.stringify(['%% c %% d'])) process.exit(3);
`;
const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url),
    timeout: 15000,
    encoding: 'utf8',
});
assert.equal(result.error, undefined, 'prism: a line of many comment runs exceeded fifteen seconds');
assert.equal(result.status, 0, `prism: ${result.stderr || `unexpected tokens (exit ${result.status})`}`);
assertThisFileRuns(import.meta.url);
console.log('  ✓ prism reads a line of many comment runs in linear time');
