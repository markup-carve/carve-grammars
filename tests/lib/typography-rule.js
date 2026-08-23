/**
 * The alternatives of a TextMate grammar's smart-typography rule, in order.
 *
 * Read from the grammar SOURCE rather than from tokenizer output, because
 * vscode-textmate merges adjacent tokens with identical scopes: a grammar that
 * reads `<-->` as `<-` then `->` returns one token spelling `<-->`, so no
 * behavioral probe can tell the two readings apart (carve-grammars#324).
 *
 * @module tests/lib/typography-rule
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SURFACES, rootVariable } from '../../scripts/surface-probe.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every `match` in the grammar whose scope names typography. */
function typographyMatches(node, out = []) {
    if (Array.isArray(node)) {
        for (const item of node) typographyMatches(item, out);

        return out;
    }
    if (!node || typeof node !== 'object') return out;
    if (typeof node.name === 'string' && /typography/.test(node.name) && typeof node.match === 'string') {
        out.push(node.match);
    }
    for (const value of Object.values(node)) typographyMatches(value, out);

    return out;
}

/**
 * The rule's alternatives, unescaped, in the order the regex tries them.
 *
 * @param {string} surface - A surface id from `scripts/surface-probe.mjs`.
 * @returns {string[]} The alternatives, source order preserved.
 */
export function typographyAlternatives(surface) {
    const entry = SURFACES[surface];
    const root = entry.local ? repoRoot : process.env[rootVariable(surface)];
    const path = resolve(root, entry.files[0]);
    if (!existsSync(path)) throw new Error(`no grammar at ${path}`);
    const matches = typographyMatches(JSON.parse(readFileSync(path, 'utf8')));
    if (matches.length !== 1) {
        throw new Error(`${surface}: expected one typography match, found ${matches.length}`);
    }

    return matches[0]
        .replace(/^\(|\)$/g, '')
        .split('|')
        .map((alternative) => alternative.replace(/\\(.)/g, '$1'));
}
