/*
 * A BARE `=` THAT BEGINS OR ENDS A SMART-TYPOGRAPHY PATTERN IS NOT A HIGHLIGHT
 * OPENER.
 *
 * grammar.ebnf states it under "Inline parsing precedence": emphasis markers
 * come before smart typography, EXCEPT "a delimiter that begins a multi-char
 * smart-typography pattern: `=>` is the arrow, never a highlight opener (the
 * pattern is consumed first)". Corpus 386's third paragraph is what that buys,
 * and it is the document this file exists for:
 *
 *     Not an arrow: key => value stays literal, and p <= q is a comparison.
 *
 * renders with NO mark at all. All three grammars in this repository scoped the
 * whole 68-character sentence as one highlight (carve-grammars#325): the `=` of
 * `=>` opened, and the `=` of `<=` closed it 48 characters later. That is worse
 * than leaving a run uncoloured, because the output then claims the document
 * holds a construct it does not - the reason carve-grammars#324 gave for fixing
 * the arrows, one rule over.
 *
 * WHY THE ARROW WORK DID NOT CATCH IT. `tests/smart-typography-test.js` asks
 * what the TYPOGRAPHY rule matches. This is the other side of the same clause:
 * what the HIGHLIGHT rule must decline to match so the typography rule can have
 * it. A grammar can get every arrow right and still open a highlight on the
 * `=` inside one.
 *
 * THE ORACLE. Two of them, and they answer different questions.
 *
 *   - The CORPUS, for the document the ticket is about. `spec/tests/corpus`
 *     carries the pinned engine's own output, so the ticket's line is pinned
 *     against the spec pin rather than against whatever `@markup-carve/carve`
 *     resolves to. That matters here specifically: the published 0.1.4 renders
 *     `=>` as an arrow and the pin does not (carve-grammars#324), and reading
 *     the ticket's own case off the lagging package would pin the wrong answer.
 *   - The ENGINE, `@markup-carve/carve`, for the generated sweep below. Mark
 *     PRESENCE is the only thing asked of it, and that is the one answer the
 *     two readings of `=>` agree on: it opens no highlight either way.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { carveToHtml } from '@markup-carve/carve';
import { CORPUS_DIR } from './lib/corpus.js';
import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

/*
 * THE SCOPE EACH ENGINE SPELLS A HIGHLIGHT WITH.
 *
 * Not one shared regex: highlight.js has no `mark` class and calls `=x=` an
 * `addition`, so a shared `/highlight/` would report every engine inert and
 * this file would pass on the grammar that has the bug. The TextMate family
 * says `markup.highlight.carve` whatever repository the grammar is in, which
 * is why the map has a default rather than an entry per surface.
 *
 * `addition` is also highlight.js's class for `{+x+}` and `{=x=}`. No document
 * below spells either, so on these inputs the class means the bare rule.
 */
const HIGHLIGHT_SCOPE = { highlightjs: /addition/ };
const scopeOf = (surface) => HIGHLIGHT_SCOPE[surface] ?? /highlight/;

const ENGINES = [['prism', prismTokens], ['highlightjs', hljsTokens], ...await textmateEngines()];

assert.ok(
    ENGINES.some(([id]) => id === 'textmate'),
    'the TextMate grammar in this repository was not reachable, so two of the three fixed grammars '
        + 'would go unmeasured and this file would pass on them',
);

/**
 * Does this grammar open a highlight anywhere in `source`?
 *
 * PRESENCE, not the run it covers, and that is forced by the medium rather
 * than chosen: vscode-textmate merges adjacent tokens whose theme colour
 * matches, so a highlighted line comes back as ONE leaf carrying the whole
 * scope stack. Which characters the mark covers is therefore unavailable on
 * four of the six grammars, while "did a highlight scope open at all" is exact
 * on every one - and it is the question the defect is about.
 *
 * @param {string} surface - the surface id, for its scope spelling.
 * @param {Function} tokenize - a tokenizer from `tests/lib/engines.js`.
 * @param {string} source - the Carve document.
 * @returns {boolean} whether any leaf carries this grammar's highlight scope.
 */
function scopesHighlight(surface, tokenize, source) {
    const scope = scopeOf(surface);

    return tokenize(source).some((leaf) => leaf.scope && scope.test(leaf.scope));
}

/** Does the pinned engine put a `<mark>` in this document? */
const enginePutsAMark = (source) => carveToHtml(source).includes('<mark>');

console.log('the corpus document the ticket is about:');

const CORPUS_CASE = '386-the-doubled-run-is-the-canonical-arrow-in-both-families';
const corpusSource = readFileSync(`${CORPUS_DIR}/${CORPUS_CASE}.crv`, 'utf8');
const corpusHtml = readFileSync(`${CORPUS_DIR}/${CORPUS_CASE}.html`, 'utf8');

ok(`${CORPUS_CASE} still carries the line, and the pin still renders no mark`, () => {
    /*
     * The line is READ OUT of the corpus rather than written here, so a
     * renumbered or reworded corpus document fails this instead of leaving the
     * rows below asserting about a sentence the spec no longer carries.
     */
    assert.match(
        corpusSource,
        /Not an arrow: key => value stays literal, and p <= q is a comparison\./,
        `${CORPUS_CASE}.crv no longer holds the "not an arrow" line, so the rows below are about a `
            + 'document the pinned spec does not have',
    );
    assert.ok(
        !corpusHtml.includes('<mark>'),
        `${CORPUS_CASE}.html now holds a mark, so the pinned engine changed its answer and the `
            + 'expectation below is the stale one',
    );
});

for (const [surface, tokenize] of ENGINES) {
    ok(`${surface}: the corpus document opens no highlight`, () => {
        assert.equal(
            scopesHighlight(surface, tokenize, corpusSource),
            false,
            `${surface} scopes a highlight in ${CORPUS_CASE}, which the pinned engine renders with no `
                + 'mark. The `=` of `=>` opens and the `=` of `<=` closes, swallowing the sentence '
                + '(carve-grammars#325).',
        );
    });
}

/*
 * THE SHAPES THE TICKET'S LINE IS MADE OF, one construct at a time.
 *
 * Every character the language puts in front of a `=` to make a comparison
 * (`<=`, `>=`, `!=` - grammar.ebnf `comparison`) or behind one to make an arrow
 * (`=>`, and the tail of `==>`), each with a closing `=` further along the line
 * so a rule without the guard has somewhere to reach. The engine renders no
 * mark in any of them.
 *
 * The last three are the OTHER side, and they are why the closer is not
 * guarded: once a highlight is open the engine lets the closer win over the
 * pattern, so `<=` and `=>` DO close one.
 */
const SHAPES = [
    ['a <=b c= d', 'the = of a <= comparison opens nothing'],
    ['a >=b c= d', 'the = of a >= comparison opens nothing'],
    ['a !=b c= d', 'the = of a != comparison opens nothing'],
    ['a =>b c= d', 'the = of a => run opens nothing'],
    ['a <=> b =c', 'the = inside <=> opens nothing'],
    ['x == y', 'a doubled run is literal, and opens no empty highlight'],
    ['a =b c= d', 'a plain bare highlight still opens'],
    ['x =y z<= w', 'an OPEN highlight is closed by the = of a <='],
    ['x =y z=> w', 'an OPEN highlight is closed by the = of a =>'],
    /*
     * AND THE SAME CHARACTERS ESCAPED (carve-grammars#380). An escape makes the
     * flanking character literal, so the `=` after it is an ordinary opener and
     * the engine marks - and an escaped `=` is not an opener at all. A
     * lookbehind cannot ask whether the character it sees was escaped unless it
     * is told to look one further, which is what Prism's opener now does; the
     * other two reach the same answer because their escape rule sits in front
     * of the highlight rule.
     */
    ['a \\!=b c= d', 'an escaped ! leaves an ordinary opener behind'],
    ['a \\<=b c= d', 'an escaped < leaves an ordinary opener behind'],
    ['a \\>=b c= d', 'an escaped > leaves an ordinary opener behind'],
    ['a \\=b c= d', 'an escaped = is not an opener'],
    /*
     * AND THE TWO THAT SAY THE ADMISSION IS NARROW. `<`, `>` and `!` are the
     * three characters the opener's own lookbehind refuses, so they are the
     * three an escape has to undo; admitting any escaped character instead
     * would take these two, which the engine leaves alone. Written from a
     * mutation that survived the list above: widening `\\[<>!]` to `\\.` was
     * caught by nothing until these arrived.
     */
    ['a \\==b c= d', 'an escape one character further back does not open the = after it'],
    ['a \\a=b c= d', 'a backslash before a word character escapes nothing, and opens nothing'],
];

/*
 * A FLOOR ON THE LIST, for the reason `MIN_ASSERTABLE` exists in
 * tests/lib/constructs.js: every row above is the only thing that measures its
 * shape - the generated sweep below draws from an alphabet with no backslash in
 * it - so a row that quietly disappears takes its shape with it. Deleting the
 * four escaped rows was caught by nothing until this line.
 */
assert.ok(
    SHAPES.length >= 15,
    `SHAPES holds ${SHAPES.length}, expected at least 15 - a shape removed here is measured nowhere else`,
);

console.log('\nevery flanking shape, against the engine:');

for (const [surface, tokenize] of ENGINES) {
    ok(`${surface}: every flanking shape reads the way the engine renders it`, () => {
        const wrong = [];
        for (const [source, why] of SHAPES) {
            const document = `${source}\n`;
            const engine = enginePutsAMark(document);
            const grammar = scopesHighlight(surface, tokenize, document);
            if (engine === grammar) continue;
            wrong.push(`${JSON.stringify(source)}: ${why} - the engine ${engine ? 'marks' : 'does not mark'}`
                + ` and ${surface} ${grammar ? 'scopes a highlight' : 'scopes none'}`);
        }
        assert.deepEqual(wrong, [], `${surface}: ${wrong.join('; ')}`);
    });
}

/*
 * THE SAME SHAPES, INSIDE A CONTAINER.
 *
 * A rule that matches at column 0 and not one column in is unsupported with a
 * reason, not implemented, and this repository has shipped that shape before
 * (carve-grammars#138 anchors the block-quote rule at column 0 deliberately).
 * A guard is the same question one level down: a lookbehind that only ever
 * sees the start of a line has not been tried against the position where a
 * container has already consumed characters in front of it.
 */
const CONTEXTS = [
    ['top level', (line) => `${line}\n`],
    ['heading', (line) => `# ${line}\n`],
    ['blockquote', (line) => `> ${line}\n`],
    ['list item', (line) => `- ${line}\n`],
    ['indented in an item', (line) => `- x\n\n  ${line}\n`],
    ['div', (line) => `::: note\n${line}\n:::\n`],
    ['indented in a div', (line) => `::: note\n  ${line}\n:::\n`],
    ['table cell', (line) => `| a | b |\n|---|---|\n| ${line} | y |\n`],
];

/*
 * WHERE THE BARE HIGHLIGHT RULE IS NOT REACHED AT ALL.
 *
 * Measured with the plainest highlight there is - `a =b c= d`, which the engine
 * marks in every context above. These surfaces scope nothing there, so the
 * guard cannot be measured in them either: the shapes below are checked in the
 * contexts each grammar DOES reach, and the unreached set is pinned instead so
 * it cannot grow quietly.
 *
 * PRE-EXISTING and not carve-grammars#325 - measured before the guard as well
 * as after, unchanged by it. It is the ledger's FIRST axis (is the construct
 * recognized here) rather than this file's question, and it is recorded here
 * because this is where it was seen. Asserted exactly, both ways: a context
 * that starts working fails this row and comes out of the list with the fix.
 */
const UNREACHED = {
    highlightjs: ['heading', 'blockquote', 'table cell'],
    textmate: ['heading', 'blockquote'],
    /*
     * Measured when the intellij checkout was first named here
     * (carve-grammars#329). It is a separate lineage from this repository's
     * TextMate grammar. Block quotes began reaching the inline family in
     * markup-carve/intellij-carve#98; headings remain the one unreached context.
     * exact assertion is for: a surface whose checkout appears with a different
     * answer fails this row rather than being quietly absent from the table.
     */
    'intellij-carve': ['heading'],
};

/*
 * WHAT A SURFACE IN ANOTHER REPOSITORY STILL READS DIFFERENTLY, one container
 * down.
 *
 * Six of the ten grammar surfaces are not editable here, so a defect found on
 * one is something this suite can MEASURE and not fix - the case a plain red
 * row handles badly, since a check that stays red for something nobody can fix
 * here gets muted. Each entry is asserted to STILL disagree, so it cannot
 * outlive its defect: a fix on that surface fails this file and the entry comes
 * out with it. That is the arrangement `KNOWN_LEAKS` in
 * `tests/opaque-payload-test.js` uses for the same reason.
 *
 * A surface in THIS repository is deliberately absent: a disagreement here is
 * fixable here, so it stays red.
 *
 * Measured 2026-08-23 on intellij-carve bdfbfd8.
 */
const IN_A_CONTAINER = {};

/*
 * THE HOSTS HAVE TO BE SEEN OPENING.
 *
 * Every row below is "the grammar agrees with the engine INSIDE a container",
 * and a wrapper that does not actually open its container makes that sentence
 * true by measuring the top level twice. The `UNREACHED` table one screen down
 * cannot see it either: a line that never entered a container still reaches the
 * inline rules, so the context reads as reachable.
 *
 * So each wrapper is asked the ENGINE what it built. The check is on the host
 * element rather than on a scope, because the question is about the document
 * the wrapper produces and not about any one grammar's vocabulary. Driven over
 * a wrapper spelled `:::<TAB>note`, which opens no container: the probe reports
 * it, which is what says the probe can fail at all.
 */
const HOSTS = {
    'top level': /^<p>/,
    heading: /<h1>/,
    blockquote: /<blockquote>/,
    'list item': /<li>/,
    'indented in an item': /<li><p>/,
    div: /<aside class="admonition note"/,
    'indented in a div': /<aside class="admonition note"/,
    'table cell': /<td>/,
};

/**
 * The contexts whose wrapper does not build the container it names.
 *
 * @param {Array<[string, (line: string) => string]>} contexts - the table to check.
 * @returns {string[]} one complaint per dead host, empty when every wrapper opens.
 */
function deadHosts(contexts) {
    const dead = [];
    for (const [context, wrap] of contexts) {
        const host = HOSTS[context];
        if (!host) {
            dead.push(`${context}: no host element recorded, so nothing says this wrapper opens anything`);
            continue;
        }
        const html = carveToHtml(wrap('a =b c= d'));
        if (!host.test(html)) dead.push(`${context}: ${host} is not in ${JSON.stringify(html)}`);
    }

    return dead;
}

ok('every context really opens the container it names', () => {
    const dead = deadHosts(CONTEXTS);
    assert.deepEqual(
        dead, [],
        'these wrappers do not build the container they name, so the rows below measure the wrong '
            + `document: ${dead.join('; ')}`,
    );
});

ok('the host probe reports a wrapper that opens nothing', () => {
    // A tab does not separate a colon fence from its type word (corpus 254), so
    // this wrapper renders one paragraph and the line never enters a container.
    const dead = deadHosts([['div', (line) => `:::\tnote\n${line}\n:::\n`]]);
    assert.equal(dead.length, 1, `a wrapper that opens nothing was not reported: ${JSON.stringify(dead)}`);
    // ... and a context with no recorded host is reported too, rather than skipped.
    assert.match(deadHosts([['nowhere', (line) => `${line}\n`]])[0] ?? '', /no host element recorded/);
});

console.log('\nthe same shapes, one container down:');

for (const [surface, tokenize] of ENGINES) {
    const recorded = UNREACHED[surface] ?? [];

    ok(`${surface}: the contexts that reach the bare highlight rule at all`, () => {
        const unreached = CONTEXTS
            .filter(([, wrap]) => !scopesHighlight(surface, tokenize, wrap('a =b c= d')))
            .map(([name]) => name);
        assert.deepEqual(
            unreached, recorded,
            `${surface}: the contexts where "a =b c= d" scopes no highlight are `
                + `${JSON.stringify(unreached)} and this file records ${JSON.stringify(recorded)}. `
                + 'A context that started working is a fix; correct the list. A context that stopped '
                + 'is a regression on the recognition axis.',
        );
    });

    ok(`${surface}: every flanking shape reads the same one container down`, () => {
        const wrong = [];
        for (const [context, wrap] of CONTEXTS) {
            if (recorded.includes(context)) continue;
            for (const [line] of SHAPES) {
                const document = wrap(line);
                if (enginePutsAMark(document) === scopesHighlight(surface, tokenize, document)) continue;
                wrong.push(`${context}: ${line}`);
            }
        }
        assert.deepEqual(
            wrong, IN_A_CONTAINER[surface] ?? [],
            `${surface}: these flanking shapes read differently one container down than the engine `
                + `renders them - ${wrong.join('; ')}. A shape that stopped disagreeing is a fix on `
                + 'that surface; take it out of IN_A_CONTAINER with the fix.',
        );
    });
}

/*
 * THE SAME QUESTION, GENERATED.
 *
 * Nine hand-written shapes are how the first draft of a fix ships half of one:
 * the alphabet below is every character the two families are built from, so a
 * run the author did not think of - `=><=`, `=!==`, a `=` alone against the
 * padding - is generated rather than hoped for. The engine answers each, and a
 * grammar must agree with it about whether a mark is there.
 *
 * `a` is in the alphabet so a body can be ordinary text; the space is what lets
 * a delimiter be unflanked. The padding keeps every run off both ends of the
 * line, the two positions where an anchored rule behaves differently.
 */
const ALPHABET = ['=', '<', '>', '!', ' ', 'a'];
const BODY_LENGTH = 4;

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

const DOCUMENTS = [...strings(ALPHABET, BODY_LENGTH)].map((body) => `x ${body} y\n`);

/*
 * WHAT THE SWEEP STILL FINDS, pinned rather than left to be rediscovered.
 *
 * Each row is asserted to STILL disagree with the engine, so it cannot outlive
 * its defect: fixing one fails this file and the row comes out with the fix.
 * That is the arrangement `tests/opaque-payload-test.js` uses for the same
 * reason.
 *
 * Neither cause is the one this file is about, and both were measured before
 * the guard as well as after - the guard changed neither.
 */
const RESIDUALS = {
    /*
     * A CLOSER FOLLOWED BY ANOTHER `=`. The engine reads `=a==` as a mark over
     * `a` plus a literal `=`; both grammars spell the body as `[^=\n]+?`, so
     * the closer they find is refused by `(?![\w=])` and the run has nowhere
     * left to go. Widening it means letting the body hold its own delimiter,
     * which is what the BRACED form `{=a=}` is for.
     */
    prism: ['x =<== y\n', 'x =!== y\n', 'x =a== y\n'],
    textmate: ['x =<== y\n', 'x =!== y\n', 'x =a== y\n'],
    // The intellij port reads the bare rule the same way, measured when its
    // checkout was first named here (carve-grammars#329).
    'intellij-carve': ['x =<== y\n', 'x =!== y\n', 'x =a== y\n'],
    /*
     * A CLOSER PRECEDED BY WHITESPACE. `bare_closer` requires a non-space
     * before the delimiter (grammar.ebnf), so `=a =` is literal - and the other
     * two grammars spell that `(?<=\S)=`. highlight.js cannot: `paired` derives
     * its opener guard from the CLOSER's own source by splitting off the first
     * character, so a lookbehind in front of the delimiter would be read as the
     * delimiter. Every one of the thirteen `paired` modes has the same shape,
     * so this is a fix to that helper and not to this rule.
     */
    highlightjs: ['x =< = y\n', 'x =! = y\n', 'x =a = y\n'],
};

console.log('\nevery generated run of arrow and comparison characters:');

for (const [surface, tokenize] of ENGINES) {
    ok(`${surface}: ${DOCUMENTS.length} generated documents agree with the engine`, () => {
        const disagree = [];
        for (const document of DOCUMENTS) {
            if (enginePutsAMark(document) === scopesHighlight(surface, tokenize, document)) continue;
            disagree.push(document);
        }
        const residual = RESIDUALS[surface] ?? [];
        /*
         * The residuals are asserted BOTH ways: still present, and nothing
         * beside them. A one-directional check would let a new disagreement in
         * as long as an old one stayed.
         */
        assert.deepEqual(
            disagree, residual,
            `${surface}: these generated documents disagree with the engine about whether a highlight `
                + 'is there. A `=` that begins or ends a smart-typography pattern is not an opener '
                + `(carve-grammars#325). Expected only the pinned residuals ${JSON.stringify(residual)}.`,
        );
    });
}

/*
 * AND THE SWEEP HAS TO BE SEEN REPORTING ONE.
 *
 * Everything above says the grammars agree with the engine, which is equally
 * true of a sweep that never looks. So each tokenizer is handed the plainest
 * highlight there is and must report it - the same code path, on the same
 * engine, with the only difference being whether a highlight is really there.
 */
ok('every tokenizer reports a highlight when there is one', () => {
    for (const [surface, tokenize] of ENGINES) {
        assert.equal(
            scopesHighlight(surface, tokenize, 'a =b c= d\n'),
            true,
            `${surface} does not scope a highlight in "a =b c= d", so every "no highlight" answer it `
                + 'gave above is a tokenizer that reported nothing rather than a grammar that declined '
                + 'to open',
        );
    }
});

ok('the generated space is big enough to mean something', () => {
    const marked = DOCUMENTS.filter(enginePutsAMark).length;
    assert.ok(
        DOCUMENTS.length >= 1000,
        `only ${DOCUMENTS.length} generated documents - the alphabet or the length shrank`,
    );
    /*
     * A FLOOR ON BOTH ANSWERS. A space the engine never marks would pass on a
     * grammar with no highlight rule at all, and a space it always marks would
     * pass on one that highlights everything.
     */
    // 33 of the 1555 hold a highlight the engine renders, which is the point of
    // the space: the other 1522 are runs it refuses, and most of them are the
    // ones a guard could get wrong in the other direction.
    assert.ok(marked >= 25, `the engine marks only ${marked} of ${DOCUMENTS.length} generated documents`);
    assert.ok(
        DOCUMENTS.length - marked >= 1000,
        `the engine marks all but ${DOCUMENTS.length - marked} generated documents`,
    );
});

/*
 * A NEW TEST FILE IN THIS REPO IS DEAD UNTIL `npm test` NAMES IT: the `test`
 * script is an explicit list of `node tests/*.js` invocations, not a glob.
 */
ok('this file is in the npm test chain', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
    const self = 'tests/highlight-opener-test.js';
    assert.ok(
        pkg.scripts.test.includes(`node ${self}`),
        `package.json "test" does not run ${self}, so this file proves nothing in CI`,
    );
});

console.log(`\n${passed} passed (${DOCUMENTS.length} generated documents on ${ENGINES.length} grammars)`);
