import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { carveToProseMirror } from '../tiptap/index.js';
import { serializeToCarve } from '../tiptap/serializer.js';
import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';

const prose = 'Prose flows {% a delimited comment %} around a hidden note.';
const nested = 'Even *bo{% hidden %}ld* stays one strong span.';
const surfaces = [
    ['prism', prismTokens, 'bold'],
    ['highlightjs', hljsTokens, 'strong'],
    ...(await textmateEngines()).map(([name, tokenize]) => [name, tokenize, 'markup.bold']),
];

for (const [name, tokenize, strongScope] of surfaces) {
    const proseTokens = await tokenize(prose);
    assert(proseTokens.some((token) => token.text.includes('{%') && token.scope?.includes('comment')), `${name}: prose comment is not scoped`);
    const nestedTokens = await tokenize(nested);
    assert(nestedTokens.find((token) => token.text.includes('{%'))?.scope?.includes('comment'), `${name}: nested comment is not scoped`);
    const visibleStrong = nestedTokens.filter((token) => token.text.includes('bo') || token.text.includes('ld'));
    assert(visibleStrong.length && visibleStrong.every((token) => token.scope?.includes(strongScope)), `${name}: comment split the strong span`);

    const unreachableCloser = await tokenize('~{/x/}{/y~/}');
    const strikeScope = name === 'highlightjs' ? 'deletion' : name === 'prism' ? 'strike' : 'markup.strikethrough';
    const italicScope = name === 'highlightjs' ? 'emphasis' : 'italic';
    assert(!unreachableCloser.find((token) => token.text.startsWith('~'))?.scope?.includes(strikeScope), `${name}: a closer inside a forced span reached an outer strike`);
    assert(unreachableCloser.some((token) => token.text.includes('x') && token.scope?.includes(italicScope)), `${name}: first forced italic was lost`);
    assert(unreachableCloser.some((token) => token.text.includes('y~') && token.scope?.includes(italicScope)), `${name}: second forced italic was split by its inner strike marker`);

    const strikeAcrossInsert = await tokenize('~a{+b~+} c~');
    assert(strikeAcrossInsert.some((token) => token.text.includes(' c') && token.scope?.includes(strikeScope)), `${name}: strike closed inside an insertion`);

    const boldAcrossUnderline = await tokenize('*a {_b* c_} d*');
    assert(boldAcrossUnderline.some((token) => token.text.includes(' d') && token.scope?.includes(strongScope)), `${name}: bold closed inside a forced underline`);

    const slashAdjacentUnderline = await tokenize('/x/_y_');
    assert(slashAdjacentUnderline.some((token) => token.text.includes('x') && token.scope?.includes(name === 'highlightjs' ? 'emphasis' : name === 'prism' ? 'italic' : 'markup.italic')), `${name}: italic before an underscore was lost`);
    assert(!slashAdjacentUnderline.some((token) => token.text.includes('y') && token.scope?.includes('underline')), `${name}: underscore after an italic closer opened underline`);

    const whitespaceForced = await tokenize('{~ ~}');
    assert(whitespaceForced.some((token) => token.text.includes(' ') && token.scope?.includes(name === 'highlightjs' ? 'deletion' : name === 'prism' ? 'forced-strike' : 'markup.strikethrough')), `${name}: whitespace-only forced strike was not scoped`);

    const bareCases = [
        ['/a {*b/ c*} d/', name === 'highlightjs' ? 'emphasis' : name === 'prism' ? 'italic' : 'markup.italic'],
        ['*a {_b* c_} d*', strongScope],
        ['_a {/*b_ c*/} d_', name === 'highlightjs' ? 'emphasis' : name === 'prism' ? 'underline' : 'markup.underline'],
        ['~a {+b~+} d~', strikeScope],
        ['=a {# b= #} d=', name === 'highlightjs' ? 'addition' : name === 'prism' ? 'highlight' : 'markup.highlight'],
    ];
    for (const [source, scope] of bareCases) {
        const tokens = await tokenize(source);
        assert(tokens.some((token) => token.text.includes(' d') && token.scope?.includes(scope)), `${name}: ${JSON.stringify(source)} closed inside a braced inline`);
    }

    for (const braced of [
        '{*b~ c*}', '{/b~ c/}', '{_b~ c_}', '{^b~ c^}', '{,b~ c,}',
        '{=b~ c=}', '{+b~ c+}', '{-b~ c-}', '{# b~ c #}', '{% b~ c %}',
        String.raw`{/b\c~ d/}`,
    ]) {
        const source = `~a ${braced} d~`;
        const tokens = await tokenize(source);
        assert(tokens.some((token) => token.text.includes(' d') && token.scope?.includes(strikeScope)), `${name}: ${JSON.stringify(braced)} exposed its inner closer`);
    }

    // A same-kind forced opener inside a bare run is text, so the run closes at `b~`.
    const sameKind = await tokenize('~a {~b~ c~} d~');
    assert(!sameKind.some((token) => token.text.includes(' d') && token.scope?.includes(strikeScope)), `${name}: a same-kind forced opener hid the bare closer`);

    const literalBracePair = await tokenize('*a {--} b*');
    assert(literalBracePair.some((token) => token.text.includes(' b') && token.scope?.includes(strongScope)), `${name}: a literal braced en dash stopped a bare run`);

    const incompleteBrace = await tokenize('*see {+ note*');
    assert(incompleteBrace.some((token) => token.text.includes('note') && token.scope?.includes(strongScope)), `${name}: an incomplete editorial opener stopped a bare run`);

    const escapedBrace = await tokenize(String.raw`*a \{_b* c_} d*`);
    assert(!escapedBrace.some((token) => token.text.includes(' c') && token.scope?.includes(strongScope)), `${name}: an escaped brace hid the real bold closer`);

    for (const [source, scope] of [
        ['/see {+ note/', name === 'highlightjs' ? 'emphasis' : name === 'prism' ? 'italic' : 'markup.italic'],
        ['_see {+ note_', name === 'highlightjs' ? 'emphasis' : name === 'prism' ? 'underline' : 'markup.underline'],
        ['~see {+ note~', strikeScope],
        ['=see {+ note=', name === 'highlightjs' ? 'addition' : name === 'prism' ? 'highlight' : 'markup.highlight'],
    ]) {
        const tokens = await tokenize(source);
        assert(tokens.some((token) => token.text.includes('note') && token.scope?.includes(scope)), `${name}: ${JSON.stringify(source)} stopped at an incomplete braced opener`);
    }

    for (const [source, scope] of [
        [String.raw`/a \{_b/ c_} d/`, name === 'highlightjs' ? 'emphasis' : name === 'prism' ? 'italic' : 'markup.italic'],
        [String.raw`_a \{*b_ c*} d_`, name === 'highlightjs' ? 'emphasis' : name === 'prism' ? 'underline' : 'markup.underline'],
        [String.raw`~a \{*b~ c*} d~`, strikeScope],
        [String.raw`=a \{*b= c*} d=`, name === 'highlightjs' ? 'addition' : name === 'prism' ? 'highlight' : 'markup.highlight'],
    ]) {
        // A real blank line selects the line-faithful TextMate driver; Shiki
        // otherwise merges adjacent capture colours and reports one combined
        // explanation for this shape.
        const tokens = await tokenize(`${source}\n\n`);
        assert(!tokens.some((token) => token.text.includes(' c') && token.scope?.includes(scope)), `${name}: ${JSON.stringify(source)} treated an escaped brace as structural`);
    }

    for (const [source, scope] of [
        ['{* *}', strongScope],
        ['{/ /}', name === 'highlightjs' ? 'emphasis' : name === 'prism' ? 'forced-italic' : 'markup.italic'],
        ['{_ _}', name === 'highlightjs' ? 'emphasis' : name === 'prism' ? 'forced-underline' : 'markup.underline'],
        ['{^ ^}', name === 'highlightjs' ? 'built_in' : name === 'prism' ? 'superscript' : 'markup.superscript'],
        ['{, ,}', name === 'highlightjs' ? 'built_in' : name === 'prism' ? 'subscript' : 'markup.subscript'],
        ['{= =}', name === 'highlightjs' ? 'addition' : name === 'prism' ? 'highlight' : 'markup.highlight'],
    ]) {
        const tokens = await tokenize(source);
        assert(tokens.some((token) => token.text.includes(' ') && token.scope?.includes(scope)), `${name}: whitespace-only ${JSON.stringify(source)} was not scoped`);
    }

    for (const source of ['{//}', '{**}', '{__}', '{~~}', '{^^}', '{,,}', '{==}', '{++}', '{##}']) {
        const tokens = await tokenize(source);
        assert(!tokens.some((token) => /(?:bold|italic|underline|strike|highlight|super|sub|insert|comment|addition|deletion|emphasis|built_in|attr)/.test(token.scope ?? '')), `${name}: empty pair ${JSON.stringify(source)} was scoped as a construct`);
    }
}

// A bare closer does not reach inside a link destination or an autolink
// (PART 9 section 9 E2a, corpus 467). Three levels of nested parentheses and
// five levels of label brackets are not recognized, by design.
const destinationRuns = [
    ['/', { prism: 'italic', highlightjs: 'emphasis', textmate: 'markup.italic' }],
    ['_', { prism: 'underline', highlightjs: 'emphasis', textmate: 'markup.underline' }],
    ['~', { prism: 'strike', highlightjs: 'deletion', textmate: 'markup.strikethrough' }],
    ['=', { prism: 'highlight', highlightjs: 'addition', textmate: 'markup.highlight' }],
    ['*', { prism: 'bold', highlightjs: 'strong', textmate: 'markup.bold' }],
];
const destinations = (d) => [
    `[x](http://a.b/c${d})`,
    `<http://a.b/c${d}>`,
    `![x](a.png "t${d}u")`,
    `![x](a.png 't${d}u')`,
    `![x](a.png "t${d}")`,
    `![x](a.png 't${d}')`,
    `[x](foo(bar)${d}baz)`,
    String.raw`[x](foo\)x` + d + 'y)',
    String.raw`[x](foo(bar(\x))` + d + 'y)',
    `<${'a'.repeat(40)}:x${d}y>`,
    `[](a${d})`,
    String.raw`[x\]](a` + d + ')',
    '[x `]` y](a' + d + ')',
    `[x {# ] #} y](a${d})`,
    `[a [b [c]]](a${d})`,
    String.raw`[x](a "t\\"` + d + '")',
    `[x](a${String.fromCharCode(0xa0)}b${d})`,
    `<x:é${d}>`,
    `<x:a${String.fromCodePoint(0x1f600)}${d}>`,
];
// Shapes the spec does not read as a destination or an autolink, so the run
// closes inside them (carve-grammars#454): no label before `](`, an address
// `email_autolink` rejects, a title gap other than one space, an escape the
// destination does not have, a character outside `url_char`, and an empty
// destination (carve#2070).
const closedDestinations = (d) => [
    `](a${d})`,
    `[x]( "t${d}")`,
    String.raw`\[x](a` + d + ')',
    `<a@b${d}>`,
    `<a@b.c${d}>`,
    `<x@a.b${d}>`,
    `[x](a  "t${d}")`,
    `[x](a  't${d}')`,
    `[x](a\t"t${d}")`,
    String.raw`[x](a\ b` + d + ')',
    `<x:a"${d}>`,
    `<x:a|${d}>`,
    `<x:a${String.fromCharCode(0x200b)}${d}>`,
    `<x:a${String.fromCodePoint(0x110bd)}${d}>`,
];
for (const [name, tokenize] of surfaces) {
    const cases = destinationRuns.flatMap(([d, scopes]) => destinations(d).map((dest) => [`${d}see ${dest} now${d}`, scopes[name] ?? scopes.textmate]));
    if (!['prism', 'highlightjs'].includes(name)) {
        cases.push(['/*see [x](a*/b) now*/', 'markup.bold.italic']);
        cases.push(['*/see [x](a/*b) now/*', 'markup.bold.italic']);
    }
    for (const address of ['<a_@b.cd>', '<ä_@b.cd>', '<a@b_c.de>']) {
        cases.push([`_see ${address} now_`, name === 'prism' ? 'underline' : name === 'highlightjs' ? 'emphasis' : 'markup.underline']);
    }
    for (const [source, scope] of cases) {
        const tokens = await tokenize(source);
        for (const word of ['see', ' now']) {
            assert(tokens.some((token) => token.text.includes(word) && token.scope?.includes(scope)), `${name}: ${JSON.stringify(source)} lost ${scope} around ${JSON.stringify(word)}`);
        }
    }
    // A trailing blank line selects the line-faithful TextMate driver, so a
    // Shiki colour merge cannot carry the scope past the closer.
    for (const [d, scopes] of destinationRuns) {
        const scope = scopes[name] ?? scopes.textmate;
        for (const dest of closedDestinations(d)) {
            const source = `${d}see ${dest} now${d}`;
            const tokens = await tokenize(`${source}\n\n`);
            assert(tokens.some((token) => token.text.includes('see') && token.scope?.includes(scope)), `${name}: ${JSON.stringify(source)} did not open ${scope}`);
            assert(!tokens.some((token) => token.text.includes(' now') && token.scope?.includes(scope)), `${name}: ${JSON.stringify(source)} kept ${scope} past the closer`);
        }
        // The run cannot hold the inner delimiter on every surface, so only the
        // far side is asserted: an escaped `[` opens no label.
        const escaped = String.raw`${d}see \[x ${d}y](a${d}) now${d}`;
        const escapedTokens = await tokenize(`${escaped}\n\n`);
        assert(!escapedTokens.some((token) => token.text.includes(' now') && token.scope?.includes(scope)), `${name}: ${JSON.stringify(escaped)} kept ${scope} past the closer`);
    }
    if (!['prism', 'highlightjs'].includes(name)) {
        for (const source of [String.raw`/*see \[x*/](a) now*/`, String.raw`*/see \[x/*](a) now/*`]) {
            const tokens = await tokenize(`${source}\n\n`);
            assert(tokens.some((token) => token.text.includes('see') && token.scope?.includes('markup.bold.italic')), `${name}: ${JSON.stringify(source)} did not open markup.bold.italic`);
            assert(!tokens.some((token) => token.text.includes(' now') && token.scope?.includes('markup.bold.italic')), `${name}: ${JSON.stringify(source)} kept markup.bold.italic past the closer`);
        }
    }
}

const textmate = JSON.parse(readFileSync(new URL('../textmate/carve.tmLanguage.json', import.meta.url), 'utf8'));
const italicMatch = textmate.repository.italic.match;
const code = '```(?:[^`\\n]|`(?!``))+```(?!`)|``(?:[^`\\n]|`(?!`))+``(?!`)|`[^`\\n]+`(?!`)';
const destinationStart = italicMatch.indexOf('|(?:\\[');
const destinationEnd = italicMatch.indexOf('|(?<=\\s)/', destinationStart);
assert(destinationStart >= 0 && destinationEnd > destinationStart, 'textmate: the opaque destination atom is not extractable');
const destination = italicMatch.slice(destinationStart, destinationEnd);
for (const [name, pattern] of [
    ['italic', italicMatch],
    ['underline', textmate.repository.underline.match],
    ['strike', textmate.repository.strike.match],
    ['highlight', textmate.repository.highlight.patterns[1].match],
]) {
    assert.equal(pattern.split(destination).length - 1, 1, `textmate: ${name} drifted from the shared opaque destination atom`);
    assert.ok(pattern.split(code).length - 1 >= 11, `textmate: ${name} drifted from the shared code atoms`);
}

const definition = {
    type: 'doc',
    content: [{
        type: 'definitionList',
        content: [
            { type: 'definitionTerm', content: [{ type: 'text', text: 'x' }] },
            { type: 'definitionDescription', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'y' }] }] },
        ],
    }],
};
assert.equal(serializeToCarve(definition), ':: x\n: y');

console.log(`latest syntax: ${surfaces.length} highlighters preserve braced-inline boundaries; dd writes one space.`);
