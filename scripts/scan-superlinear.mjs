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
 *
 * A LOADED MACHINE STILL PRODUCES FALSE ROWS, so a row is reported only after
 * three hurdles: it is re-measured on the spot to `REPEATS` medians and the
 * median of those stands, so one stall either way decides nothing; `FLOOR`
 * is scaled by the one-minute load average per core (`LOAD_SCALE`,
 * between 1 and `MAX_LOAD_SCALE`), because a stall that inflates one sample is
 * longer on a busier host; and every row still flagged is measured again after
 * the whole sweep, at a different moment of load, before the script exits 1.
 * The load average is host-wide, which a CPU-limited container does not share:
 * the cap keeps the floor below any real finding's time, and
 * `PERF_SWEEP_LOAD_SCALE=1` turns the scaling off.
 */
import { createRequire } from 'node:module';
import { availableParallelism, loadavg } from 'node:os';

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
const ROUNDS = 7;
const REPEATS = 3;
const MAX_LOAD_SCALE = 4;
const LOAD_SCALE = Number(process.env.PERF_SWEEP_LOAD_SCALE)
    || Math.min(MAX_LOAD_SCALE, Math.max(1, loadavg()[0] / availableParallelism()));
// Below this, a ratio is measurement noise rather than a finding.
const FLOOR = 25 * LOAD_SCALE;

const mk = (unit, n) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
const time = (fn) => {
    const start = process.hrtime.bigint();
    fn();
    return Number(process.hrtime.bigint() - start) / 1e6;
};

// A shared runner can pause either side of a ratio. Measure adjacent, alternating
// pairs and use the median ratio. The numerator stays beside the denominator
// measured under the same load, while isolated stalls on either side fall away.
const measurePair = (small, large) => {
    const pairs = [];
    small();
    large();
    for (let round = 0; round < ROUNDS; round++) {
        const order = round % 2 ? [[1, large], [0, small]] : [[0, small], [1, large]];
        const pair = [];
        for (const [index, fn] of order) pair[index] = time(fn);
        pairs.push(pair);
    }
    pairs.sort((a, b) => (a[1] / Math.max(a[0], 0.01)) - (b[1] / Math.max(b[0], 0.01)));
    return pairs[Math.floor(pairs.length / 2)];
};
const isSuperlinear = (ms, ratio, floor = FLOOR, limit = SUSPECT) => ms > floor && ratio > limit;
const ratioOf = (pair) => pair[1] / Math.max(pair[0], 0.01);
// A flagged pair is measured to `REPEATS` medians and the median of those stands.
const settledPair = (small, large, floor = FLOOR, limit = SUSPECT) => {
    const first = measurePair(small, large);
    if (!isSuperlinear(first[1], ratioOf(first), floor, limit)) return first;
    const pairs = [first];
    while (pairs.length < REPEATS) pairs.push(measurePair(small, large));
    pairs.sort((a, b) => ratioOf(a) - ratioOf(b));
    return pairs[Math.floor(pairs.length / 2)];
};
// A flagged row is kept with the closure that measured it and asked again at the end.
const flaggedRows = [];
const report = (label, measure) => {
    const first = measure();
    console.log(first.text + (first.flagged ? '  <-- SUPERLINEAR' : ''));
    if (first.flagged) flaggedRows.push({ label, measure });
};

// Pin both verdicts with costs whose complexity is known. The quadratic regex
// repeats a variable-length prefix check at every position, which is the class
// of failure this script exists to find.
let syntheticSink = 0;
const linearWork = (n) => {
    let value = syntheticSink;
    for (let i = 0; i < n; i++) value = (value + i) | 0;
    syntheticSink = value;
};
const syntheticInput = (n) => `${' '.repeat(n)}y`;
const linear = measurePair(
    () => linearWork(80000000),
    () => linearWork(160000000),
);
const quadratic = measurePair(
    () => /(?<=^ *)x/.test(syntheticInput(12000)),
    () => /(?<=^ *)x/.test(syntheticInput(24000)),
);
const linearRatio = linear[1] / Math.max(linear[0], 0.01);
const quadraticRatio = quadratic[1] / Math.max(quadratic[0], 0.01);
if (linear[1] <= FLOOR) {
    throw new Error('the linear measurement oracle did not reach the evidence floor');
}
if (isSuperlinear(linear[1], linearRatio)) {
    throw new Error('the linear measurement oracle was reported as superlinear');
}
if (!isSuperlinear(quadratic[1], quadraticRatio)) {
    throw new Error('the quadratic measurement oracle was not reported');
}
console.log(`measurement oracle: linear x${linearRatio.toFixed(2)}, quadratic x${quadraticRatio.toFixed(2)}`);
console.log(`load x${LOAD_SCALE.toFixed(2)} per core: evidence floor ${FLOOR.toFixed(1)} ms`);

const measureUnit = (unit) => () => {
    const prism = settledPair(
        () => Prism.tokenize(mk(unit, SMALL), Prism.languages.carve),
        () => Prism.tokenize(mk(unit, LARGE), Prism.languages.carve),
    );
    const hl = settledPair(
        () => hljs.highlight(mk(unit, SMALL), { language: 'carve' }),
        () => hljs.highlight(mk(unit, LARGE), { language: 'carve' }),
    );
    const prismRatio = ratioOf(prism);
    const hlRatio = ratioOf(hl);
    return {
        rank: Math.max(prismRatio, hlRatio),
        // Per ENGINE: a ratio only means something next to that engine's own time.
        // Pairing one engine's ratio with the other's absolute time reported the
        // backslash shape three runs out of four, and it is linear at every size
        // large enough to measure - 192 KB of it is 38ms.
        flagged: isSuperlinear(prism[1], prismRatio) || isSuperlinear(hl[1], hlRatio),
        text: `${JSON.stringify(unit).padEnd(9)} ${prism[1].toFixed(1).padStart(10)}  ${prismRatio.toFixed(2).padStart(5)}`
            + `  ${hl[1].toFixed(1).padStart(10)}  ${hlRatio.toFixed(2).padStart(5)}`,
    };
};
const rows = UNITS.map((unit) => ({ unit, measure: measureUnit(unit), first: measureUnit(unit)() }));
rows.sort((a, b) => b.first.rank - a.first.rank);

console.log(`opener     prism@${LARGE}  ratio    hljs@${LARGE}  ratio`);
for (const r of rows) {
    let first = r.first;
    report(JSON.stringify(r.unit), () => {
        const result = first ?? r.measure();
        first = null;
        return result;
    });
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
    // The input itself grows by `bytesRatio`, so LINEAR cost shows as that
    // ratio and not as 2 - the limit is the bytes ratio itself, not a multiple
    // of it. Measured at these two sizes, the bounded scan comes in at 4.4
    // against a bytes ratio of 15.8 and the unbounded one at 58.2, so the two
    // are nowhere near each other and the threshold needs no tuning margin.
    // `SUSPECT` is deliberately not used here: it is calibrated for the
    // repeated-opener rows above, where the input doubles rather than growing
    // with the square of its own line count.
    const limit = bytesRatio;
    report(label, () => {
        const prism = settledPair(
            () => Prism.tokenize(small, Prism.languages.carve),
            () => Prism.tokenize(large, Prism.languages.carve),
            FLOOR,
            limit,
        );
        const hl = settledPair(
            () => hljs.highlight(small, { language: 'carve' }),
            () => hljs.highlight(large, { language: 'carve' }),
            FLOOR,
            limit,
        );
        const prismRatio = ratioOf(prism);
        const hlRatio = ratioOf(hl);
        return {
            flagged: isSuperlinear(prism[1], prismRatio, FLOOR, limit) || isSuperlinear(hl[1], hlRatio, FLOOR, limit),
            text: `${label.padEnd(20)} ${String(large.length).padStart(8)}  ${prism[1].toFixed(1).padStart(9)}  ${prismRatio.toFixed(2).padStart(5)}`
                + `  ${hl[1].toFixed(1).padStart(9)}  ${hlRatio.toFixed(2).padStart(5)}`
                + `   (bytes x${bytesRatio.toFixed(1)}, limit ${limit.toFixed(1)})`,
        };
    });
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
// Lower than `FLOOR`: an exponential can cross this floor at 32 lines and then
// take minutes at the next rung. Paired sampling removes the scheduler noise
// that made this floor unreliable on a loaded host (#423).
// Not load-scaled: the ladder stops at `CEILING`, so a raised floor could let
// an exponential shape step past the last rung it can be caught on.
const LINE_FLOOR = 5;

const lineShapes = [
    ['unclosed %%% on a bullet', (n) => `- %%%\n${'  x\n'.repeat(n)}`],
    ['closed %%% on a bullet', (n) => `- %%%\n${'  x\n'.repeat(n)}  %%%\n`],
    ['unclosed %%% in a quote', (n) => `> %%%\n${'> x\n'.repeat(n)}`],
    ['unclosed %%% at column 0', (n) => `%%%\n${'  x\n'.repeat(n)}`],
];

console.log('\nline shapes (cost per PARSE of the body, not per position)');
console.log('shape                            lines  prism      ratio    hljs       ratio');
for (const [label, gen] of lineShapes) report(label, () => {
    let worstPrism = 0;
    let worstHl = 0;
    // A ratio is only evidence next to a measurable absolute time, the same rule
    // the rows above follow - but the ratio is PRINTED either way, so a row that
    // is growing fast while still cheap stays visible instead of reading as 0.
    let flagged = false;
    let last = { lines: 0, prism: 0, hl: 0 };
    for (let rung = 1; rung < LADDER.length; rung++) {
        const beforeLines = LADDER[rung - 1];
        const lines = LADDER[rung];
        const before = gen(beforeLines);
        const after = gen(lines);
        const limit = (lines / beforeLines) * SUSPECT_MARGIN;
        const prism = settledPair(
            () => Prism.tokenize(before, Prism.languages.carve),
            () => Prism.tokenize(after, Prism.languages.carve),
            LINE_FLOOR,
            limit,
        );
        const hl = settledPair(
            () => hljs.highlight(before, { language: 'carve' }),
            () => hljs.highlight(after, { language: 'carve' }),
            LINE_FLOOR,
            limit,
        );
        const pr = prism[1] / Math.max(prism[0], 0.01);
        const hr = hl[1] / Math.max(hl[0], 0.01);
        worstPrism = Math.max(worstPrism, pr);
        worstHl = Math.max(worstHl, hr);
        flagged = isSuperlinear(prism[1], pr, LINE_FLOOR, limit)
            || isSuperlinear(hl[1], hr, LINE_FLOOR, limit);
        last = { lines, prism: prism[1], hl: hl[1] };
        if (flagged || prism[1] > CEILING || hl[1] > CEILING) break;
    }
    return {
        flagged,
        text: `${label.padEnd(30)} ${String(last.lines).padStart(6)}  ${last.prism.toFixed(1).padStart(9)}`
            + `  ${worstPrism.toFixed(2).padStart(5)}  ${last.hl.toFixed(1).padStart(9)}`
            + `  ${worstHl.toFixed(2).padStart(5)}`,
    };
});

// SHAPES INSIDE ONE LONG LINE, WHICH A REPEATED OPENER CANNOT BUILD.
//
// Every family above repeats a UNIT or a LINE. Neither reaches a rule whose
// cost lives inside a single long line, and the include directive is one: its
// opener is `{{` followed by a RUN OF WHITESPACE, so `{{{{{{...` - the unit the
// first family feeds it - fails at the second character and the rule is never
// entered. The sweep therefore reported nothing about `include-directive` at
// any size, on either side of the widening in carve-grammars#412.
//
// What the rule can be made to do instead is backtrack WITHIN one directive.
// Its part run admits a quoted segment, so a `"` that could be both an opener
// and an ordinary character gives the engine two paths at every quote, and a
// directive with no closer on the line is what forces it to try both. These
// shapes are that bait, repeated inside ONE line: the cost to look for is the
// engine disproving a parse, not the document getting longer.
const lineBaits = [
    ['unterminated, quote baits', (n) => `{{ a.crv ${'@x:"y '.repeat(n)}\n`],
    ['unterminated, brace baits', (n) => `{{ a.crv ${'@x:"a}b" '.repeat(n)}\n`],
    ['closed, brace baits', (n) => `{{ a.crv ${'@x:"a}b" '.repeat(n)}}}\n`],
    ['unterminated, closer baits', (n) => `{{ a.crv ${'@x:"a }} b" '.repeat(n)}\n`],
    // A CELL COMMENT'S OWN BODY, which stops at the cell rather than at the line
    // (carve-grammars#576). The row and whitespace shapes cover patches that were
    // quadratic in different places and neither showed up in any row above: a
    // long row with no comment at all (the row test walked back to the line
    // start at every space) and a comment body full of whitespace (a lazy body
    // retried its closing lookahead at every space). The repeated-opener shapes
    // also measure the prefix scan that still runs once per candidate comment.
    ['non-row, comment openers', (n) => `x${' %%'.repeat(Math.ceil(n / 8))}\n`],
    ['row, repeated comments', (n) => `| ${'a %%c |'.repeat(Math.ceil(n / 8))}\n`],
    ['table row, no comment', (n) => `| ${'a'.repeat(n)} | b |\n`],
    ['table cell comment, spaces', (n) => `| a %% ${' '.repeat(n)}h | b |\n`],
    ['spaces, then a block', (n) => `x${' '.repeat(n)}{.c}\n`],
    // A HEADING'S COMMENT RULE WALKS ITS LINE PREFIX (carve-grammars#601). The
    // walk matches span widths with a backreference and skips backslash
    // escapes, so its cost lives in one long line and no repeated opener above
    // reaches it: the shape needs backtick runs AND a trailing `%%` on the same
    // heading line. The rungs cover what the walk branches on - paired runs, a
    // run with no partner (which blocks the walk and is where a regex pays for
    // the parses it rules out), wide runs, escapes, and one span that never
    // closes.
    ['heading, paired runs then %%', (n) => `# ${'\`x\` '.repeat(Math.ceil(n / 4))}%% h\n`],
    ['heading, unpaired runs then %%', (n) => `# ${'\`x\` '.repeat(Math.ceil(n / 4))}\` %% h\n`],
    ['heading, wide runs then %%', (n) => `# ${'\`\`x\`\` '.repeat(Math.ceil(n / 6))}%% h\n`],
    ['heading, escaped backticks then %%', (n) => `# ${'\\\` '.repeat(Math.ceil(n / 3))}%% h\n`],
    // TWO backslashes, which is an escaped BACKSLASH and then a LIVE span
    // opener - hundreds of them on one line. The row was in this file by
    // accident, as a mis-escaped spelling of the row above, and it is the row
    // that found carve-grammars#602: a heading's verbatim rules retried from
    // every fragment `escape` had split the line into. Kept deliberately now.
    ['heading, live openers then %%', (n) => `# ${'\\\\\` '.repeat(Math.ceil(n / 4))}%% h\n`],
    ['heading, one open run', (n) => `# a \`${'x'.repeat(n)}\n`],
];

// A single pass costing more than this backs the row off to a smaller size.
const IN_LINE_CEILING = 250;
console.log('\nin-line shapes (cost inside ONE line, not per line or per position)');
console.log(`shape                          bytes  prism      ratio    hljs       ratio`);
for (const [label, gen] of lineBaits) {
    // Sized so the larger rung clears FLOOR on the row that matches - a ladder
    // whose absolute times sit under the floor cannot report anything, which is
    // the failure mode `bracedOpeners` exists to stop elsewhere in this file.
    const small = gen(16000);
    const large = gen(32000);
    // STEP UP TO THE FULL SIZE, and stop at the first rung that costs more than
    // `IN_LINE_CEILING`. `measurePair` takes 16 samples, so a row that is seconds
    // at 32 KB turns into minutes and the script simply never reaches the rows
    // after it - which is what the heading rows did on arrival
    // (carve-grammars#602). A row that stops early still PRINTS, with the size it
    // reached, so a reader sees an expensive row rather than a missing one.
    let reached = 32000;
    for (const probe of [2000, 8000, 32000]) {
        reached = probe;
        const one = time(() => Prism.tokenize(gen(probe), Prism.languages.carve))
            + time(() => hljs.highlight(gen(probe), { language: 'carve' }));
        if (one > IN_LINE_CEILING) break;
    }
    const sized = reached === 32000 ? [small, large] : [gen(Math.ceil(reached / 2)), gen(reached)];
    report(label, () => {
        const prism = settledPair(
            () => Prism.tokenize(sized[0], Prism.languages.carve),
            () => Prism.tokenize(sized[1], Prism.languages.carve),
        );
        const hl = settledPair(
            () => hljs.highlight(sized[0], { language: 'carve' }),
            () => hljs.highlight(sized[1], { language: 'carve' }),
        );
        const prismRatio = ratioOf(prism);
        const hlRatio = ratioOf(hl);
        return {
            flagged: isSuperlinear(prism[1], prismRatio) || isSuperlinear(hl[1], hlRatio),
            text: `${label.padEnd(26)} ${String(sized[1].length).padStart(8)}  ${prism[1].toFixed(1).padStart(9)}  ${prismRatio.toFixed(2).padStart(5)}`
                + `  ${hl[1].toFixed(1).padStart(9)}  ${hlRatio.toFixed(2).padStart(5)}`,
        };
    });
}

// A plain line with a long indentation run reaches no opener at all. That is
// precisely why the opener-based rows above missed #440: highlight.js paid for
// variable-length indentation lookbehinds before checking whether the current
// character was `>`, `%` or `{`. The include path mode has the same trap after
// `{{`. Prism has different line-prefix machinery, so
// this row measures only the grammar and engine named by the defect.
console.log('\nhighlight.js plain-line whitespace');
console.log('shape                          bytes  hljs       ratio');
for (const [label, gen] of [
    ['spaces before plain text', (n) => `${' '.repeat(n)}word\n`],
    ['spaces before include path', (n) => `{{${' '.repeat(n)}a }}\n`],
]) {
    const small = gen(16000);
    const large = gen(32000);
    report(label, () => {
        const pair = settledPair(
            () => hljs.highlight(small, { language: 'carve' }),
            () => hljs.highlight(large, { language: 'carve' }),
        );
        const ratio = ratioOf(pair);
        return {
            flagged: isSuperlinear(pair[1], ratio),
            text: `${label.padEnd(26)} ${String(large.length).padStart(8)}`
                + `  ${pair[1].toFixed(1).padStart(9)}  ${ratio.toFixed(2).padStart(5)}`,
        };
    });
}

// The second look, at a different moment of load: a row flagged by a stall
// clears here, a superlinear one does not.
let suspects = 0;
if (flaggedRows.length) console.log(`\nre-measuring ${flaggedRows.length} flagged row(s)`);
for (const { measure } of flaggedRows) {
    const again = measure();
    if (again.flagged) suspects++;
    console.log(`${again.flagged ? 'confirmed' : 'cleared  '}  ${again.text}`);
}

console.log(`\n${suspects} superlinear (ratio > ${SUSPECT} with a measurable absolute time)`);
process.exit(suspects ? 1 : 0);
