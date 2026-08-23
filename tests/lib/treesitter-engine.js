/**
 * A tokenizer for the tree-sitter surface, so the payload axis can reach it.
 *
 * The other nine surfaces answer "what scope does this run carry?" from a
 * grammar this process can load. tree-sitter answers in two halves: the parser
 * builds a tree, and `queries/highlights.scm` says which nodes an editor
 * paints. Both halves matter to the second axis - a payload leaks if a markup
 * capture lands INSIDE it - so this drives both and flattens the answer into
 * the same `{ scope, text }` leaf list `tests/lib/engines.js` returns.
 *
 * RESOLVED THE WAY A CONSUMER RESOLVES IT, not as a list of every match. A
 * query file is not independent facts: several patterns claim the same node and
 * what an editor shows is the highest `(#set! priority N)`, later patterns
 * winning a tie, with 100 as the default. That is the rule Neovim and Helix
 * implement, and it is the model `scripts/highlight-captures.mjs` in
 * tree-sitter-carve already measures against - reporting every match instead
 * would call a payload leaky whenever a low-priority inner pattern existed,
 * whether or not any editor paints it.
 *
 * WHY THE CHECKOUT AND NOT A PACKAGE. The grammar is a native addon built from
 * the pinned repository, so it is read from the checkout named by
 * `CARVE_SURFACE_TREE_SITTER_CARVE`, the same variable the probe already reads.
 * Without it this surface is not measured and the ledger's recorded rows stand.
 *
 * @module tests/lib/treesitter-engine
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const DEFAULT_PRIORITY = 100;

/*
 * Captures that are not a colour. `spell` and `nospell` mark a range for the
 * spell checker, `conceal` hides one, `none` clears an inherited highlight.
 * None is what an editor paints, and all of them land on the nodes the colour
 * patterns do, so counting them would answer a different question.
 */
const NOT_A_COLOUR = new Set(['spell', 'nospell', 'conceal', 'none']);

/**
 * Build a tokenizer over a tree-sitter-carve checkout.
 *
 * @param {string} root - The checkout root.
 * @returns {(source: string) => Array<{scope: (string|null), text: string}>} The tokenizer.
 */
export function treesitterTokenizer(root) {
    const require = createRequire(import.meta.url);
    const Parser = require(resolve(root, 'node_modules', 'tree-sitter'));
    const Carve = require(resolve(root, 'bindings', 'node'));
    const parser = new Parser();
    parser.setLanguage(Carve);

    /*
     * `#offset!` adjusts a capture's RANGE and is understood by the editors
     * that consume these queries, not by the node binding, which refuses to
     * build a query holding a directive it does not know. Stripping it leaves
     * every pattern, capture and `#set!` intact; only four range adjustments
     * are lost, and no range is asserted on here. The same strip
     * `scripts/highlight-captures.mjs` makes upstream, for the same reason.
     */
    const scm = readFileSync(resolve(root, 'queries', 'highlights.scm'), 'utf8')
        .replace(/\(#offset![^)]*\)/g, '');
    const query = new Parser.Query(Carve, scm);

    return (source) => {
        const tree = parser.parse(source);

        /*
         * Per source offset: the winning capture, its priority, and the index
         * of the PATTERN that claimed it, so a later pattern takes a tie the
         * way an editor lets it.
         *
         * The pattern's index, not the match's. `matches()` enumerates in TREE
         * order, so the match index says which node came first in the document
         * and nothing about which pattern in `highlights.scm` wrote it - two
         * equal-priority patterns would then resolve by where their nodes
         * happen to sit. `match.pattern` is the position in the query file,
         * which is what "later patterns win a tie" means.
         */
        const paint = new Array(source.length).fill(null);
        const rank = new Array(source.length).fill(-Infinity);
        const order = new Array(source.length).fill(-Infinity);

        for (const match of query.matches(tree.rootNode)) {
            const priority = Number(query.setProperties?.[match.pattern]?.priority ?? DEFAULT_PRIORITY);
            const index = match.pattern;
            for (const capture of match.captures) {
                // `@_name` captures are internal to a predicate and paint nothing.
                if (capture.name.startsWith('_')) continue;
                if (NOT_A_COLOUR.has(capture.name)) continue;
                const { startIndex, endIndex } = capture.node;
                for (let at = startIndex; at < endIndex && at < source.length; at++) {
                    if (priority > rank[at] || (priority === rank[at] && index >= order[at])) {
                        paint[at] = capture.name;
                        rank[at] = priority;
                        order[at] = index;
                    }
                }
            }
        }

        // Contiguous runs of one scope, so the leaves reproduce the source.
        const leaves = [];
        let from = 0;
        for (let at = 1; at <= source.length; at++) {
            if (at === source.length || paint[at] !== paint[from]) {
                leaves.push({ scope: paint[from], text: source.slice(from, at) });
                from = at;
            }
        }

        return leaves;
    };
}

/**
 * The tokenizer for the tree-sitter surface, when a checkout is named and built.
 *
 * @param {string|undefined} root - The checkout root, or undefined.
 * @returns {Function|null} The tokenizer, or null when the surface is not reachable.
 */
export function treesitterEngine(root) {
    if (!root || !existsSync(resolve(root, 'queries', 'highlights.scm'))) return null;
    // The native addon is BUILT, not shipped in the checkout, so a clone that
    // has not been installed is not measurable. Saying so beats throwing at
    // import time in a run that was never going to measure this surface.
    if (!existsSync(resolve(root, 'build', 'Release')) && !existsSync(resolve(root, 'prebuilds'))) return null;

    return treesitterTokenizer(root);
}
