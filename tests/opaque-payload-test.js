/*
 * A CONSTRUCT WHOSE PAYLOAD IS NOT CARVE KEEPS THE MARKERS INSIDE IT INERT.
 *
 * carve-grammars#309. `tests/construct-ledger-test.js` measures that on ONE
 * sample per construct, which is what made the defect visible - highlight.js
 * scoped a fenced code block's two delimiter lines and left NOTHING between
 * them, so the body went to the full top-level mode list and
 *
 *     ```
 *     # not a heading
 *     /not italic/  *not bold*  #notatag
 *     ```
 *
 * - corpus 11-fenced-code-15, a document written to say those runs are not
 * markup - was highlighted as a heading, an emphasis, a strong and a tag. That
 * is the markup-carve/carve#1239 shape one construct over, and it is worse than
 * leaving the block unhighlighted, because the output then claims the document
 * says something it does not.
 *
 * WHY A SECOND FILE AND NOT A LONGER LIST OF SAMPLES. One sample per construct
 * is as far as the ledger can go - it is a re-measurement that runs on every
 * seed - and the corpus is no substitute: of 1325 documents, exactly ONE
 * exposed this defect. carve-grammars#303 settled the method for that here, so
 * the payloads below are GENERATED: every string up to a fixed length over an
 * alphabet carrying the construct's own delimiters, with the emphasis marker
 * placed on both sides of each. A body holding a backtick, a half-closed fence
 * or a newline is generated many times over rather than hoped for.
 *
 * THE ORACLE IS THE ENGINE, NOT THIS FILE'S OPINION. Every generated document
 * is parsed by `@markup-carve/carve` - the package these grammars describe -
 * and a row is asserted only where the ENGINE says the payload really is
 * verbatim: a node of a verbatim type whose content is exactly the run that was
 * generated, or, for the comments, an output the run has vanished from. A
 * string whose delimiters do not close, or that the engine reads as something
 * else, is skipped rather than asserted about, so no expectation here is a
 * hand-written claim about what Carve means.
 *
 * WHAT IS NOT PROVED HERE. That a construct is RECOGNIZED at all: that is the
 * ledger's first axis and the surface probe measures it. This file says only
 * that where the engine has a verbatim payload, the grammar must not scope
 * markup inside it.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { carveToHtml, parse } from '@markup-carve/carve';
import { PAYLOAD, measure } from './lib/payload-inertness.js';
import { hljsTokens, prismTokens } from './lib/engines.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const require = createRequire(import.meta.url);

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

const ENGINES = [['prism', prismTokens], ['highlightjs', hljsTokens]];

/*
 * THE AST TYPES THAT CARRY A VERBATIM PAYLOAD.
 *
 * Node types, not spec construct names: the ledger's list is written in the
 * grammar's vocabulary (`code_span`, `math_inline`) and the AST answers in its
 * own (`code`, `math`). The mapping is checked below against a parse of each
 * type's own sample, because a type this engine does not produce would locate
 * nothing - and a sweep that locates nothing passes.
 */
const VERBATIM_TYPES = {
    code_block: '```\nx *b* y\n```\n',
    raw_block: '```=html\n<i>*b*</i>\n```\n',
    code: 'a `x *b* y` z\n',
    raw_inline: 'a `<i>*b*</i>`{=html} z\n',
    literal_inline: 'a !`x *b* y` z\n',
    math: 'a $`x *b* y` z\n',
};

/**
 * The verbatim payloads the engine reports in `source`, as source offsets.
 *
 * The payload is located by its own text rather than by arithmetic on the
 * delimiters: `content` (blocks) and `value` (inlines) are preserved literally,
 * so the string is in the source, and the node's own offsets bound the search.
 *
 * @param {string} source - the Carve document.
 * @returns {Array<[number, number]>} half-open [start, end) offsets.
 */
function verbatimRanges(source) {
    const ranges = [];
    const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(walk);
        const payload = typeof node.content === 'string' ? node.content
            : (typeof node.value === 'string' ? node.value : null);
        if (payload && node.pos && Object.hasOwn(VERBATIM_TYPES, node.type)) {
            const at = source.indexOf(payload, node.pos.startOffset);
            if (at >= 0 && at + payload.length <= node.pos.endOffset) {
                ranges.push([at, at + payload.length]);
            }
        }
        for (const key of Object.keys(node)) {
            if (key !== 'pos' && typeof node[key] === 'object') walk(node[key]);
        }
    };
    walk(parse(source, { positions: true }).children);

    return ranges;
}

/**
 * Does the engine read exactly `[start, end)` of `source` as a verbatim payload?
 *
 * EXACTLY, not "somewhere inside", and that is what keeps the sweep about
 * closed constructs. An unclosed run reaches further than the region the
 * generator wrote - a `` ` `` with no partner takes the rest of the paragraph -
 * so a document that lost its delimiter answers false here instead of being
 * asserted on as though it were the shape it was generated as. The residuals at
 * the end of this file are where those live.
 *
 * @param {string} source - the generated document.
 * @param {number} start - where the generated payload begins.
 * @param {number} end - where it ends.
 * @returns {boolean} whether the engine agrees that region is verbatim.
 */
const engineReadsVerbatim = (source, start, end) =>
    verbatimRanges(source).some(([from, to]) => from === start && to === end);

/*
 * A COMMENT HAS NO NODE IN THE AST AT ALL, so the engine is asked the other way
 * round: what became of the payload in the rendered output.
 *
 * A comment renders NOTHING, so the run is gone - and `b` is the only letter
 * the generated comment bodies use, so a `b` anywhere in the HTML says the run
 * escaped and the document is not the shape the row is about. That guard is not
 * pedantry: a body of `%}` closes the comment early, `a {% %}**b* %} z` renders
 * `**b*` as ordinary text, and asserting on it would report an emphasis
 * BOUNDARY reading as a payload leak.
 */
const engineRendersNothing = (source) => !carveToHtml(source).includes('b');

/*
 * The editorial comment is the one comment whose payload is VISIBLE and still
 * not Carve: `{# x *b* y #}` renders `<span class="critic-comment"> x *b* y
 * </span>` with the run literal inside it. So the question is whether the run
 * reached the output as TEXT in that span, not whether it reached it at all.
 */
const LITERAL_PAYLOAD = new RegExp(
    '<span class="critic-comment">[^<]*' + PAYLOAD.replace(/[*]/g, '\\*'),
);
const engineKeepsLiteral = (source) => LITERAL_PAYLOAD.test(carveToHtml(source));

/**
 * Every string over `alphabet` of length 0 to `maxLength`.
 *
 * @param {string[]} alphabet - the symbols to draw from.
 * @param {number} maxLength - the longest string to emit.
 * @yields {string} one string.
 */
function* strings(alphabet, maxLength) {
    let level = [''];
    yield '';
    for (let length = 1; length <= maxLength; length++) {
        const next = [];
        for (const prefix of level) {
            for (const symbol of alphabet) {
                next.push(prefix + symbol);
                yield prefix + symbol;
            }
        }
        level = next;
    }
}

/*
 * ONE ROW PER CONSTRUCT.
 *
 * `wrap` puts a generated body between the construct's delimiters; the sweep
 * calls it twice per body, once with the `*b*` run before the body and once
 * after, so the marker meets every generated neighbourhood on both sides.
 *
 * The alphabet always carries the construct's OWN delimiter characters plus
 * `*` and `/`, two emphasis delimiters, so a body can close one emphasis shape
 * while opening another. A newline is in it wherever the construct may hold
 * one: `{% ... %}` and `{# ... #}` may, and since carve-grammars#312 both
 * grammars read them that way, so their bodies are generated across breaks.
 * `%%` to end of line may not - the newline IS its closer - so those two rows
 * stay on one line.
 */
const CONSTRUCTS = [
    { name: 'code_block', wrap: (b) => ['```\n', b, '\n```\n'], alphabet: ['`', '~', '*', '/', '\n', ' '] },
    { name: 'code_block with a language', wrap: (b) => ['```js\n', b, '\n```\n'], alphabet: ['`', '*', '/', '\n', ' '] },
    { name: 'code_block on a tilde fence', wrap: (b) => ['~~~\n', b, '\n~~~\n'], alphabet: ['~', '`', '*', '\n'] },
    { name: 'code_block on a wide fence', wrap: (b) => ['````\n', b, '\n````\n'], alphabet: ['`', '*', '\n'] },
    { name: 'raw_block', wrap: (b) => ['```=html\n', b, '\n```\n'], alphabet: ['`', '*', '<', '\n'] },
    { name: 'code_span', wrap: (b) => ['a `', b, '` z\n'], alphabet: ['`', '*', '/', ' '] },
    { name: 'code_span on a wide fence', wrap: (b) => ['a ``', b, '`` z\n'], alphabet: ['`', '*', ' '] },
    { name: 'raw_inline', wrap: (b) => ['a `', b, '`{=html} z\n'], alphabet: ['`', '*', '{', '}'] },
    { name: 'literal_inline', wrap: (b) => ['a !`', b, '` z\n'], alphabet: ['`', '*', '!', ' '] },
    { name: 'math_inline', wrap: (b) => ['a $`', b, '` z\n'], alphabet: ['`', '*', '$', ' '] },
    { name: 'math_display', wrap: (b) => ['a $$`', b, '` z\n'], alphabet: ['`', '*', '$', ' '] },
    {
        name: 'comment_block',
        wrap: (b) => ['%%%\n', b, '\n%%%\n'],
        alphabet: ['%', '*', '/', '\n', ' '],
        holds: engineRendersNothing,
    },
    { name: 'comment_line', wrap: (b) => ['%% ', b, '\n'], alphabet: ['%', '*', '/', ' '], holds: engineRendersNothing },
    { name: 'inline_comment', wrap: (b) => ['text %% ', b, '\n'], alphabet: ['%', '*', '/', ' '], holds: engineRendersNothing },
    {
        name: 'braced_comment',
        wrap: (b) => ['a {% ', b, ' %} z\n'],
        alphabet: ['%', '*', '{', '}', ' ', '\n'],
        holds: engineRendersNothing,
        skipBlockOpeners: true,
    },
    {
        name: 'editorial_comment',
        wrap: (b) => ['a {# ', b, ' #} z\n'],
        alphabet: ['#', '*', '{', '}', ' ', '\n'],
        holds: engineKeepsLiteral,
        skipBlockOpeners: true,
    },
    /*
     * An UNPARTNERED verbatim run, which is a code span to the end of its
     * paragraph (carve-grammars#312). Generated the same way as the closed
     * rows and gated the same way - `holds` asks the ENGINE where the payload
     * begins and ends, so a body that closes the run, or that ends the
     * paragraph, is skipped instead of asserted about.
     */
    {
        name: 'code_span with no closing run',
        wrap: (b) => ['a `', b, '\n'],
        alphabet: ['`', '*', '/', ' ', '\n'],
        holds: (source) => engineReadsVerbatim(source, 3, source.length - 1),
        skipBlockOpeners: true,
    },
    {
        name: 'code_span with no closing run, on a wide run',
        wrap: (b) => ['a ``', b, '\n'],
        alphabet: ['`', '*', ' ', '\n'],
        holds: (source) => engineReadsVerbatim(source, 4, source.length - 1),
        skipBlockOpeners: true,
    },
];

/*
 * A GENERATED LINE THAT OPENS A BLOCK, which neither grammar has a container
 * model to reason about.
 *
 * Both files match block rules first and inline rules after, so a `* ` at the
 * start of a generated continuation line is taken as a list marker before any
 * inline comment can span it - `a {#` / `* #} z` colours a bold run inside a
 * comment. That is real, and it is one shape wider than carve-grammars#312:
 * fixing it means teaching a flat token map which blocks may appear inside an
 * inline construct. It is pinned as a residual at the end of this file and
 * skipped here, so the row keeps asserting the multi-line bodies it CAN answer
 * for instead of being reduced to single-line ones again.
 */
const OPENS_A_BLOCK = /\n[ \t]*(?:[-*+][ \t]|\d+[.)][ \t]|#{1,6} |[`~:]{3,}|>[ \t]|\|)/;

/** The longest generated body. Every row runs the same space on both engines. */
const BODY_LENGTH = 3;

/**
 * Sweep one construct on one engine.
 *
 * @param {object} row - a `CONSTRUCTS` entry.
 * @param {Function} tokenize - a tokenizer from `tests/lib/engines.js`.
 * @returns {{considered: number, leaks: string[]}} what the sweep saw.
 */
function sweep(row, tokenize) {
    let considered = 0;
    const leaks = [];
    for (const body of strings(row.alphabet, BODY_LENGTH)) {
        for (const payloadBody of [PAYLOAD + body, body + PAYLOAD]) {
            const [open, generated, close] = row.wrap(payloadBody);
            const source = open + generated + close;
            // One run per document, or `measure` would answer about the first.
            if (source.indexOf(PAYLOAD) !== source.lastIndexOf(PAYLOAD)) continue;
            let holds = false;
            try {
                holds = row.holds
                    ? row.holds(source)
                    : engineReadsVerbatim(source, open.length, open.length + generated.length);
            } catch {
                continue; // the engine refused the document; it is not a case about payloads
            }
            if (!holds) continue;
            if (row.skipBlockOpeners && OPENS_A_BLOCK.test(source)) continue;
            considered++;
            if (measure(tokenize, source) === 'leaks') leaks.push(source);
        }
    }

    return { considered, leaks };
}

console.log('the AST types this file locates payloads by:');

ok('every verbatim type is a type the engine really produces', () => {
    for (const [type, sample] of Object.entries(VERBATIM_TYPES)) {
        assert.ok(
            verbatimRanges(sample).length > 0,
            `no ${type} node with a locatable payload in ${JSON.stringify(sample)} - the AST renamed the `
                + 'type or moved the payload field, and every row below would then locate nothing and pass',
        );
    }
});

console.log('\nevery generated payload, on both engines:');

let asserted = 0;
for (const row of CONSTRUCTS) {
    for (const [engine, tokenize] of ENGINES) {
        ok(`${engine}: ${row.name} keeps every generated payload inert`, () => {
            const { considered, leaks } = sweep(row, tokenize);
            // A FLOOR ON THE SPACE, because a sweep that qualifies no document
            // passes. That is the shape of dead check this repo has shipped
            // three times (carve-grammars#295, #298, #300).
            assert.ok(
                considered >= 8,
                `${engine}/${row.name}: the engine qualified only ${considered} generated documents, so `
                    + 'this row asserts almost nothing - did the wrapper stop producing the construct?',
            );
            assert.deepStrictEqual(
                leaks.slice(0, 5), [],
                `${engine}/${row.name}: ${leaks.length} of ${considered} generated documents scope markup `
                    + 'INSIDE a payload the engine keeps verbatim. A payload that is not Carve must not '
                    + 'colour the markers in it (carve-grammars#309, markup-carve/carve#1239).',
            );
            asserted += considered;
        });
    }
}

console.log('\nthe opener shapes a corpus does not happen to carry:');

/*
 * The opener line, varied across the info strings the grammar allows and a few
 * it does not, with a fixed payload under it.
 *
 * The info string is where a fenced-code rule decides whether it has a block at
 * all, so a fence the rule fails to recognize leaks its WHOLE body - the same
 * defect reached through the opener rather than through the body. That is not
 * hypothetical: before #309 this grammar's opener took `[a-zA-Z]*` and no more,
 * so ```` ```c++ ````, ```` ```text/html ````, ```` ```=html ```` and every
 * fence carrying a "title" or a [label] fell through to the inline code rule
 * with its body live.
 */
const OPENERS = [
    '```', '~~~', '````', '`````',
    '``` js', '```js', '```js2', '```c++', '```f#', '```text/html', '```a.b', '```a-b', '```_a', '```9',
    '```js "T"', '```js "T" [L]', '```js [L]', '```"T"', '```"T" [L]', '```[L]', '```[]', '```""',
    '```=html', '```=latex', '``` =html', '```=a-b', '```=_a',
    '```js ', '```js\t', '``` ', '```\t',
];

for (const [engine, tokenize] of ENGINES) {
    ok(`${engine}: every fence opener the engine accepts keeps its body inert`, () => {
        const leaks = [];
        let considered = 0;
        for (const opener of OPENERS) {
            const fence = /^[`~]+/.exec(opener)[0];
            for (const [body, closer] of [
                [`x ${PAYLOAD} y`, fence],
                [PAYLOAD, fence],
                [`x\n${PAYLOAD}`, fence],
            ]) {
                const source = `${opener}\n${body}\n${closer}\n`;
                if (!engineReadsVerbatim(source, opener.length + 1, opener.length + 1 + body.length)) continue;
                considered++;
                if (measure(tokenize, source) === 'leaks') leaks.push(source);
            }
        }
        assert.ok(considered >= 40, `only ${considered} of these openers opened a block in the engine`);
        assert.deepStrictEqual(
            leaks.slice(0, 5), [],
            `${engine}: ${leaks.length} of ${considered} fence shapes leak their body. `
                + `First: ${JSON.stringify(leaks[0])}`,
        );
    });
}

/*
 * A PAYLOAD LINE THAT LOOKS LIKE THE CLOSER.
 *
 * The generated bodies above are too short to spell a whole delimiter line, and
 * this is where a fenced rule with a stateful closer gets it wrong: a fence
 * holding a fence as SAMPLE TEXT is what every document describing Carve in
 * Carve is made of, and the rule has to decide which run ends the block. The
 * engine's answers, all measured: a shorter run does not close, a run indented
 * past the opener does not close (it is content, which is what makes the sample
 * possible at all), a longer run DOES close, and a run of the other fence
 * character never does.
 */
const CLOSER_SHAPED_LINES = [
    '```', '`````', '~~~', '``', '``` x', '````', '~~~~', '```  ', '```~', '~~~`',
    '  ```', '   ```', '\t```', '  ~~~', '  ````',
];

/*
 * The indented run is in that list. It is the sample-text case, and the reason
 * the closer is compared to its opener's own column at all: until
 * carve-grammars#312 Prism ended its block there and everything after went
 * live, so the shape sat in the residual table with each engine's answer
 * stated instead of being asserted on both.
 */

console.log('\nthe payload lines that look like a delimiter:');

for (const [engine, tokenize] of ENGINES) {
    ok(`${engine}: a delimiter-shaped payload line does not end the block early`, () => {
        const leaks = [];
        let considered = 0;
        for (const line of CLOSER_SHAPED_LINES) {
            for (const fence of ['```', '~~~', '````']) {
                for (const body of [`${line}\n${PAYLOAD}`, `${PAYLOAD}\n${line}`]) {
                    const source = `${fence}\n${body}\n${fence}\n`;
                    if (!engineReadsVerbatim(source, fence.length + 1, fence.length + 1 + body.length)) continue;
                    considered++;
                    if (measure(tokenize, source) === 'leaks') leaks.push(source);
                }
            }
        }
        assert.ok(considered >= 20, `only ${considered} of these bodies stayed one block in the engine`);
        assert.deepStrictEqual(
            leaks.slice(0, 5), [],
            `${engine}: ${leaks.length} of ${considered} blocks end at a delimiter-shaped line that the `
                + `engine keeps as content. First: ${JSON.stringify(leaks[0])}`,
        );
    });
}

/*
 * EVERY CLOSER WIDTH AND EVERY CLOSER COLUMN, generated.
 *
 * The two numbers a fenced rule has to get right, and the two it got wrong
 * (carve-grammars#312): PART 9 §2 closes on the same character at
 * `len(close) >= len(open)`, at the OPENER's own column. Prism spelled the
 * closer as a backreference, which is an exact width, and let it sit at any
 * indent - so `~~~` closed by `~~~~` was no block at all and a run indented
 * past the opener ended one early. Both leave a verbatim payload live.
 *
 * Generated over the cross product rather than sampled, and every case is
 * gated on the ENGINE reading that exact region as a payload, so a pair that
 * does NOT make one block is skipped instead of asserted about. That gate is
 * also what makes the row two-sided: a widening that closed on ANYTHING would
 * fail it, because the engine disagrees on the narrow closers and the indented
 * ones.
 */
const FENCE_WIDTHS = [3, 4, 5];
const CLOSER_INDENTS = ['', ' ', '  ', '   '];

console.log('\nevery closer width and column:');

for (const [engine, tokenize] of ENGINES) {
    ok(`${engine}: a closer at least as long, at the opener's column, and nowhere else`, () => {
        const leaks = [];
        let considered = 0;
        for (const character of ['`', '~']) {
            for (const open of FENCE_WIDTHS) {
                for (const close of [...FENCE_WIDTHS, 6]) {
                    for (const indent of CLOSER_INDENTS) {
                        for (const openIndent of ['', ' ']) {
                            const opener = openIndent + character.repeat(open);
                            const body = `x ${PAYLOAD} y`;
                            const source = `${opener}\n${body}\n${indent}${character.repeat(close)}\n`;
                            if (!engineReadsVerbatim(source, opener.length + 1, opener.length + 1 + body.length)) {
                                continue;
                            }
                            considered++;
                            if (measure(tokenize, source) === 'leaks') leaks.push(source);
                        }
                    }
                }
            }
        }
        // 18 of the 192 pairs make one block in the engine, which is the
        // point of the row: the other 174 are closers it refuses.
        assert.ok(considered >= 16, `only ${considered} of these fences made one block in the engine`);
        assert.deepStrictEqual(
            leaks.slice(0, 5), [],
            `${engine}: ${leaks.length} of ${considered} opener/closer pairs leak. `
                + `First: ${JSON.stringify(leaks[0])}`,
        );
    });
}

/*
 * A PAYLOAD LONGER THAN THE FORWARD SCAN.
 *
 * highlight.js has no begin->end backreference, so the fenced rule asks for its
 * closer in a bounded lookahead - and past that bound the fence opens no mode
 * at all and its payload is live prose again. That makes the bound a
 * correctness number and not only a performance one, so it is measured here
 * rather than left to the comment that explains it: at the 8 KB this repository
 * uses for `%%%` a 16 KB code block already leaked.
 *
 * Prism has no such bound - it matches the whole block in one pattern - so this
 * asserts the same thing about both and only one of them can regress.
 */
const LONG_PAYLOAD = `\`\`\`\n${'a\n'.repeat(10000)}${PAYLOAD}\n\`\`\`\n`;

console.log('\na payload bigger than the forward scan:');

for (const [engine, tokenize] of ENGINES) {
    ok(`${engine}: a ${Math.round(LONG_PAYLOAD.length / 1024)} KB code block keeps its payload inert`, () => {
        assert.ok(
            engineReadsVerbatim(LONG_PAYLOAD, 4, LONG_PAYLOAD.length - 5),
            'the engine did not read this as one code block, so the row proves nothing',
        );
        assert.strictEqual(
            measure(tokenize, LONG_PAYLOAD),
            'inert',
            `${engine}: a code block of ${LONG_PAYLOAD.length} characters colours markup in its payload. `
                + 'If this is highlight.js, the forward scan in `fenceOpener` is shorter than the block '
                + 'and the fence opened no mode at all - the bound is a correctness number, see the note '
                + 'on `fencedVerbatim`.',
        );
    });
}

/*
 * WHAT STILL LEAKS, PINNED RATHER THAN LEFT TO BE REDISCOVERED.
 *
 * Each row is a payload the ENGINE keeps verbatim and a grammar still scopes
 * markup inside, measured while carve-grammars#309 was being fixed. They are
 * asserted to STILL leak, so the entry cannot outlive the defect: fixing one
 * fails this test and the row comes out with the fix.
 *
 * The unterminated fence is the one this file's own change traded for, and the
 * trade is written up on `fencedVerbatim` in `highlightjs/carve.js`: a mode
 * that opens on a fence with no closer ahead runs to end of file, and inside a
 * container it would then swallow the container's own closer and every block
 * after it - which the spec says explicitly does not happen (grammar.ebnf,
 * A CLOSER IS REQUIRED). Prism has required a closer since long before this.
 *
 * The four rows carve-grammars#312 named are GONE from this table, which is
 * how a fixed residual leaves: an exact-width closer, an indented run, an
 * unclosed inline run and a comment across a line break are each asserted
 * inert now, most of them by a generated sweep above rather than by one
 * document. What remains below is the same trade at a width no name can
 * settle, and one ordering a flat token map cannot.
 */
const RESIDUALS = [
    {
        what: 'an unterminated fence at document level leaves its body live',
        source: '```\nx *b* y\n',
        engines: ['prism', 'highlightjs'],
        ticket: 'the trade named on fencedVerbatim in highlightjs/carve.js',
    },
    {
        /*
         * The WIDER half of the run this grammar now reads. A run of one or
         * two backticks with no partner is an inline code span to the end of
         * its paragraph and is scoped as one (carve-grammars#312); three or
         * more is the shape a flat token map cannot tell from an unterminated
         * code fence, and opening a span over it is the trade the row above
         * declines to make. Left here rather than guessed at, since the answer
         * needs a container model.
         */
        what: 'an unclosed verbatim run of three or more backticks leaks its paragraph',
        source: 'a ```x *b* y\n',
        engines: ['prism'],
        ticket: 'the same trade as the row above, one construct over',
    },
    {
        /*
         * A BLOCK OPENER INSIDE AN INLINE COMMENT. Both files match block
         * rules before inline ones, so the `* ` at the start of the second
         * line is a list marker before any comment can span it - and the run
         * before it colours. The generated sweep skips this shape for the two
         * comment rows (`OPENS_A_BLOCK`) and it is pinned here instead, so
         * skipping it is a stated exclusion rather than a silent one.
         *
         * `{% ... %}` is inert on the same shape because its rule matches
         * earlier than the list rule; that is the ordering, not a decision.
         */
        what: 'a comment whose continuation line opens a block is broken by the block rule',
        source: 'a {# *b*\n* #} z\n',
        engines: ['prism'],
        ticket: 'needs a container model, carve-grammars#312',
    },
];

console.log('\nthe payloads that still leak, and the ticket each is on:');

for (const residual of RESIDUALS) {
    ok(`${residual.engines.join(' and ')}: ${residual.what} (${residual.ticket})`, () => {
        for (const [engine, tokenize] of ENGINES) {
            const expected = residual.engines.includes(engine) ? 'leaks' : 'inert';
            assert.strictEqual(
                measure(tokenize, residual.source),
                expected,
                `${engine} on ${JSON.stringify(residual.source)}: this residual is recorded as `
                    + `"${expected}" and measures otherwise. If it was FIXED, delete the row - a residual `
                    + 'that outlives its defect is a claim the repository has stopped checking.',
            );
        }
    });
}

/*
 * THE SWEEP HAS TO BE SEEN REPORTING A LEAK.
 *
 * Everything above says the two shipped grammars are clean, which is equally
 * true of a sweep that never looks inside a payload. So the oracle is the
 * defect this file was written for, rebuilt out of the SHIPPED definition
 * rather than copied: highlight.js suppresses a payload by giving the mode an
 * empty `contains`, so handing those modes the top-level mode list back is
 * exactly the pre-#309 grammar, and the sweep must report it.
 */
console.log('\noracle - the sweep reporting a grammar that leaks:');

const hljs = require('highlight.js');
const carveDefinition = (await import('../highlightjs/carve.mjs')).default;

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };

const leakyTokens = (() => {
    const definition = carveDefinition(hljs);
    const inert = definition.contains.filter((mode) => Array.isArray(mode.contains) && mode.contains.length === 0);
    assert.ok(
        inert.length >= 2,
        'no mode in highlightjs/carve.js declares an inert payload (an empty `contains`), so this oracle '
            + 'has nothing to revert - if the suppression is spelled another way now, revert THAT here',
    );
    for (const mode of inert) mode.contains = definition.contains;
    const instance = hljs.newInstance();
    instance.registerLanguage('carve-leak-oracle', () => definition);

    return (source) => {
        const { value } = instance.highlight(source, { language: 'carve-leak-oracle' });
        const leaves = [];
        const stack = [];
        const token = /<span class="([^"]*)">|<\/span>|([^<]+)/g;
        let match;
        while ((match = token.exec(value)) !== null) {
            if (match[1] !== undefined) stack.push(match[1].replace(/^hljs-/, ''));
            else if (match[2] !== undefined) {
                leaves.push({
                    scope: stack.at(-1) ?? null,
                    text: match[2].replace(/&(?:lt|gt|amp|quot|#x27|#39);/g, (entity) => ENTITIES[entity]),
                });
            } else stack.pop();
        }

        return leaves;
    };
})();

ok('a fenced code block whose body is handed back to the mode list is reported', () => {
    assert.strictEqual(measure(leakyTokens, '```\nx *b* y\n```\n'), 'leaks');
});

ok('the same grammar with the suppression in place is reported inert', () => {
    assert.strictEqual(measure(hljsTokens, '```\nx *b* y\n```\n'), 'inert');
});

ok('the sweep itself reports the reverted grammar, not just one sample', () => {
    const { considered, leaks } = sweep(CONSTRUCTS[0], leakyTokens);
    assert.ok(considered >= 8, 'the oracle qualified no documents');
    assert.ok(
        leaks.length > 0,
        'the sweep found nothing wrong with a grammar whose code-block payload is live - it is '
            + 'measuring something other than what it claims',
    );
});

/*
 * A NEW TEST FILE IN THIS REPO IS DEAD UNTIL `npm test` NAMES IT: the `test`
 * script is an explicit list of `node tests/*.js` invocations, not a glob.
 */
ok('this file is in the npm test chain', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
    const self = 'tests/opaque-payload-test.js';
    assert.ok(
        pkg.scripts.test.includes(`node ${self}`),
        `package.json "test" does not run ${self}, so this file proves nothing in CI`,
    );
});

console.log(`\n${passed} passed (${asserted} generated documents asserted)`);
