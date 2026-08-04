/**
 * Tokenizers for the Prism and highlight.js Carve grammars.
 *
 * Both engines are asked the same question - "what scope, if any, does this
 * run of text carry?" - but answer in different shapes: Prism returns a nested
 * token tree, highlight.js returns a string of nested `<span>`s. These two
 * helpers flatten each into the same `{ scope, text }` leaf list so a test can
 * assert over both without knowing which engine produced the answer.
 *
 * The scope vocabularies are NOT unified: Prism says `italic` where
 * highlight.js says `emphasis`. Tests here assert whether a run is scoped, not
 * what the scope is called - pinning the names is what the snapshots are for.
 *
 * @module tests/lib/engines
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ----- Prism -----
const Prism = require('prismjs');
globalThis.Prism = Prism;
await import('../../prism/carve.js');
delete globalThis.Prism;
const carveGrammar = Prism.languages.carve;

function prismLeaves(tokens, parentPath = '') {
    const out = [];
    for (const tok of tokens) {
        if (typeof tok === 'string') {
            out.push({ scope: parentPath || null, text: tok });
            continue;
        }
        const path = parentPath ? `${parentPath}>${tok.type}` : tok.type;
        if (Array.isArray(tok.content)) {
            out.push(...prismLeaves(tok.content, path));
        } else if (tok.content && typeof tok.content === 'object') {
            out.push(...prismLeaves([tok.content], path));
        } else {
            out.push({ scope: path, text: String(tok.content) });
        }
    }
    return out;
}

/**
 * @param {string} src - Carve source.
 * @returns {Array<{scope: (string|null), text: string}>} flattened Prism leaves.
 */
export const prismTokens = (src) => prismLeaves(Prism.tokenize(src, carveGrammar));

// ----- highlight.js -----
const hljs = require('highlight.js');
const hljsCarve = (await import('../../highlightjs/carve.mjs')).default;
hljs.registerLanguage('carve', hljsCarve);

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };
const unescapeHtml = (s) => s.replace(/&(?:lt|gt|amp|quot|#x27|#39);/g, (m) => ENTITIES[m]);

/**
 * @param {string} source - Carve source.
 * @returns {Array<{scope: (string|null), text: string}>} flattened highlight.js
 *   leaves, with the `hljs-` class prefix stripped from each scope.
 */
export function hljsTokens(source) {
    const { value } = hljs.highlight(source, { language: 'carve' });
    const out = [];
    const stack = [];
    const re = /<span class="([^"]*)">|<\/span>|([^<]+)/g;
    let m;
    while ((m = re.exec(value)) !== null) {
        if (m[1] !== undefined) stack.push(m[1].replace(/^hljs-/, ''));
        else if (m[2] !== undefined) out.push({ scope: stack.at(-1) ?? null, text: unescapeHtml(m[2]) });
        else stack.pop();
    }
    return out;
}

/** Both engines, keyed by the name a test failure should report. */
export const ENGINES = [
    ['prism', prismTokens],
    ['highlightjs', hljsTokens],
];
