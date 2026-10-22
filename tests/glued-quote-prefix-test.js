/**
 * A `+` line may glue its quote prefixes (grammar.ebnf `quote_continuation_line`:
 * `>+`, `>>+`, `>> +`, `> >+`). carve-js reads every such line as a quote line,
 * whether or not the `+` attaches, so each grammar gives the prefix its quote
 * scope. A glued `>>` before anything but the `+` is text (`>> x`, `>>  +`).
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { prismTokens, hljsTokens } from './lib/engines.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const tm = await textmateLineTokenizer(fileURLToPath(new URL('../textmate/carve.tmLanguage.json', import.meta.url)));

const ENGINES = {
    textmate: { tokenize: tm, quote: (scope) => scope.includes('punctuation.definition.quote.carve') },
    prism: { tokenize: prismTokens, quote: (scope) => scope.startsWith('blockquote') },
    highlightjs: { tokenize: hljsTokens, quote: (scope) => scope === 'quote' },
};

const QUOTED = ['>+\nx', '>>+\nx', '>> +\nx', '> >+\nx', '> > +\nx', '>>>+\nx', '>+\n\nx', '>+', '>>+\n>>+\nx', '>+ \nx', '>> para\n>>+\nx'];
const LITERAL = ['>+x\ny', '>>  +\nx', '>> + x', '>> x', '>>x'];

const scopeAt = (tokens, at) => {
    let offset = 0;
    for (const token of tokens) {
        if (at >= offset && at < offset + token.text.length) return token.scope ?? '';
        offset += token.text.length;
    }
    return '';
};

let failures = 0;
for (const [name, { tokenize, quote }] of Object.entries(ENGINES)) {
    for (const source of QUOTED) {
        const tokens = tokenize(source);
        const line = source.lastIndexOf('\n', source.indexOf('+')) + 1;
        if (!quote(scopeAt(tokens, line))) {
            failures++;
            console.error(`${name}: ${JSON.stringify(source)} - the first > of the + line has no quote scope`);
        }
    }
    for (const source of LITERAL) {
        if (quote(scopeAt(tokenize(source), 0))) {
            failures++;
            console.error(`${name}: ${JSON.stringify(source)} - a literal > took the quote scope`);
        }
    }
}
assert.equal(failures, 0, `${failures} glued quote prefix row(s) failed`);
console.log('glued quote prefix: a + line with glued > prefixes is a quote line in all three grammars');
