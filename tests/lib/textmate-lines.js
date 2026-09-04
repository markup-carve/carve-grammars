/**
 * A TextMate tokenizer that feeds EVERY line, blank ones included.
 *
 * `tests/lib/textmate-engine.js` drives Shiki, which is the right tool for the
 * question it asks - which scope covers which characters on a line. It cannot
 * be used for anything that turns on a BLANK line. Measured on this
 * repository's own grammar (carve-grammars#395), giving the bold rule a
 * blank-line terminator:
 *
 *   Shiki               : `a *b c` still colours the next paragraph and heading
 *   raw vscode-textmate : it stops at the blank line
 *
 * Same grammar, same document, opposite answers - and vscode-textmate is what
 * VS Code actually runs. A test written against Shiki would therefore report a
 * correct fix as broken, which is how carve-grammars#393 stayed invisible.
 *
 * So this drives `vscode-textmate` directly and carries the rule stack across
 * every line itself. That stack is the whole point: a begin/end rule that never
 * closes lives in it, and dropping one line drops the evidence.
 *
 * @module tests/lib/textmate-lines
 */
import { readFileSync } from 'node:fs';

import { Registry, INITIAL } from '@shikijs/vscode-textmate';
import { createOnigurumaEngine } from '@shikijs/engine-oniguruma';

/**
 * A `{scope, text}` tokenizer for one TextMate grammar, line by line.
 *
 * The scope is the whole stack joined, not the innermost name: an unclosed
 * begin/end rule shows up as an ANCESTOR of every token after it, which is
 * exactly the shape being measured.
 *
 * @param {string} path - Path to a `.tmLanguage.json` grammar.
 * @returns {Promise<(source: string) => Array<{scope: string, text: string}>>} the tokenizer.
 */
export async function textmateLineTokenizer(path) {
    const grammar = JSON.parse(readFileSync(path, 'utf8'));
    const engine = await createOnigurumaEngine(import('shiki/wasm'));
    const registry = new Registry({
        onigLib: {
            createOnigScanner: (sources) => engine.createScanner(sources),
            createOnigString: (source) => engine.createString(source),
        },
        loadGrammar: () => grammar,
    });
    const loaded = await registry.loadGrammar(grammar.scopeName);

    return (source) => {
        const out = [];
        const lines = source.split('\n');
        let state = INITIAL;
        lines.forEach((line, index) => {
            const result = loaded.tokenizeLine(line, state);
            state = result.ruleStack;
            for (const token of result.tokens) {
                out.push({ scope: token.scopes.join(' '), text: line.slice(token.startIndex, token.endIndex) });
            }
            if (index < lines.length - 1) out.push({ scope: '', text: '\n' });
        });

        return out;
    };
}

/**
 * The source run `scope` covers in `source`.
 *
 * @param {Function} tokenize - a tokenizer from `textmateLineTokenizer`.
 * @param {string} source - the Carve document.
 * @param {string} scope - the scope name to collect.
 * @returns {string} the covered source, empty when the scope never opened.
 */
export const covered = (tokenize, source, scope) => tokenize(source)
    .filter((leaf) => leaf.scope.split(' ').includes(scope))
    .map((leaf) => leaf.text)
    .join('');
