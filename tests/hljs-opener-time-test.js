import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { assertThisFileRuns } from './lib/runs-in-ci.js';

// Alternating forced openers with no closer took 15-17 s at 600 repetitions in
// highlight.js, each bare opener rescanning every braced span after it. The
// child has a hard deadline so a regression fails instead of hanging the suite;
// 1,200 repetitions are far past the old cliff and well inside it now.
const script = `
    import { hljsTokens } from './tests/lib/engines.js';
    for (const unit of ['{*a {/b ', '{*a {_b ', '{~a {=b ']) {
        const source = unit.repeat(1200);
        const tokens = hljsTokens(source);
        if (tokens.map((token) => token.text).join('') !== source
            || tokens.some((token) => token.scope !== null)) process.exit(1);
    }
    // The precheck must not hide a closer the full scan finds: the engine
    // reads strong around emphasis here.
    const closed = hljsTokens('{*a {/b /x/ *y*');
    if (!closed.some((token) => token.ancestors.join('>') === 'strong>emphasis')
        || closed.at(-1).scope !== 'strong') process.exit(2);
`;
const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url),
    timeout: 30000,
    encoding: 'utf8',
});
assert.equal(result.error, undefined, 'hljs: alternating forced openers exceeded thirty seconds');
assert.equal(result.status, 0, `hljs: ${result.stderr || `unexpected tokens (exit ${result.status})`}`);
assertThisFileRuns(import.meta.url);
console.log('  ✓ hljs highlights alternating forced openers in linear-ish time');
