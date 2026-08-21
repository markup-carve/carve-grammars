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

import { bracedOpeners } from './braced-openers.mjs';

const require = createRequire(import.meta.url);
const Prism = require('prismjs');
globalThis.Prism = Prism;
await import('../prism/carve.js');
delete globalThis.Prism;
const hljs = require('highlight.js');
hljs.registerLanguage('carve', (await import('../highlightjs/carve.mjs')).default);

// One repetition per opener the grammars react to, plus two-character baits
// that get further into a rule before failing.
//
// HAND-WRITTEN, WHICH IS WHY IT WENT STALE. Of the eleven `{X ... X}`
// constructs the grammars spell, this list named two - `{#` and `{%` - so the
// same defect went reported on those and unreported on the other nine
// (carve-grammars#298, #300). The braced family is therefore DERIVED from the
// grammars below rather than typed here, the way `tests/line-ambiguity-test.js`
// discovers its line groups: a `{X ... X}` rule added later is swept without an
// edit to this file.
const UNITS = [
    '[', '{', '(', '`', '*', '_', '<', '!', ':', '|', '^', '~', '=', '$', '@', '#', '\\', '"', "'", '+', '-', '>',
    '[a', '{a', '(a', '`a', '![', '[@', '[^', '{.', '<h', ':::', '|a', '^[', '$$', '~~', '==', '**', '__', '//',
    '<<', '%%', '\\[', '[[', '((', '{{',
];

// The derivation itself moved to `scripts/braced-openers.mjs` when #300 gave it
// a second consumer: `tests/scans-are-bounded-test.js` asserts every construct
// it names carries bounded scans, so the sweep and the bounds check cannot end
// up disagreeing about which constructs exist.
UNITS.push(...bracedOpeners().filter((u) => !UNITS.includes(u)));
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

console.log('\nsearch shapes (cost per distinct fence width, not per position)');
console.log(`shape                  bytes  prism      ratio    hljs       ratio`);
for (const [label, gen] of [['increasing % widths', widths]]) {
    const small = gen(500);
    const large = gen(2000);
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

// SHAPES SIZED IN LINES, NOT CHARACTERS.
//
// Both families above build their input out of ONE UNIT REPEATED, and the unit
// is a character or two. Nothing they generate contains a repeated LINE, so
// nothing they generate reaches a rule whose repetition counts LINES - which is
// what a fence body is. Both grammars scan for a comment fence's closer by
// repeating a "one line of the body" group, and when the fence never closes the
// engine has to disprove every parse of the body before it gives up. The cost of
// that failure is the NUMBER OF PARSES, so an ambiguous line group is
// EXPONENTIAL in the line count rather than quadratic in the byte count. Shipped
// in 0.1.4 and invisible to this script until this section existed: `- %%%` plus
// 24 indented lines took 421 ms in Prism and 379 ms in highlight.js, and the two
// families above reported 0 superlinear throughout (carve-grammars#294).
//
// The ladder is walked from small to large and STOPS at the first flagged rung,
// or at the first measurement over `CEILING`. Both stops are required, because
// the defect this is looking for does not finish: the pre-fix grammar takes
// 421 ms at 24 lines and does not return at 30, so a fixed large size would hang
// this script rather than report from it.
//
// The bottom rungs step by FOUR LINES rather than doubling, for the same reason.
// An exponential shape is too cheap to distinguish from noise at 16 lines and
// already unbounded at 32, so a doubling ladder steps straight over the only
// sizes where it is both visible and affordable. Four lines apart, the pre-fix
// grammar goes 1.6 ms -> 26 ms while a linear one grows by a quarter.
//
// A LINEAR shape costs the size ratio, whatever that ratio is, so the threshold
// is relative to it: `sizeRatio * 1.5`, which is exactly `SUSPECT` on the
// doubling rungs above and scales down on the four-line ones.
const LADDER = [16, 20, 24, 28, 32, 64, 128, 256, 512, 1024, 2048];
const CEILING = 1000;
const SUSPECT_MARGIN = 1.5;
// Lower than `FLOOR`: these ratios are x4 per four lines rather than x4 per
// doubling, so a few milliseconds against a few tenths is already a signal, and
// waiting for 25 ms means waiting for the rung that costs two minutes.
const LINE_FLOOR = 5;

const lineShapes = [
    ['unclosed %%% on a bullet', (n) => `- %%%\n${'  x\n'.repeat(n)}`],
    ['closed %%% on a bullet', (n) => `- %%%\n${'  x\n'.repeat(n)}  %%%\n`],
    ['unclosed %%% in a quote', (n) => `> %%%\n${'> x\n'.repeat(n)}`],
    ['unclosed %%% at column 0', (n) => `%%%\n${'  x\n'.repeat(n)}`],
];

console.log('\nline shapes (cost per PARSE of the body, not per position)');
console.log('shape                            lines  prism      ratio    hljs       ratio');
for (const [label, gen] of lineShapes) {
    // One warm run before the ladder: the first tokenize of a shape pays for
    // JIT, and paying it inside the ladder shows up as a ratio under 1 on the
    // second rung and hides the ones above it.
    time(() => Prism.tokenize(gen(LADDER[0]), Prism.languages.carve));
    time(() => hljs.highlight(gen(LADDER[0]), { language: 'carve' }));

    let prev = null;
    let worstPrism = 0;
    let worstHl = 0;
    // A ratio is only evidence next to a measurable absolute time, the same rule
    // the rows above follow - but the ratio is PRINTED either way, so a row that
    // is growing fast while still cheap stays visible instead of reading as 0.
    let flagged = false;
    let last = { lines: 0, prism: 0, hl: 0 };
    for (const lines of LADDER) {
        const src = gen(lines);
        const prism = time(() => Prism.tokenize(src, Prism.languages.carve));
        const hl = time(() => hljs.highlight(src, { language: 'carve' }));
        if (prev) {
            const limit = (lines / prev.lines) * SUSPECT_MARGIN;
            const pr = prism / Math.max(prev.prism, 0.01);
            const hr = hl / Math.max(prev.hl, 0.01);
            worstPrism = Math.max(worstPrism, pr);
            worstHl = Math.max(worstHl, hr);
            flagged = flagged
                || (prism > LINE_FLOOR && pr > limit)
                || (hl > LINE_FLOOR && hr > limit);
        }
        prev = { lines, prism, hl };
        last = { lines, prism, hl };
        if (flagged || prism > CEILING || hl > CEILING) break;
    }
    const flag = flagged ? '  <-- SUPERLINEAR' : '';
    if (flag) suspects++;
    console.log(
        `${label.padEnd(30)} ${String(last.lines).padStart(6)}  ${last.prism.toFixed(1).padStart(9)}`
        + `  ${worstPrism.toFixed(2).padStart(5)}  ${last.hl.toFixed(1).padStart(9)}`
        + `  ${worstHl.toFixed(2).padStart(5)}${flag}`,
    );
}

console.log(`\n${suspects} superlinear (ratio > ${SUSPECT} with a measurable absolute time)`);
process.exit(suspects ? 1 : 0);
