import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

// A quote whose every line is a bare `>` is no caption host (CARVE-P9-080,
// corpus 554), so a `^ ` line below it is a paragraph. Expectations measured
// against carve-js.
assertThisFileRuns(import.meta.url);
const grammar = fileURLToPath(new URL('../textmate/carve.tmLanguage.json', import.meta.url));
const textmate = await textmateLineTokenizer(grammar);

const CAPTION = { textmate: /meta\.caption/, prism: /(^|>)caption(>|$)/, highlightjs: /^title caption_$/ };
const engines = [['textmate', textmate], ['prism', prismTokens], ['highlightjs', hljsTokens]];

const PARAGRAPH = [
    '>\n^ cap\n',
    '| a |\n\n>\n\n^ cap\n',
    '>\n\n^ cap\n',
    '>\n\n\n^ cap\n',
    '>\n>\n^ cap\n',
    '>   \n^ cap\n',
    '>\t\n^ cap\n',
    '﻿>\n^ cap\n',
    '> q\n\n>\n^ cap\n',
    '> q\n\n>\n\n^ cap\n',
    '>\r\n^ cap\r\n',
    '> q\r\n\r\n>\r\n^ cap\r\n',
];

const CAPTIONED = [
    '> q\n>\n\n^ cap\n',
    '> q\n>\n^ cap\n',
    '> q\n^ cap\n',
    '> q\n\n^ cap\n',
    '>\n> q\n^ cap\n',
    '> >\n^ cap\n',
    '> %% c\n^ cap\n',
    '> q\nlazy\n>\n^ cap\n',
    '> q %% c\n>\n^ cap\n',
    '> q\r\n>\r\n^ cap\r\n',
    '![a](b.png)\n^ cap\n',
    '![a](b.png)\n\n^ cap\n',
    '| a |\n^ cap\n',
    '| a |\n\n^ cap\n',
    '```\nx\n```\n^ cap\n',
    '```\nx\n```\n\n^ cap\n',
    // The empty quote ends at the next block; a later host still captions.
    '>\n^ cap\n\n> q\n^ real\n',
];

// LIMIT, documented in docs/reference.md: a bare `>` right below a paragraph
// line could close a quote that line continues lazily (`> q`, `lazy`, `>`
// captions), and no grammar here looks far enough back to tell. The engines
// render these as paragraphs; the grammars keep painting a caption.
const LIMIT = [
    'text\n>\n^ cap\n',
    '- a\n>\n^ cap\n',
];

// The scope of the token holding the LAST `cap` in the source.
function captionScope(tokens, source) {
    const at = source.lastIndexOf('^ ') + 2;
    let offset = 0;
    for (const token of tokens) {
        const length = (token.text ?? '').length;
        if (at >= offset && at < offset + length) return token.scope ?? '';
        offset += length;
    }
    assert.fail(`no token at ${at} in ${JSON.stringify(source)}`);
}

for (const [name, tokenize] of engines) {
    const projected = (source) => {
        const tokens = tokenize(source);
        assert.equal(tokens.map((t) => t.text).join(''), source, `${name}: projection`);
        return tokens;
    };
    for (const source of PARAGRAPH) {
        assert.doesNotMatch(captionScope(projected(source), source), CAPTION[name], `${name}: paragraph ${JSON.stringify(source)}`);
    }
    for (const source of [...CAPTIONED, ...LIMIT]) {
        assert.match(captionScope(projected(source), source), CAPTION[name], `${name}: caption ${JSON.stringify(source)}`);
    }
}

// The fix must not leave TextMate state behind: what follows scopes as usual.
const after = textmate('>\n^ cap\n\n# H\n');
assert.ok(after.some((t) => t.text === 'H' && /markup\.heading/.test(t.scope)), 'textmate: heading after the paragraph');

console.log('Empty quote: a caret line below a bare-marker quote is a paragraph in all three grammars.');
