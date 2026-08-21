/*
 * The unrolled brace scans must match the SAME LANGUAGE they replaced.
 *
 * WHY THIS FILE EXISTS. carve-grammars#298 and #300 replaced every
 * `{X ... X}` scan that ran to the end of a line (or, for `{+` and `{-`, to the
 * end of the document) with an unrolled form that stops at the closer's own
 * first character. That is a pure performance change ONLY if the rewritten
 * pattern still accepts and rejects exactly what the old one did - and the
 * cheap way to get the timing down is to stop matching the construct.
 *
 * #298 found that trap on itself: `\{%[^%\n]{0,512}%\}` is fast and looks
 * right, and it drops `{% 50% off %}` out of the language, because the body of
 * a comment may hold a `%` that is not the closer. Every rule here has the same
 * shape of body, so every rule here has the same trap. A stopwatch cannot see
 * it; only a language comparison can.
 *
 * WHAT IS PROVED. For each construct, the pre-fix pattern (verbatim, from the
 * commit before its fix) and the pattern the package SHIPS TODAY are run over
 * every string on a small alphabet up to a fixed length, and must agree on the
 * first match - same index, same matched text, or both no match. The alphabet
 * always carries the construct's own delimiter characters, so a body holding a
 * non-closing delimiter is generated many times over rather than hoped for.
 *
 * WHERE THE "TODAY" PATTERN COMES FROM. Not a copy - copies rot, and a copy
 * would prove that two strings in this file agree. Prism's patterns are read
 * out of the grammar object `prism/carve.js` registers, and highlight.js's out
 * of the language definition `highlightjs/carve.js` returns, matched to their
 * construct by the closer they end on. Rewriting a rule therefore re-runs this
 * comparison against the rule as rewritten.
 *
 * THE BOUNDS ARE NOT PROVED EQUIVALENT, AND CANNOT BE. `{0,4096}` and `{0,32}`
 * make the new patterns reject bodies the old ones accepted - a body over 4 KB
 * between two delimiters, or over 32 non-closing delimiters in one construct.
 * That is the deliberate part of the change (an unmatched `{` stays plain text,
 * which is the safe direction), so the comparison runs on strings far shorter
 * than either bound, where the two must agree exactly.
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

/* ------------------------------------------------------------------ *
 * The patterns as they ship, read out of the two grammars.
 * ------------------------------------------------------------------ */

const Prism = require('prismjs');
require(resolve(here, '..', 'prism', 'carve.js'));

/**
 * Every RegExp anywhere in Prism's `carve` grammar, keyed by token name.
 *
 * A token can be an array of alternatives, so the value is a set. It is a SET
 * and not a list because the same rule object is registered under several
 * parents - `inline['forced-bold']` is also the top-level `forced-bold` and is
 * reachable from every block token that contains running text - so an
 * occurrence count would say 11 where the grammar has one rule.
 *
 * @returns {Map<string, Set<RegExp>>} token name to its distinct patterns.
 */
const prismPatterns = () => {
    const found = new Map();
    const seen = new Set();
    const add = (key, pattern) => {
        if (!found.has(key)) found.set(key, new Set());
        found.get(key).add(pattern);
    };
    const walk = (obj) => {
        if (!obj || typeof obj !== 'object' || seen.has(obj)) return;
        seen.add(obj);
        for (const [key, value] of Object.entries(obj)) {
            for (const entry of Array.isArray(value) ? value : [value]) {
                if (!entry) continue;
                if (entry instanceof RegExp) {
                    add(key, entry);
                } else if (typeof entry === 'object') {
                    if (entry.pattern instanceof RegExp) add(key, entry.pattern);
                    walk(entry.inside || entry);
                }
            }
        }
    };
    walk(Prism.languages.carve);
    return found;
};

const PRISM = prismPatterns();

/**
 * The shipped Prism pattern for a token, chosen among that token's
 * alternatives by a substring of its source - `forced-bold` and `bold` are two
 * tokens, but `highlight` is one token holding both the braced and the bare
 * form in one alternation.
 *
 * @param {string} token - the token name in the grammar.
 * @param {string} marker - a substring that identifies the wanted alternative.
 * @returns {RegExp} the pattern.
 */
const prismRule = (token, marker) => {
    const candidates = [...(PRISM.get(token) || [])].filter((r) => r.source.includes(marker));
    assert.strictEqual(
        candidates.length,
        1,
        `prism/carve.js: expected exactly one '${token}' pattern containing ${JSON.stringify(marker)}, `
            + `found ${candidates.length} - did the rule get renamed or split?`,
    );
    return candidates[0];
};

const hljs = (await import('highlight.js')).default;
const hljsDefinition = (await import('../highlightjs/carve.mjs')).default(hljs);

/**
 * Every begin/end mode in the highlight.js definition. `paired()` is
 * module-private, so its output is recovered from the definition it produced -
 * which is also the only form that proves what ships.
 *
 * @returns {Array<{begin: RegExp, end: RegExp}>} the modes.
 */
const hljsModes = () => {
    const found = [];
    const seen = new Set();
    const walk = (modes) => {
        for (const mode of modes || []) {
            if (!mode || typeof mode !== 'object' || seen.has(mode)) continue;
            seen.add(mode);
            if (mode.begin instanceof RegExp && mode.end instanceof RegExp) found.push(mode);
            walk(mode.contains);
            walk(mode.starts ? [mode.starts] : []);
        }
    };
    walk(hljsDefinition.contains);
    return found;
};

const HLJS = hljsModes();

/**
 * The shipped highlight.js `begin` for the mode `paired(opener, closer)` built.
 *
 * BOTH halves are needed to identify it. `~\}` closes two different modes -
 * the CriticMarkup substitution `{~old~>new~}` and the forced strike `{~x~}` -
 * so a lookup on the closer alone silently returns the wrong one, which is how
 * the first version of this file "found" a language change that was its own
 * bug.
 *
 * @param {RegExp} opener - the delimiter that starts the span.
 * @param {RegExp} closer - the mode's `end`.
 * @returns {RegExp} the mode's `begin`.
 */
const hljsBegin = (prefix, closer) => {
    const modes = HLJS.filter(
        (m) => m.end.source === closer.source && m.begin.source.startsWith(prefix),
    );
    assert.strictEqual(
        modes.length,
        1,
        `highlightjs/carve.js: expected exactly one mode beginning ${JSON.stringify(prefix)} `
            + `and ending /${closer.source}/, found ${modes.length} - did paired() stop being used, `
            + 'or did the opener change?',
    );
    return modes[0].begin;
};

/**
 * The guard `paired()` built before carve-grammars#300: unbounded, lazy, free
 * to cross a newline that is not followed by a blank line.
 *
 * @param {RegExp} opener - the delimiter that starts the span.
 * @param {RegExp} closer - the delimiter that ends it.
 * @returns {RegExp} the pre-fix `begin`.
 */
const pairedBefore = (opener, closer) =>
    new RegExp(`${opener.source}(?=(?:[^\\n]|\\n(?!\\s*\\n))*?${closer.source})`);

/* ------------------------------------------------------------------ *
 * The comparison.
 * ------------------------------------------------------------------ */

/**
 * Every string over `alphabet` of length 0 to `maxLength`, as a generator so
 * the whole space is never held at once.
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
                const s = prefix + symbol;
                next.push(s);
                yield s;
            }
        }
        level = next;
    }
}

/**
 * First match of a pattern, as a comparable value.
 *
 * @param {RegExp} pattern - the pattern to run.
 * @param {string} input - the subject.
 * @returns {string|null} `index:text`, or null when there is no match.
 */
const firstMatch = (pattern, input) => {
    const m = new RegExp(pattern.source, pattern.flags.replace('g', '')).exec(input);
    return m ? `${m.index}:${m[0]}` : null;
};

/**
 * Assert two patterns pick the same first match on every string in the space.
 *
 * @param {string} name - what is being compared, for the failure message.
 * @param {RegExp} before - the pre-fix pattern.
 * @param {RegExp} after - the pattern as it ships.
 * @param {string[]} alphabet - the symbols to draw from.
 * @param {number} maxLength - the longest string to try.
 * @returns {number} how many strings were compared.
 */
const agree = (name, before, after, alphabet, maxLength) => {
    let count = 0;
    for (const input of strings(alphabet, maxLength)) {
        count++;
        const a = firstMatch(before, input);
        const b = firstMatch(after, input);
        if (a !== b) {
            assert.fail(
                `${name}: the rewritten pattern changed the LANGUAGE on ${JSON.stringify(input)}\n`
                    + `  before /${before.source}/ -> ${a}\n`
                    + `  ships  /${after.source}/ -> ${b}\n`
                    + '  A faster pattern that no longer matches the construct is a regression, '
                    + 'not a fix - see the note at the top of this file.',
            );
        }
    }
    return count;
};

/*
 * One row per rewritten scan.
 *
 * `before` is the pattern's VERBATIM pre-fix text, from the commit before its
 * fix - not a paraphrase, or the comparison proves nothing about what was
 * shipped. The alphabet always holds `{`, `}`, the construct's own delimiter,
 * a word character and a newline, plus any character the rule reacts to
 * specially (`>` for the two `~` rules, a space where a guard spells `\s`).
 */
const CASES = [
    // ---- prism/carve.js, the seven line-scanning inline rules -------------
    {
        name: 'prism forced-bold {*',
        before: /\{\*(?=\S)[^\n]*?\*\}/,
        after: () => prismRule('forced-bold', '\\{\\*'),
        alphabet: ['{', '}', '*', 'a', '\n'],
        maxLength: 8,
    },
    {
        name: 'prism forced-italic {/',
        before: /\{\/(?=\S)[^\n]*?\/\}/,
        after: () => prismRule('forced-italic', '\\{\\/'),
        alphabet: ['{', '}', '/', 'a', '\n'],
        maxLength: 8,
    },
    {
        name: 'prism forced-underline {_',
        before: /\{_(?=\S)[^\n]*?_\}/,
        after: () => prismRule('forced-underline', '\\{_'),
        alphabet: ['{', '}', '_', 'a', '\n'],
        maxLength: 8,
    },
    {
        name: 'prism forced-strike {~',
        before: /\{~(?=\S)(?:(?!~>)[^\n])*?~\}/,
        after: () => prismRule('forced-strike', '\\{~'),
        // `>` is in the alphabet because the old form barred `~>` from the body
        // and the new one spells that as part of the tempering.
        alphabet: ['{', '}', '~', '>', 'a', '\n'],
        maxLength: 7,
    },
    {
        // ONE PATTERN, BOTH FORMS. `highlight` fuses the braced `{=x=}` and the
        // bare `=x=` into one alternation, and #300 touched both halves - the
        // braced body was unrolled, and the bare body's `[^=\n]+?` was given a
        // bound so the whole line passes the derived family check in
        // `scans-are-bounded-test.js`. Comparing the pattern rather than the
        // alternative is therefore what proves the bare form survived too.
        name: 'prism highlight {= and bare =',
        before: /\{=(?=\S)[^\n]*?=\}|(?<![\w=])=(?=\S)[^=\n]+?(?<=\S)=(?![\w=])/,
        after: () => prismRule('highlight', '\\{='),
        alphabet: ['{', '}', '=', 'a', '\n'],
        maxLength: 8,
    },
    {
        name: 'prism superscript {^',
        before: /\{\^(?=\S)[^\n]*?\^\}/,
        after: () => prismRule('superscript', '\\{\\^'),
        alphabet: ['{', '}', '^', 'a', '\n'],
        maxLength: 8,
    },
    {
        name: 'prism subscript {,',
        before: /\{,(?=\S)[^\n]*?,\}/,
        after: () => prismRule('subscript', '\\{,'),
        alphabet: ['{', '}', ',', 'a', '\n'],
        maxLength: 8,
    },
    // ---- prism/carve.js, the three CriticMarkup rules --------------------
    // These scanned past a NEWLINE (`[^}]*`), so the old and new patterns are
    // compared on multi-line input too.
    {
        name: 'prism inserted {+',
        before: /\{\+[^}]*\+\}/,
        after: () => prismRule('inserted', '\\{\\+'),
        alphabet: ['{', '}', '+', 'a', '\n'],
        maxLength: 8,
    },
    {
        name: 'prism deleted {-',
        before: /\{-[^}]*-\}/,
        after: () => prismRule('deleted', '\\{-'),
        alphabet: ['{', '}', '-', 'a', '\n'],
        maxLength: 8,
    },
    {
        name: 'prism changed {~ ~> ~}',
        before: /\{~[^~]*~>[^~]*~\}/,
        after: () => prismRule('changed', '~>'),
        alphabet: ['{', '}', '~', '>', 'a'],
        maxLength: 8,
    },
    // ---- highlightjs/carve.js, all thirteen paired() modes ----------------
    // One helper, so one defect and one fix - but each call site instantiates
    // the guard from its own closer, so each is compared separately. The five
    // bare delimiters are here for the same reason: they were never in the
    // ticket, and they went through the same broken guard.
    // The fourth column is the prefix that identifies the SHIPPED mode. It is
    // the opener's source everywhere except forced-strike, whose opener is part
    // of this fix - see the row's own note.
    ...[
        ['forced-bold {*', /\{\*(?=\S)/, /\*\}/, null, ['{', '}', '*', 'a', '\n']],
        ['forced-italic {/', /\{\/(?=\S)/, /\/\}/, null, ['{', '}', '/', 'a', '\n']],
        ['forced-underline {_', /\{_(?=\S)/, /_\}/, null, ['{', '}', '_', 'a', '\n']],
        // Its OPENER changed too: `(?!.*~>)` was a greedy scan of the rest of
        // the line, so it is matched on the part that did not change. Both
        // halves of the begin are compared, which is the point - the guard and
        // the arrow lookahead were rewritten in the same commit.
        ['forced-strike {~', /\{~(?=\S)(?!.*~>)/, /~\}/, '\\{~(?=\\S)', ['{', '}', '~', '>', 'a', '\n']],
        ['inserted {+', /\{\+/, /\+\}/, null, ['{', '}', '+', 'a', '\n']],
        ['deleted {-', /\{-/, /-\}/, null, ['{', '}', '-', 'a', '\n']],
        ['subscript {,', /\{,(?=\S)/, /,\}/, null, ['{', '}', ',', 'a', '\n']],
        ['superscript {^', /\{\^(?=\S)/, /\^\}/, null, ['{', '}', '^', 'a', '\n']],
        ['emphasis /', /(?<![\w:/])\/(?=\S)/, /\/(?![\w/])/, null, ['/', 'a', ' ', '\n', '{']],
        ['underline _', /(?<!\w)_(?!\s)/, /_(?!\w)/, null, ['_', 'a', ' ', '\n', '{']],
        // The `\[` escape is redundant inside a class and kept anyway: the
        // opener is matched against the SHIPPED source text character for
        // character, so it has to be spelled the way the grammar spells it.
        // eslint-disable-next-line no-useless-escape
        ['strong *', /(?<!\w)\*(?![\s\[])/, /\*(?!\w)/, null, ['*', 'a', ' ', '\n', '{']],
        ['highlight =', /(?<![=\w])=(?=\S)/, /=(?![=\w])/, null, ['=', 'a', ' ', '\n', '{']],
        ['strikethrough ~', /(?<!\w)~(?=\S)/, /~(?!\w)/, null, ['~', 'a', ' ', '\n', '{']],
    ].map(([label, opener, closer, prefix, alphabet]) => ({
        name: `hljs ${label}`,
        before: pairedBefore(opener, closer),
        after: () => hljsBegin(prefix || opener.source, closer),
        alphabet,
        maxLength: alphabet.length > 5 ? 7 : 8,
    })),
    // Not a paired() mode: the CriticMarkup substitution hunts for its `~>`
    // arrow with a lookahead of its own, and that scan ran to end of line too -
    // it is the other reason `{~` stayed superlinear after paired() was fixed.
    {
        name: 'hljs changed {~ ~> ~}',
        before: /\{~(?=[^}\n]*~>)/,
        after: () => hljsBegin('\\{~(?=[^~}', /~\}/),
        alphabet: ['{', '}', '~', '>', 'a', '\n'],
        maxLength: 7,
    },
];

console.log('language equivalence, pre-fix pattern against the pattern that ships:');
let compared = 0;
for (const c of CASES) {
    ok(`${c.name} is unchanged as a language`, () => {
        compared += agree(c.name, c.before, c.after(), c.alphabet, c.maxLength);
    });
}
console.log(`  (${compared.toLocaleString('en-US')} strings compared)`);

/*
 * THE COMPARISON HAS TO BE SEEN REJECTING SOMETHING.
 *
 * Everything above passes just as happily if `agree` never actually ran a
 * pattern, or if the alphabet were so thin that no body ever held a
 * non-closing delimiter. The shapes below are the two ways a "fix" for this
 * ticket goes wrong, and the comparison must catch both.
 */
console.log('\nthe comparison rejects a language change:');
ok('catches the naive character class that drops a non-closing delimiter', () => {
    // `{% 50% off %}` in the shape of this ticket's rules: the body may hold
    // the delimiter, and a class that excludes it silently narrows the
    // language. This is the exact pattern carve-grammars#298 rejected.
    assert.throws(
        () => agree(
            'probe',
            /\{\*(?=\S)[^\n]*?\*\}/,
            /\{\*(?=\S)[^*\n]{0,512}\*\}/,
            ['{', '}', '*', 'a', '\n'],
            6,
        ),
        /changed the LANGUAGE/,
    );
});
ok('catches a tempering that forgets the closer is two characters', () => {
    // Excluding every `*` INCLUDING the closer's, rather than tempering on
    // `*` not followed by `}`, matches nothing at all past the first body
    // delimiter.
    assert.throws(
        () => agree(
            'probe',
            /\{,(?=\S)[^\n]*?,\}/,
            /\{,(?=\S)[^,\n]{0,4096}(?:,(?!,)[^,\n]{0,4096}){0,32},\}/,
            ['{', '}', ',', 'a', '\n'],
            6,
        ),
        /changed the LANGUAGE/,
    );
});
ok('the alphabets do generate bodies holding a non-closing delimiter', () => {
    // Without this the two probes above could pass on a technicality while the
    // real cases never exercise the interesting body at all.
    for (const c of CASES) {
        const delimiter = c.alphabet.find((s) => !/[a-z{}\s]/.test(s));
        assert.ok(delimiter, `${c.name}: alphabet has no delimiter character`);
        assert.ok(
            c.maxLength >= 6,
            `${c.name}: length ${c.maxLength} is too short to hold opener + delimiter + closer`,
        );
    }
});

/*
 * A NEW TEST FILE IN THIS REPO IS DEAD UNTIL `npm test` NAMES IT.
 *
 * The `test` script is an explicit list of `node tests/*.js` invocations, not a
 * glob, so a file added here runs when someone runs it by hand and never again.
 * That has already cost this repo three times over - the same shape as the
 * hand-written opener list in `scripts/scan-superlinear.mjs` and the
 * hand-written URL list in `scripts/no-git-dependencies.mjs`. So the file
 * asserts its own presence in the chain.
 */
ok('this file is in the npm test chain', () => {
    const pkg = JSON.parse(readFileSync(resolve(here, '..', 'package.json'), 'utf8'));
    const self = 'tests/braced-scan-equivalence-test.js';
    assert.ok(
        pkg.scripts.test.includes(`node ${self}`),
        `package.json "test" does not run ${self}, so this file proves nothing in CI - `
            + 'the script is an explicit list, not a glob',
    );
});

console.log(`\n${passed} passed`);
