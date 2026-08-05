/**
 * Cross-engine construct sweep for the Prism and highlight.js grammars.
 *
 * The snapshot tests pin whatever the grammars currently do -- so a construct
 * with NO rule at all snapshots happily as unscoped text, and a construct
 * claimed by the WRONG rule snapshots happily under the wrong scope. Both went
 * unnoticed that way: the forced brace family (`{_path_}`, `{/a/b/}`) had no
 * rules in either engine and was being swallowed by the attribute rule.
 *
 * This sweep asserts two engine-agnostic invariants over every construct, so a
 * missing or mis-ordered rule fails instead of being pinned:
 *
 *   1. COVERED   -- the construct's payload text carries some scope (it is not
 *                   plain text).
 *   2. NOT-ATTRS -- it is not scoped as an attribute block, unless it IS one.
 *                   This is the failure mode the `{...}` family keeps hitting:
 *                   the attribute rule opens on any brace and steals the span.
 *
 * Deliberately NOT asserting exact scope names: Prism and highlight.js use
 * different vocabularies, and pinning those is what the snapshots are for. The
 * TextMate sweep asserts the name, over the SAME inventory - see
 * `tests/lib/constructs.js`, which is the one list both sweeps consume.
 */
import { prismTokens, hljsTokens } from './lib/engines.js';
import { CONSTRUCTS, LITERALS, assertInventory } from './lib/constructs.js';

const ATTR_SCOPE = /attr/i;

function check(engineName, tokenize) {
    let pass = 0;
    const fails = [];
    const skipped = CONSTRUCTS.filter((c) => c.skip?.[engineName]);
    const applicable = CONSTRUCTS.filter((c) => !c.skip?.[engineName]);
    assertInventory(`${engineName} sweep`, applicable.length);

    for (const construct of applicable) {
        const { name, sample, attr } = construct;
        const payload = construct.enginePayload ?? construct.payload;
        const tokens = tokenize(sample);
        // every token whose text overlaps the payload
        const hits = tokens.filter((t) => t.text.includes(payload) || payload.includes(t.text.trim()) && t.text.trim() !== '');
        const carrying = hits.filter((t) => t.scope);
        const covered = carrying.length > 0;
        const attrScoped = carrying.some((t) => ATTR_SCOPE.test(t.scope));

        let problem = null;
        if (!covered) problem = 'NOT SCOPED (no rule matches it)';
        else if (!attr && attrScoped) problem = `scoped as an ATTRIBUTE block (${carrying.find((t) => ATTR_SCOPE.test(t.scope)).scope})`;
        else if (attr && !attrScoped) problem = 'attribute construct is NOT scoped as attributes';

        if (problem) {
            const dump = tokens.map((t) => `${JSON.stringify(t.text)}:${t.scope ?? '-'}`).join(' | ');
            fails.push(`FAIL [${engineName}] ${name}  ${problem}\n   payload: ${JSON.stringify(payload)}\n   got: ${dump.slice(0, 300)}`);
        } else pass++;
    }

    console.log(`  ${fails.length ? '✗' : '✓'} ${engineName} sweep: ${pass}/${applicable.length} constructs scoped correctly`);
    // A skip is a decision, so it is reported every run rather than quietly
    // shrinking the denominator.
    for (const c of skipped) console.log(`    - skipped ${c.name}: ${c.skip[engineName]}`);
    fails.forEach((f) => console.log(f + '\n'));
    return fails.length;
}

/**
 * The counter-examples: a shape that resembles a construct but is prose must
 * NOT carry that construct's scope. A positive case cannot catch an over-eager
 * rule, since the valid and the invalid shape differ only in their tail.
 *
 * @param {string} engineName - which grammar is being checked.
 * @param {Function} tokenize - its tokenizer from ./lib/engines.js.
 * @returns {number} how many literals were mis-scoped.
 */
function checkLiterals(engineName, tokenize) {
    const fails = [];
    for (const { name, sample, payload, scopes } of LITERALS) {
        const selector = scopes[engineName];
        const wrong = tokenize(sample)
            .filter((t) => t.text.includes(payload) && t.scope?.includes(selector));
        if (wrong.length) {
            fails.push(`FAIL(neg) [${engineName}] ${name}: ${JSON.stringify(payload)} scoped as ${wrong[0].scope}`
                + `\n   source: ${JSON.stringify(sample)}`);
        }
    }
    console.log(`  ${fails.length ? '✗' : '✓'} ${engineName}: ${LITERALS.length - fails.length}/${LITERALS.length} literal shapes stay unscoped`);
    fails.forEach((f) => console.log(f + '\n'));
    return fails.length;
}

console.log('carve-grammars engine sweep:');
const failed = check('prism', prismTokens) + check('highlightjs', hljsTokens)
    + checkLiterals('prism', prismTokens) + checkLiterals('highlightjs', hljsTokens);
if (failed) {
    console.error(`\n${failed} construct(s) mis-scoped. A construct must carry a scope, must not be`);
    console.error('claimed by the attribute rule unless it is an attribute block, and a shape that only');
    console.error('resembles a construct must not carry its scope.');
    process.exit(1);
}
