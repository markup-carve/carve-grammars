/**
 * One production, three grammars: an include option VALUE is an
 * `attribute_value`, so it may be quoted.
 *
 *   include_options = {whitespace+, '@', identifier, ':', attribute_value}+ ;
 *   attribute_value = unquoted_value | quoted_value ;
 *
 * The rule added in carve-grammars#403 read the value as `[^\s}]+`, a run of
 * non-space characters, so `@label:"two words"` scoped `"two` and left `words"`
 * out of the option (carve-grammars#409). Every grammar carrying the ported
 * rule had the same limit, which is why the shapes below are asserted on all
 * three at once rather than on the surface the defect was noticed in.
 *
 * TWO THINGS A QUOTED RUN MUST NOT DO, both asserted here because the fix for
 * the first is what makes the second reachable:
 *
 *   An UNTERMINATED quote falls back to the unquoted reading and stops at the
 *   space. It must never pair with a quote further along and swallow what is
 *   between - the processor leaves a malformed directive as text.
 *
 *   A quoted run STOPS AT THE NEWLINE. `quoted_include_path` is spelled
 *   `character - ('"' | newline)` and the same bound is normative for
 *   `quoted_value` [CARVE-P4-006]. Prism and highlight.js scan the whole
 *   document, so without it the opening quote of a path paired with a quote
 *   lines away and painted everything between as directive.
 *
 * A `}` INSIDE THE QUOTES IS THE VALUE'S (carve-grammars#412). `quoted_value`
 * admits it, but the outer part run was `[^\s}]+` and stopped at it, so
 * `{{ ch.crv @label:"a}b" }}` matched NOTHING on TextMate and Prism - not the
 * value, the whole directive - while highlight.js, whose mode has no
 * equivalent run, scoped it. The three surfaces disagreed on one character.
 *
 * AND SO IS THE `}}` PAIR, since markup-carve/carve#2013: THE DIRECTIVE'S
 * CLOSER IS THE FIRST `}}` OUTSIDE ANY QUOTED RUN. `quoted_value` and
 * `quoted_include_path` exclude only their own quote, the backslash and the
 * newline, so a run may hold the pair and the directive then ends at the pair
 * that FOLLOWS the closing quote. This supersedes the `\}(?!\})` bound
 * carve-grammars#413 gave all three surfaces, which excluded the pair from a
 * run and so read `@label:"a }} more"` as the unterminated `"a`.
 *
 * AN UNTERMINATED QUOTE STILL OPENS NO RUN, which is what preserves the old
 * reading for a malformed directive: with no closing quote on the line the
 * value falls back to the unquoted reading and the closer is again the first
 * `}}`. The two readings are asserted next to each other below, because it is
 * the QUOTE'S TERMINATION, not the `}}`, that now decides where a directive
 * ends.
 */
import { createHighlighter } from 'shiki';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { prismTokens, hljsTokens } from './lib/engines.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const grammar = JSON.parse(
    readFileSync(resolve(__dirname, '../textmate/carve.tmLanguage.json'), 'utf8'),
);
const hl = await createHighlighter({
    themes: ['github-light'],
    langs: [{ ...grammar, name: 'carve' }],
});

/** TextMate leaves as `{scope, text}`, the scope being the whole stack. */
function textmateLeaves(source) {
    return hl.codeToTokens(source, {
        lang: 'carve',
        theme: 'github-light',
        includeExplanation: true,
    }).tokens.flat().map((t) => ({
        scope: (t.explanation ?? []).flatMap((e) => e.scopes.map((s) => s.scopeName)).join(' '),
        text: t.content,
    }));
}

const GRAMMARS = [
    {
        name: 'textmate',
        leaves: textmateLeaves,
        value: 'constant.other.include',
        path: 'string.other.link.include',
        directive: 'meta.directive.include',
    },
    {
        name: 'prism',
        leaves: prismTokens,
        value: 'include-option-value',
        path: 'include-path',
        directive: 'include-directive',
    },
    // highlight.js has no include-specific class names: the option value is
    // `literal` and the directive itself is `meta`. Nothing else in these
    // one-line samples emits either, so the class identifies the token here.
    {
        name: 'highlight.js',
        leaves: hljsTokens,
        value: 'literal',
        path: 'string',
        directive: 'meta',
    },
];

/** The exact text carrying the option-value scope, '' when nothing does. */
function valueText(g, source) {
    return g.leaves(source)
        .filter((t) => (t.scope ?? '').includes(g.value))
        .map((t) => t.text)
        .join('');
}

/**
 * The text after the directive's CLOSER that is still inside the directive,
 * '' when none is. The closer is the first `}}` outside a quoted run, so a
 * case whose value legitimately holds the pair says where its own closer is;
 * everywhere else it is the first one in the source.
 */
function spillAfterCloser(g, source, closerAt) {
    const tail = (closerAt ?? source.indexOf('}}')) + 2;
    let at = 0;
    const out = [];
    for (const t of g.leaves(source)) {
        const start = at;
        at += t.text.length;
        if (start < tail) continue;
        if ((t.scope ?? '').includes(g.directive)) out.push(t.text);
    }
    return out.join('');
}

const OPTION = '{{ ch.crv @label:';

const CASES = [
    {
        why: 'the unquoted form is the control - it scopes exactly as it did',
        source: `See {{ ch.crv @shift:auto }} here`,
        value: 'auto',
    },
    {
        why: 'a double-quoted value holding a space',
        source: `See ${OPTION}"two words" }} here`,
        value: '"two words"',
    },
    {
        why: 'a single-quoted value holding a space',
        source: `See ${OPTION}'two words' }} here`,
        value: "'two words'",
    },
    {
        why: 'a double-quoted value holding the other quote character',
        source: `See ${OPTION}"it's here" }} here`,
        value: `"it's here"`,
    },
    {
        why: 'a single-quoted value holding the other quote character',
        source: `See ${OPTION}'say "hi"' }} here`,
        value: `'say "hi"'`,
    },
    {
        why: 'a backslash escapes a quote inside the quoted value',
        source: `See ${OPTION}"a\\"b" }} here`,
        value: `"a\\"b"`,
    },
    {
        why: 'a `}` inside a double-quoted value is the value\'s, not the closer\'s',
        source: `See ${OPTION}"a}b" }} here`,
        value: '"a}b"',
    },
    {
        why: 'a `}` inside a single-quoted value is the value\'s, not the closer\'s',
        source: `See ${OPTION}'a}b' }} here`,
        value: "'a}b'",
    },
    {
        // THE RULING (markup-carve/carve#2013). The pair is inside a terminated
        // run, so it is the value's and the closer is the NEXT one. `closer`
        // points `spillAfterCloser` at that second pair: without it the helper
        // would read the value's own `}}` as the closer and call the rest of
        // the directive spill.
        why: 'a `}}` inside a quoted value is the value\'s, and the closer is the next pair',
        source: `See ${OPTION}"a }} more" }} end`,
        value: '"a }} more"',
        closer: `See ${OPTION}"a }} more" `.length,
    },
    {
        why: 'the same in a single-quoted value',
        source: `See ${OPTION}'a }} more' }} end`,
        value: "'a }} more'",
        closer: `See ${OPTION}'a }} more' `.length,
    },
    {
        // The other half of the ruling, and the one the superseded bound was
        // protecting: no closing quote on the line, so no run is open, so the
        // value is the unquoted `"a` and the closer is the first pair.
        why: 'an UNTERMINATED quote opens no run, so the closer is the first `}}`',
        source: `See ${OPTION}"a }} more }} end`,
        value: '"a',
    },
    {
        why: 'an unterminated double quote falls back to the unquoted reading',
        source: `See ${OPTION}"two words }} here and more text`,
        value: '"two',
    },
    {
        why: 'an unterminated single quote falls back to the unquoted reading',
        source: `See ${OPTION}'two words }} here and more text`,
        value: "'two",
    },
];

// A quoted run that ignored the newline paired the opening quote with one two
// lines down and claimed everything between, emphasis markers included. The
// second shape puts a `}}` on the opening line, which is what lets the run eat
// the closer: highlight.js then had no end for its mode on that line either.
const ACROSS_LINES = [
    'See {{ "a\nnot a directive *bold* here\nb" }} end\n',
    'See {{ "a }} end\nb" *bold* tail\n',
];

let pass = 0;
const fails = [];

for (const g of GRAMMARS) {
    for (const { source, value, why, closer } of CASES) {
        const got = valueText(g, source);
        if (got === value) pass++;
        else fails.push(`${g.name}: value is ${JSON.stringify(got)}, expected ${JSON.stringify(value)} - ${why}`);

        const spill = spillAfterCloser(g, source, closer);
        if (spill === '') pass++;
        else fails.push(`${g.name}: directive spills past its closer onto ${JSON.stringify(spill)} - ${why}`);
    }

    // TextMate rules match per line, so the newline bound is the engine's
    // rather than the pattern's and there is nothing to assert.
    if (g.name === 'textmate') continue;
    for (const source of ACROSS_LINES) {
        // Nothing in these samples is a multi-line construct, so ANY scoped
        // token spanning the newline is the run that should have stopped at it.
        const claimed = g.leaves(source)
            .filter((t) => (t.scope ?? '') !== '' && t.text.includes('\n'))
            .map((t) => t.text);
        if (claimed.length === 0) pass++;
        else fails.push(`${g.name}: a scoped token runs across a newline: ${JSON.stringify(claimed[0])}`);
    }
}

/*
 * THE PATH HALF of the same ruling. `quoted_include_path` has always excluded
 * only the quote, the backslash and the newline, so every surface already
 * admitted the pair here - which is precisely why the two halves could be read
 * two different ways on one line. Asserted so the halves cannot drift apart
 * again: the closer is the pair AFTER the closing quote, and what follows it is
 * prose.
 */
const PATH_CASES = [
    {
        why: 'a `}}` inside a quoted PATH is the path\'s, and the closer is the next pair',
        source: 'See {{ "a }} more" @k:v }} end',
        path: '"a }} more"',
        closer: 'See {{ "a }} more" @k:v '.length,
    },
];

for (const g of GRAMMARS) {
    for (const { source, path, why, closer } of PATH_CASES) {
        const got = g.leaves(source)
            .filter((t) => (t.scope ?? '').includes(g.path))
            .map((t) => t.text)
            .join('');
        if (got === path) pass++;
        else fails.push(`${g.name}: path is ${JSON.stringify(got)}, expected ${JSON.stringify(path)} - ${why}`);

        const spill = spillAfterCloser(g, source, closer);
        if (spill === '') pass++;
        else fails.push(`${g.name}: directive spills past its closer onto ${JSON.stringify(spill)} - ${why}`);
    }
}

/*
 * Shapes the three surfaces do NOT read alike, pinned PER SURFACE so the
 * divergence is a recorded reading rather than a silence.
 *
 * Both are malformed. `unquoted_value` is `(letter | digit | '-' | '_' | '.' |
 * ':')+`, so an unquoted `}` ends neither the value nor the directive and
 * `{{ ch.crv @label:a}b }}` is not an `include_directive` at all. TextMate and
 * Prism refuse the line outright, which is what the grammar says; highlight.js
 * opens its mode on a `}}` lookahead that does not read what lies between, so
 * it scopes the line and stops the value at the brace. Neither reading moved in
 * carve-grammars#412 and neither is that ticket's to settle - they are pinned
 * here so a later change to the part run has to say which way it moved them.
 */
const DIVERGENT = [
    {
        /*
         * A TERMINATED run holding the ONLY pair on the line. Under
         * markup-carve/carve#2013 there is then no `}}` outside a quoted run,
         * so the line is not an `include_directive` at all and is ordinary
         * text - which is what TextMate and Prism read, their outer pattern
         * needing a closer it cannot find.
         *
         * highlight.js cannot reach that reading: its mode opens on a
         * lookahead that only asks whether SOME `}}` is on the line, without
         * reading what lies between, so it opens and then finds no closer
         * outside the run. `end` carries `|$` so the mode dies at the line
         * end rather than painting the rest of the document - the failure
         * carve-grammars#403 is about. The line is scoped, the value reads as
         * the run, and that is the residual.
         *
         * Before #2013 this row lived in CASES reading `"a` everywhere,
         * because the superseded bound stopped the run at the pair and left
         * the quote unterminated. The ruling moved it; it is recorded here
         * rather than deleted so the move is visible.
         */
        why: 'a terminated quoted run holding the only `}}` leaves no closer outside it',
        source: `See ${OPTION}"a b }} tail "later"`,
        value: { textmate: '', prism: '', 'highlight.js': '"a b }} tail "' },
    },
    {
        why: 'a `}` in an UNQUOTED value - the control, unmoved by #412',
        source: `See ${OPTION}a}b }} here`,
        value: { textmate: '', prism: '', 'highlight.js': 'a' },
    },
    {
        why: 'an unterminated quote holding a `}` - also unmoved',
        source: `See ${OPTION}"a}b }} here`,
        value: { textmate: '', prism: '', 'highlight.js': '"a' },
    },
];

for (const g of GRAMMARS) {
    for (const { source, value, why } of DIVERGENT) {
        const got = valueText(g, source);
        if (got === value[g.name]) pass++;
        else fails.push(`${g.name}: value is ${JSON.stringify(got)}, expected ${JSON.stringify(value[g.name])} - ${why}`);
    }
}

/*
 * AN UNTERMINATED OPENER OPENS NOTHING. Every grammar in this family has been
 * bitten by one - highlight.js needs the closer in its opening lookahead or it
 * paints the rest of the document (carve-grammars#403), and the same construct
 * left a context open for the rest of the buffer in sublime-carve#42. The
 * widening in #412 touches the run BETWEEN the braces, which is reached only
 * after the opener matches, so the opener is asserted next to it rather than
 * assumed to be out of reach.
 */
const NO_DIRECTIVE = [
    'See {{ ch.crv @label:"a}b" and more text\n',
    'See {{ ch.crv @label:"a}b" and more\nand a second line *bold* here\n',
    // No `}}` ANYWHERE, which is what makes these unterminated. A line that
    // carries one is a directive whose VALUE is unterminated, and that is a
    // different shape - it is asserted in CASES above, reading `"a`.
];

for (const g of GRAMMARS) {
    for (const source of NO_DIRECTIVE) {
        const claimed = g.leaves(source)
            .filter((t) => (t.scope ?? '').includes(g.directive))
            .map((t) => t.text);
        if (claimed.length === 0) pass++;
        else fails.push(`${g.name}: an unterminated opener still scoped ${JSON.stringify(claimed.join(''))} as a directive - ${JSON.stringify(source)}`);
    }
}

// A probe that can never read a value would pass nothing but would also never
// fail, so make each one answer both ways before its verdicts are believed.
for (const g of GRAMMARS) {
    if (valueText(g, 'See {{ ch.crv @shift:auto }} here') !== 'auto') {
        fails.push(`${g.name}: probe reads no option value at all`);
    }
    if (valueText(g, 'plain text with no directive') !== '') {
        fails.push(`${g.name}: probe reads an option value out of ordinary text`);
    }
}

if (fails.length) {
    console.error(`include option value: ${fails.length} failing`);
    for (const f of fails) console.error(`  ${f}`);
    process.exit(1);
}

console.log(`include option value: ${pass} checks pass across ${GRAMMARS.length} grammars`);
