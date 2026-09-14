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
 * AND THE `}}` PAIR IS NOT. The two pull in opposite directions and both are
 * asserted below, because a fix for the first silently introduces the second:
 * a quoted run that admits `}}` closes against a quote further along the line
 * and the directive then ends on the SECOND closer, swallowing what is between
 * (tree-sitter-carve#288). highlight.js did exactly that before #412.
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
        directive: 'meta.directive.include',
    },
    {
        name: 'prism',
        leaves: prismTokens,
        value: 'include-option-value',
        directive: 'include-directive',
    },
    // highlight.js has no include-specific class names: the option value is
    // `literal` and the directive itself is `meta`. Nothing else in these
    // one-line samples emits either, so the class identifies the token here.
    {
        name: 'highlight.js',
        leaves: hljsTokens,
        value: 'literal',
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

/** The text after `}}` that is still inside the directive, '' when none is. */
function spillAfterCloser(g, source) {
    const tail = source.indexOf('}}') + 2;
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
        // The directive must end at the FIRST `}}`. `spillAfterCloser` below is
        // what asserts that half: it reads from the first closer on, so a
        // directive that closed on the second one shows up as spill.
        why: 'a `}}` inside a quoted value does NOT extend the directive to the second closer',
        source: `See ${OPTION}"a }} more" }} end`,
        value: '"a',
    },
    {
        why: 'an unterminated quote does not pair with one in the prose after the closer',
        source: `See ${OPTION}"a b }} tail "later"`,
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
    for (const { source, value, why } of CASES) {
        const got = valueText(g, source);
        if (got === value) pass++;
        else fails.push(`${g.name}: value is ${JSON.stringify(got)}, expected ${JSON.stringify(value)} - ${why}`);

        const spill = spillAfterCloser(g, source);
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
