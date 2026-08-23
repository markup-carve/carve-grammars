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
import { emacsEngine } from './emacs-engine.js';
import { textmateTokenizer } from './textmate-engine.js';
import { treesitterEngine } from './treesitter-engine.js';

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

/**
 * The two surfaces that are neither TextMate nor a tokenizer this repo hosts.
 *
 * tree-sitter and emacs-carve are the last surfaces whose payload column was
 * recorded rather than measured, and both are reachable in process: the
 * tree-sitter grammar through its built native addon, and emacs-carve through
 * one batch Emacs that fontifies a buffer and prints back the face runs. Each
 * needs its own checkout, named by the `CARVE_SURFACE_*` variable
 * `scripts/surface-probe.mjs` already reads, and is simply absent otherwise -
 * the same rule the TextMate family follows above.
 *
 * intellij-carve is NOT here. Its grammar is a TextMate file and
 * `textmateEngines()` above reaches it whenever its variable is set; it needs
 * nothing of its own.
 *
 * @returns {Array<[string, Function]>} `[surface id, tokenizer]` pairs.
 */
export function otherEngines() {
    const out = [];
    const treesitter = treesitterEngine(process.env[rootVariable('tree-sitter-carve')]);
    if (treesitter) out.push(['tree-sitter-carve', treesitter]);
    const emacs = emacsEngine(process.env[rootVariable('emacs-carve')]);
    if (emacs) out.push(['emacs-carve', emacs]);

    return out;
}
