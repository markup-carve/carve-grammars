/**
 * The surfaces this process can tokenize, TextMate family included.
 *
 * `scripts/surface-probe.mjs` already knows where every grammar lives and how
 * to reach the three that are in other repositories - a `CARVE_SURFACE_*`
 * variable naming a checkout. This reuses that map so the payload sweep and
 * the ledger's re-measurement agree with the probe on which surfaces are in
 * front of them, rather than keeping a second list that can disagree.
 *
 * @module tests/lib/surface-engines
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SURFACES, rootVariable } from '../../scripts/surface-probe.mjs';
import { textmateTokenizer } from './textmate-engine.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * A tokenizer per TextMate grammar that is actually on disk.
 *
 * `textmate` is in this repository and is always there. `vscode-carve` and
 * `intellij-carve` are read from a checkout when one is named, and are absent
 * otherwise - the same rule the probe applies, so a run without those
 * variables measures what it can and leaves the rest recorded.
 *
 * @returns {Promise<Array<[string, Function]>>} `[surface id, tokenizer]` pairs.
 */
export async function textmateEngines() {
    const out = [];
    for (const [id, surface] of Object.entries(SURFACES)) {
        if (surface.extract !== 'tmlanguage') continue;
        const root = surface.local ? repoRoot : process.env[rootVariable(id)];
        if (!root || !existsSync(root)) continue;
        const grammar = resolve(root, surface.files[0]);
        if (!existsSync(grammar)) continue;
        out.push([id, await textmateTokenizer(grammar)]);
    }

    return out;
}
