/**
 * A valueless include option is an option (carve-grammars#743). Since
 * markup-carve/carve#3326, `include_options` makes the value optional so a bare
 * `@code` (CARVE-P6-001 I1c) is well formed. Every surface scopes it the way it
 * scopes `@code:js`; `@k:` with nothing after the colon stays unscoped.
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
        value: 'constant.other.include',
        comment: 'comment',
    },
    {
        name: 'prism',
        leaves: prismTokens,
        directive: 'include-directive',
        path: 'include-path',
        option: 'include-option-name',
        value: 'include-option-value',
        comment: 'comment',
    },
    {
        name: 'highlight.js',
        leaves: hljsLeaves,
        directive: 'meta',
        path: 'meta string',
        option: 'meta keyword',
        value: 'meta literal',
        comment: 'comment',
    },
];

const textUnder = (g, source, scope, sep) => g.leaves(source)
    .filter((t) => scope.split(' ').every((s) => (t.scope ?? '').includes(s)))
    .map((t) => t.text)
    .join(sep);

// `oracle` overrides `directive` where the pinned spec's directive scanner
// predates carve#3326 and still refuses a valueless option.
const ROWS = [
    { why: 'a bare `@code`', source: '{{ src/a.js @code }}', directive: '{{ src/a.js @code }}', oracle: '', path: 'src/a.js', options: '@code', values: '' },
    { why: 'a bare `@code` glued to the path', source: '{{ src/a.js@code }}', directive: '{{ src/a.js@code }}', oracle: '', path: 'src/a.js', options: '@code', values: '' },
    { why: 'a bare `@code` before a valued option', source: '{{ a.js @code @lines:1-2 }}', directive: '{{ a.js @code @lines:1-2 }}', oracle: '', path: 'a.js', options: '@code|@lines', values: '1-2' },
    { why: 'a glued region and a valued `@code`', source: '{{ src/a.js@region:start @code:js }}', directive: '{{ src/a.js@region:start @code:js }}', path: 'src/a.js', options: '@region|@code', values: 'start|js' },
    { why: 'a valued option - the control', source: '{{ c.crv @shift:1 }}', directive: '{{ c.crv @shift:1 }}', path: 'c.crv', options: '@shift', values: '1' },
    { why: 'a colon with no value is no option', source: '{{ c.crv @shift: }}', directive: '{{ c.crv @shift: }}', oracle: '', path: 'c.crv', options: '', values: '' },
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
        for (const field of ['directive', 'path', 'options', 'values']) {
            const scope = field === 'options' ? g.option : field === 'values' ? g.value : g[field];
            const sep = field === 'options' || field === 'values' ? '|' : '';
            const got = textUnder(g, row.source, scope, sep);
            if (got === row[field]) pass++;
            else fails.push(`${g.name}: ${field} is ${JSON.stringify(got)}, expected ${JSON.stringify(row[field])} - ${row.why}`);
        }
    }

    // A region marker is an ordinary comment line; no grammar may read
    // `#region` as a tag or a section.
    const marker = '%% #region start\n\nText.\n\n%% #endregion\n';
    const got = textUnder(g, marker, g.comment, '|');
    if (got === '%% #region start|%% #endregion') pass++;
    else fails.push(`${g.name}: region markers scoped as ${JSON.stringify(got)}, expected both lines as comments`);
}

if (fails.length) {
    console.error(`include option bare: ${fails.length} failing`);
    for (const f of fails) console.error(`  ${f}`);
    process.exit(1);
}

console.log(`include option bare: ${pass} checks pass (oracle + ${GRAMMARS.length} grammars)`);
