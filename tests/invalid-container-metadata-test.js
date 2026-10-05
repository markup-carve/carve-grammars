import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateTokenizer } from './lib/textmate-engine.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);
const grammar = fileURLToPath(new URL('../textmate/carve.tmLanguage.json', import.meta.url));
const engines = [
    ['prism', prismTokens, /div-delimiter/, /invalid-metadata/],
    ['highlightjs', hljsTokens, /keyword/, null],
    ['textmate', await textmateTokenizer(grammar), /entity.name.tag.admonition/, /invalid.illegal.container-metadata/],
    ['textmate-lines', await textmateLineTokenizer(grammar), /entity.name.tag.admonition/, /invalid.illegal.container-metadata/],
];
function scopesAt(tokens, source, text) {
    const start = source.indexOf(text);
    assert.ok(start >= 0, text);
    const end = start + text.length;
    let offset = 0;
    const scopes = [];
    for (const token of tokens) {
        const next = offset + token.text.length;
        if (offset < end && next > start) scopes.push(token.scope ?? '');
        offset = next;
    }
    assert.ok(scopes.length, text);
    return scopes;
}
for (const [name, tokenize, openerScope, invalidScope] of engines) {
    for (const kind of ['note', 'widget', 'figure', '123']) {
        for (const tail of [' Bare title', ' "Unclosed', ' [Unclosed', ' "Valid" [broken', '\t"Tabbed"', ' “Curly”', '{.inline}', '[label]', ' %% comment', ' "Valid" %% comment', ' "Valid"\t%% comment', ' [label] %% comment', ' x %%%', ' {% c %}', ' "Valid" {% c %}', '\u2028x', '\u2029x', '\u0085"Title"', '\ufeff"Title"', '\u00a0"Title"']) {
            for (const marker of ['', '- ', '- [x] ', '1. ']) {
                const indent = marker === '1. ' ? '   ' : marker ? '  ' : '';
                const source = `${marker}::: ${kind}${tail}\n${indent}# Heading\n\n${indent}- first\n${indent}- second\n${indent}:::\n\nAfter.`;
                const tokens = tokenize(source);
                assert.equal(tokens.map(t => t.text).join(''), source, name);
                assert.ok(scopesAt(tokens, source, kind).every(scope => openerScope.test(scope)), `${name}: ${marker}${kind}${tail}`);
                if (invalidScope) assert.ok(scopesAt(tokens, source, tail).every(scope => invalidScope.test(scope)), `${name}: invalid metadata ${tail}`);
                assert.ok(scopesAt(tokens, source, '# Heading').some(scope => (marker && name.startsWith('textmate') ? /admonition/ : /title|heading|section/).test(scope)), `${name}: ${marker}${kind}${tail}: heading`);
                assert.ok(scopesAt(tokens, source, 'After.').every(scope => !/div|admonition|figure-group|keyword/.test(scope)), `${name}: following paragraph`);
                assert.ok(scopesAt(tokens, source, kind).every(scope => !/figure-group/.test(scope)), `${name}: recovered figure is generic`);
            }
        }
    }
    for (const opener of [':::note', ':::\tnote', '::: \tnote', '::: {.x}', '::: note!junk', "::: note'Title'", '::: |\u2028x', '::: >\u2029x', ':::[label]\u2028x', ':::\u2028x']) {
        const source = `${opener}\nBody.`;
        assert.ok(scopesAt(tokenize(source), source, opener).every(scope => !/div|admonition|figure-group|keyword/.test(scope)), `${name}: ${opener}`);
    }
    for (const tail of [' "Valid"', ' [label]', ' "Valid" [label]', ' [a\t%% hidden]', ' [a {% c %}]']) {
        const source = `::: note${tail}\nBody.\n:::\n`;
        const tokens = tokenize(source);
        if (invalidScope) assert.ok(tokens.every(t => !invalidScope.test(t.scope ?? '')), `${name}: valid metadata`);
        if (name !== 'highlightjs') {
            if (tail.includes('"')) assert.ok(scopesAt(tokens, source, '"Valid"').every(scope => /string/.test(scope)), `${name}: title scope`);
            if (tail.includes('[')) {
                const label = tail.slice(tail.indexOf('['));
                assert.ok(scopesAt(tokens, source, label).every(scope => /symbol|label/.test(scope)), `${name}: label scope`);
            }
        }
    }
    if (name === 'prism' || name === 'highlightjs') {
        for (const kind of ['note', 'figure']) {
            const source = `::: ${kind}\r\nBody.\r\n:::\r\n`;
            const tokens = tokenize(source);
            assert.equal(tokens.map(t => t.text).join(''), source);
            assert.ok(scopesAt(tokens, source, kind).every(scope => /div-delimiter|figure-group|keyword|section/.test(scope)), `${name}: CRLF opener`);
        }
    }
    if (name === 'prism' || name === 'highlightjs') {
        for (const tail of [' %% comment', ' "Valid" %% comment', ' {% comment %}']) {
            const source = `- ::: note${tail}\nlazy\n`;
            const tokens = tokenize(source);
            assert.ok(scopesAt(tokens, source, 'comment').every(scope => /comment/.test(scope)), `${name}: folded opener comment`);
        }
    }
    if (name === 'prism') {
        const source = '- ::: note "Valid" %% comment\r\n\r\n  Body.\r\n  :::\r\n';
        assert.ok(scopesAt(tokenize(source), source, '%% comment').every(scope => /invalid-metadata/.test(scope)), 'prism: blank CRLF line after marker opener');
    }
    if (name === 'prism') {
        const source = `::: note ${'x'.repeat(12000)} {% comment %}\nBody.\n:::\n`;
        const tokens = tokenize(source);
        assert.equal(tokens.map(token => token.text).join(''), source);
        assert.ok(scopesAt(tokens, source, '{% comment %}').every(scope => /invalid-metadata/.test(scope)), 'prism: long metadata retains comments');
    }
    if (name === 'prism') {
        const source = '::: note {% unclosed\nBody {% actual %}\n:::\n';
        assert.ok(scopesAt(tokenize(source), source, '{% actual %}').every(scope => /comment/.test(scope)), 'prism: rejected multiline metadata comment does not swallow a body comment');
        for (const separator of ['\u2028', '\u2029']) {
            const source = `text${separator}::: note %% comment\nBody.\n`;
            const tokens = tokenize(source);
            assert.ok(scopesAt(tokens, source, 'note').every(scope => !/div-delimiter/.test(scope)), 'prism: Unicode separators do not start a container');
            assert.ok(scopesAt(tokens, source, '%% comment').every(scope => /comment/.test(scope)), 'prism: Unicode content retains comments');
        }
    }
    if (name === 'prism') {
        for (const separator of ['\u2028', '\u2029']) {
            const source = `::: note\nBody${separator}:::\nMore.\n:::\nOutside.\n`;
            const tokens = tokenize(source);
            assert.ok(scopesAt(tokens, source, 'More.').every(scope => /div/.test(scope)), 'prism: Unicode separators do not close a container');
            assert.ok(scopesAt(tokens, source, 'Outside.').every(scope => !/div/.test(scope)), 'prism: logical closer still closes');
        }
    }
    if (name === 'prism') {
        for (const separator of ['\u2028', '\u2029']) {
            for (const line of [`  Body${separator}  :::`, `  :::${separator}content`]) {
                const source = `- ::: note\n${line}\n  More.\n  :::\n`;
                assert.ok(scopesAt(tokenize(source), source, 'More.').every(scope => /div/.test(scope)), 'prism: marker-line container keeps Unicode content in its body');
            }
        }
    }
    if (name === 'prism') {
        for (const separator of ['\u2028', '\u2029']) {
            const source = `::: note\nBody\n:::${separator}content\nMore.\n:::\nOutside.\n`;
            assert.ok(scopesAt(tokenize(source), source, 'More.').every(scope => /div/.test(scope)), 'prism: text after a Unicode-separated closer keeps the container open');
            for (const marker of ['#', '-']) {
                const source = `text${separator}${marker} %% comment\n`;
                assert.ok(scopesAt(tokenize(source), source, '%% comment').every(scope => /comment/.test(scope)), 'prism: Unicode text before a marker retains its comment');
            }
            for (const run of ['%%', '%%%']) {
                const comment = `${run} first${separator}second %% third`;
                const commentSource = `text ${comment}\n`;
                assert.ok(scopesAt(tokenize(commentSource), commentSource, comment).every(scope => /comment/.test(scope)), 'prism: Unicode separators stay inside a logical-line comment');
            }
        }
    }
    const corpus = new URL('../spec/tests/corpus/', import.meta.url);
    const files = readdirSync(corpus).filter(file => /^(537-invalid-named-container|255-colon-fence-metadata).*\.crv$/.test(file));
    assert.ok(files.length >= 6, 'recovery corpus cases must be present');
    for (const file of files) {
        const source = readFileSync(new URL(file, corpus), 'utf8');
        const html = readFileSync(new URL(file.replace(/\.crv$/, '.html'), corpus), 'utf8');
        assert.match(html, /<(aside|div) /);
        const tokens = tokenize(source);
        const kind = /:{3,} +(note|widget)/.exec(source)?.[1];
        assert.ok(kind, file);
        assert.ok(scopesAt(tokens, source, kind).every(scope => openerScope.test(scope)), `${name}: ${file}`);
    }
}
console.log('invalid container metadata: recovery, kind boundaries, valid slots and corpus 255/537 pass');
