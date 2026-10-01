/*
 * A ONE-LINE BLOCK'S INLINE SET COSTS WHAT A PARAGRAPH'S DOES
 * (carve-grammars#602).
 *
 * Giving `title` and `caption` an inline set in carve-grammars#600 put `escape`
 * ahead of the verbatim rules, so a backslashed backtick could not open a span.
 * The reading was right; the ordering made the line quadratic. `escape`
 * tokenizes each backslash pair, splitting the line into hundreds of fragments,
 * and Prism retries every greedy verbatim rule from each one. A heading of 800
 * units took 733 ms where the same text as a paragraph took 11 ms, and
 * `npm run perf:sweep` stopped finishing. The entries carry `notEscaped`
 * themselves now, and the set follows the document's order.
 *
 * THE ASSERTION IS A RATIO AGAINST THE PARAGRAPH, measured in the same process
 * moments apart, never a millisecond figure: a wall-clock constant measured here
 * fails on a runner. The paragraph is the right denominator because it is the
 * same inline work on the same bytes - if the block costs a small multiple of
 * it, no rule is retrying per fragment.
 *
 * Not part of the superlinear sweep, which is not in CI for the same
 * load-measures-load reason. This one is affordable because it compares two
 * readings taken beside each other rather than reading a clock.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Prism = require('prismjs');
globalThis.Prism = Prism;
await import('../prism/carve.js');
delete globalThis.Prism;
const carve = Prism.languages.carve;

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

const BT = String.fromCharCode(96);

// An escaped BACKSLASH and then a live span opener, repeated. This is the shape
// that found the defect: `escape` claims each pair, every backtick after one
// opens a span, and the fragments are what the retries multiply over.
const units = (n) => `${'\\\\' + BT + ' '.repeat(1)}`.repeat(n);

const time = (source) => {
    const start = process.hrtime.bigint();
    Prism.tokenize(source, carve);

    return Number(process.hrtime.bigint() - start) / 1e6;
};

// Interleaved and median-of-five, so a scheduler stall on one side does not
// decide the ratio.
const ratio = (blockPrefix, n) => {
    const block = `${blockPrefix}${units(n)}%% h\n`;
    const para = `p ${units(n)}%% h\n`;
    time(block);
    time(para);
    const seen = [];
    for (let round = 0; round < 5; round++) {
        const pair = [];
        if (round % 2) {
            pair[1] = time(block);
            pair[0] = time(para);
        } else {
            pair[0] = time(para);
            pair[1] = time(block);
        }
        seen.push(pair[1] / Math.max(pair[0], 0.05));
    }
    seen.sort((a, b) => a - b);

    return seen[2];
};

// Pre-fix this was ~70x at 800 units and climbing with the input; a block doing
// the same work as the paragraph sits near 1. The bar is loose on purpose - the
// defect it catches is a factor of ten, not a factor of two.
const CEILING = 8;

console.log('a one-line block costs what the same text costs as a paragraph:');

for (const [name, prefix] of [['a heading', '# '], ['a caption', '^ ']]) {
    for (const n of [200, 800]) {
        ok(`${name} is within ${CEILING}x of the paragraph at ${n} units`, () => {
            const measured = ratio(prefix, n);
            assert.ok(
                measured < CEILING,
                `${name} cost ${measured.toFixed(1)}x the paragraph at ${n} units`,
            );
        });
    }
}

// GROWTH, not just the level: the pre-fix shape was fine at small n and only
// showed itself as the line got longer, so a single size could have passed.
ok('the heading ratio does not grow with the line', () => {
    const small = ratio('# ', 200);
    const large = ratio('# ', 1600);
    assert.ok(
        large < small * 4 + CEILING,
        `the ratio grew from ${small.toFixed(1)}x to ${large.toFixed(1)}x with the line`,
    );
});


/*
 * A QUOTED ONE-LINE BLOCK'S RULES COST WHAT THE SAME TEXT COSTS AS A PARAGRAPH
 * (carve-grammars#604).
 *
 * carve-grammars#601 reached `> # h %% c` and `> ^ cap %% c` in highlight.js by
 * prefixing each quoted-block rule with a lookbehind for the marker run. The
 * reading is right and the spelling was quadratic: the lookbehind is
 * VARIABLE-LENGTH, so it walks back to the line start from every sentinel
 * position, and the walk is at its most expensive exactly where it must FAIL -
 * ordinary quoted prose carrying inline code, which is a common shape rather
 * than an adversarial one. A 32 KB `> a ` line of backtick runs took 2485 ms
 * against 21 ms unprefixed, four times per doubling. The line test runs after
 * the candidate now.
 *
 * SAME DENOMINATOR AND SAME REASONING as the Prism rows above: a ratio against
 * the identical text as a paragraph, never a millisecond figure. Measured
 * through `hljs.highlight` rather than a test helper, so nothing between the
 * engine and the clock.
 */
const hljs = require('highlight.js');
hljs.registerLanguage('carve', (await import('../highlightjs/carve.mjs')).default);

// Backtick runs in prose: a sentinel every three bytes, no span ever closing.
// This is the shape the lookbehind failed on, and failing is its worst case.
const spans = (n) => `${BT}x `.repeat(n);

const hljsTime = (source) => {
    const start = process.hrtime.bigint();
    hljs.highlight(source, { language: 'carve' });

    return Number(process.hrtime.bigint() - start) / 1e6;
};

const hljsRatio = (prefix, n) => {
    const quoted = `${prefix}${spans(n)}\n`;
    const para = `p ${spans(n)}\n`;
    hljsTime(quoted);
    hljsTime(para);
    const seen = [];
    for (let round = 0; round < 5; round++) {
        const pair = [];
        if (round % 2) {
            pair[1] = hljsTime(quoted);
            pair[0] = hljsTime(para);
        } else {
            pair[0] = hljsTime(para);
            pair[1] = hljsTime(quoted);
        }
        seen.push(pair[1] / Math.max(pair[0], 0.05));
    }
    seen.sort((a, b) => a - b);

    return seen[2];
};

console.log('\na quoted one-line block costs what the same text costs as a paragraph:');

// `> a ` carries NO marker, so every candidate is rejected - the row the
// lookbehind was slowest on. `> # h ` carries one, so the rules actually run.
for (const [name, prefix] of [['quoted prose', '> a '], ['a quoted heading', '> # h ']]) {
    for (const n of [2730, 10920]) {
        ok(`hljs: ${name} is within ${CEILING}x of the paragraph at ${n * 3} bytes`, () => {
            const measured = hljsRatio(prefix, n);
            assert.ok(
                measured < CEILING,
                `${name} cost ${measured.toFixed(1)}x the paragraph at ${n * 3} bytes`,
            );
        });
    }
}

// Pre-fix the unmarked row was ~2x the paragraph at 8 KB and ~120x at 32 KB, so
// a single size would have passed. GROWTH is the assertion that catches it.
ok('hljs: the quoted-prose ratio does not grow with the line', () => {
    const small = hljsRatio('> a ', 2730);
    const large = hljsRatio('> a ', 10920);
    assert.ok(
        large < small * 4 + CEILING,
        `the ratio grew from ${small.toFixed(1)}x to ${large.toFixed(1)}x with the line`,
    );
});

console.log(`\n${passed} passed`);
