/*
 * A CLOSER MAY NOT STAND AFTER WHITESPACE.
 *
 * `bare_closer` in grammar.ebnf requires a non-space character in front of the
 * delimiter, which is the mirror of the `(?=\S)` every bare opener carries. The
 * engine therefore renders `a *b * d` literally, and highlight.js coloured it -
 * on ALL FIVE bare delimiters, because every one of them is built by the same
 * `paired()` helper (carve-grammars#392). One gap with five spellings.
 *
 * THE NINE BRACED CONSTRUCTS ARE THE CONTROL, not an afterthought. The engine
 * BUILDS `a {*b *} d`, so the same guard applied there would turn an over-scope
 * into an under-scope. They are asserted here so a future widening of the
 * helper that catches them fails this file rather than shipping.
 *
 * WHY highlight.js NEEDED A THIRD MECHANISM. The other two grammars spell the
 * rule `(?<=\S)` and are correct already. highlight.js cannot:
 *
 *   - A lookbehind ANYWHERE in a mode's `end` stops it closing at all, with no
 *     error - `x =b= y` colours to end of line.
 *   - A CONSUMED flank in `end` closes correctly, but starts one column earlier,
 *     which is where the escape submode starts; it wins the tie and closes on
 *     the `\=` that carve-grammars#390 exists to refuse.
 *
 * So the false closer is EATEN by a submode instead of refused by `end`, the
 * same shape #390 uses for the escape, and the guard in `begin` does the
 * refusing. Both measured on a two-line grammar before the spelling was chosen.
 */
import assert from 'node:assert/strict';

import { carveToHtml } from '@markup-carve/carve';

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

const hljs = (await import('highlight.js')).default;
hljs.registerLanguage('carve', (await import('../highlightjs/carve.mjs')).default);

/** Does the engine build any construct here, rather than rendering it flat? */
const engineBuilds = (source) =>
    /<[a-z]/i.test(carveToHtml(source).replace(/^\s*<p>|<\/p>\s*$/g, ''));

/**
 * Does highlight.js open `className` anywhere in `source`?
 *
 * The class is asked for BY NAME rather than "did any span appear". A run of
 * `*b *` puts a span on the page either way - the question is whether this
 * grammar claims the document holds a bold run, and a generic check answers
 * yes for an unrelated token and passes the bug.
 */
const hljsScopes = (source, className) =>
    new RegExp(`<span class="hljs-${className}"`).test(hljs.highlight(source, { language: 'carve' }).value);

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };
const unescapeHtml = (s) => s.replace(/&(?:lt|gt|amp|quot|#x27|#39);/g, (m) => ENTITIES[m]);

/**
 * The source run `className` covers, delimiters included.
 *
 * Stack-aware: a nested submode pushes its own class, so reading the innermost
 * one would drop the characters the false-closer submode consumes - which are
 * exactly the characters this file is about.
 *
 * @param {string} source - the Carve document.
 * @param {string} className - the class the mode declares.
 * @returns {string} the covered source, empty when the mode never opened.
 */
function hljsCovers(source, className) {
    const { value } = hljs.highlight(source, { language: 'carve' });
    const stack = [];
    let out = '';
    const re = /<span class="([^"]*)">|<[/]span>|([^<]+)/g;
    let m;
    while ((m = re.exec(value)) !== null) {
        if (m[1] !== undefined) stack.push(m[1].replace(/^hljs-/, ''));
        else if (m[2] !== undefined) { if (stack.includes(className)) out += unescapeHtml(m[2]); }
        else stack.pop();
    }

    return out;
}

const carveDefinition = (await import('../highlightjs/carve.mjs')).default(hljs);

/*
 * [construct, opener, closer, the class the mode declares].
 *
 * The five BARE delimiters, then the nine BRACED ones. Both halves matter: the
 * bare rows are the defect and the braced rows are what must not move.
 */
const BARE = [
    ['emphasis', '/', '/', 'emphasis'],
    ['underline', '_', '_', 'emphasis'],
    ['strong', '*', '*', 'strong'],
    ['highlight', '=', '=', 'addition'],
    ['strike', '~', '~', 'deletion'],
];
const BRACED = [
    ['forced strong', '{*', '*}', 'strong'],
    ['forced emphasis', '{/', '/}', 'emphasis'],
    ['forced underline', '{_', '_}', 'emphasis'],
    ['forced strike', '{~', '~}', 'deletion'],
    ['forced highlight', '{=', '=}', 'addition'],
    ['insert', '{+', '+}', 'addition'],
    ['delete', '{-', '-}', 'deletion'],
    ['subscript', '{,', ',}', 'built_in'],
    ['superscript', '{^', '^}', 'built_in'],
];

assert.equal(BARE.length + BRACED.length, 14,
    'paired() builds fourteen modes; a row lost here is a construct measured nowhere');

console.log('a SPACE before the closer, on the five bare delimiters:');

for (const [name, open, close, className] of BARE) {
    ok(`${name}: a closer after whitespace closes nothing`, () => {
        const loose = `a ${open}b ${close} d`;
        assert.equal(engineBuilds(loose), false,
            `the engine started building ${JSON.stringify(loose)} - this row's premise is gone`);
        assert.equal(hljsScopes(loose, className), false,
            `highlight.js scopes ${className} over ${JSON.stringify(loose)}, which the engine renders flat`);
    });

    ok(`${name}: the ordinary run still colours`, () => {
        const tight = `a ${open}b${close} d`;
        assert.equal(engineBuilds(tight), true, `the engine stopped building ${JSON.stringify(tight)}`);
        assert.equal(hljsScopes(tight, className), true,
            `highlight.js no longer scopes ${JSON.stringify(tight)} - the guard took the run with it`);
    });
}

/*
 * AND THE RUN MUST STILL REACH A REAL CLOSER PAST A FALSE ONE. This is the half
 * that fails if only `end` is guarded and the `begin` guard is not taught to
 * step over the delimiter it now refuses: the engine reads `a *b * c* d` as one
 * bold run, and a grammar that stops at the middle star colours nothing.
 */
console.log('\nstepping over a false closer to reach the real one:');

for (const [name, open, close, className] of BARE) {
    ok(`${name}: a false closer inside the run does not end it`, () => {
        const source = `a ${open}b ${close} c${close} d`;
        assert.equal(engineBuilds(source), true,
            `the engine stopped building ${JSON.stringify(source)} - this row's premise is gone`);
        /*
         * THE SPAN, not just presence, and that is not belt and braces: a mode
         * that closes at the FALSE closer still scopes something, so a presence
         * check passes it. STRONG did exactly that - it re-declared its own
         * contains after spreading paired() and dropped the false-closer
         * submode, and the presence version of this row went green over the
         * half-run that left behind.
         */
        assert.equal(
            hljsCovers(source, className),
            `${open}b ${close} c${close}`,
            `highlight.js covers the wrong run in ${JSON.stringify(source)} - it closed on the `
                + 'delimiter that stands after a space instead of stepping over it',
        );
    });
}

/*
 * AND THE SUBMODE IS ACTUALLY ON EVERY FLANKED MODE.
 *
 * The rows above measure behavior, which is the right question; this one closes
 * the way that behavior BREAKS. paired() hands back a contains list, and a mode
 * that declares its own after spreading it drops the submode silently - no
 * error, and the mode still opens. Two of the five modes do declare one, so
 * this is not hypothetical; STRONG shipped that way for the length of an
 * afternoon. A structural check catches the sixth without anyone measuring it.
 */
console.log('\nevery flanked mode kept the submode paired() gave it:');

ok('each bare mode carries a false-closer submode', () => {
    const modes = [];
    const seen = new Set();
    (function walk(node) {
        if (!node || typeof node !== 'object' || seen.has(node)) return;
        seen.add(node);
        if (node.begin && node.end) modes.push(node);
        for (const key of ['contains', 'variants', 'starts']) {
            const value = node[key];
            if (Array.isArray(value)) value.forEach(walk);
            else if (value) walk(value);
        }
    })(carveDefinition);

    for (const [name, , close, className] of BARE) {
        // The BARE mode, told from its braced sibling by the brace: both carry
        // the same class and the same delimiter character.
        const found = modes.filter((m) => m.className === className
            && m.end.source.includes(close)
            && !m.end.source.includes('}'));
        assert.ok(found.length > 0, `no bare ${name} mode found - did paired() stop being used?`);
        for (const mode of found) {
            const submodes = (mode.contains ?? []).map((c) => String(c.begin ?? ''));
            assert.ok(
                submodes.some((b) => b.startsWith('/' + String.raw`\s`)),
                `the ${name} mode has no submode beginning with whitespace, so the false closer it `
                    + `is meant to eat reaches its end instead. Its contains: ${JSON.stringify(submodes)}. `
                    + 'A mode that declares contains after spreading paired() has to merge, not replace',
            );
        }
    }
});

console.log('\nthe nine braced constructs are unmoved:');

for (const [name, open, close, className] of BRACED) {
    ok(`${name}: whitespace before the closer is ordinary content`, () => {
        const loose = `a ${open}b ${close} d`;
        assert.equal(engineBuilds(loose), true,
            `the engine stopped building ${JSON.stringify(loose)} - braced bodies may hold a trailing space`);
        assert.equal(hljsScopes(loose, className), true,
            `highlight.js declines ${JSON.stringify(loose)} - the flanking guard reached a braced mode, `
                + 'where it turns an over-scope into an under-scope');
    });
}

console.log(`\n${passed} checks passed`);
