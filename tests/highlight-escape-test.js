/*
 * THE RUN THE HIGHLIGHT RULE COLOURS AROUND AN ESCAPE.
 *
 * carve-grammars#385 guarded the closer with a lookbehind that counts the
 * backslash run, bounded at `{0,32}`. carve-grammars#390 replaced it: the body
 * consumes an escape as a PAIR and refuses a bare backslash, so the position
 * immediately before an escaped `=` is never a body end and the closer can
 * never land on one. Two reasons, and only the second is visible from here:
 *
 *   - The IDE's TextMate engine refuses a variable-length lookbehind by not
 *     matching ANYTHING - no error - so the rule went inert and `x =b= y` lost
 *     its mark. Measured in markup-carve/intellij-carve#117; not reproducible
 *     in this process, which runs Oniguruma.
 *   - Any bound is reachable. At `{0,32}` the guard stopped seeing the run at
 *     66 backslashes and all three grammars refused a highlight the engine
 *     marks. THAT is measured below, and it is what fails if the lookbehind
 *     comes back.
 *
 * WHY SPANS AND NOT PRESENCE. tests/highlight-opener-test.js asks whether a
 * highlight scope opened at all, which is the right question for an opener
 * guard and blind to half of this one: a body that cannot hold an escaped
 * delimiter still opens, it just stops in the wrong place. Only the covered RUN
 * separates the two.
 *
 * WHY ASSERTIONS AND NOT A GOLDEN. tests/snapshot-test.js compares against
 * files this repository generated from these grammars, so green there means the
 * grammar did not CHANGE, never that it is right - a snapshot taken before a
 * fix pins the defect. markup-carve/vscode-carve#176 found exactly that: its
 * `doubled-run-arrows` golden had recorded a 68-character sentence as one
 * highlight. Every row here was rendered through the pinned engine and read off
 * the `<mark>` it did or did not produce.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { carveToHtml } from '@markup-carve/carve';
import { createHighlighter } from 'shiki';
import { prismTokens } from './lib/engines.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };
const unescapeHtml = (s) => s.replace(/&(?:lt|gt|amp|quot|#x27|#39);/g, (m) => ENTITIES[m]);

/** What the pinned engine marks in `source`, or null when it marks nothing. */
function engineMark(source) {
    const m = carveToHtml(source).match(/<mark>(.*?)<\/mark>/s);

    return m ? unescapeHtml(m[1]) : null;
}

/*
 * A grammar answers in SOURCE and the engine answers in RENDERED TEXT, so the
 * two differ wherever an escape was consumed: `a =b c\= d= e` renders the mark
 * `b c= d` and the grammar colours `b c\= d`. Resolving the escapes the engine
 * resolves - its punctuation set, not every backslash - puts them in the same
 * alphabet. `\b` is NOT an escape and keeps its backslash on both sides.
 */
const resolveEscapes = (s) => s.replace(/\\([!-/:-@[-`{-~])/g, '$1');

/*
 * SHIKI MERGES ADJACENT TOKENS THAT SHARE A COLOUR, so under a theme that
 * styles neither scope a highlighted line comes back as ONE leaf and the span
 * is unavailable - which is why tests/lib/textmate-engine.js documents presence
 * as the only exact question it can ask. Giving the body and the delimiters two
 * different colours is what keeps them apart; the colours are never read.
 */
const PROBE_THEME = {
    name: 'carve-span-probe',
    type: 'light',
    colors: { 'editor.foreground': '#000000' },
    tokenColors: [
        { scope: 'markup.highlight.carve', settings: { foreground: '#ff0000' } },
        { scope: 'punctuation.definition.highlight.carve', settings: { foreground: '#00ff00' } },
    ],
};

const tmGrammar = JSON.parse(readFileSync(resolve(repoRoot, 'textmate/carve.tmLanguage.json'), 'utf8'));
const highlighter = await createHighlighter({
    themes: [PROBE_THEME],
    langs: [{ ...tmGrammar, name: 'carve' }],
});

/** The source run `textmate/carve.tmLanguage.json` scopes as a highlight body. */
function textmateBody(source) {
    const { tokens } = highlighter.codeToTokens(source, {
        lang: 'carve',
        theme: PROBE_THEME.name,
        includeExplanation: 'scopeName',
    });

    return tokens
        .flat()
        .filter((token) => (token.explanation ?? [])
            .some((part) => part.scopes.some((s) => s.scopeName === 'markup.highlight.carve')))
        .map((token) => token.content)
        .join('');
}

/*
 * Prism and highlight.js scope the DELIMITERS with the body rather than apart
 * from it, so their answer is the token minus one `=` at each end. Only when
 * both ends carry one: `x =<== y` comes back `=<==` and the body is `<=`, which
 * is the residual this file pins rather than a slice to guess at.
 */
const withoutDelimiters = (run) => (run.startsWith('=') && run.endsWith('=') && run.length > 1
    ? run.slice(1, -1)
    : run);

const prismBody = (source) => withoutDelimiters(prismTokens(source)
    .filter((leaf) => leaf.scope && /highlight/.test(leaf.scope))
    .map((leaf) => leaf.text)
    .join(''));

const hljs = (await import('highlight.js')).default;
hljs.registerLanguage('carve', (await import('../highlightjs/carve.mjs')).default);

/*
 * STACK-AWARE on purpose. HIGHLIGHT now `contains` the escape submode
 * (carve-grammars#390), so the escaped `=` inside a marked run is its own
 * `symbol` span NESTED in the `addition` one. Reading the innermost class - the
 * way tests/lib/engines.js does, correctly for its own question - would drop
 * those characters and report a body the grammar does not colour.
 */
function hljsBody(source) {
    const { value } = hljs.highlight(source, { language: 'carve' });
    const stack = [];
    let out = '';
    const re = /<span class="([^"]*)">|<\/span>|([^<]+)/g;
    let m;
    while ((m = re.exec(value)) !== null) {
        if (m[1] !== undefined) stack.push(m[1].replace(/^hljs-/, ''));
        else if (m[2] !== undefined) { if (stack.some((c) => c === 'addition')) out += unescapeHtml(m[2]); }
        else stack.pop();
    }

    return withoutDelimiters(out);
}

const GRAMMARS = [['textmate', textmateBody], ['prism', prismBody], ['highlightjs', hljsBody]];

/** What a grammar colours, in the engine's alphabet, or null for no highlight. */
const reading = (read, source) => {
    const run = read(source);

    return run === '' ? null : resolveEscapes(run);
};

/*
 * THE SHAPES, each with why it is here. Both directions on purpose: a
 * no-mark-only list passes a rule that colours nothing, and a mark-only list
 * passes a rule that colours everything.
 */
const ROWS = [
    ['x =\\= y', 'an escaped = is not a closer, and nothing else can close'],
    ['x =<\\= y', 'nor when the escape follows a character the closer would admit'],
    ['x =!\\= y', 'nor after a !'],
    ['x =a\\= y', 'nor after a word character'],
    ['x =\\=< y', 'nor when the escaped delimiter is followed by one'],
    ['x =\\=> y', 'nor when what follows would be an arrow'],
    ['x  =\\= y', 'nor one column further in'],
    ['a =b c\\= d= e', 'the body steps over an escaped = and closes on the real one'],
    ['x =\\== y', 'an escaped = is body content, and the next = closes'],
    ['x =\\\\= y', 'an even run escapes the backslash, so the = after it closes'],
    ['x =\\\\\\\\= y', 'and a longer even run still does'],
    ['x =\\\\\\= y', 'an odd run escapes the = again, so nothing closes'],
    ['a =b c\\\\\\= d= e', 'and the body steps over that one too'],
    ['x =a\\bc= y', 'a backslash before a word character escapes nothing and stays content'],
    ['x =\\ = y', 'an escaped SPACE leaves the closer preceded by whitespace'],
    ['x \\=a= y', 'an escaped = opens nothing either - the escape rule takes it first'],
    ['x \\\\=a= y', 'and an even run in front leaves an ordinary opener'],
    ['x =b= y', 'an ordinary highlight still colours'],
    ['a =b c= d', 'and one with a space in it'],
    ['x =y z<= w', 'a closer still beats smart typography once the run is open'],
    ['x =y z=> w', 'on the other side of the pattern too'],
    ['a => b= c', 'and an arrow still opens nothing'],
    /*
     * THE ROWS THE `{0,32}` LOOKBEHIND MISSED, and the reason this file exists.
     * The bound counts PAIRS, so the guard stops seeing the run at 66
     * backslashes: all three grammars refused a highlight the engine marks,
     * while 64 was still inside it. The body's odd-run branch had the same
     * bound and failed one step later.
     */
    [`x =a${'\\'.repeat(64)}= y`, '64 backslashes was inside the old bound'],
    [`x =a${'\\'.repeat(66)}= y`, '66 is past it, and the old spelling coloured nothing'],
    [`x =a${'\\'.repeat(68)}= y`, 'and 68'],
    [`a =b c${'\\'.repeat(67)}= d= e`, 'the body run had the same bound, one step later'],
];

/*
 * A FLOOR, for the reason tests/highlight-opener-test.js gives: every row is
 * the only thing measuring its shape, so one that quietly disappears takes its
 * shape with it.
 */
assert.ok(ROWS.length >= 26, `ROWS holds ${ROWS.length}, expected at least 26`);

/*
 * AND THE ROWS THAT ARE STILL WRONG, pinned exactly rather than left out.
 *
 * All three are "a closer followed by another `=`", which the engine marks and
 * `(?![=\w])` refuses. Fixing them means letting the body hold its own
 * delimiter, which is a larger change with its own measurement
 * (carve-grammars#390); leaving them unasserted would let a regression hide
 * among them. Asserted per grammar because they fail differently: the two
 * single-`match` grammars decline the row, and highlight.js opens and closes one
 * character late.
 */
const RESIDUALS = [
    ['x =<== y', { textmate: null, prism: null, highlightjs: '<=' }],
    ['x =!== y', { textmate: null, prism: null, highlightjs: '!=' }],
    ['x =a== y', { textmate: null, prism: null, highlightjs: 'a=' }],
];

/*
 * A SECOND KNOWN-WRONG ROW, and NOT this ticket's. highlight.js's closer carries
 * no "not preceded by whitespace" guard, so `x =a = y` marks in it and not in
 * the engine - with no escape anywhere. `x =\ = y` above is one instance of
 * that, so it is pinned here rather than counted as an escape defect.
 */
const RIGHT_FLANK_GAP = { 'x =\\ = y': '\\ ', 'x =a = y': 'a ' };

console.log('every escape shape, against the engine:');

for (const [name, read] of GRAMMARS) {
    ok(`${name}: colours the run the engine marks`, () => {
        const wrong = [];
        for (const [source, why] of ROWS) {
            const expected = Object.hasOwn(RIGHT_FLANK_GAP, source) && name === 'highlightjs'
                ? RIGHT_FLANK_GAP[source]
                : engineMark(source);
            const got = reading(read, source);
            if (got === expected) continue;
            wrong.push(`${JSON.stringify(source)} (${why}): engine marks ${JSON.stringify(expected)},`
                + ` ${name} colours ${JSON.stringify(got)}`);
        }
        assert.deepEqual(wrong, [], `${name}:\n    ${wrong.join('\n    ')}`);
    });
}

console.log('\nthe engine oracle is answering, not defaulting:');

ok('the rows are not all one answer', () => {
    const marked = ROWS.filter(([source]) => engineMark(source) !== null).length;
    assert.ok(marked >= 8 && marked <= ROWS.length - 6,
        `the engine marks ${marked} of ${ROWS.length} rows - a list that is nearly all one answer `
            + 'passes a grammar that colours everything or nothing');
});

console.log('\nthe residuals are still exactly as wrong as they were:');

for (const [name, read] of GRAMMARS) {
    ok(`${name}: the three "closer then =" residuals read as pinned`, () => {
        for (const [source, expected] of RESIDUALS) {
            assert.notEqual(engineMark(source), null, `${JSON.stringify(source)} stopped marking in the engine`);
            assert.equal(
                reading(read, source),
                expected[name],
                `${JSON.stringify(source)} in ${name}: the pinned residual moved. If it now agrees `
                    + 'with the engine, take the row out of RESIDUALS and put it in ROWS',
            );
        }
    });
}

ok('highlight.js still lacks the closer\'s right-flank guard', () => {
    for (const [source, expected] of Object.entries(RIGHT_FLANK_GAP)) {
        assert.equal(engineMark(source), null, `${JSON.stringify(source)} started marking in the engine`);
        assert.equal(reading(hljsBody, source), expected,
            `${JSON.stringify(source)}: the gap moved - if highlight.js now declines it, this pin comes out`);
    }
});

console.log(`\n${passed} checks passed`);
