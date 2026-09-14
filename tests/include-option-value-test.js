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
