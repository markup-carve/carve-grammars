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
// SHAPES A REPEATED OPENER CANNOT REACH.
//
// Everything above is one unit repeated, which finds a quantifier that runs to
// the end of the document from each of n positions. It cannot find a rule whose
// cost comes from a DOCUMENT-WIDE SEARCH that only fails - a lookahead proving
// there is no closer scans to end of input, and it is paid once per distinct
// fence WIDTH, so it needs a document with many widths rather than many copies
// of one. Measured before this section existed: 2000 `%` runs of increasing
// width took 2.0 s in highlight.js and 1.8 s in Prism, 8 MB took 16.3 s and
// 14.2 s, and the sweep above reported 0 superlinear throughout
// (carve-grammars#260).
//
// Sized by LINE COUNT rather than bytes, because a document of distinct-width
// runs is quadratic in its own line count - the ratio to read is time against
// bytes, which is why both are printed.
const widths = (lines) => {
    const out = [];
    for (let i = 0; i < lines; i += 1) out.push('%'.repeat(3 + i));
    return `${out.join('\n')}\n`;
};

// A SHAPE WHOSE REPEATED UNIT IS A LINE, which neither section above can build.
//
// A container-marked fence scans for its closer over a repetition of LINES, so
// the cost comes from how the group matching one line is written. Two
// alternatives that can both match the same line let the repetition split the
// same input many ways, and the scan backtracks exponentially - which is what
// `blankOrIndentedLine` did until the alternatives were made disjoint
// (carve-grammars#294). No amount of one repeated character reaches this: the
// unit has to be a line, and the fence has to stay open to the end.
//
// SIZED IN TENS OF LINES, not hundreds, and deliberately so. Exponential cost
// means a regression here does not finish at 500 lines in any useful sense -
// the previous defect took 7.4 s at 22 lines and roughly six times that per two
// lines after. Small sizes keep this sweep terminating while a regression still
// shows up as an enormous ratio.
const unclosedFenceInItem = (lines) => `- %%%\n${'  x\n'.repeat(lines)}${' '.repeat(20)}\n`;

console.log('\nsearch shapes (cost per distinct fence width, not per position)');
console.log(`shape                  bytes  prism      ratio    hljs       ratio`);
for (const [label, gen, smallN, largeN] of [
    ['increasing % widths', widths, 500, 2000],
    ['unclosed fence in item', unclosedFenceInItem, 20, 24],
]) {
    const small = gen(smallN);
    const large = gen(largeN);
    const bytesRatio = large.length / small.length;
    const prism = [small, large].map((src) => time(() => Prism.tokenize(src, Prism.languages.carve)));
    const hl = [small, large].map((src) => time(() => hljs.highlight(src, { language: 'carve' })));
    // The input itself grows by `bytesRatio`, so LINEAR cost shows as that
    // ratio and not as 2 - the limit is the bytes ratio itself, not a multiple
    // of it. Measured at these two sizes, the bounded scan comes in at 4.4
    // against a bytes ratio of 15.8 and the unbounded one at 58.2, so the two
    // are nowhere near each other and the threshold needs no tuning margin.
    // `SUSPECT` is deliberately not used here: it is calibrated for the
    // repeated-opener rows above, where the input doubles rather than growing
    // with the square of its own line count.
    const limit = bytesRatio;
    const prismRatio = prism[1] / Math.max(prism[0], 0.01);
    const hlRatio = hl[1] / Math.max(hl[0], 0.01);
    const superlinear = (ms, ratio) => ms > FLOOR && ratio > limit;
    const flag = superlinear(prism[1], prismRatio) || superlinear(hl[1], hlRatio)
        ? '  <-- SUPERLINEAR' : '';
    if (flag) suspects++;
    console.log(
        `${label.padEnd(20)} ${String(large.length).padStart(8)}  ${prism[1].toFixed(1).padStart(9)}  ${prismRatio.toFixed(2).padStart(5)}`
        + `  ${hl[1].toFixed(1).padStart(9)}  ${hlRatio.toFixed(2).padStart(5)}${flag}`
        + `   (bytes x${bytesRatio.toFixed(1)}, limit ${limit.toFixed(1)})`,
    );
}

console.log(`\n${suspects} superlinear (ratio > ${SUSPECT} with a measurable absolute time)`);
process.exit(suspects ? 1 : 0);
