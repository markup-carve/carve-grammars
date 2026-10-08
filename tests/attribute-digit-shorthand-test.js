/**
 * A shorthand id or class may open on a digit.
 *
 *   id_attribute = '#', explicit_identifier ;
 *   class_attribute = '.', explicit_identifier ;
 *   explicit_identifier = (letter | digit | '_'), {letter | digit | '_' | '-'} ;
 *
 * Every surface spelled the shorthand `[.#][A-Za-z_]`, the `identifier` class,
 * so `{#2024-plan}` and `{.2024}` were not attribute blocks anywhere. A bare
 * key stays `identifier` (`key_value_attribute`), so `{2=v}` stays literal.
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

const GRAMMARS = [
    { name: 'textmate', leaves: textmateLeaves, attr: 'meta.attributes' },
    { name: 'prism', leaves: prismTokens, attr: 'attributes' },
    { name: 'highlight.js', leaves: hljsLeaves, attr: 'attr' },
];

const attrText = (g, source) => g.leaves(source)
    .filter((t) => (t.scope ?? '').includes(g.attr))
    .map((t) => t.text)
    .join('');

// `html` is what the engine must render for the row to be a valid attribute.
const ROWS = [
    { why: 'block id, letter-leading - the control', source: '{#plan}\npara\n', payload: '#plan', html: 'id="plan"' },
    { why: 'block id', source: '{#2024-plan}\npara\n', payload: '#2024-plan', html: 'id="2024-plan"' },
    { why: 'block class', source: '{.2024}\npara\n', payload: '.2024', html: 'class="2024"' },
    { why: 'span id', source: '[x]{#2024-plan}\n', payload: '#2024-plan', html: 'id="2024-plan"' },
    { why: 'span class', source: '[x]{.2024}\n', payload: '.2024', html: 'class="2024"' },
    { why: 'bullet item id', source: '-{#2024-plan} item\n', payload: '#2024-plan', html: 'id="2024-plan"' },
    { why: 'bullet item class', source: '-{.2024} item\n', payload: '.2024', html: 'class="2024"' },
    { why: 'ordered item id', source: '1.{#7a} item\n', payload: '#7a', html: 'id="7a"' },
    { why: 'ordered item class', source: '1.{.2024} item\n', payload: '.2024', html: 'class="2024"' },
    { why: 'a digit-first KEY stays literal', source: '[x]{2=v}\n', payload: '', html: null },
];

let pass = 0;
const fails = [];

for (const { why, source, html } of ROWS) {
    const out = carveToHtml(source);
    const ok = html === null ? !/\b(?:id|class)="/.test(out) && !out.includes('2="') : out.includes(html);
    if (ok) pass++;
    else fails.push(`engine: ${JSON.stringify(out)} - ${why}`);
}

for (const g of GRAMMARS) {
    for (const { why, source, payload } of ROWS) {
        const got = attrText(g, source);
        const ok = payload === '' ? got === '' : got.includes(payload);
        if (ok) pass++;
        else fails.push(`${g.name}: attribute text is ${JSON.stringify(got)}, expected it to hold ${JSON.stringify(payload)} - ${why}`);
    }
}

// Prism also scopes the shorthand item itself inside the block.
for (const { why, source, payload } of ROWS) {
    if (!payload) continue;
    const inner = payload.startsWith('#') ? 'id' : 'class-name';
    const hit = prismTokens(source).some((t) => t.text === payload && (t.scope ?? '').endsWith(inner));
    if (hit) pass++;
    else fails.push(`prism: no ${inner} token spelling ${JSON.stringify(payload)} - ${why}`);
}

// A dot or hash inside a value is not an item: `widths=33.3` must stay one value.
for (const source of ['[x]{widths=33.3,66.7}\n', '[x]{k=a#1}\n']) {
    const stray = prismTokens(source).filter((t) => /(?:^|>)(?:id|class-name)$/.test(t.scope ?? ''));
    if (stray.length === 0) pass++;
    else fails.push(`prism: ${JSON.stringify(stray.map((t) => t.text))} scoped as an item inside a value in ${JSON.stringify(source)}`);
}

if (fails.length) {
    console.error(`attribute digit shorthand: ${fails.length} failing`);
    for (const f of fails) console.error(`  ${f}`);
    process.exit(1);
}

console.log(`attribute digit shorthand: ${pass} checks pass (engine + ${GRAMMARS.length} grammars)`);
