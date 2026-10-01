import assert from 'node:assert/strict';
import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';

const surfaces = [['prism', prismTokens], ['highlightjs', hljsTokens], ...(await textmateEngines(textmateLineTokenizer))];
function scopeAt(tokens, source, needle) {
    const at = source.indexOf(needle);
    let offset = 0;
    for (const token of tokens) {
        offset += token.text.length;
        if (offset > at) return token.scope || '';
    }
    assert.fail(`No token for ${needle}`);
}
let count = 0;
for (const [name, tokenize] of surfaces) {
    for (const prefix of ['# a ', '![alt](x.png)\n^ cap ', '> # a ', '> ![alt](x.png)\n> ^ cap ']) {
        for (const code of ['`x %% b`', '``x %% b``', '!`x %% b`', '$`x %% b`', '`x %% b']) {
            const source = prefix + code + '\n\nplain tail';
            const tokens = tokenize(source);
            assert.doesNotMatch(scopeAt(tokens, source, '%%'), /comment/, `${name}: ${prefix}${code}`);
            assert.doesNotMatch(scopeAt(tokens, source, 'plain tail'), /heading|caption|comment|code|string/, `${name}: scope leak`);
            count += 2;
        }
        for (const slashes of [1, 2, 3, 4]) {
            const source = prefix + '\\'.repeat(slashes) + '`x %% hidden';
            const scope = scopeAt(tokenize(source), source, '%%');
            if (slashes % 2) assert.match(scope, /comment/, `${name}: escaped opener ${slashes}`);
            else assert.doesNotMatch(scope, /comment/, `${name}: even backslashes ${slashes}`);
            count++;
        }
        for (const gap of [' ', '\t']) {
            const source = prefix + '`x`' + gap + '%% hidden';
            assert.match(scopeAt(tokenize(source), source, '%%'), /comment/, `${name}: ${source}`);
            count++;
        }
    }
}
console.log(`${count} heading and caption comment assertions passed`);
