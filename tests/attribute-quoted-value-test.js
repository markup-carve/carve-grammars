/**
 * A quoted attribute value is one value, whatever it holds.
 *
 *   key_value_attribute = identifier, '=', attribute_value ;
 *   attribute_value = unquoted_value | quoted_value ;
 *
 * Prism tokenized inside the attribute block with `id`, `class-name`,
 * `attr-name` and `language` ahead of `string`, so `title="a .b #c"` came out
 * as a class and an id inside the value. Every row here must leave the quoted
 * run as a single token with a single scope, on all three grammars.
 */
import { createHighlighter } from './lib/shiki.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { carveToHtml } from '@markup-carve/carve';

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

// `whole` is the scope the quoted run must carry in full on that surface.
const GRAMMARS = [
    { name: 'textmate', leaves: textmateLeaves, whole: (s) => s.includes('meta.attributes') },
    { name: 'prism', leaves: prismTokens, whole: (s) => s === 'attributes>attr-value>string' },
    { name: 'highlight.js', leaves: hljsLeaves, whole: (s) => s.includes('attr') },
];

// `html` is a fragment the engine must render, proving the row is a quoted value.
const ROWS = [
    { why: 'plain words - the control', source: '[t]{title="a b"}\n', quoted: '"a b"', html: 'title="a b"' },
    { why: 'a class and an id after a space', source: '[t]{title="a .b #c"}\n', quoted: '"a .b #c"', html: 'title="a .b #c"' },
    { why: 'single quotes on a block', source: "{title='x .y'}\npara\n", quoted: "'x .y'", html: 'title="x .y"' },
    { why: 'a real class after the value', source: '[t]{title="a .b" .real}\n', quoted: '"a .b"', html: 'title="a .b"' },
    { why: 'a key=value spelling inside', source: '[t]{title="k=v"}\n', quoted: '"k=v"', html: 'title="k=v"' },
    { why: 'a language spelling inside', source: '[t]{title="a :en"}\n', quoted: '"a :en"', html: 'title="a :en"' },
    { why: 'an escaped quote, then a class', source: '[t]{title="a \\" .b"}\n', quoted: '"a \\" .b"', html: 'title="a &quot; .b"' },
    { why: 'braces inside', source: '[t]{title="a {b} c"}\n', quoted: '"a {b} c"', html: 'title="a {b} c"' },
];

let pass = 0;
const fails = [];

for (const { why, source, html } of ROWS) {
    const out = carveToHtml(source);
    if (out.includes(html)) pass++;
    else fails.push(`engine: ${JSON.stringify(out)} lacks ${JSON.stringify(html)} - ${why}`);
}

for (const g of GRAMMARS) {
    for (const { why, source, quoted } of ROWS) {
        const from = source.indexOf(quoted);
        const to = from + quoted.length;
        let at = 0;
        const scopes = new Set();
        for (const t of g.leaves(source)) {
            const start = at;
            at += t.text.length;
            if (at > from && start < to) scopes.add(t.scope ?? '');
        }
        const [only] = scopes;
        if (scopes.size === 1 && g.whole(only)) pass++;
        else fails.push(`${g.name}: ${JSON.stringify(quoted)} carries ${JSON.stringify([...scopes])} - ${why}`);
    }
}

if (fails.length) {
    console.error(`attribute quoted value: ${fails.length} failing`);
    for (const f of fails) console.error(`  ${f}`);
    process.exit(1);
}

console.log(`attribute quoted value: ${pass} checks pass (engine + ${GRAMMARS.length} grammars)`);
