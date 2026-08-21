/**
 * The construct list, DERIVED from the spec's own normative grammar.
 *
 * `spec/resources/grammar.ebnf` says of itself that it is "the NORMATIVE
 * specification of Carve", and the spec repo gates it in CI. Two of its
 * productions enumerate what a document can hold:
 *
 *   block          = heading | thematic_break | code_block | ... ;
 *   inline_element = escaped_char | raw_inline | literal_inline | ... ;
 *
 * Everything a grammar surface has to recognize is an alternative of one of
 * those two, so the list is read out of them rather than typed out here. That
 * is the whole point of carve-grammars#284: a hand-written checklist is the
 * same artifact as the thing it polices, and it goes stale in exactly the case
 * that matters - whoever forgot to add the grammar rule also forgot to add the
 * checklist row. `{% ... %}` (carve#1239) landed on five surfaces and was
 * absent from the other five with nothing going red.
 *
 * ONE LEVEL OF EXPANSION, MECHANICALLY. An alternative whose own production is
 * a pure alternation of two or more bare production names is a FAMILY, and its
 * members are listed instead of it: `math` is expanded to `math_inline` and
 * `math_display` because a surface can carry one and not the other. The rule is
 * "pure alternation of bare names", not a judgement about which families are
 * interesting - a judgement is the hand-written list coming back in.
 *
 * WHAT IS NOT DERIVED HERE. The ruling asks the ledger to track a SECOND thing
 * per construct - whether a surface that recognizes it also keeps its payload
 * inert. That is a property of the surface, not of the grammar, so it is a
 * declared field on each ledger entry rather than something read out of this
 * file. Deriving "which constructs have an inert payload" from the grammar was
 * tried and abandoned: the productions state it in prose ("OPAQUE", "verbatim")
 * in some places and structurally (`math_inline = '$', code_span`) in others,
 * and every mechanical reading of it either missed `code_block` or swept in
 * half the language. A derivation that is wrong about what it derives is worse
 * than a declared field, because it reads as measured.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const GRAMMAR_PATH = resolve(here, '..', 'spec', 'resources', 'grammar.ebnf');

/** The grammar source, read once. */
const grammar = () => readFileSync(GRAMMAR_PATH, 'utf8');

/**
 * The raw text of production `name`, comments stripped.
 *
 * @param {string} src - The grammar source.
 * @param {string} name - The production name.
 * @returns {string|null} The right-hand side, or null when there is no such production.
 */
function production(src, name) {
    // Anchored at column zero: `heading = ...` at the left margin is a
    // definition, the same word inside another production's body is a
    // reference. `[\s\S]*?;` stops at the first `;`, which EBNF reserves for
    // the end of a production.
    const match = src.match(new RegExp(`^${name}[ \\t]*=([\\s\\S]*?);`, 'm'));

    return match ? match[1] : null;
}

/** Strip `(* ... *)` comments. */
const uncomment = (text) => text.replace(/\(\*[\s\S]*?\*\)/g, ' ');

/**
 * The alternatives of production `name`, or null when it has no production.
 *
 * @param {string} src - The grammar source.
 * @param {string} name - The production name.
 * @returns {string[]|null} One entry per `|`-separated alternative.
 */
function alternatives(src, name) {
    const body = production(src, name);
    if (body === null) return null;

    return uncomment(body).split('|').map((piece) => piece.trim()).filter(Boolean);
}

/** A pure alternation of two or more bare production names. */
const isFamily = (alts) => alts !== null
    && alts.length >= 2
    && alts.every((alt) => /^[a-z_][a-zA-Z0-9_]*$/.test(alt));

/**
 * Every construct the normative grammar enumerates.
 *
 * @returns {Array<{name: string, kind: 'block'|'inline', family: string|null}>}
 *   In grammar order, block constructs first.
 */
export function specConstructs() {
    const src = grammar();
    const out = [];

    for (const [kind, root] of [['block', 'block'], ['inline', 'inline_element']]) {
        const alts = alternatives(src, root);
        if (alts === null) {
            throw new Error(
                `grammar.ebnf has no "${root}" production - the derivation broke, and a broken `
                + 'derivation reports an empty checklist as success',
            );
        }
        for (const alt of alts) {
            const members = alternatives(src, alt);
            const names = isFamily(members) ? members : [alt];
            for (const name of names) {
                out.push({ name, kind, family: names.length > 1 ? alt : null });
            }
        }
    }

    return out;
}

export const constructNames = () => specConstructs().map((c) => c.name);
