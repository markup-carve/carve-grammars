/**
 * One production, three grammars: `abbreviation_term = (letter | digit)+`.
 *
 * `letter` is enumerated in resources/grammar.ebnf as `a`..`z` plus `A`..`Z`,
 * and `digit` as `0`..`9`. So the term is case-blind, may lead with a digit,
 * may be a digit alone, and may hold nothing else - no dot, no space, no
 * non-ASCII letter.
 *
 * This repo spelled that rule three times and got three different answers:
 * TextMate and Prism required the whole term to be uppercase, and highlight.js
 * accepted anything without a bracket. The same document therefore highlighted
 * differently depending on which target rendered it, which is the one thing a
 * multi-target grammar repo exists to prevent.
 *
 * The engines had the same spread and are fixed: carve-js required uppercase
 * (carve-js#720), carve-php crashed on a digit-only term (carve-php#880), and
 * carve-rs accepted any Unicode alphanumeric (carve-rs#660).
 *
 * The snapshots could not catch it. Every abbreviation sample in them uses an
 * uppercase multi-letter term - the one shape all the spellings agree on - so
 * they pinned the agreement and nothing else. The shapes below are chosen for
 * exactly the opposite reason: each one separates at least two of the readings.
 *
 * A rejected term matters more than it looks. An abbreviation has no marker at
 * the use site, so a line wrongly claimed as a definition is not highlighted
 * WRONG, it is highlighted as a construct that will not exist when the document
 * is rendered - the reader is told `*[e.g.]: for example` disappears, and in the
 * engines it stays as paragraph text.
 */
import { prismTokens, hljsTokens } from './lib/engines.js';
import { createHighlighter } from 'shiki';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const grammar = JSON.parse(
    readFileSync(resolve(__dirname, '../textmate/carve.tmLanguage.json'), 'utf8'),
);
const hl = await createHighlighter({
    themes: ['github-light'],
    langs: [{ ...grammar, name: 'carve' }],
});

// Each row separates at least two of the readings this test exists to unify.
const TERMS = [
    { term: 'HTML', defines: true, why: 'the shape every reading already agreed on' },
    { term: 'dl', defines: true, why: 'lowercase - rejected by the uppercase-only readings' },
    { term: 'Wm', defines: true, why: 'mixed case' },
    { term: '3D', defines: true, why: 'digit-leading' },
    { term: '9', defines: true, why: 'a digit alone is a term' },
    { term: 'e.g.', defines: false, why: 'a dot is not a letter or a digit' },
    { term: 'HTTP API', defines: false, why: 'a space is not a letter or a digit' },
    { term: 'ss', defines: true, why: 'the ASCII spelling of the row below' },
    { term: 'ß', defines: false, why: 'letter is enumerated ASCII' },
];

const line = (term) => `*[${term}]: expansion here\n`;
const opener = (term) => `*[${term}]:`;

/** Prism names the rule, so ask for it by name. */
function prismDefines(term) {
    return prismTokens(line(term)).some(
        (t) => t.scope?.includes('abbreviation-definition'),
    );
}

/**
 * highlight.js reuses `symbol` for a dozen rules, so the class name proves
 * nothing on its own. What identifies THIS rule is that it takes the whole
 * `*[term]:` opener as one scoped token.
 */
function hljsDefines(term) {
    return hljsTokens(line(term)).some(
        (t) => t.scope && t.text.startsWith(opener(term)),
    );
}

/** TextMate scope names are a contract, so this one is named exactly. */
function textmateDefines(term) {
    const tokens = hl.codeToTokens(line(term), {
        lang: 'carve',
        theme: 'github-light',
        includeExplanation: true,
    }).tokens.flat();
    return tokens.some((t) => t.explanation?.some((e) =>
        e.scopes.some((s) => s.scopeName.includes('entity.name.abbreviation')),
    ));
}

const GRAMMARS = [
    ['prism', prismDefines],
    ['highlight.js', hljsDefines],
    ['textmate', textmateDefines],
];

let pass = 0;
const fails = [];

for (const { term, defines, why } of TERMS) {
    for (const [name, probe] of GRAMMARS) {
        const got = probe(term);
        if (got === defines) {
            pass++;
            continue;
        }
        fails.push(
            `${name}: *[${term}]: is ${got ? 'a definition' : 'plain text'}, ` +
            `expected ${defines ? 'a definition' : 'plain text'} - ${why}`,
        );
    }
}

// A probe that can never say "definition" would pass every rejecting row and
// report a green grammar it never read. Each one has to answer both ways.
for (const [name, probe] of GRAMMARS) {
    if (!probe('HTML')) fails.push(`${name}: probe never finds a definition at all`);
    if (probe('!!')) fails.push(`${name}: probe calls anything a definition`);
}

if (fails.length) {
    console.error(`abbreviation term alphabet: ${fails.length} failing`);
    for (const f of fails) console.error(`  ${f}`);
    process.exit(1);
}

console.log(`abbreviation term alphabet: ${pass} checks pass across ${GRAMMARS.length} grammars`);
