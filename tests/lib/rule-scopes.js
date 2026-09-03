/**
 * The construct ledger's `evidence` column, turned from a spelling into a
 * measurement.
 *
 * carve-grammars#376. `IMPLEMENTED` was satisfied by any non-empty `evidence`
 * string, and the checks around it asked only about NAMES: that the cited name
 * is declared by the grammar, and that the probe attributes that name to this
 * construct. Nothing asked the grammar to colour anything. So a rule whose name
 * plausibly covers a family recorded every member of that family as
 * implemented, whether or not it matches them - `smart_typography` names eight
 * constructs on all three grammars here, and on measurement covers five of
 * them.
 *
 * Three separate errors were sitting under that, all invisible to a name check:
 *
 *   - `smart_quote` is scoped by NONE of the three. A bare `"` reaches no rule.
 *   - `comparison` and `typographic_symbol` are recorded for TextMate, whose
 *     typography alternation carries neither (carve-grammars#374).
 *   - `braced_en_dash` IS coloured on all three, by the CriticMarkup DELETION
 *     rule - `{--}` read as `{-` plus an empty body - so the colour is right by
 *     accident and says the wrong thing (carve-grammars#378).
 *
 * The third is why this file resolves the cited rule to the scopes IT can emit
 * rather than asking whether the payload carries any scope at all. "Scoped by
 * something" would have passed `braced_en_dash` on every surface, which is the
 * weaker check the engine sweep deliberately makes for a different reason
 * (`tests/lib/constructs.js`, `engineScopes`).
 *
 * WHAT THIS CANNOT DO. Seven of the ten surfaces are other repositories. The
 * three formalisms read here - TextMate, Prism, highlight.js - are the ones a
 * checkout can be tokenized from in process, and the reader is offered for any
 * surface in that family, so a `CARVE_SURFACE_*` checkout extends the gate
 * rather than needing its own.
 *
 * @module tests/lib/rule-scopes
 */
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { SURFACES } from '../../scripts/surface-probe.mjs';

/**
 * One document per construct, and the run whose scope answers the question.
 *
 * ONE SAMPLE SERVES EVERY SURFACE, the way `tests/lib/constructs.js` uses one
 * per entry: a per-surface sample is a per-surface answer, and the point here
 * is to ask the same question of each.
 *
 * `unscopable` is the written alternative to a sample, for the constructs that
 * carry no marker of their own. It is not an exemption - a construct spelled
 * that way must not be IMPLEMENTED on a surface that scopes markers, and the
 * ledger test asserts exactly that, so the escape hatch is itself a check.
 *
 * The table is TOTAL over the derived construct list, which is what makes a new
 * spec clause force the decision here as well as in the ledger.
 */
export const SCOPE_SAMPLES = {
    heading: { sample: '# Title\n', payload: '#' },
    thematic_break: { sample: '***\n', payload: '***' },
    code_block: { sample: '```\ncode\n```\n', payload: '```' },
    blockquote: { sample: '> quoted\n', payload: '>' },
    unordered_list: { sample: '- item\n', payload: '-' },
    ordered_list: { sample: '1. item\n', payload: '1.' },
    definition_list: { sample: ':: Term\n: definition\n', payload: '::' },
    table: { sample: '| a | b |\n', payload: '|' },
    line_block: { sample: '::: |\nverse line\n:::\n', payload: '::: |' },
    local_hard_break_block: { sample: '::: \\\nline one\n:::\n', payload: '::: \\' },
    figure_group: { sample: '::: figure\ntext\n:::\n', payload: '::: figure' },
    admonition: { sample: '::: note\ntext\n:::\n', payload: '::: note' },
    div: { sample: ':::\ntext\n:::\n', payload: ':::' },
    comment_block: { sample: '%%%\nhidden\n%%%\n', payload: '%%%' },
    comment_line: { sample: '%% note\n', payload: '%%' },
    raw_block: { sample: '```=html\n<b>x</b>\n```\n', payload: '=html' },
    reference_definition: { sample: '[ref]: https://x.de\n', payload: '[ref]' },
    footnote_definition: { sample: '[^1]: note\n', payload: '[^1]' },
    abbreviation_definition: { sample: '*[HTML]: HyperText\n', payload: '*[HTML]' },
    paragraph: { unscopable: 'a paragraph is the ABSENCE of a block marker' },
    block_attributes: { sample: '{#id .class}\n# H\n', payload: '#id' },
    blank_line: { unscopable: 'a blank line carries no marker of its own' },
    escaped_char: { sample: 'a \\* b\n', payload: '\\*' },
    raw_inline: { sample: 'a `<b>x</b>`{=html} z\n', payload: '{=html}' },
    literal_inline: { sample: 'a !`x` z\n', payload: '!`' },
    code_span: { sample: 'a `code` b\n', payload: 'code' },
    autolink: { sample: 'a <https://example.com> b\n', payload: 'https://example.com' },
    auto_text_link: { sample: 'a </#some-id> b\n', payload: '#some-id' },
    inline_link: { sample: '[text](https://x.de)\n', payload: 'https://x.de' },
    reference_link: { sample: 'a [text][ref] b\n', payload: 'ref' },
    collapsed_reference_link: { sample: 'a [text][] b\n', payload: 'text' },
    inline_span: { sample: 'a [span]{.c} b\n', payload: 'span' },
    inline_image: { sample: '![alt](img.jpg)\n', payload: '![' },
    reference_image: { sample: 'a ![alt][ref] b\n', payload: '![' },
    collapsed_reference_image: { sample: 'a ![alt][] b\n', payload: '![' },
    math_inline: { sample: 'a $`x^2` b\n', payload: '$`' },
    math_display: { sample: 'a $$`x^2` b\n', payload: '$$`' },
    emphasis: { sample: 'some /italic/ text\n', payload: 'italic' },
    strong: { sample: 'some *bold* text\n', payload: 'bold' },
    bold_italic: { sample: 'some /*both*/ text\n', payload: 'both' },
    underline: { sample: 'some _under_ text\n', payload: 'under' },
    strikethrough: { sample: 'some ~strike~ text\n', payload: 'strike' },
    highlight: { sample: 'a =mark= b\n', payload: 'mark' },
    forced_emphasis: { sample: 'a{/b/}c\n', payload: 'b' },
    forced_strong: { sample: 'foo{*bar*}baz\n', payload: 'bar' },
    forced_underline: { sample: 'my{_path_}name\n', payload: 'path' },
    forced_strike: { sample: 'x{~gone~}y\n', payload: 'gone' },
    forced_super: { sample: 'mc{^2^} end\n', payload: '2' },
    forced_sub: { sample: 'H{,2,}O\n', payload: '2' },
    forced_highlight: { sample: 'wo{=mark=}rd\n', payload: 'mark' },
    reference_footnote: { sample: 'a [^1] b\n', payload: '[^1]' },
    inline_footnote: { sample: 'a ^[inline note] b\n', payload: 'inline note' },
    extension_inline: { sample: 'a :kbd[Ctrl] b\n', payload: ':kbd' },
    addition: { sample: 'a {+ins+} b\n', payload: 'ins' },
    deletion: { sample: 'a {-del-} b\n', payload: 'del' },
    substitution: { sample: 'a {~old~>new~} b\n', payload: 'old' },
    editorial_comment: { sample: 'a {#note#} b\n', payload: 'note' },
    mention: { sample: 'hi @jane there\n', payload: '@jane' },
    tag: { sample: 'see #release here\n', payload: '#release' },
    symbol: { sample: 'a :smile: b\n', payload: ':smile:' },
    em_dash: { sample: 'a --- b\n', payload: '---' },
    en_dash: { sample: 'a -- b\n', payload: '--' },
    braced_en_dash: { sample: 'a {--} b\n', payload: '{--}' },
    ellipsis: { sample: 'a ... b\n', payload: '...' },
    smart_quote: { sample: 'she said "hi"\n', payload: '"' },
    arrow: { sample: 'a --> b\n', payload: '-->' },
    comparison: { sample: 'a != b\n', payload: '!=' },
    typographic_symbol: { sample: 'a (c) b\n', payload: '(c)' },
    inline_comment: { sample: 'text %% note\n', payload: '%%' },
    braced_comment: { sample: 'a {% c %} b\n', payload: '{%' },
    hard_break: { sample: 'line\\\nnext\n', payload: '\\' },
    soft_break: { unscopable: 'a newline inside a paragraph carries no marker' },
};

/*
 * A FLOOR ON HOW MANY ROWS THE GATE ACTUALLY MEASURES, per surface.
 *
 * The same failure `MIN_ASSERTABLE` guards in `tests/lib/constructs.js`: this
 * check runs over the IMPLEMENTED rows, so a ledger that stopped calling
 * anything implemented would leave it asserting nothing and printing a tick.
 * Today's counts, and lowering one is a decision made in a diff.
 */
export const MIN_ATTRIBUTED = {
    textmate: 65,
    prism: 67,
    highlightjs: 67,
};

/** The separator between the names in one leaf's scope, per formalism. */
const SEPARATOR = { tmlanguage: ' ', prism: '>', hljs: ' ' };

/** TextMate's own root scope, which every token carries and no rule earns. */
const TEXTMATE_ROOT = /^(?:source|text)\./;

/** Every `name` / `contentName` under one node of a TextMate grammar. */
function tmScopesUnder(node, out = new Set()) {
    if (Array.isArray(node)) {
        node.forEach((item) => tmScopesUnder(item, out));
    } else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
            if ((key === 'name' || key === 'contentName') && typeof value === 'string') out.add(value);
            else tmScopesUnder(value, out);
        }
    }

    return out;
}

/**
 * The text of one `const NAME = ...` declaration, string- and regex-aware.
 *
 * A depth counter alone cannot read this file: `begin: /\{\*(?=\S)/` holds an
 * escaped brace with no partner, so a naive scan never returns to depth zero
 * and swallows the rest of the module. Comments, strings, template literals and
 * regex literals are therefore skipped rather than counted.
 *
 * @param {string} source - the grammar module's text.
 * @param {number} from - the index just past the `=`.
 * @returns {string} the initializer, up to the statement's own semicolon.
 */
function statementFrom(source, from) {
    let at = from;
    let depth = 0;
    // A `/` opens a regex when what precedes it cannot end an expression.
    const opensRegex = () => {
        for (let back = at - 1; back >= 0; back--) {
            if (/\s/.test(source[back])) continue;

            return '=(,:[!&|?{};+-*%<>~^'.includes(source[back]);
        }

        return true;
    };

    while (at < source.length) {
        const char = source[at];
        if (char === '/' && source[at + 1] === '/') {
            while (at < source.length && source[at] !== '\n') at++;
            continue;
        }
        if (char === '/' && source[at + 1] === '*') {
            const close = source.indexOf('*/', at + 2);
            at = close < 0 ? source.length : close + 2;
            continue;
        }
        if (char === '/' && opensRegex()) {
            at++;
            let inClass = false;
            while (at < source.length) {
                const inner = source[at];
                if (inner === '\\') { at += 2; continue; }
                if (inner === '[') inClass = true;
                else if (inner === ']') inClass = false;
                else if (inner === '/' && !inClass) { at++; break; }
                else if (inner === '\n') break;
                at++;
            }
            continue;
        }
        if (char === "'" || char === '"' || char === '`') {
            at++;
            while (at < source.length) {
                if (source[at] === '\\') { at += 2; continue; }
                if (source[at] === char) { at++; break; }
                at++;
            }
            continue;
        }
        if ('{(['.includes(char)) { depth++; at++; continue; }
        if ('})]'.includes(char)) { depth--; at++; continue; }
        if (char === ';' && depth <= 0) return source.slice(from, at);
        at++;
    }

    return source.slice(from);
}

/** The scope keys a highlight.js mode may set. */
const HLJS_SCOPE_KEY = /\b(?:className|scope|beginScope|endScope)\s*:\s*'([^']+)'/g;

/**
 * A reader that resolves one grammar's rule name to the scopes it can emit.
 *
 * @param {string} id - a surface id from `scripts/surface-probe.mjs`.
 * @param {string} root - the checkout the surface's files live in.
 * @returns {{separator: string, scopesOf: (rule: string) => (Set<string>|null)}|null}
 *   the reader, or null for a formalism this module does not read.
 */
export function scopeReader(id, root) {
    const surface = SURFACES[id];
    if (!surface) return null;
    const separator = SEPARATOR[surface.extract];
    if (!separator) return null;
    const text = readFileSync(resolvePath(root, surface.files[0]), 'utf8');

    if (surface.extract === 'tmlanguage') {
        const grammar = JSON.parse(text);
        const declared = tmScopesUnder(grammar);

        return {
            separator,
            // The evidence is a repository key OR a scope name - the extractor
            // in `scripts/surface-probe.mjs` reads both as vocabulary, and the
            // committed ledger cites both.
            scopesOf(rule) {
                const node = (grammar.repository || {})[rule];
                if (node) return tmScopesUnder(node);

                return declared.has(rule) ? new Set([rule]) : null;
            },
        };
    }

    if (surface.extract === 'prism') {
        /*
         * Prism's leaf carries the TOKEN PATH - `figure-group>delimiter` - and
         * the evidence is a token key, so the name IS the scope. Nothing to
         * resolve; the reader answers with the name itself so the caller does
         * not need to know which formalism it is holding.
         */
        return { separator, scopesOf: (rule) => new Set([rule]) };
    }

    /*
     * highlight.js modes are `const` objects with no name of their own, so the
     * scopes one can emit are read from its declaration.
     *
     * ITS OWN SCOPE, NOT ITS CHILDREN'S. A mode's `contains` names the modes
     * that may open INSIDE it, and unioning their scopes in was measured to
     * hand `STRONG` the set `strong, emphasis` - so citing the bold rule for
     * the italic construct came back attributed, which is the whole thing this
     * file exists to refuse.
     *
     * References are followed only when the initializer declares NO scope of
     * its own, which is the one shape that needs it: a mode built by a helper
     * (`const CODE_BLOCK = fencedVerbatim(...)`) carries its scopes in the
     * helper.
     */
    const scopesOf = (rule, seen = new Set()) => {
        if (seen.has(rule)) return new Set();
        seen.add(rule);
        const declaration = new RegExp(`\\b(?:const|let|var)\\s+${rule}\\s*=(?!=)`, 'g');
        const match = declaration.exec(text);
        if (!match) return null;
        const body = statementFrom(text, declaration.lastIndex);
        const own = new Set([...body.matchAll(HLJS_SCOPE_KEY)].map((hit) => hit[1]));
        if (own.size) return own;

        const out = new Set();
        for (const reference of new Set([...body.matchAll(/\b([A-Za-z_]\w*)\b/g)].map((hit) => hit[1]))) {
            if (seen.has(reference)) continue;
            const nested = scopesOf(reference, seen);
            if (nested) for (const scope of nested) out.add(scope);
        }

        return out;
    };

    return { separator, scopesOf: (rule) => scopesOf(rule) };
}

/**
 * What the grammar actually did with one construct's sample.
 *
 * @param {object} reader - from `scopeReader`.
 * @param {(source: string) => Array<{scope: (string|null), text: string}>} tokenize -
 *   the surface's tokenizer.
 * @param {{sample: string, payload: string}} sample - the construct's document.
 * @param {string} evidence - the rule the ledger cites.
 * @returns {{verdict: 'attributed'|'other-rule'|'unscoped'|'unresolved', got: string[], allowed: string[]}}
 *   `unresolved` says the cited name is not a rule this reader can read, which
 *   is a failure and never a pass - a reader that cannot resolve a name cannot
 *   refute it either.
 */
export function attribute(reader, tokenize, sample, evidence) {
    const allowed = reader.scopesOf(evidence);
    if (allowed === null) return { verdict: 'unresolved', got: [], allowed: [] };

    const start = sample.sample.indexOf(sample.payload);
    if (start < 0) throw new Error(`sample does not contain ${JSON.stringify(sample.payload)}`);
    const end = start + sample.payload.length;

    let at = 0;
    const got = new Set();
    let attributed = false;
    for (const leaf of tokenize(sample.sample)) {
        const from = at;
        at += leaf.text.length;
        if (at <= start || from >= end) continue;
        for (const name of (leaf.scope || '').split(reader.separator)) {
            if (!name || TEXTMATE_ROOT.test(name)) continue;
            got.add(name);
            if (allowed.has(name)) attributed = true;
        }
    }

    return {
        verdict: attributed ? 'attributed' : (got.size ? 'other-rule' : 'unscoped'),
        got: [...got],
        allowed: [...allowed],
    };
}

/**
 * Whether the grammar REFUSES the claim that `rule` covers a construct.
 *
 * One predicate, used by the seeder and by the ledger test, because the two
 * have to agree about what a refusal is: a seeder that demoted rows the test
 * then called stale would make every re-measurement a failing run.
 *
 * A construct with no sample - one spelled `unscopable` - is never refused.
 * Neither is `unresolved`: a reader that cannot resolve the cited name has
 * measured nothing, and treating that as a refusal turns a broken reader into a
 * page of fresh gaps.
 *
 * @param {object} reader - from `scopeReader`.
 * @param {(source: string) => Array<{scope: (string|null), text: string}>} tokenize -
 *   the surface's tokenizer.
 * @returns {(name: string, rule: string) => boolean} the predicate.
 */
export function refusal(reader, tokenize) {
    return (name, rule) => {
        const sample = SCOPE_SAMPLES[name];
        if (!sample || sample.unscopable) return false;
        const { verdict } = attribute(reader, tokenize, sample, rule);

        return verdict === 'unscoped' || verdict === 'other-rule';
    };
}
