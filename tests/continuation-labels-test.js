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
    heading: { TextMate: 'markup.heading.carve', Prism: 'title', 'highlight.js': 'section' },
    quote: { TextMate: 'markup.quote.carve', Prism: 'blockquote', 'highlight.js': 'quote' },
    comment: { TextMate: 'comment.line.percent.carve', Prism: 'comment', 'highlight.js': 'comment' },
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
    // Heading: a `:::` fence or a `%%%` block comment ends it (carve-grammars#943).
    ['# Title\n  ::: note\n  body\n  :::\n', 'heading', '#Title', ':::'],
    ['# Title\n  ::: note\n  body\n  :::\n', 'heading', '#Title', 'body'],
    ['# Title\n  :::\n  :::\n', 'heading', '#Title', ':::'],
    ['- item\n\n  # Title\n    :::\n    :::\n', 'heading', '#Title', ':::'],
    ['# Title\n  %%%\n  x\n  %%%\n', 'heading', '#Title', 'x'],
    // Heading on a list marker line; it ends with its line (carve-grammars#945).
    ['- # Title\n', 'heading', '#Title', '-'],
    ['* ## T\n', 'heading', '##T', '*'],
    ['1. ## Sub\n', 'heading', '##Sub', '1.'],
    ['1) # T\n', 'heading', '#T', '1)'],
    ['a. # T\n', 'heading', '#T', 'a.'],
    ['- [ ] # T\n', 'heading', '#T', '['],
    ['- - # T\n', 'heading', '#T', '-'],
    ['- = T\n', 'heading', '=T', '-'],
    ['- ###### T\n', 'heading', '######T', '-'],
    ['- # T\n  more\n', 'heading', '#T', 'more'],
    ['- # T\n- # U\n', 'heading', '#T#U', '-'],
    ['- # \tT\n', 'heading', '#T', '-'],
    ['# \tT\n', 'heading', '#T', ''],
    ['- #tag\n', 'heading', '', ''],
    ['- ####### T\n', 'heading', '', ''],
    ['p\n- # T\n', 'heading', '', ''],
    // A block on a quoted, attribute-glued or nested marker line
    // (carve-grammars#947). A quoted heading scopes only its run in highlight.js.
    ['> - # T\n', 'heading', '#', '-'],
    ['> 1. - # T\n', 'heading', '#', '1.'],
    ['> a. # T\n', 'heading', '#', 'a.'],
    ['> - = T\n', 'heading', '=', '-'],
    ['> -{.c} # T\n', 'heading', '#', '{'],
    ['-{.c} # T\n', 'heading', '#T', '{'],
    ['1.{.c} # T\n', 'heading', '#T', '{'],
    ['-{.c} - # T\n', 'heading', '#T', '{'],
    ['1. - # T\n', 'heading', '#T', '1.'],
    ['- 1. # T\n', 'heading', '#T', '1.'],
    ['1. a. # T\n', 'heading', '#T', 'a.'],
    ['- - [ ] # T\n', 'heading', '#T', '['],
    ['-{.c} > x\n', 'quote', 'x', '{'],
    ['1. - > x\n', 'quote', 'x', '1.'],
    ['-{title="a}b"} # T\n', 'heading', '#T', '{'],
    ['-{title="a}b"} > x\n', 'quote', 'x', '{'],
    ['- a.{.c} # T\n', 'heading', '#T', '{'],
    ['- a.{.c} > x\n', 'quote', 'x', '{'],
    ['-{+a+} # T\n', 'heading', '', ''],
    ['- {.c} # T\n', 'heading', '', ''],
    ['> A. # T\n', 'heading', '', ''],
    // Heading continuation (CC-699, C2-B-154, C2-B-234, carve-grammars#957).
    ['= H\n  cont\nnext\n', 'heading', '=Hcont', 'next'],
    ['# a\n b\n', 'heading', '#ab', ''],
    ['## H\n   x\n   y\n\n  z\n', 'heading', '##Hxy', 'z'],
    ['= H\n  - x\n', 'heading', '=H-x', ''],
    ['= H\n  | t |\n', 'heading', '=H', 't'],
    ['= H\n  ***\n', 'heading', '=H', '***'],
    ['p\n= H\n  x\n', 'heading', '', ''],
    ['= H\n%% note\n  continued\nx\n', 'heading', 'continued', 'x'],
    ['= H\n%% note\nx\n', 'heading', '%%note', 'x'],
    // A caret line directly below a caption is text (CC-1861, CC-2035,
    // C2-B-148, C2-B-149, carve-grammars#956).
    ['![a](a.png)\n^ one\n^ two\n', 'caption', '^one', 'two'],
    ['![i](u)\n^ c\n^ d\n', 'caption', '^c', 'd'],
    ['| a | b |\n^ first\n^ second\n', 'caption', '^first', 'second'],
    ['![a](a.png)\n^ one\n  two\n^ three\nnext\n', 'caption', '^onetwo', 'three'],
    ['![a](a.png)\n^ one\n^ two\n::: note\nx\n:::\n', 'caption', '^one', 'x'],
    // A comment-only line in a term is a comment, and the term goes on below it (C2-B-137, C2-B-234).
    [':: Comment term\n%% note\n   after comment\n: Desc.\n', 'term', 'Commentterm%%noteaftercomment', 'Desc'],
    [':: Comment term\n%% note\n   after comment\n: Desc.\n', 'comment', '%%note', 'after'],
    // A caret line with no host is text (CC-1371, CC-013, CC-116, C2-B-149).
    ['{.x}\n^ cap\n', 'caption', '', ''],
    ['![a][b[c]d]\n^ cap', 'caption', '', ''],
    ['![a](i.png)\n%% #region x\n^ cap', 'caption', '', ''],
    ['![a](i.png) %% c\n^ cap\n', 'caption', '', ''],
    ['![a](i.png)\n{.x}\n^ cap\n', 'caption', '', ''],
    ['![a][]\n^ cap\n', 'caption', '^cap', ''],
    ['![a]\n^ cap\n', 'caption', '', ''],
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
// A colon fence ends the text below a second caret line, so the div opens (C2-B-012).
assert.ok(textmateLeaves('![a](a.png)\n^ one\n^ two\n::: note\nx\n:::\n').some(([scopes]) => scopes.includes('meta.admonition.carve')), 'TextMate div after a caret line');
groups++;
// A label in a list item or a quote continues on the lines indented past its
// marker, the column counted behind the quote marks (C2-B-003, C2-B-234). Prism
// and highlight.js read a quoted line or a marker line's rest on its own, so
// only TextMate holds these.
for (const [source, construct, inside, outside] of [
    ['- :: Item term\n     item more\n  : Desc.\n', 'term', 'Itemtermitemmore', 'Desc'],
    ['- :: Item term\n     item more\n  : Desc.\n', 'description', ':', ''],
    ['- :: t\n  more\n', 'term', 't', 'more'],
    ['- :: t\n  %% c\n     more\n  : d\n', 'term', 't%%cmore', 'd'],
    ['> :: Quoted term\n>    quoted more\n> : Desc.\n', 'term', 'Quotedtermquotedmore', 'Desc'],
    ['> :: Quoted term\n>    quoted more\n> : Desc.\n', 'description', ':', ''],
    ['> :: t\n> x\n', 'term', 't', 'x'],
    ['> - :: t\n>     more\n', 'term', 'tmore', ''],
    ['> # Quoted head\n>   head more\n', 'heading', 'Quotedheadheadmore', '>'],
    ['> # H\n> %% c\n>  more\n', 'heading', 'H%%cmore', ''],
    ['> # H\n> text\n', 'heading', 'H', 'text'],
    ['> # H\n>   ***\n', 'heading', 'H', '***'],
    ['- # Item head\n    head more\n', 'heading', '#Itemheadheadmore', ''],
    ['1. # H\n    more\n', 'heading', '#Hmore', ''],
    ['1. # H\n   more\n', 'heading', '#H', 'more'],
    ['- # H\n  - x\n', 'heading', '#H', 'x'],
    // A heading on a quoted list marker line continues too (C2-B-003, C2-B-234).
    ['> - # H\n>     more\n', 'heading', 'Hmore', '>'],
    ['> - # H\n> x\n', 'heading', 'H', 'x'],
    ['> - # H\n> %% c\n>     more\n', 'heading', 'H%%cmore', ''],
    ['> 1. - # T\n>        more\n', 'heading', 'Tmore', '1.'],
    // A tab reaches the next tab stop (C2-B-004), and a column-0 comment-only
    // line ends neither the item nor its label (C2-B-137).
    ['- # H\n\tmore\n', 'heading', '#Hmore', ''],
    ['- # H\n%% c\n    more\n', 'heading', '#H%%cmore', ''],
    ['- # H\n%% c\n    more\n', 'comment', '%%c', 'more'],
    ['- :: t\n\tmore\n  : d\n', 'term', 'tmore', 'd'],
    ['- :: t\n%% c\n     more\n  : d\n', 'term', 't%%cmore', 'd'],
    ['- :: t\n%% c\n     more\n  : d\n', 'description', ':', ''],
    // A list marker indented past the item's marker ends a heading (C2-B-234);
    // carve-js keeps it in a term.
    ['- # H\n    - item\n', 'heading', '#H', 'item'],
    ['1. # H\n     1. item\n', 'heading', '#H', 'item'],
    ['> - # H\n>     - item\n', 'heading', 'H', 'item'],
    ['- # H\n    a) item\n', 'heading', '#H', 'item'],
    ['- # H\n    A.  item\n', 'heading', '#H', 'item'],
    ['- # H\n    . item\n', 'heading', '#H', 'item'],
    ['- # H\n    ii) item\n', 'heading', '#Hii)item', ''],
    ['- # H\n    A. item\n', 'heading', '#HA.item', ''],
    ['- # H\n    . . x\n', 'heading', '#H..x', ''],
    ['- :: t\n     - item\n', 'term', 't-item', ''],
    ['> - :: t\n>     1. item\n', 'term', 't1.item', ''],
    // Past marker column 24 a label still opens and ends with its line.
    ['-                         # Long\n                            more\n', 'heading', '#Long', 'more'],
    ['-                          :: Long\n- x\n', 'term', 'Long', 'x'],
    ['> | a |\n> ^ Quoted cap\n>   cap more\n', 'caption', '^Quotedcapcapmore', '>'],
    ['> ![a](i.png)\n> ^ cap\n>   more\n', 'caption', '^capmore', ''],
    ['> | a |\n> ^ cap\n> %% c\n>   more\n', 'caption', '^cap%%cmore', ''],
    ['> | a |\n> ^ one\n> ^ two\n', 'caption', '^one', 'two'],
    ['> x\n> ^ cap\n', 'caption', '', ''],
]) {
    const text = covered('TextMate', source, construct);
    const label = `TextMate ${construct}: ${JSON.stringify(source)} -> ${JSON.stringify(text)}`;
    if (inside) assert.ok(text.includes(inside), `${label} holds ${JSON.stringify(inside)}`);
    else assert.equal(text, '', `${label} is empty`);
    if (outside) assert.ok(!text.includes(outside), `${label} leaves out ${JSON.stringify(outside)}`);
    groups++;
}
// A heading continuation is indented past the marker by column, tabs counted
// to the next multiple of 4 (C2-B-004, C2-B-234). TextMate compares the
// characters, so it is left out here.
for (const engine of ['Prism', 'highlight.js']) {
    assert.equal(covered(engine, '\t= H\n     x\n', 'heading'), '=Hx', `${engine} tab heading`);
    assert.equal(covered(engine, '= H\n\tcont\nnext\n', 'heading'), '=Hcont', `${engine} tab continuation`);
}
groups++;
// A title and an attribute block on their own tail lines. TextMate ends its rule
// at the title line (a child rule cannot end its parent), so it is left out here.
for (const engine of ['Prism', 'highlight.js']) {
    const text = covered(engine, '[a]: /u\n  "T"\n  {.c}\nPara\n', 'definition');
    assert.ok(text.includes('"T"{.c}') && !text.includes('Para'), `${engine} split tail: ${text}`);
}
groups++;
console.log(`continuation labels: ${groups} assertion groups passed`);
