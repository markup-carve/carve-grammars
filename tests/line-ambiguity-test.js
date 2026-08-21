/*
 * A repeated LINE group in Prism/highlight.js must have exactly one parse.
 *
 * WHY. `prism/carve.js` and `highlightjs/carve.js` both scan for a comment
 * fence's closer by repeating a "one line of the body" group, lazily, up to a
 * closer that has to be there. When there is NO closer the engine has to
 * disprove every parse before it gives up - so the cost of the failure is the
 * NUMBER OF PARSES of the body, not its length. If the group can parse an
 * n-line body in 2^n ways, `- %%%` plus thirty ordinary indented lines hangs
 * the thread that highlights it. That is a denial of service on any surface
 * rendering untrusted Carve, and it shipped in 0.1.4 (carve-grammars#294):
 * Prism took 421 ms at 24 lines and highlight.js 379 ms, roughly x4 per two
 * lines added.
 *
 * Two independent things multiply the parse count, and BOTH have to be absent:
 *
 *   1. Branches that OVERLAP. `[ \t]*\n` and `[ \t]+[^\n]*\n` both match a
 *      whitespace-only line, so each such line doubles the parses.
 *   2. A branch that is internally AMBIGUOUS. `[ \t]+[^\n]*` splits `  x` two
 *      ways at the same end position, because `[^\n]` accepts a space too.
 *      This one is invisible to a check that only compares branches, and it is
 *      the factor actually paid on the reported input.
 *
 * HOW IT IS CHECKED, and why not with a clock. A millisecond budget measures
 * the machine's load as much as the grammar. Both properties here are
 * decidable instead:
 *
 *   - overlap: enumerate every string over { space, tab, x, newline } up to
 *     five characters and assert no two branches match the same one entirely.
 *   - internal ambiguity: wrap each atom of a branch in a capture group and
 *     match twice, once with every quantifier greedy and once with every
 *     quantifier lazy. An unambiguous branch has one parse, so the two runs
 *     must agree on where every atom starts and stops. They disagree exactly
 *     when a second parse exists.
 *
 * Neither reads the clock, so this runs in CI where `npm run perf:sweep`
 * cannot.
 *
 * The groups are DISCOVERED, not listed: anything used as `NAME + '*'` in
 * either grammar is checked. A line group added later is covered without an
 * edit here, which is the blind spot that let this defect ship - the sweep in
 * `scripts/scan-superlinear.mjs` repeats ONE CHARACTER, so no input it builds
 * has a repeated LINE in it at all.
 *
 * The two pre-fix sources are kept below as fixtures the oracle must REJECT.
 * A check that cannot fail is the recurring defect in this repo's history, so
 * this one demonstrates its own teeth on every run.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

console.log('carve-grammars repeated line groups:');

/* ---------------------------------------------------------------- tokenizer */

/*
 * Split a regex source into ATOMS, each with its quantifier. An atom is an
 * escape, a character class, a group, or a single character - enough for the
 * line groups, and it throws rather than guesses on anything else.
 */
function atomsOf(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
        let atom;
        const c = src[i];
        if (c === '\\') {
            atom = src.slice(i, i + 2);
            i += 2;
        } else if (c === '[') {
            let j = i + 1;
            if (src[j] === '^') j += 1;
            if (src[j] === ']') j += 1;
            while (j < src.length && src[j] !== ']') {
                if (src[j] === '\\') j += 1;
                j += 1;
            }
            if (j >= src.length) throw new Error(`unterminated class in ${src}`);
            atom = src.slice(i, j + 1);
            i = j + 1;
        } else if (c === '(') {
            let depth = 0;
            let j = i;
            for (; j < src.length; j += 1) {
                if (src[j] === '\\') { j += 1; continue; }
                if (src[j] === '[') {
                    j += 1;
                    while (j < src.length && src[j] !== ']') {
                        if (src[j] === '\\') j += 1;
                        j += 1;
                    }
                    continue;
                }
                if (src[j] === '(') depth += 1;
                else if (src[j] === ')') { depth -= 1; if (depth === 0) break; }
            }
            if (depth !== 0) throw new Error(`unbalanced group in ${src}`);
            atom = src.slice(i, j + 1);
            i = j + 1;
        } else if (c === '|') {
            throw new Error(`atomsOf saw a top-level alternation: ${src}`);
        } else {
            atom = c;
            i += 1;
        }

        let quant = '';
        if (src[i] === '*' || src[i] === '+' || src[i] === '?') {
            quant = src[i];
            i += 1;
        } else if (src[i] === '{') {
            const close = src.indexOf('}', i);
            if (close !== -1 && /^\{\d*(?:,\d*)?\}$/.test(src.slice(i, close + 1))) {
                quant = src.slice(i, close + 1);
                i = close + 1;
            }
        }
        if (quant && src[i] === '?') {
            quant += '?';
            i += 1;
        }
        out.push({ atom, quant });
    }
    return out;
}

/* Walk past a character class that starts at `j`; returns the index of its `]`. */
function endOfClass(src, j) {
    let k = j + 1;
    if (src[k] === '^') k += 1;
    if (src[k] === ']') k += 1;
    while (k < src.length && src[k] !== ']') {
        if (src[k] === '\\') k += 1;
        k += 1;
    }
    return k;
}

/* Split a group source on TOP-LEVEL `|`, ignoring classes and nested groups. */
function branchesOf(source) {
    let src = source;
    // Unwrap one enclosing `(?: ... )` when it spans the whole source.
    if (src.startsWith('(?:') && src.endsWith(')')) {
        const inner = src.slice(3, -1);
        let depth = 0;
        let spans = true;
        for (let j = 0; j < inner.length; j += 1) {
            if (inner[j] === '\\') { j += 1; continue; }
            if (inner[j] === '[') { j = endOfClass(inner, j); continue; }
            if (inner[j] === '(') depth += 1;
            else if (inner[j] === ')') { depth -= 1; if (depth < 0) { spans = false; break; } }
        }
        if (spans && depth === 0) src = inner;
    }

    const parts = [];
    let depth = 0;
    let start = 0;
    for (let j = 0; j < src.length; j += 1) {
        if (src[j] === '\\') { j += 1; continue; }
        if (src[j] === '[') { j = endOfClass(src, j); continue; }
        if (src[j] === '(') depth += 1;
        else if (src[j] === ')') depth -= 1;
        else if (src[j] === '|' && depth === 0) { parts.push(src.slice(start, j)); start = j + 1; }
    }
    parts.push(src.slice(start));
    return parts;
}

/* ------------------------------------------------------------------ oracles */

const ALPHABET = [' ', '\t', 'x', '\n'];
const MAX_LEN = 5;

function everyString() {
    const out = [''];
    let frontier = [''];
    for (let len = 1; len <= MAX_LEN; len += 1) {
        const next = [];
        for (const s of frontier) for (const c of ALPHABET) next.push(s + c);
        out.push(...next);
        frontier = next;
    }
    return out;
}
const SAMPLES = everyString();

const anchored = (src) => new RegExp(`^(?:${src})$`);

/*
 * The same branch twice: every quantifier greedy, then every quantifier lazy,
 * with each atom in its own capture group. One parse means one capture split.
 */
function parses(branch) {
    const atoms = atomsOf(branch);
    const build = (lazy) => atoms
        .map(({ atom, quant }) => {
            let q = quant;
            if (lazy && q && !q.endsWith('?')) q += '?';
            return `(${atom}${q})`;
        })
        .join('');
    return {
        greedy: new RegExp(`^${build(false)}$`),
        lazy: new RegExp(`^${build(true)}$`),
    };
}

function overlaps(branches) {
    const res = branches.map((b) => anchored(b));
    const found = [];
    for (const s of SAMPLES) {
        const hit = [];
        for (let k = 0; k < res.length; k += 1) if (res[k].test(s)) hit.push(k + 1);
        if (hit.length > 1) found.push({ sample: s, branches: hit });
    }
    return found;
}

function ambiguities(branch) {
    const { greedy, lazy } = parses(branch);
    const found = [];
    for (const s of SAMPLES) {
        const g = greedy.exec(s);
        if (!g) continue;
        const l = lazy.exec(s);
        // A greedy full match with no lazy full match would itself be two
        // different answers to the same question, so it counts.
        if (!l || g.slice(1).join('␟') !== l.slice(1).join('␟')) {
            found.push({ sample: s, greedy: g.slice(1), lazy: l ? l.slice(1) : null });
        }
    }
    return found;
}

const show = (v) => JSON.stringify(v);

function checkGroup(label, source) {
    const branches = branchesOf(source);
    ok(`${label}: branches do not overlap`, () => {
        const bad = overlaps(branches);
        assert.deepStrictEqual(
            bad.slice(0, 3),
            [],
            `${label} ${source}: ${show(bad.slice(0, 3))} match more than one branch - each such `
                + 'line doubles the parses of the body, and an unclosed fence pays for all of them',
        );
    });
    branches.forEach((branch, k) => {
        ok(`${label}: branch ${k + 1} has one parse`, () => {
            const bad = ambiguities(branch);
            assert.deepStrictEqual(
                bad.slice(0, 3),
                [],
                `${label} branch ${show(branch)} splits more than one way: ${show(bad.slice(0, 3))} - `
                    + 'a repetition of it is exponential in the number of lines',
            );
        });
    });
}

/* ---------------------------------------------- the fixtures that must fail */

/*
 * The first two are exactly what shipped in 0.1.4. The third is the NEAR MISS
 * that keeps the second oracle honest: it separates the branches and nothing
 * else, so the overlap oracle passes it - and it still takes 146 ms on the
 * reported input at 22 lines, x4 per two lines, because `[ \t]+[^\n]*` still
 * splits `  x` two ways. Removing either oracle would let one of these through.
 */
const MUST_BE_REJECTED = [
    ['the 0.1.4 prism blankOrIndentedLine', '(?:[ \\t]*\\n|[ \\t]+[^\\n]*\\n)', ['overlap', 'one-parse']],
    [
        'the 0.1.4 highlightjs BLANK_OR_INDENTED_LINE',
        '(?:\\n(?![ \\t]*[^ \\t\\n])[^\\n]*|\\n[ \\t]+[^\\n]*)',
        ['overlap', 'one-parse'],
    ],
    [
        'a branch-separating fix that leaves the branch itself ambiguous',
        '(?:[ \\t]*\\n|[ \\t]+(?=[^\\n]*[^ \\t\\n])[^\\n]*\\n)',
        ['one-parse'],
    ],
];

for (const [label, source, oracles] of MUST_BE_REJECTED) {
    ok(`${oracles.join(' + ')} rejects ${label}`, () => {
        const branches = branchesOf(source);
        const verdict = {
            overlap: overlaps(branches).length > 0,
            'one-parse': branches.flatMap((b) => ambiguities(b)).length > 0,
        };
        for (const oracle of oracles) {
            assert.ok(
                verdict[oracle],
                `the ${oracle} oracle passed ${source}, which is exponential - it cannot detect the defect`,
            );
        }
    });
}

/* ------------------------------------------------ the groups in the grammars */

/*
 * Every string helper used as `NAME + '*'` - the repetition is what makes the
 * parse count compound, so that usage is the whole population to check.
 */
const GRAMMARS = ['prism/carve.js', 'highlightjs/carve.js'];
const REPEATED = /\+ ([A-Za-z_][A-Za-z0-9_]*) \+ '\*/g;
const DECLARED = /^\s*(?:var|const) ([A-Za-z_][A-Za-z0-9_]*) = ('(?:[^'\\]|\\.)*');\s*$/;

const discovered = [];
for (const file of GRAMMARS) {
    const text = readFileSync(resolve(here, '..', file), 'utf8');
    const names = [...new Set([...text.matchAll(REPEATED)].map((m) => m[1]))];

    ok(`${file}: repeated line groups found`, () => {
        assert.ok(names.length > 0, `no \`NAME + '*'\` repetition in ${file} - did the scan stop matching?`);
    });

    for (const name of names) {
        const line = text.split('\n').find((l) => DECLARED.test(l) && DECLARED.exec(l)[1] === name);
        ok(`${file}: ${name} is a declared string helper`, () => {
            assert.ok(line, `\`${name}\` is repeated but not declared as a single-quoted string literal`);
            assert.ok(
                !DECLARED.exec(line)[2].includes('"'),
                `${name} carries a double quote; widen the literal reader below`,
            );
        });
        const literal = DECLARED.exec(line)[2];
        discovered.push([`${file} ${name}`, JSON.parse(`"${literal.slice(1, -1)}"`)]);
    }
}

ok('every repeated group named in 0.1.4 is still reached', () => {
    // Renaming one out of the scan above would silently drop it from the
    // population, which is how a check quietly stops checking.
    const labels = discovered.map(([l]) => l);
    for (const want of [
        'prism/carve.js blankOrIndentedLine',
        'prism/carve.js quoteMarkedLine',
        'highlightjs/carve.js BLANK_OR_INDENTED_LINE',
        'highlightjs/carve.js QUOTE_MARKED_LINE',
    ]) {
        assert.ok(labels.includes(want), `${want} is no longer discovered - ${show(labels)}`);
    }
});

for (const [label, source] of discovered) checkGroup(label, source);

/* -------------------------------------------------------- the reported input */

/*
 * The shape from the ticket, kept whole. Sized so it is fast either way: the
 * pin against the blow-up is the oracle above, because a size that separated
 * the two by time would HANG rather than fail on the pre-fix grammar.
 */
const require = createRequire(import.meta.url);
const realPrism = (() => { try { return require('prismjs'); } catch { return null; } })();
if (realPrism) {
    globalThis.Prism = realPrism;
    await import('../prism/carve.js');
    delete globalThis.Prism;

    const comments = (src) => realPrism
        .tokenize(src, realPrism.languages.carve)
        .filter((t) => typeof t !== 'string' && t.type === 'comment')
        .map((t) => String(t.content));

    ok('prism: an UNCLOSED marker-line fence stays one line, body visible', () => {
        assert.deepStrictEqual(comments(`- %%%\n${'  x\n'.repeat(8)}\nafter\n`), ['%%%']);
    });
    ok('prism: a CLOSED marker-line fence still hides its body', () => {
        assert.deepStrictEqual(
            comments('- %%%\n  hidden\n  %%%\n\nafter\n'),
            ['%%%\n  hidden\n  %%%'],
        );
    });
    ok('prism: a CLOSED fence still spans blank and whitespace-only body lines', () => {
        assert.deepStrictEqual(
            comments('- %%%\n  a\n\n   \n  b\n  %%%\n\nafter\n'),
            ['%%%\n  a\n\n   \n  b\n  %%%'],
        );
    });
    ok('prism: a column-0 line still ends the item and the fence with it', () => {
        assert.deepStrictEqual(comments('- %%%\nc\n%%%\n'), ['%%%', '%%%']);
    });
} else {
    console.log('  - prismjs not installed, skipping the tokenizer pins');
}

/* ------------------------------------------------------------------ not dead */

ok('is named in the test script, so it is not dead on arrival', () => {
    // `test` is an explicit chain of `node tests/*.js` invocations, not a glob.
    // A file added without a link in that chain never runs and looks exactly
    // like one that does.
    const manifest = JSON.parse(readFileSync(resolve(here, '..', 'package.json'), 'utf8'));
    assert.ok(
        manifest.scripts.test.includes('node tests/line-ambiguity-test.js'),
        'tests/line-ambiguity-test.js is not in the test script chain',
    );
});

console.log(`\n${passed} passed`);
