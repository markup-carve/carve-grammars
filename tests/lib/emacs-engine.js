/**
 * A tokenizer for the emacs-carve surface, so the payload axis can reach it.
 *
 * `carve-mode.el` is font-lock, not a token map: it puts a `face' text property
 * on the buffer and the answer to "what scope does this run carry?" is that
 * property. `emacs-faces.el` beside this file fontifies a buffer in batch Emacs
 * and prints the runs back as JSON, which flattens into the same
 * `{ scope, text }` leaf list `tests/lib/engines.js` returns.
 *
 * ONE PROCESS PER BATCH, WHICH IS WHY `prime` EXISTS. The payload sweep asks
 * about thousands of generated documents. A process per document is minutes of
 * Emacs startup measuring nothing, and the tokenizer interface is synchronous,
 * so a caller that knows its whole space calls `prime(sources)` first and every
 * `tokenize` after that is a cache read. A caller that does not still works, at
 * one process per miss.
 *
 * WHY THE CHECKOUT AND NOT A PACKAGE. `carve-mode.el` is loaded from the
 * checkout named by `CARVE_SURFACE_EMACS_CARVE`, the same variable the probe
 * already reads. Without it, or without an `emacs` on PATH, this surface is not
 * measured and the ledger's recorded rows stand.
 *
 * @module tests/lib/emacs-engine
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** The batch size, so one command line and one JSON file stay a sane size. */
const BATCH = 1500;

/**
 * Build a tokenizer over an emacs-carve checkout.
 *
 * @param {string} root - The checkout root.
 * @returns {Function} The tokenizer, carrying a `prime` method.
 */
export function emacsTokenizer(root) {
    const mode = resolve(root, 'carve-mode.el');
    const bridge = resolve(here, 'emacs-faces.el');
    const cache = new Map();

    /**
     * Fontify a batch of documents in one Emacs and fill the cache.
     *
     * @param {string[]} sources - The documents.
     * @returns {undefined}
     */
    const fontify = (sources) => {
        if (!sources.length) return;
        const work = mkdtempSync(resolve(tmpdir(), 'carve-emacs-'));
        try {
            const input = resolve(work, 'in.json');
            writeFileSync(input, JSON.stringify(sources));
            const out = execFileSync(
                'emacs',
                ['-Q', '--batch', '-l', mode, '-l', bridge, '--', input],
                { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
            );
            const runs = JSON.parse(out);
            if (runs.length !== sources.length) {
                throw new Error(`emacs answered about ${runs.length} of ${sources.length} documents`);
            }
            sources.forEach((source, at) => {
                cache.set(source, runs[at].map(([scope, text]) => ({ scope, text })));
            });
        } finally {
            rmSync(work, { recursive: true, force: true });
        }
    };

    const tokenize = (source) => {
        if (!cache.has(source)) fontify([source]);

        return cache.get(source);
    };

    /**
     * Fontify every document that is not cached yet, in batches.
     *
     * @param {string[]} sources - The documents the caller is about to ask about.
     * @returns {undefined}
     */
    tokenize.prime = (sources) => {
        const missing = [...new Set(sources.filter((source) => !cache.has(source)))];
        for (let at = 0; at < missing.length; at += BATCH) fontify(missing.slice(at, at + BATCH));
    };

    return tokenize;
}

/**
 * The tokenizer for the emacs surface, when a checkout is named and Emacs is on PATH.
 *
 * @param {string|undefined} root - The checkout root, or undefined.
 * @returns {Function|null} The tokenizer, or null when the surface is not reachable.
 */
export function emacsEngine(root) {
    if (!root || !existsSync(resolve(root, 'carve-mode.el'))) return null;
    try {
        execFileSync('emacs', ['--version'], { stdio: 'ignore' });
    } catch {
        return null;
    }

    return emacsTokenizer(root);
}
