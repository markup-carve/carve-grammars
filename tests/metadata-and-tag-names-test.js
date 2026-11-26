// Later typed metadata blocks (C2-B-232, C2-B-233, carve-grammars#954) and
// mention and tag names (C2-I-092, carve-grammars#955) in all three grammars.
// Inputs are the spec's clause cases; each row was checked against carve-js next2.
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
const ENGINES = { TextMate: textmateLeaves, Prism: prismLeaves, 'highlight.js': hljsLeaves };

// Each run of leaves carrying `scope`, whitespace dropped.
function runs(engine, source, matches) {
    const out = [];
    let open = false;
    for (const [scopes, text] of ENGINES[engine](source)) {
        if (scopes.some(matches)) {
            if (open) out[out.length - 1] += text;
            else out.push(text);
            open = true;
        } else open = false;
    }
    return out.map(text => text.replace(/\s+/g, '')).filter(Boolean);
}

let groups = 0;

// The metadata text a grammar scopes, as one string.
const METADATA = {
    TextMate: scope => scope.startsWith('meta.frontmatter.'),
    Prism: scope => scope === 'front-matter' || scope === 'metadata-block',
    'highlight.js': scope => scope === 'meta' || scope.startsWith('language-'),
};
// [source, metadata text, text left out]
for (const [source, inside, outside] of [
    ['a\n\n---yaml\nk: v\n---\n\nb\n', '---yamlk:v---', 'b'], // CC-1581
    ['a\n\n--- toml\nk = 1\n---\n', '---tomlk=1---', 'a'], // CC-1582
    ['---\nt: 1\n---\n\nbody\n\n---json\n{}\n---\n', '---json{}---', 'body'], // CC-1583
    ['a\n\n---\nk: v\n---\n', '', ''], // CC-1584
    ['a\n\n ---yaml\nk: v\n---\n', '', ''], // CC-1585
    ['a\n---yaml\nk: v\n---\n', '', ''], // CC-1586
    ['::: note\n\n---yaml\nk: v\n---\n\n:::\n', '', ''], // CC-1587
    ['> a\n>\n> ---yaml\n> k: v\n> ---\n', '', ''], // CC-1588
    ['- a\n\n  ---yaml\n  k: v\n  ---\n', '', ''], // CC-1589
    ['- a\n- b\n\n---toml\nk = 1\n---\n\nx\n', '---tomlk=1---', 'x'], // CC-1590
    ['## Ch\n\n{#ch1 scope=section}\n---yaml\nauthor: A\n---\n', '---yamlauthor:A---', 'Ch'], // CC-1591
    ['a\n\n---yaml\nk: v\n\n# Lost\n', '---yamlk:v#Lost', ''], // CC-1592
    ['{#only}\n---json\n{}\n---\n\nbody\n', '---json{}---', 'body'], // CC-1593
    ['Text\n{#k}\n---toml\na = 1\n---\n', '', ''],
    ['a\n\n```\n\n---toml\n```\n', '', ''],
]) {
    for (const engine of Object.keys(ENGINES)) {
        const text = runs(engine, source, METADATA[engine]).join('');
        const label = `${engine} metadata: ${JSON.stringify(source)} -> ${JSON.stringify(text)}`;
        if (inside) assert.ok(text.includes(inside), `${label} holds ${JSON.stringify(inside)}`);
        else assert.equal(text, '', `${label} is empty`);
        if (outside) assert.ok(!text.includes(outside), `${label} leaves out ${JSON.stringify(outside)}`);
    }
    groups++;
}

// The mention and tag runs a grammar scopes, sigil included.
const NAMES = {
    TextMate: scope => /^(?:punctuation\.definition|variable\.other)\.(?:tag|mention)\.carve$/.test(scope),
    Prism: scope => scope === 'tag' || scope === 'mention',
    'highlight.js': scope => scope === 'symbol',
};
// [source, the names scoped, in order]
for (const [source, names] of [
    ['Tag #café and #cafe here, #größe.', ['#cafe']], // CC-1634
    ['#café x', []], // CC-1635
    ['x #tag漢字 and #漢字', []], // CC-1636
    ['x #tag٣ and #tag²', []], // CC-1637
    ['x #tag😀 x', ['#tag']], // CC-1638
    ['x #tag-é #tag.é #tag- é', ['#tag']], // CC-1639
    ['@josé and @jose', ['@jose']], // CC-1640
    ['x #größe y\nx @josé y\nx #tag-é\n#tag- x\n@a.b.\nx #a.b.\n', ['#tag', '@a.b', '#a.b']],
    ['x #-a #a-- #a..b #1 #1a #a.1', ['#-a', '#a', '#a', '#1a', '#a.1']],
    ['= H #a.b. #größe\n', ['#a.b']],
]) {
    for (const engine of Object.keys(ENGINES)) {
        assert.deepEqual(runs(engine, source, NAMES[engine]), names, `${engine} names: ${JSON.stringify(source)}`);
    }
    groups++;
}
// A `---` line in a div body is text, not a thematic break (C2-B-159).
assert.deepEqual(runs('highlight.js', '::: note\n\n---\n:::\n', scope => scope === 'meta'), []);
groups++;
console.log(`metadata and tag names: ${groups} assertion groups passed`);
