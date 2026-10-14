import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Each child has a hard deadline so a regex regression fails instead of
// hanging the test suite. Forty openers exceed the old exponential cliff.
for (const engine of ['prismTokens', 'hljsTokens']) {
    const script = `
        import { ${engine} } from './tests/lib/engines.js';
        for (const delimiter of ['*', '/', '_', '~', '=']) {
            const source = (delimiter + 'a ').repeat(40).trim();
            const tokens = ${engine}(source);
            if (tokens.map((token) => token.text).join('') !== source
                || tokens.some((token) => token.scope !== null)) process.exit(1);
            const closed = (delimiter + 'a ').repeat(40) + 'b' + delimiter;
            const closedTokens = ${engine}(closed);
            if (closedTokens.map((token) => token.text).join('') !== closed
                || !closedTokens.some((token) => token.scope !== null)) process.exit(1);
        }
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: new URL('..', import.meta.url),
        timeout: 30000,
        encoding: 'utf8',
    });
    assert.equal(result.error, undefined, `${engine}: highlighting exceeded thirty seconds`);
    assert.equal(result.status, 0, `${engine}: ${result.stderr || 'unexpected tokens'}`);
    console.log(`  ✓ ${engine} handles repeated unclosed strong openers`);
}
