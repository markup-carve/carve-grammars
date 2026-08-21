/**
 * The `{X ... X}` constructs the grammars spell, DERIVED from the grammars.
 *
 * WHY THIS IS NOT A LIST. It was one, twice, and both times the list was the
 * defect. `scripts/scan-superlinear.mjs` named `{#` and `{%` out of eleven
 * braced constructs, so the quadratic scan it exists to find went reported on
 * two rules and unreported on nine (carve-grammars#298, #300); the same repo
 * has since produced two more hand-maintained lists that hid what they were
 * meant to cover. A construct added to either grammar tomorrow is swept and
 * bounds-checked without anyone remembering this file.
 *
 * WHAT COUNTS AS ONE. A character qualifies when it appears BOTH right after a
 * `\{` and right before a `\}` somewhere in the source. That pairing is what
 * makes it a braced construct rather than an incidental `{` inside a character
 * class, and it is why `{)` `{[` `{|` - all from classes like `[\s{]` - do not
 * come out of this. Alphanumerics are excluded: `{a` is not a delimiter.
 *
 * @module scripts/braced-openers
 */
import { readFileSync } from 'node:fs';

/** The two grammars that ship regex-based rules, relative to this file. */
export const GRAMMARS = ['../prism/carve.js', '../highlightjs/carve.js'];

/**
 * Every braced delimiter character either grammar spells.
 *
 * @returns {string[]} the delimiter characters, sorted.
 */
export const bracedDelimiters = () => {
    const opens = new Set();
    const closes = new Set();
    for (const file of GRAMMARS) {
        const src = readFileSync(new URL(file, import.meta.url), 'utf8');
        for (const m of src.matchAll(/\\\{\\?([^\sA-Za-z0-9\\])/g)) opens.add(m[1]);
        for (const m of src.matchAll(/\\?([^\sA-Za-z0-9\\])\\\}/g)) closes.add(m[1]);
    }
    return [...opens].filter((c) => closes.has(c)).sort();
};

/**
 * The same set as `{X` openers, the shape `scan-superlinear.mjs` feeds its
 * document builder.
 *
 * @returns {string[]} e.g. `['{#', '{%', '{*', ...]`.
 */
export const bracedOpeners = () => bracedDelimiters().map((c) => `{${c}`);

/**
 * How a delimiter is spelled inside a regex literal in the source: some
 * characters carry a backslash there (`\{\*`), others do not (`\{,`), and both
 * spellings have to be searched for.
 *
 * @param {string} delimiter - the single delimiter character.
 * @returns {string[]} the opener spellings, and the closer spellings.
 */
export const spellings = (delimiter) => ({
    open: [`\\{${delimiter}`, `\\{\\${delimiter}`],
    close: [`${delimiter}\\}`, `\\${delimiter}\\}`],
});
