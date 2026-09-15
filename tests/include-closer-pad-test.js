/**
 * An include directive needs a path and a padded closer on every surface, and
 * the closer is the first `}}` outside a quoted run.
 */
import { createHighlighter } from 'shiki';
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

// Per explanation part: a merged shiki token can hold the closer and the prose after it.
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

// `meta` sits on the directive's own span, not on its part children.
const hljsLeaves = (source) => hljsTokens(source).map((t) => ({
    scope: t.ancestors.join(' '),
    text: t.text,
}));

const GRAMMARS = [
    { name: 'textmate', leaves: textmateLeaves, directive: 'meta.directive.include' },
    { name: 'prism', leaves: prismTokens, directive: 'include-directive' },
    { name: 'highlight.js', leaves: hljsLeaves, directive: 'meta' },
];

const directiveText = (g, source) => g.leaves(source)
    .filter((t) => (t.scope ?? '').includes(g.directive))
    .map((t) => t.text)
    .join('');

const ROWS = [
    { why: 'a padded closer - the control', source: 'See {{ ch.crv }} end', directive: '{{ ch.crv }}' },
    { why: 'a tab pads the closer', source: 'See {{ ch.crv\t}} end', directive: '{{ ch.crv\t}}' },
    { why: 'the pad is a run', source: 'See {{ ch.crv   }} end', directive: '{{ ch.crv   }}' },
    { why: 'a third brace after a padded closer is prose', source: 'See {{ ch.crv }}} end', directive: '{{ ch.crv }}' },

    { why: 'no pad before the closer (#424)', source: 'See {{ ch.crv}} end', directive: '' },
    { why: 'no pad after a section', source: 'See {{ ch.crv #intro}} end', directive: '' },
    { why: 'no pad after an option', source: 'See {{ ch.crv @shift:auto}} end', directive: '' },
    { why: 'no pad, then a third brace', source: 'See {{ ch.crv}}} end', directive: '' },
    {
        why: 'an unpadded closer before a later, padded directive',
        source: 'See {{ ch.crv}} and {{ later }} end',
        directive: '{{ later }}',
    },
    {
        why: 'a padded pair inside a terminated run, then an unpadded closer',
        source: 'See {{ ch.crv @label:"a }}"}} end',
        directive: '',
    },
    {
        why: 'the padded twin of the row above is a directive',
        source: 'See {{ ch.crv @label:"a }}" }} end',
        directive: '{{ ch.crv @label:"a }}" }}',
    },
    {
        why: 'a space INSIDE the quoted run does not pad the closer',
        source: 'See {{ ch.crv @label:"a "}} end',
        directive: '',
    },

    { why: 'no path, only the pad (#434)', source: 'See {{  }} end', directive: '' },
    { why: 'a section with no path', source: 'See {{ #intro }} end', directive: '' },
    { why: 'an option with no path', source: 'See {{ @shift:1 }} end', directive: '' },
    { why: 'a lone `}` is no path', source: 'See {{ } }} end', directive: '' },
    { why: 'a lone `}` after the path', source: 'See {{ a } }} end', directive: '' },
    { why: 'a `}` in an unquoted option value', source: 'See {{ ch.crv @label:a}b }} end', directive: '' },
    { why: 'a spaced section after a path', source: 'See {{ ch.crv #intro }} end', directive: '{{ ch.crv #intro }}' },
    { why: 'a glued section after a path', source: 'See {{ ch.crv#intro }} end', directive: '{{ ch.crv#intro }}' },
    { why: 'a quoted path holding a space', source: 'See {{ "a b" }} end', directive: '{{ "a b" }}' },
];

let pass = 0;
const fails = [];

for (const { why, source, directive } of ROWS) {
    const oracle = findDirectives(source).map((d) => source.slice(d.start, d.end)).join('');
    if (oracle === directive) pass++;
    else fails.push(`oracle: directive is ${JSON.stringify(oracle)}, row expects ${JSON.stringify(directive)} - ${why}`);
}

for (const g of GRAMMARS) {
    for (const { why, source, directive } of ROWS) {
        const got = directiveText(g, source);
        if (got === directive) pass++;
        else fails.push(`${g.name}: directive is ${JSON.stringify(got)}, expected ${JSON.stringify(directive)} - ${why}`);
    }
}

if (fails.length) {
    console.error(`include closer pad: ${fails.length} failing`);
    for (const f of fails) console.error(`  ${f}`);
    process.exit(1);
}

console.log(`include closer pad: ${pass} checks pass (oracle + ${GRAMMARS.length} grammars)`);
