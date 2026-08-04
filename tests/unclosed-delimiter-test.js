/**
 * An unpartnered inline delimiter must not color the rest of the document.
 *
 * highlight.js models every inline mark as a `begin`/`end` mode, and such a
 * mode opens the moment `begin` matches whether or not the closer ever
 * arrives. A lone `_` therefore used to scope every remaining character of the
 * file as underline (#81) - and the shapes that hit it are not typos: `:_[x]`
 * is an inline extension and `:_x:` is a symbol, where the `_` is part of the
 * name and is not a delimiter at all.
 *
 * Three corpus documents recorded that runaway as their golden, so the
 * snapshots could not catch it. This asserts the invariant directly, over both
 * engines, so the next mark added to either grammar is held to it. Prism has
 * always passed - its patterns require the closer in one match - which is what
 * makes it a useful control rather than a second copy of the same bug.
 */
import { ENGINES } from './lib/engines.js';

const SENTINEL = 'SENTINEL';

/**
 * An opener with no closer, then a paragraph break, then the sentinel. Nothing
 * from the sentinel onwards may carry a scope.
 *
 * @type {Array<[string, string]>} label and the source before the sentinel.
 */
const UNCLOSED = [
    ['emphasis', 'unclosed /em here'],
    ['underline', 'unclosed _under here'],
    ['strong', 'unclosed *strong here'],
    ['strike', 'unclosed ~strike here'],
    ['highlight', 'unclosed =mark here'],
    ['forced strong', 'unclosed {*bold here'],
    ['forced emphasis', 'unclosed {/em here'],
    ['forced underline', 'unclosed {_under here'],
    ['forced strike', 'unclosed {~strike here'],
    ['insert', 'unclosed {+ins here'],
    ['delete', 'unclosed {-del here'],
    ['subscript', 'unclosed {,sub here'],
    ['superscript', 'unclosed {^sup here'],

    // The corpus shapes that exposed it. Here the delimiter belongs to another
    // construct entirely, so there is no closer to find by design.
    ['inline extension', 'a :_[x] b'],
    ['symbol', 'a:b:c and 10:30: meeting, :_x: too.'],
    ['emoticon', '>_< face'],
];

/**
 * A closer that DOES arrive must still open the span - including across a line
 * break, which the engine allows inside one paragraph. Without these the fix
 * for the runaway could be "never open the mode" and still pass.
 *
 * The last argument names the engines a case applies to. Prism's inline
 * patterns exclude `\n` from every character class, so it scopes single-line
 * marks only - a deliberate limit of matching the whole span in one regex, not
 * a regression this test should pin as passing.
 * highlight.js can span lines and does, so the two multi-line cases guard
 * against the guard being tightened to end-of-line.
 *
 * @type {Array<[string, string, string, Array<string>]>} label, source, payload
 *   that must be scoped, engines the case applies to.
 */
const BOTH = ['prism', 'highlightjs'];
const CLOSED = [
    ['emphasis on one line', 'a /em/ b', 'em', BOTH],
    ['underline on one line', 'a _under_ b', 'under', BOTH],
    ['strong on one line', 'a *strong* b', 'strong', BOTH],
    ['strike on one line', 'a ~strike~ b', 'strike', BOTH],
    ['emphasis across a line break', 'a /multi\nline em/ b', 'line em', ['highlightjs']],
    ['strong across a line break', 'a *multi\nline strong* b', 'line strong', ['highlightjs']],
    ['forced underline', 'my{_path_}name', 'path', BOTH],
    ['insert', 'a {+added+} b', 'added', BOTH],
];

let failed = 0;
console.log('carve-grammars unclosed delimiters:');

for (const [engineName, tokenize] of ENGINES) {
    const fails = [];

    for (const [label, prefix] of UNCLOSED) {
        const source = `${prefix}\n\n${SENTINEL} text\n`;
        const tokens = tokenize(source);
        const leaked = tokens.filter((t) => t.text.includes(SENTINEL) && t.scope);
        if (leaked.length) {
            fails.push(`FAIL [${engineName}] ${label}: the span reached past the paragraph`
                + `\n   source: ${JSON.stringify(source)}`
                + `\n   sentinel scoped as: ${leaked.map((t) => t.scope).join(', ')}`);
        }
    }

    const closed = CLOSED.filter(([, , , engines]) => engines.includes(engineName));
    for (const [label, source, payload] of closed) {
        const tokens = tokenize(source);
        const carrying = tokens.filter((t) => t.text.includes(payload) && t.scope);
        if (!carrying.length) {
            fails.push(`FAIL [${engineName}] ${label}: a closed mark is NOT scoped`
                + `\n   source: ${JSON.stringify(source)}`
                + `\n   payload: ${JSON.stringify(payload)}`);
        }
    }

    const total = UNCLOSED.length + closed.length;
    console.log(`  ${fails.length ? '✗' : '✓'} ${engineName}: ${total - fails.length}/${total} delimiter cases`);
    fails.forEach((f) => console.log(f + '\n'));
    failed += fails.length;
}

if (failed) {
    console.error(`\n${failed} delimiter case(s) wrong. An opener with no closer must not open a span,`);
    console.error('and an opener with a closer must still open one - including across a line break.');
    process.exit(1);
}
