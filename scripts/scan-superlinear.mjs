/*
 * Find grammar rules whose cost grows faster than the input.
 *
 * Prism and highlight.js hand the WHOLE document to each pattern and retry at
 * successive positions, so a quantifier that can run to the end of the document
 * costs O(n) at each of n positions. That is quadratic in the document, and it
 * does not show up on any realistic sample - it needs an adversarial one.
 *
 * This tokenizes a repeated opener at two sizes and reports the growth. A ratio
 * near 2 is linear (twice the input, twice the time); near 4 is quadratic. The
 * RATIO is the result - absolute times on a machine carrying other load measure
 * the load, not the grammar.
 *
 * Not part of `npm test`, for that reason. Run it after touching a pattern:
 *
 *     npm run perf:sweep
 *
 * A row over 3 with a meaningful absolute time is worth attributing: drop one
 * rule at a time from the grammar object, re-tokenize, and the one that
 * collapses the time is the one to bound.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Prism = require('prismjs');
globalThis.Prism = Prism;
await import('../prism/carve.js');
delete globalThis.Prism;
const hljs = require('highlight.js');
hljs.registerLanguage('carve', (await import('../highlightjs/carve.mjs')).default);

// One repetition per opener the grammars react to, plus two-character baits
// that get further into a rule before failing.
const UNITS = [
    '[', '{', '(', '`', '*', '_', '<', '!', ':', '|', '^', '~', '=', '$', '@', '#', '\\', '"', "'", '+', '-', '>',
    '[a', '{a', '(a', '`a', '![', '[@', '[^', '{.', '<h', ':::', '|a', '^[', '$$', '~~', '==', '**', '__', '//',
    '<<', '{#', '{%', '%%', '\\[', '[[', '((', '{{',
];
const SMALL = 12000;
const LARGE = 24000;
const SUSPECT = 3;
// Below this, a ratio is measurement noise rather than a finding.
const FLOOR = 25;

const mk = (unit, n) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
const time = (fn) => {
    const start = process.hrtime.bigint();
    fn();
    return Number(process.hrtime.bigint() - start) / 1e6;
};

const rows = [];
for (const unit of UNITS) {
    const prism = [SMALL, LARGE].map((n) => time(() => Prism.tokenize(mk(unit, n), Prism.languages.carve)));
    const hl = [SMALL, LARGE].map((n) => time(() => hljs.highlight(mk(unit, n), { language: 'carve' })));
    rows.push({
        unit,
        prism: prism[1],
        prismRatio: prism[1] / Math.max(prism[0], 0.01),
        hl: hl[1],
        hlRatio: hl[1] / Math.max(hl[0], 0.01),
    });
}
rows.sort((a, b) => Math.max(b.prismRatio, b.hlRatio) - Math.max(a.prismRatio, a.hlRatio));

console.log(`opener     prism@${LARGE}  ratio    hljs@${LARGE}  ratio`);
let suspects = 0;
for (const r of rows) {
    // Per ENGINE: a ratio only means something next to that engine's own time.
    // Pairing one engine's ratio with the other's absolute time reported the
    // backslash shape three runs out of four, and it is linear at every size
    // large enough to measure - 192 KB of it is 38ms.
    const superlinear = (ms, ratio) => ms > FLOOR && ratio > SUSPECT;
    const flag = superlinear(r.prism, r.prismRatio) || superlinear(r.hl, r.hlRatio)
        ? '  <-- SUPERLINEAR' : '';
    if (flag) suspects++;
    console.log(
        `${JSON.stringify(r.unit).padEnd(9)} ${r.prism.toFixed(1).padStart(10)}  ${r.prismRatio.toFixed(2).padStart(5)}`
        + `  ${r.hl.toFixed(1).padStart(10)}  ${r.hlRatio.toFixed(2).padStart(5)}${flag}`,
    );
}
console.log(`\n${suspects} superlinear (ratio > ${SUSPECT} with a measurable absolute time)`);
process.exit(suspects ? 1 : 0);
