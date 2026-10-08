/**
 * An include option needs no whitespace before its `@`, in any position
 * (`include_options` in spec `resources/spec/10-includes.ebnf`): the bare path
 * stops at `@` and a section name holds none, so an option may butt straight
 * onto either slot. Every surface that models the directive has to read the
 * glued spelling as a directive AND scope the option as an option - not as a
 * tag, and not as more path.
 */
import { createHighlighter } from './lib/shiki.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { findDirectives } from '../spec/scripts/spec/include-directive.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const grammar = JSON.parse(
    readFileSync(resolve(__dirname, '../textmate/carve.tmLanguage.json'), 'utf8'),
);
const hl = await createHighlighter({
    themes: ['github-light'],
    langs: [{ ...grammar, name: 'carve' }],
});

function textmateLeaves(source) {
    return hl.codeToTokens(source, {
        lang: 'carve',
        theme: 'github-light',
        includeExplanation: true,
    }).tokens.flat().flatMap((t) => (t.explanation ?? []).map((e) => ({
        scope: e.scopes.map((s) => s.scopeName).join(' '),
        text: e.content,
    })));
}

const hljsLeaves = (source) => hljsTokens(source).map((t) => ({
    scope: t.ancestors.join(' '),
    text: t.text,
}));

const GRAMMARS = [
    {
        name: 'textmate',
        leaves: textmateLeaves,
        directive: 'meta.directive.include',
        path: 'string.other.link.include',
        option: 'variable.parameter.include',
        section: 'entity.name.section.include',
    },
    {
        name: 'prism',
        leaves: prismTokens,
        directive: 'include-directive',
        path: 'include-path',
        option: 'include-option-name',
        section: 'include-section',
    },
    {
        name: 'highlight.js',
        leaves: hljsLeaves,
        directive: 'meta',
        path: 'meta string',
        option: 'meta keyword',
        section: 'meta symbol',
    },
];

// An option NAME can repeat, so that field alone joins with a separator; the
// others are one run each and join to the raw text.
const textUnder = (g, source, scope, sep) => g.leaves(source)
    .filter((t) => scope.split(' ').every((s) => (t.scope ?? '').includes(s)))
    .map((t) => t.text)
    .join(sep);

const ROWS = [
    // The nine spellings the clause declares well formed.
    { why: 'an option glued to a bare path', source: 'See {{ c.crv@shift:1 }} end', directive: '{{ c.crv@shift:1 }}', path: 'c.crv', options: '@shift', section: '' },
    { why: 'an option glued to a section', source: 'See {{ c.crv #Alpha@shift:1 }} end', directive: '{{ c.crv #Alpha@shift:1 }}', path: 'c.crv', options: '@shift', section: '#Alpha' },
    { why: 'a spaced option - the control', source: 'See {{ c.crv @shift:1 }} end', directive: '{{ c.crv @shift:1 }}', path: 'c.crv', options: '@shift', section: '' },
    { why: 'a spaced section and a spaced option', source: 'See {{ c.crv #Alpha @shift:1 }} end', directive: '{{ c.crv #Alpha @shift:1 }}', path: 'c.crv', options: '@shift', section: '#Alpha' },
    { why: 'two spaced options', source: 'See {{ c.crv @shift:1 @lines:1-2 }} end', directive: '{{ c.crv @shift:1 @lines:1-2 }}', path: 'c.crv', options: '@shift|@lines', section: '' },
    // TWO options, not one: `include_unquoted_value` is `unquoted_value` less
    // the `@`, so a value ends at the next option's marker (carve#2780).
    { why: 'two glued options', source: 'See {{ c.crv@shift:1@lines:1-2 }} end', directive: '{{ c.crv@shift:1@lines:1-2 }}', path: 'c.crv', options: '@shift|@lines', section: '' },
    { why: 'an option glued to a digit-leading section', source: 'See {{ c.crv #2024-plan@shift:1 }} end', directive: '{{ c.crv #2024-plan@shift:1 }}', path: 'c.crv', options: '@shift', section: '#2024-plan' },
    { why: 'an option glued to a quoted path', source: 'See {{ "my chapter.crv"@shift:1 }} end', directive: '{{ "my chapter.crv"@shift:1 }}', path: '"my chapter.crv"', options: '@shift', section: '' },
    { why: 'a quoted option value holding the closer pair', source: 'See {{ ch.crv @label:"a }} more" }} end', directive: '{{ ch.crv @label:"a }} more" }}', path: 'ch.crv', options: '@label', section: '' },

    // The padding rule is unchanged: the outer run is required on each side.
    { why: 'no padding at all', source: 'See {{c.crv}} end', directive: '', path: '', options: '', section: '' },
    { why: 'no padding before the closer', source: 'See {{ c.crv}} end', directive: '', path: '', options: '', section: '' },
    { why: 'a glued option with no padding before the closer', source: 'See {{ c.crv@shift:1}} end', directive: '', path: '', options: '', section: '' },
    // An unterminated quote in an option VALUE falls back to the unquoted
    // reading, which tests/include-option-value-test.js pins; the unterminated
    // PATH is the one that leaves no directive on every surface.
    { why: 'an unterminated quoted path with a glued option', source: 'See {{ "my chapter.crv@shift:1 }} end', directive: '', path: '', options: '', section: '' },
    { why: 'a glued option and no closer on the line', source: 'See {{ c.crv@shift:1 end', directive: '', path: '', options: '', section: '' },
    // A part that is neither a section nor an option is left UNSCOPED rather
    // than refused, which is this grammar family's standing reading and is why
    // these two rows keep a directive the oracle refuses. The pair is here to
    // pin that the glued spelling reads exactly like its spaced twin.
    { why: 'a glued `@` with no option name', source: 'See {{ c.crv@ }} end', directive: '{{ c.crv@ }}', oracle: '', path: 'c.crv', options: '', section: '' },
    { why: 'the spaced twin of the row above', source: 'See {{ c.crv @ }} end', directive: '{{ c.crv @ }}', oracle: '', path: 'c.crv', options: '', section: '' },
];

let pass = 0;
const fails = [];

for (const { why, source, directive, oracle: want = directive } of ROWS) {
    const oracle = findDirectives(source).map((d) => source.slice(d.start, d.end)).join('');
    if (oracle === want) pass++;
    else fails.push(`oracle: directive is ${JSON.stringify(oracle)}, row expects ${JSON.stringify(want)} - ${why}`);
}

for (const g of GRAMMARS) {
    for (const row of ROWS) {
        for (const field of ['directive', 'path', 'options', 'section']) {
            const scope = field === 'options' ? g.option : g[field];
            const got = textUnder(g, row.source, scope, field === 'options' ? '|' : '');
            const want = row[field];
            if (got === want) pass++;
            else fails.push(`${g.name}: ${field} is ${JSON.stringify(got)}, expected ${JSON.stringify(want)} - ${row.why}`);
        }
    }
}

if (fails.length) {
    console.error(`include option glue: ${fails.length} failing`);
    for (const f of fails) console.error(`  ${f}`);
    process.exit(1);
}

console.log(`include option glue: ${pass} checks pass (oracle + ${GRAMMARS.length} grammars)`);
