/**
 * A tokenizer for any of the FOUR TextMate grammars Carve ships.
 *
 * `tests/lib/engines.js` gives Prism and highlight.js a common `{scope, text}`
 * leaf shape so a test can ask both the same question. The TextMate family had
 * no such handle: `tests/textmate-sweep-test.js` drove Shiki inline and asked
 * about ONE construct at a time, which is enough for "does this carry the scope
 * it should" and not enough for the ledger's second axis, where the question is
 * "did any scope open INSIDE a payload that is not Carve".
 *
 * That axis had never been measured on a TextMate surface. `textmate`,
 * `vscode-carve` and `intellij-carve` carried 11 to 13 `payload: "unmeasured"`
 * rows each, which is the largest unknown the ledger has
 * (carve-grammars#320) - and every payload leak found so far was found by
 * somebody looking rather than by a test: carve#1239, carve-grammars#309 (where
 * the corpus carried a GOLDEN SNAPSHOT recording the leak as correct),
 * vim-carve#27, carve-grammars#312.
 *
 * WHY A FACTORY AND NOT A CONSTANT. Three of the four grammars live in other
 * repositories, read from a checkout named by a `CARVE_SURFACE_*` variable the
 * way `scripts/surface-probe.mjs` reads them. One tokenizer per path is what
 * lets the same generated sweep run over a grammar this repo does not own.
 *
 * @module tests/lib/textmate-engine
 */
import { readFileSync } from 'node:fs';
import { createHighlighter } from 'shiki';
import { textmateLineTokenizer } from './textmate-lines.js';

function hasBlankLine(source) {
    if (source === '') return false;
    const lines = source.split('\n');
    // A final split sentinel represents a line ending, not a blank line.
    if (source.endsWith('\n')) lines.pop();
    return lines.some((line) => /^[ \t]*$/.test(line));
}

/**
 * A `{scope, text}` tokenizer for one TextMate grammar.
 *
 * The leaves reconstruct the source exactly. That is not cosmetic: `measure`
 * in `payload-inertness.js` locates the payload by counting characters, so a
 * tokenizer that loses one reports about the wrong region.
 *
 * The scope is the whole SCOPE STACK joined, not the innermost name. A leak is
 * a markup scope OPEN over the payload, and on a begin/end grammar that scope
 * is usually an ancestor of the token rather than the token's own name.
 *
 * Shiki preserves the established per-line scope answers. For a document with
 * an actual blank line, the helper switches to the line-faithful
 * `vscode-textmate` driver: Shiki drops blank lines before they reach the state
 * machine, so it cannot answer whether a begin/end rule terminates there.
 *
 * @param {string} path - Path to a `.tmLanguage.json` grammar.
 * @returns {Promise<(source: string) => Array<{scope: (string|null), text: string}>>} the tokenizer.
 */
export async function textmateTokenizer(path) {
    const grammar = JSON.parse(readFileSync(path, 'utf8'));
    const highlighter = await createHighlighter({
        themes: ['github-light'],
        langs: [{ ...grammar, name: 'carve' }],
    });
    const tokenizeLines = await textmateLineTokenizer(path);

    return (source) => {
        if (hasBlankLine(source)) {
            return tokenizeLines(source);
        }

        const { tokens } = highlighter.codeToTokens(source, {
            lang: 'carve',
            theme: 'github-light',
            includeExplanation: 'scopeName',
        });
        const out = [];
        tokens.forEach((line, index) => {
            for (const token of line) {
                const scopes = (token.explanation ?? [])
                    .flatMap((part) => part.scopes.map((scope) => scope.scopeName));

                out.push({ scope: scopes.join(' ') || null, text: token.content });
            }
            if (index < tokens.length - 1) out.push({ scope: null, text: '\n' });
        });

        return out;
    };
}

/**
 * A tokenizer that reproduces its input, or an explanation of why it does not.
 *
 * A sweep whose tokenizer silently drops characters measures a region that is
 * not the payload and passes, which is the dead-check shape this repo has
 * shipped three times (carve-grammars#295, #298, #300).
 *
 * @param {(source: string) => Array<{text: string}>} tokenize - The tokenizer.
 * @param {string} source - A document to check it against.
 * @returns {string|null} The problem, or null when the leaves reconstruct `source`.
 */
export function unfaithful(tokenize, source) {
    const joined = tokenize(source).map((leaf) => leaf.text).join('');
    if (joined === source) return null;
    // Shiki drops a trailing newline; the line-faithful blank-line path may not.
    if (!hasBlankLine(source) && `${joined}\n` === source) return null;
    return `the tokenizer returned ${JSON.stringify(joined)} for ${JSON.stringify(source)}`;
}
