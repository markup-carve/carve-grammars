// 0.2 continuation rules for link and abbreviation definitions, captions and
// terms (carve-grammars#941, markup-carve/carve#6507, markup-carve/carve#6508):
// only a paragraph takes unindented lines, every other block continues only on
// lines indented past its marker. Each row was checked against carve-js next2.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import Prism from 'prismjs';
import hljs from 'highlight.js';
import carve from '../highlightjs/carve.mjs';
import { textmateLineTokenizer } from './lib/textmate-lines.js';

globalThis.Prism = Prism;
await import('../prism/carve.js');
hljs.registerLanguage('carve', carve);
const tokenizeTextMate = await textmateLineTokenizer(resolve('textmate/carve.tmLanguage.json'));

function prismLeaves(source) {
    const out = [];
    const visit = (node, scopes) => {
        if (typeof node === 'string') out.push([scopes, node]);
        else if (Array.isArray(node)) node.forEach(child => visit(child, scopes));
        else visit(node.content, [...scopes, node.type, ...[].concat(node.alias ?? [])]);
    };
    visit(Prism.tokenize(source, Prism.languages.carve), []);
    return out;
}
function hljsLeaves(source) {
    const html = hljs.highlight(source, { language: 'carve' }).value;
    const decode = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
    const out = [];
    const stack = [];
    for (const [, open, close, text] of html.matchAll(/<span class="([^"]*)">|(<\/span>)|([^<]+)/g)) {
        if (open !== undefined) stack.push(open.split(' ').map(name => name.replace(/^hljs-/, '').replace(/_+$/, '')));
        else if (close) stack.pop();
        else out.push([stack.flat(), decode(text)]);
    }
    return out;
}
function textmateLeaves(source) {
    return tokenizeTextMate(source).map(({ scope, text }) => [scope.split(' '), text]);
}

// The text an engine scopes with `scope` in `source`, whitespace dropped.
const ENGINES = {
    TextMate: textmateLeaves,
    Prism: prismLeaves,
    'highlight.js': hljsLeaves,
};
const SCOPES = {
    abbreviation: { TextMate: 'string.unquoted.abbreviation.carve', Prism: 'abbreviation-definition', 'highlight.js': 'symbol' },
    definition: { TextMate: 'meta.link.reference.def.carve', Prism: 'reference-definition', 'highlight.js': 'symbol' },
    title: { TextMate: 'string.quoted.link.title.carve', Prism: 'string', 'highlight.js': 'string' },
    caption: { TextMate: 'meta.caption.carve', Prism: 'caption', 'highlight.js': 'caption' },
    term: { TextMate: 'entity.name.tag.definition.term.carve', Prism: 'definition-term', 'highlight.js': 'title' },
    description: { TextMate: 'punctuation.definition.list.definition.carve', Prism: 'punctuation', 'highlight.js': 'punctuation' },
};
function covered(engine, source, construct) {
    const scope = SCOPES[construct][engine];
    const leaves = ENGINES[engine](source).filter(([scopes]) => scopes.includes(scope));
    // A description marker is a lone `:`; the term's `::` shares its scope.
    if (construct === 'description') return leaves.some(([, text]) => text.trim() === ':') ? ':' : '';
    return leaves.map(([, text]) => text).join('').replace(/\s+/g, '');
}

let groups = 0;
// [source, construct, text the construct holds, text it does not hold]
for (const [source, construct, inside, outside] of [
    // Abbreviation definition (C2-B-084).
    ['*[HTML]: Hyper Text\n  Markup Language\n\nSee HTML.\n', 'abbreviation', 'HyperTextMarkupLanguage', 'See'],
    ['*[CSS]: Cascading\n\tStyle\t\n \t Sheets\n\nCSS\n', 'abbreviation', 'CascadingStyleSheets', ''],
    ['*[HTML]: Hyper Text\nMarkup Language\n', 'abbreviation', 'HyperText', 'Markup'],
    ['*[X]: a\n  - y\n', 'abbreviation', 'a-y', ''],
    ['*[X]: a\n  | b |\n', 'abbreviation', 'a', 'b'],
    ['*[X]: a\n  ***\n', 'abbreviation', 'a', '***'],
    ['*[X]: a\n  ```\n  c\n  ```\n', 'abbreviation', 'a', 'c'],
    ['*[X]: a\n  ::: d\n  :::\n', 'abbreviation', 'a', 'd'],
    ['*[X]: a\n  %% note\n  b\n', 'abbreviation', 'a', 'b'],
    ['*[X]: a\n\n  b\n', 'abbreviation', 'a', 'b'],
    // Link definition (C2-B-083).
    ['[a]: /url\n  "Title"\n\nSee [a].\n', 'title', '"Title"', ''],
    ['[a]: /url\n  "Title"\n\nSee [a].\n', 'definition', '[a]:/url"Title"', 'See'],
    ['[a]: /u\n  "T" {.c}\n\nSee [a].\n', 'definition', '[a]:/u"T"{.c}', 'See'],
    ['[a]: /u\n  {.c}\nPara\n', 'definition', '[a]:/u{.c}', 'Para'],
    ['[a]: /u "T"\n\t{.c}\n', 'definition', '[a]:/u"T"{.c}', ''],
    ["[a]: /u\n   'T'  \n", 'title', "'T'", ''],
    ['[a]: /url\n  more text\n', 'definition', '[a]:/url', 'more'],
    ['[a]: /u "T"\n  "U"\n', 'title', '"T"', '"U"'],
    ['[a]: /u\n  "T"\n  "U"\n', 'title', '"T"', '"U"'],
    ['[a]: /u\n  "T" x\n', 'definition', '[a]:/u', 'x'],
    ['[a]: /u {.c}\n  {.d}\nPara\n', 'definition', '[a]:/u{.c}', '{.d}'],
    ['[a]: /url\n"Title"\n', 'definition', '[a]:/url', 'Title'],
    ['[a]: /u\n  {.c}\n  "T"\n', 'definition', '[a]:/u{.c}', '"T"'],
    ['[a]: /u\n%% c\n  "T"\n', 'definition', '[a]:/u', '"T"'],
    // Caption (carve#6508, C2-B-146 to C2-B-149).
    ['![a](a.png)\n^ The caption\n  goes on\nNext prose.\n', 'caption', '^Thecaptiongoeson', 'Next'],
    ['![a](a.png)\n^ The caption\nNext prose.\n', 'caption', '^Thecaption', 'Next'],
    ['![a](a.png)\n^ cap\n  %% c\n  more\n', 'caption', '^cap%%cmore', ''],
    ['![a](a.png)\n^ cap\n  - y\n', 'caption', '^cap-y', ''],
    ['![a](a.png)\n^ cap\n  | t |\n', 'caption', '^cap', 't'],
    ['![a](a.png)\n^ cap\n  %%%\n  z\n  %%%\n  more\n', 'caption', '^cap', 'more'],
    ['> q\n^ cap\n  more\nnext\n', 'caption', '^capmore', 'next'],
    // Description term (carve#6508, C2-B-069).
    [':: Term\n  more\n: desc\n', 'term', 'Termmore', 'desc'],
    [':: Term\n  more\n: desc\n', 'description', ':', ''],
    [':: Term\nmore\n: desc\n', 'term', 'Term', 'more'],
    [':: Term\nmore\n: desc\n', 'description', '', ':'],
    [':: Term\n  %% c\n  more\n: d\n', 'term', 'Term%%cmore', 'd'],
    [':: T\n  - y\n  > q\n: d\n', 'term', 'T-y>q', 'd'],
    [':: T\n  | t |\n', 'term', 'T', 't'],
    ['- x\n\n  :: Term\n    more\n  : desc\n', 'term', 'Termmore', 'desc'],
    ['- x\n\n  :: Term\n    more\n  : desc\n', 'description', ':', ''],
]) {
    for (const engine of Object.keys(ENGINES)) {
        const text = covered(engine, source, construct);
        const label = `${engine} ${construct}: ${JSON.stringify(source)} -> ${JSON.stringify(text)}`;
        if (inside) assert.ok(text.includes(inside), `${label} holds ${JSON.stringify(inside)}`);
        else assert.equal(text, '', `${label} is empty`);
        if (outside) assert.ok(!text.includes(outside), `${label} leaves out ${JSON.stringify(outside)}`);
    }
    groups++;
}
// A title and an attribute block on their own tail lines. TextMate ends its rule
// at the title line (a child rule cannot end its parent), so it is left out here.
for (const engine of ['Prism', 'highlight.js']) {
    const text = covered(engine, '[a]: /u\n  "T"\n  {.c}\nPara\n', 'definition');
    assert.ok(text.includes('"T"{.c}') && !text.includes('Para'), `${engine} split tail: ${text}`);
}
groups++;
console.log(`continuation labels: ${groups} assertion groups passed`);
