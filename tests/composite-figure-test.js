/**
 * Composite figures, in all three grammars at once (PART 9 §4c,
 * markup-carve/carve#1215).
 *
 * A BARE `::: figure` opener - the fence, its separator, the kind word, and
 * NOTHING else - is ONE figure of ordered panels. An opener that carries a
 * quoted title or a `[label]` is not that production at all: it stays a generic
 * Tier-2 container. A highlighting grammar does not build the figure-group
 * model, but it does have to tell those two readings apart, because they are
 * different constructs that differ only in the tail of one line.
 *
 * That is why this file exists next to the two sweeps rather than inside them.
 * `tests/engine-sweep-test.js` asks whether a payload is scoped AT ALL, which
 * every one of these lines is either way; `tests/textmate-sweep-test.js` asks
 * for one scope on one payload, which cannot express "this opener and that
 * opener must scope DIFFERENTLY". Both inventories carry the two openers as
 * well (a construct and a literal each), so a grammar that stops scoping the
 * bare form, or starts scoping the titled one as a group, fails there too. What
 * only this file can see is the pair, in one document, in every grammar.
 *
 * The cases below are the shapes the corpus category pins:
 *
 *   - the bare opener with captioned panels and the group caption after the
 *     closing fence, which is §4's sixth host;
 *   - the titled and the labelled opener, which stay generic containers;
 *   - a bare opener INSIDE an open group, which degrades to a generic container
 *     because groups do not nest (318-composite-figures-9);
 *   - a group that follows another container, and a second group in the same
 *     document. Those two are not decoration: highlight.js reads a mode's
 *     `contains` before its own `end`, so a container's closing fence used to
 *     open a phantom nested container and every group after the first in a
 *     document scoped generic. Nothing in either sweep could see it, because
 *     each of their samples holds exactly one container.
 */
import { createHighlighter } from 'shiki';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { prismTokens, hljsTokens } from './lib/engines.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const grammar = JSON.parse(
    readFileSync(resolve(__dirname, '../textmate/carve.tmLanguage.json'), 'utf8'),
);
const shiki = await createHighlighter({
    themes: ['github-light'],
    langs: [{ ...grammar, name: 'carve' }],
});

/** TextMate tokens, flattened into the `{ scope, text }` shape engines.js uses. */
function textmateTokens(source) {
    const { tokens } = shiki.codeToTokens(source, {
        lang: 'carve',
        theme: 'github-light',
        includeExplanation: 'scopeName',
    });
    return tokens.flat().map((tk) => ({
        text: tk.content ?? '',
        scope: (tk.explanation ?? [])
            .flatMap((e) => e.scopes.map((s) => s.scopeName))
            .filter((s) => s !== 'source.carve')
            .join(','),
    }));
}

/*
 * How each grammar SAYS "composite figure", "generic container" and "caption".
 *
 * The vocabularies differ on purpose - Prism nests token names, highlight.js
 * emits one class, TextMate emits a scope stack - so the reading is per engine
 * and the cases below are shared. `null` from a reader means "neither", which a
 * case can assert too: it is the answer for a line no rule claims.
 *
 * Each reader names the scope the DELIMITER rule puts on the kind word, never
 * the container's outer `meta` scope. A nested opener carries both - it sits
 * inside the group whose body it is - so a reader that matched anywhere in the
 * stack answered "group" for the inner opener of `::: figure` > `:::: figure`
 * and could not have failed the one case it is here for.
 */
const ENGINES = [
    {
        name: 'prism',
        tokenize: prismTokens,
        container: (scope) =>
            (scope?.includes('figure-group-delimiter') && 'group') ||
            (scope?.includes('div-delimiter') && 'generic') ||
            null,
        isCaption: (scope) => Boolean(scope?.includes('caption')),
    },
    {
        name: 'highlightjs',
        tokenize: hljsTokens,
        container: (scope) => (scope === 'section' && 'group') || (scope === 'keyword' && 'generic') || null,
        isCaption: (scope) => scope === 'title',
    },
    {
        name: 'textmate',
        tokenize: textmateTokens,
        container: (scope) =>
            (scope?.includes('entity.name.tag.figure-group') && 'group') ||
            (scope?.includes('entity.name.tag.admonition') && 'generic') ||
            null,
        isCaption: (scope) => Boolean(scope?.includes('caption')),
    },
];

/*
 * `openers` reads left to right over every token whose text holds the kind word,
 * so a case states what each `::: figure` line in it is, in source order. No
 * sample writes `figure` anywhere else - not in a title, not in a caption - so
 * the Nth hit is the Nth opener in all three engines even though they split the
 * line differently.
 *
 * `captions` is the same idea for the `^ ` lines, and it is what pins the group
 * caption's POSITION: the line after the closing fence.
 */
const CASES = [
    {
        name: 'a bare opener with two captioned panels and a group caption',
        source: '::: figure\n![one](a.png)\n^ (a) One\n\n![two](b.png)\n^ (b) Two\n:::\n^ Figure #: Group caption\n',
        openers: ['group'],
        captions: 3,
    },
    {
        name: 'a quoted title makes it a generic container',
        source: '::: figure "Panel set"\n![one](a.png)\n^ (a) One\n:::\n^ Not a group caption\n',
        openers: ['generic'],
        captions: 2,
    },
    {
        name: 'a [label] makes it a generic container',
        source: '::: figure [g]\nBody.\n:::\n',
        openers: ['generic'],
        captions: 0,
    },
    {
        name: 'a bare opener inside an open group does not nest',
        source: '::: figure\n:::: figure\n![one](a.png)\n^ (a) One\n::::\n:::\n^ Figure #: Outer only\n',
        openers: ['group', 'generic'],
        captions: 2,
    },
    {
        name: 'a group inside another container kind is still a group',
        source: '::: note\n:::: figure\n![x](x.png)\n^ (a) X\n::::\n:::\n',
        openers: ['group'],
        captions: 1,
    },
    {
        name: 'a group after a closed container is still a group',
        source: '::: note\nBody text.\n:::\n\n::: figure\n![x](x.png)\n^ (a) X\n:::\n^ Figure #: Second\n',
        openers: ['group'],
        captions: 2,
    },
    {
        name: 'two groups in one document',
        source: '::: figure\n![a](a.png)\n^ (a) A\n:::\n^ Figure #: First\n\n::: figure\n![b](b.png)\n^ (b) B\n:::\n^ Figure #: Second\n',
        openers: ['group', 'group'],
        captions: 4,
    },
];

const fails = [];
let pass = 0;

for (const engine of ENGINES) {
    for (const { name, source, openers, captions } of CASES) {
        const tokens = engine.tokenize(source);
        const dump = () =>
            tokens
                .filter((t) => t.text.trim())
                .map((t) => `${JSON.stringify(t.text)}:${t.scope ?? '-'}`)
                .join(' | ')
                .slice(0, 400);

        const got = tokens.filter((t) => t.text.includes('figure')).map((t) => engine.container(t.scope));
        if (JSON.stringify(got) === JSON.stringify(openers)) {
            pass++;
        } else {
            fails.push(
                `FAIL [${engine.name}] ${name}\n   openers read ${JSON.stringify(got)}, ` +
                    `expected ${JSON.stringify(openers)}\n   got: ${dump()}`,
            );
        }

        const gotCaptions = tokens.filter((t) => engine.isCaption(t.scope) && t.text.includes('^')).length;
        if (gotCaptions === captions) {
            pass++;
        } else {
            fails.push(
                `FAIL [${engine.name}] ${name}\n   ${gotCaptions} caption marker(s) scoped, ` +
                    `expected ${captions}\n   got: ${dump()}`,
            );
        }
    }
}

/*
 * The readers have to answer BOTH ways, or every row above passes without
 * reading anything. `container` returning "group" for a plain `::: note`, or
 * `isCaption` returning true for ordinary prose, is the shape of control this
 * repo has shipped green before (carve#755).
 */
for (const engine of ENGINES) {
    const note = engine.tokenize('::: note\nBody text.\n:::\n');
    const claimed = note.filter((t) => engine.container(t.scope) === 'group');
    if (claimed.length) {
        fails.push(
            `FAIL [${engine.name}] control: a plain \`::: note\` reads as a composite figure ` +
                `(${claimed.map((t) => `${JSON.stringify(t.text)}:${t.scope}`).join(' | ')})`,
        );
    } else pass++;

    const prose = engine.tokenize('A caret ^ in prose is not a caption.\n');
    if (prose.some((t) => engine.isCaption(t.scope))) {
        fails.push(`FAIL [${engine.name}] control: prose holding a caret reads as a caption`);
    } else pass++;
}

if (fails.length) {
    console.log(`  ✗ composite figures: ${fails.length} failing`);
    for (const f of fails) console.log(f + '\n');
    process.exit(1);
}

console.log(
    `  ✓ composite figures: ${pass} checks pass across ${CASES.length} shapes in ${ENGINES.length} grammars`,
);
