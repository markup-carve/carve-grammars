/**
 * A braced span holds inline content, and a braced span of another kind inside
 * it is an atom its closer cannot reach into (carve-grammars#485). One mask per
 * kind, read off the executable grammar at carve 7bd6577: `i` italic, `b`
 * bold, `u` underline, `s` strikethrough or deletion, `h` highlight, `n`
 * insertion, `c` code or math; `d` is a delimiter (either reading allowed).
 * A kind a row does not list must not appear.
 */
import assert from 'node:assert/strict';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';

const textmateKinds = (leaf) => {
    const scopes = (leaf.scope ?? '').split(' ');
    const has = (name) => scopes.includes(name);
    const kinds = new Set();
    if (has('markup.italic.carve') || has('markup.bold.italic.carve')) kinds.add('i');
    if (has('markup.bold.carve') || has('markup.bold.italic.carve')) kinds.add('b');
    if (has('markup.underline.text.carve')) kinds.add('u');
    if (has('markup.strikethrough.carve') || has('markup.deleted.carve')) kinds.add('s');
    if (has('markup.inserted.carve')) kinds.add('n');
    if (has('markup.highlight.carve')) kinds.add('h');
    if (scopes.some((s) => /^markup\.(raw\.inline|math|other\.math)/.test(s))) kinds.add('c');
    return kinds;
};

const prismKinds = (leaf) => {
    const path = (leaf.scope ?? '').split('>');
    const kinds = new Set();
    if (path.includes('italic') || path.includes('bold-italic')) kinds.add('i');
    if (path.includes('bold') || path.includes('bold-italic')) kinds.add('b');
    if (path.includes('underline')) kinds.add('u');
    if (path.includes('strike') || path.includes('deleted')) kinds.add('s');
    if (path.includes('inserted')) kinds.add('n');
    if (path.includes('highlight')) kinds.add('h');
    if (path.includes('code') || path.includes('math')) kinds.add('c');
    return kinds;
};

// highlight.js has one theme word for italic and underline, and one for
// highlight and insertion, so both sides are compared in its alphabet.
const hljsKinds = (leaf) => {
    const kinds = new Set();
    for (const [scope, kind] of [['emphasis', 'i'], ['strong', 'b'], ['deletion', 's'], ['addition', 'h'], ['code', 'c'], ['string', 'c']]) {
        if (leaf.ancestors.includes(scope)) kinds.add(kind);
    }
    return kinds;
};

const surfaces = [
    ['prism', prismTokens, prismKinds, {}],
    ['highlightjs', hljsTokens, hljsKinds, { u: 'i', n: 'h' }],
    ...(await textmateEngines(textmateLineTokenizer)).map(([name, tokenize]) => [name, tokenize, textmateKinds, {}]),
];

const TEXTMATE = ['textmate', 'vscode-carve', 'intellij-carve'];

const rows = [
    // With no closer outside the atom, TextMate's bare bold colors to the end
    // of the paragraph (a declared limit).
    ["{*a [x](u*}) b", {"":"....d.dddddd.."}, TEXTMATE],
    ["{*a {/b*} c/} d", {"i":"....ddiiiiidd.."}, TEXTMATE],
    // A code span opened inside a braced span reaches past its closer (#486).
    ["x{*`a*} and `b`", {"c":"...dccccccccd.d"}, TEXTMATE],
    ["x{+`a+} and `b`", {"c":"...dccccccccd.d"}],
    ["{+a {-b+} c-} d+}", {"n":"ddnnnnndd........"}],
    ["{-a {*b-} c*} d-}", {"s":"ddsssssdd........"}],
    ["{*a `b*}` c*}", {"b":"ddbbdbbbdbbdd","c":"dd..dcccd..dd"}],
    ["{**}", {"":"...."}],
    ["{++}", {"":"...."}],
    ["{* a*}", {"b":"ddbbdd"}],
    ["{*`a`*}", {"b":"dddbddd","c":"dddcddd"}],
    ["{+ a+}", {"n":"ddnndd"}],
    ["{+*a*+}", {"b":"dddbddd","n":"dddnddd"}],
    ["{,*a*,}", {"b":"dddbddd"}],
    ["{-/a/-}", {"i":"dddiddd","s":"dddsddd"}],
    ["{-a- }", {"":"......"}],
    ["{/a/}/}", {"i":"ddidd.."}],
    ["{=a=}", {"h":"ddhdd"}],
    ["{^ a^}", {"":"dd..dd"}],
    ["{_ a _}", {"u":"dduuudd"}],
    ["{*a*} b*}", {"b":"ddbdd...."}],
    ["{,a,b,}", {"":"dd...dd"}],
    ["{/a *b/}", {"i":"ddiiiidd"}],
    ["{/a/b/}", {"i":"ddiiidd"}],
    ["{~`a~>b~}", {"c":"dddccccdd","s":"dddssssdd"}],
    ["{~a \\~ b~}", {"s":"ddssdsssdd"}],
    ["{~a~b~}", {"s":"ddsssdd"}],
    ["{*a *b* c*}", {"b":"ddbbbbbbbdd"}],
    ["{*a {*b*} c*}", {"b":"ddbbbbbdd...."}],
    ["{-a -b- c-}", {"s":"ddsssssssdd"}],
    ["{/a *b* c/}", {"b":"dd..dbd..dd","i":"ddiididiidd"}],
    ["{=a `b` c=}", {"c":"dd..dcd..dd","h":"ddhhdhdhhdd"}],
    ["{^a *b ^}c*^}", {"":"dd.....dd...."}],
    ["{^a {^b^} c^}", {"":"dd.....dd...."}],
    ["{_a *b_} c*", {"u":"dduuuudd..."}],
    ["{_a /b/ c_}", {"i":"dd..did..dd","u":"dduududuudd"}],
    ["{*a {# b*} c #} d*}", {"b":"ddbbddbbbbbbbddbbdd"}],
    ["{*a {% b*} c %} d*}", {"b":"ddbdddddddddbddbbdd"}],
    ["{*a {+b*} c+} d*}", {"b":"ddbbddbbbbbddbbdd","n":"dd..ddnnnnndd..dd"}],
    ["{*a {,b*} c,} d*}", {"b":"ddbbddbbbbbddbbdd"}],
    ["{*a {-b*} c-} d*}", {"b":"ddbbddbbbbbddbbdd","s":"dd..ddsssssdd..dd"}],
    ["{*a {/b `*}` c/} d*}", {"b":"ddbbddbbdbbdbbddbbdd","c":"dd..dd..dccd..dd..dd","i":"dd..ddiidiidiidd..dd"}],
    ["{*a {/b*} c/} d*}", {"b":"ddbbddbbbbbddbbdd","i":"dd..ddiiiiidd..dd"}],
    ["{*a {=b*} c=} d*}", {"b":"ddbbddbbbbbddbbdd","h":"dd..ddhhhhhdd..dd"}],
    ["{*a {^b*} c^} d*}", {"b":"ddbbddbbbbbddbbdd"}],
    ["{*a {_b*} c_} d*}", {"b":"ddbbddbbbbbddbbdd","u":"dd..dduuuuudd..dd"}],
    ["{*a {~b*} c~} d*}", {"b":"ddbbddbbbbbddbbdd","s":"dd..ddsssssdd..dd"}],
    ["{,a {*b,} c*} d,}", {"b":"dd..ddbbbbbdd..dd"}],
    ["{,a {+b,} c+} d,}", {"n":"dd..ddnnnnndd..dd"}],
    ["{,a {-b,} c-} d,}", {"s":"dd..ddsssssdd..dd"}],
    ["{,a {/b,} c/} d,}", {"i":"dd..ddiiiiidd..dd"}],
    ["{,a {=b,} c=} d,}", {"h":"dd..ddhhhhhdd..dd"}],
    ["{,a {^b,} c^} d,}", {"":"dd..dd.....dd..dd"}],
    ["{,a {_b,} c_} d,}", {"u":"dd..dduuuuudd..dd"}],
    ["{,a {~b,} c~} d,}", {"s":"dd..ddsssssdd..dd"}],
    ["{/a {*b/} c*} d/}", {"b":"dd..ddbbbbbdd..dd","i":"ddiiddiiiiiddiidd"}],
    ["{/a {+b/} c+} d/}", {"i":"ddiiddiiiiiddiidd","n":"dd..ddnnnnndd..dd"}],
    ["{/a {,b/} c,} d/}", {"i":"ddiiddiiiiiddiidd"}],
    ["{/a {-b/} c-} d/}", {"i":"ddiiddiiiiiddiidd","s":"dd..ddsssssdd..dd"}],
    ["{/a {=b/} c=} d/}", {"h":"dd..ddhhhhhdd..dd","i":"ddiiddiiiiiddiidd"}],
    ["{/a {^b/} c^} d/}", {"i":"ddiiddiiiiiddiidd"}],
    ["{/a {_b/} c_} d/}", {"i":"ddiiddiiiiiddiidd","u":"dd..dduuuuudd..dd"}],
    ["{/a {~b/} c~} d/}", {"i":"ddiiddiiiiiddiidd","s":"dd..ddsssssdd..dd"}],
    ["{=a {*b=} c*} d=}", {"b":"dd..ddbbbbbdd..dd","h":"ddhhddhhhhhddhhdd"}],
    ["{=a {+b=} c+} d=}", {"h":"ddhhddhhhhhddhhdd","n":"dd..ddnnnnndd..dd"}],
    ["{=a {,b=} c,} d=}", {"h":"ddhhddhhhhhddhhdd"}],
    ["{=a {-b=} c-} d=}", {"h":"ddhhddhhhhhddhhdd","s":"dd..ddsssssdd..dd"}],
    ["{=a {/b=} c/} d=}", {"h":"ddhhddhhhhhddhhdd","i":"dd..ddiiiiidd..dd"}],
    ["{=a {^b=} c^} d=}", {"h":"ddhhddhhhhhddhhdd"}],
    ["{=a {_b=} c_} d=}", {"h":"ddhhddhhhhhddhhdd","u":"dd..dduuuuudd..dd"}],
    ["{=a {~b=} c~} d=}", {"h":"ddhhddhhhhhddhhdd","s":"dd..ddsssssdd..dd"}],
    ["{^a {*b^} c*} d^}", {"b":"dd..ddbbbbbdd..dd"}],
    ["{^a {+b^} c+} d^}", {"n":"dd..ddnnnnndd..dd"}],
    ["{^a {,b^} c,} d^}", {"":"dd..dd.....dd..dd"}],
    ["{^a {-b^} c-} d^}", {"s":"dd..ddsssssdd..dd"}],
    ["{^a {/b^} c/} d^}", {"i":"dd..ddiiiiidd..dd"}],
    ["{^a {=b^} c=} d^}", {"h":"dd..ddhhhhhdd..dd"}],
    ["{^a {_b^} c_} d^}", {"u":"dd..dduuuuudd..dd"}],
    ["{^a {~b^} c~} d^}", {"s":"dd..ddsssssdd..dd"}],
    ["{_a {*b_} c*} d_}", {"b":"dd..ddbbbbbdd..dd","u":"dduudduuuuudduudd"}],
    ["{_a {+b_} c+} d_}", {"n":"dd..ddnnnnndd..dd","u":"dduudduuuuudduudd"}],
    ["{_a {,b_} c,} d_}", {"u":"dduudduuuuudduudd"}],
    ["{_a {-b_} c-} d_}", {"s":"dd..ddsssssdd..dd","u":"dduudduuuuudduudd"}],
    ["{_a {/b_} c/} d_}", {"i":"dd..ddiiiiidd..dd","u":"dduudduuuuudduudd"}],
    ["{_a {=b_} c=} d_}", {"h":"dd..ddhhhhhdd..dd","u":"dduudduuuuudduudd"}],
    ["{_a {^b_} c^} d_}", {"u":"dduudduuuuudduudd"}],
    ["{_a {~b_} c~} d_}", {"s":"dd..ddsssssdd..dd","u":"dduudduuuuudduudd"}],
    ["{~a {*b~} c*} d~}", {"b":"dd..ddbbbbbdd..dd","s":"ddssddsssssddssdd"}],
    ["{~a {+b~} c+} d~}", {"n":"dd..ddnnnnndd..dd","s":"ddssddsssssddssdd"}],
    ["{~a {,b~} c,} d~}", {"s":"ddssddsssssddssdd"}],
    ["{~a {-b~} c-} d~}", {"s":"ddssddsssssddssdd"}],
    ["{~a {/b~} c/} d~}", {"i":"dd..ddiiiiidd..dd","s":"ddssddsssssddssdd"}],
    ["{~a {=b~} c=} d~}", {"h":"dd..ddhhhhhdd..dd","s":"ddssddsssssddssdd"}],
    ["{~a {^b~} c^} d~}", {"s":"ddssddsssssddssdd"}],
    ["{~a {_b~} c_} d~}", {"s":"ddssddsssssddssdd","u":"dd..dduuuuudd..dd"}],
    ["{*a {/b {*c*} d/} e*}", {"b":"ddbbddbbddbddbbddbbdd","i":"dd..ddiiddiddiidd..dd"}],
    // highlight.js nests a substitution's inserted half inside its deleted half.
    ["{*a {~b*} c~>d~} e*}", {"b":"ddbbddbbbbbddbddbbdd","n":"dd..dd.....ddndd..dd","s":"dd..ddsssssdd.dd..dd"}, ['highlightjs']],
    ["{*a {/b *} d/} e*}", {"b":"ddbbddbbbbbbddbbdd","i":"dd..ddiiiiiidd..dd"}],
    ["{_a `x_}` b_}", {"c":"dd..dcccd..dd","u":"dduuduuuduudd"}],
    ["a{*{*x*}*}b", {"b":".ddbbbdd..."}],
    ["{*a [x](u*}) b*}", {"b":"ddbbdbddddddbbdd"}],
    ["{^*b*^}", {"b":"dddbddd"}],
    ["{= =h= =}", {"h":"ddhhhhhdd"}],
    ["{/ /x/ /}", {"i":"ddiiiiidd"}],
    ["x{_$$`a_} here", {"c":".dddddcdd.....","u":".dddddudd....."}],
    ["x{*$`a*} here", {"b":".ddddbdd.....","c":".ddddcdd....."}],
    ["x{*a*}y", {"b":".ddbdd."}],
];

let checked = 0;
for (const [name, tokenize, classify, alphabet] of surfaces) {
    for (const [source, masks, skip] of rows) {
        if (skip?.includes(name)) continue;
        const got = [];
        for (const leaf of await tokenize(`${source}\n`)) {
            for (let i = 0; i < leaf.text.length; i++) got.push(classify(leaf));
        }
        const dontCare = Object.values(masks)[0];
        const want = [...dontCare].map((m, i) => (m === 'd' ? 'd' : [...new Set(
            Object.entries(masks).filter(([, mask]) => mask[i] !== '.' && mask[i] !== 'd').map(([kind]) => alphabet[kind] ?? kind),
        )].sort().join('') || '.'));
        const seen = want.map((w, i) => (w === 'd' ? 'd' : [...(got[i] ?? [])].sort().join('') || '.'));
        assert.deepEqual(seen, want, `${name}: ${JSON.stringify(source)}`);
        checked++;
    }
}

// The span's own delimiter inside it is text, not the start of a nested run.
for (const leaf of prismTokens('{*a *b* c*}\n')) {
    assert.ok((leaf.scope ?? '').split('>').filter((type) => type === 'bold').length <= 1, `prism: nested bold at ${JSON.stringify(leaf.text)}`);
}
// A substitution inside a braced span still splits.
assert.ok(hljsTokens('{*a {~b~>c~} d*}\n').some((leaf) => leaf.text === '~>' && leaf.scope === 'punctuation'), 'highlightjs: substitution arrow inside a braced span');
for (const [name, tokenize] of surfaces.filter(([name]) => TEXTMATE.includes(name))) {
    const tokens = await tokenize('{*a *b* c*}\n');
    let offset = 0;
    for (const leaf of tokens) {
        const inside = offset > 1 && offset < 9;
        assert.ok(!(inside && leaf.scope?.includes('punctuation.definition.bold')), `${name}: ${JSON.stringify(leaf.text)} at ${offset} is a delimiter`);
        offset += leaf.text.length;
    }
    checked++;
}

console.log(`braced span content: ${checked} rows across ${surfaces.length} surfaces`);
