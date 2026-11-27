import assert from 'node:assert/strict';
import Prism from 'prismjs';
import hljs from 'highlight.js';
import carve from '../highlightjs/carve.mjs';
import { textmateLineTokenizer } from './lib/textmate-lines.js';

globalThis.Prism = Prism;
await import('../prism/carve.js');
hljs.registerLanguage('carve', carve);
const textmate = await textmateLineTokenizer('textmate/carve.tmLanguage.json');

assert.equal(Prism.highlight('> %% c', Prism.languages.carve, 'carve'),
    '<span class="token blockquote"><span class="token punctuation">></span> <span class="token comment">%% c</span></span>');
for (const source of ['plain\n- > %% c', 'plain\n- > x %% c', 'plain\n- > `x` %% c']) {
    assert.ok(Prism.highlight(source, Prism.languages.carve, 'carve').includes('<span class="token comment">%% c</span>'),
        `a list-shaped paragraph continuation retains its comment in ${JSON.stringify(source)}`);
}

function prismQuotedComment(source) {
    let found = false;
    function visit(node, scopes = []) {
        if (typeof node === 'string') {
            if (node.includes('%% c') && scopes.includes('blockquote') && scopes.includes('comment')) found = true;
        } else if (Array.isArray(node)) node.forEach((child) => visit(child, scopes));
        else visit(node.content, [...scopes, node.type]);
    }
    visit(Prism.tokenize(source, Prism.languages.carve));
    return found;
}

function hljsQuotedComment(source) {
    const stack = [];
    let found = false;
    for (const match of hljs.highlight(source, { language: 'carve' }).value.matchAll(/<span class="hljs-([^"]+)">|<\/span>|([^<]+)/g)) {
        if (match[1]) stack.push(match[1]);
        else if (match[2] !== undefined) {
            if (match[2].includes('%% c') && stack.includes('quote') && stack.includes('comment')) found = true;
        } else stack.pop();
    }
    return found;
}

function textmateQuotedComment(source) {
    return textmate(source).some(({ scope, text }) => text.includes('%% c')
        && scope.includes('markup.quote.carve') && scope.includes('comment.line.percent.carve'));
}

const hosts = ['', '- ', '1. ', '> ', '> - ', '- > '];
const depths = ['> ', '> > ', '> > > '];
const bodies = ['', 'x ', 'x `code` ', '*x* ', '[x](u) ', '```js\n```\n'];
const followers = ['', '\n> tail', '\n\nrest'];
let positive = 0;
for (let index = 0; index < 1000; index++) {
    const source = hosts[index % hosts.length]
        + depths[Math.floor(index / hosts.length) % depths.length]
        + bodies[Math.floor(index / 18) % bodies.length]
        + '%% c' + index
        + followers[Math.floor(index / 108) % followers.length];
    const highlight = hljsQuotedComment(source);
    const mate = textmateQuotedComment(source);
    assert.equal(highlight, mate, `peer agreement in ${JSON.stringify(source)}`);
    if (highlight) positive++;
    assert.equal(prismQuotedComment(source), highlight, `Prism quote/comment nesting in ${JSON.stringify(source)}`);
}
assert.ok(positive >= 800, `only ${positive} positive cases`);
assert.ok(!prismQuotedComment('> `%% c`'), 'a code span is verbatim');
assert.equal(Prism.tokenize('> {% %% c %}', Prism.languages.carve)[0].content.at(-1).content,
    '{% %% c %}', 'the complete braced comment stays one token');
console.log(`Prism quoted comments: 1,000 peer agreements, ${positive} positive cases`);
