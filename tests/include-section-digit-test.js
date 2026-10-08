/**
 * An include section selector may open on a digit.
 *
 *   include_section = id_attribute ;
 *   id_attribute = '#', explicit_identifier ;
 *   explicit_identifier = (letter | digit | '_'), {letter | digit | '_' | '-'} ;
 *
 * Since carve 0.1.8 the selector is `id_attribute`, not `identifier`, so
 * `#2024-plan` is a selector. Every surface spelled it `#[A-Za-z_]...`, and the
 * old fixtures all used letter-leading ids, so nothing could see the gap.
 * Both the spaced and the glued spelling are asserted, because they fail
 * differently: the glued one lost the whole directive.
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
    { name: 'textmate', leaves: textmateLeaves, directive: 'meta.directive.include', section: 'entity.name.section.include' },
    { name: 'prism', leaves: prismTokens, directive: 'include-directive', section: 'include-section' },
    // `symbol` is the section's class; nothing else in these samples emits it.
    { name: 'highlight.js', leaves: hljsLeaves, directive: 'meta', section: 'symbol' },
];

const scoped = (g, source, scope) => g.leaves(source)
    .filter((t) => (t.scope ?? '').includes(scope))
    .map((t) => t.text)
    .join('');

const ROWS = [
    { why: 'a letter-leading id, spaced - the control', source: 'See {{ ch.crv #intro }} end', section: 'intro' },
    { why: 'a letter-leading id, glued - the control', source: 'See {{ ch.crv#intro }} end', section: 'intro' },
    { why: 'a digit-leading id, spaced', source: 'See {{ chapter.crv #2024-plan }} end', section: '2024-plan' },
    { why: 'a digit-leading id, glued', source: 'See {{ chapter.crv#2024-plan }} end', section: '2024-plan' },
    { why: 'an all-digit id', source: 'See {{ ch.crv #7 }} end', section: '7' },
    { why: 'a digit-leading id before an option', source: 'See {{ ch.crv #2024-plan @shift:1 }} end', section: '2024-plan' },
];

let pass = 0;
const fails = [];

for (const { why, source, section } of ROWS) {
    const found = findDirectives(source);
    const got = found.length === 1 ? found[0].section : null;
    if (got === section) pass++;
    else fails.push(`oracle: section is ${JSON.stringify(got)}, row expects ${JSON.stringify(section)} - ${why}`);
}

for (const g of GRAMMARS) {
    for (const { why, source, section } of ROWS) {
        const open = source.indexOf('{{');
        const directive = source.slice(open, source.indexOf('}}', open) + 2);
        const gotDirective = scoped(g, source, g.directive);
        if (gotDirective === directive) pass++;
        else fails.push(`${g.name}: directive is ${JSON.stringify(gotDirective)}, expected ${JSON.stringify(directive)} - ${why}`);
        const gotSection = scoped(g, source, g.section);
        if (gotSection === `#${section}`) pass++;
        else fails.push(`${g.name}: section is ${JSON.stringify(gotSection)}, expected ${JSON.stringify(`#${section}`)} - ${why}`);
    }
}

if (fails.length) {
    console.error(`include section digit: ${fails.length} failing`);
    for (const f of fails) console.error(`  ${f}`);
    process.exit(1);
}

console.log(`include section digit: ${pass} checks pass (oracle + ${GRAMMARS.length} grammars)`);
