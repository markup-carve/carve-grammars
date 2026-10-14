import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Alternating unclosed braced openers on one line used to cost Prism cubic
// time (800 pairs ran past a minute). The child has a hard deadline so a
// regression fails instead of hanging the suite.
const script = `
    import { prismTokens } from './tests/lib/engines.js';
    for (const unit of ['{*a {/b ', '{*a {_b ', '{~a {=b ', '{/a {*b ', '{_a {~b ']) {
        const source = unit.repeat(800).trim();
        const tokens = prismTokens(source);
        if (tokens.map((token) => token.text).join('') !== source) process.exit(1);
        if (tokens.some((token) => /bold|italic|underline|strike|highlight/.test(token.scope ?? ''))) process.exit(2);
    }
    // A closer candidate the run cannot reach: inside a code span, behind an
    // escape, in a link destination or an autolink.
    for (const tail of [' \`x/\`', ' x\\\\/', ' [a](u/)', ' <https://a/>']) {
        const source = '{*a {/b '.repeat(800).trim() + tail;
        const tokens = prismTokens(source);
        if (tokens.map((token) => token.text).join('') !== source) process.exit(4);
        if (tokens.some((token) => /^(?:bold|italic)/.test(token.scope ?? ''))) process.exit(5);
    }
    const closed = '{*a {/b '.repeat(20) + '\\n\\n*x* {/y/}';
    const scopes = prismTokens(closed).map((token) => token.scope ?? '');
    if (!scopes.some((scope) => scope.startsWith('bold')) || !scopes.some((scope) => scope.startsWith('forced-italic'))) process.exit(3);
`;
const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url),
    timeout: 30000,
    encoding: 'utf8',
});
assert.equal(result.error, undefined, 'prism: highlighting exceeded thirty seconds');
assert.equal(result.status, 0, `prism: ${result.stderr || `unexpected tokens (exit ${result.status})`}`);
console.log('  ✓ prismTokens handles alternating unclosed braced openers');
