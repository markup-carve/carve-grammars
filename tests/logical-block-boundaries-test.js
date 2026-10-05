import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);
for (const [name, tokenize] of [['prism', prismTokens], ['highlightjs', hljsTokens]]) {
    for (const separator of ['\u2028', '\u2029']) {
        for (const block of ['# Heading', '> Quote', '- item', '1. item', '---', '::: note', '| cell |', '^ Caption', ':: Term', '*[ABC]: expansion', '[ref]: /url']) {
            const source = `text${separator}${block}\n`;
            const tokens = tokenize(source);
            assert.equal(tokens.map(t => t.text).join(''), source);
            assert.ok(tokens.every(t => !/title|section|blockquote|quote|list|bullet|thematic-break|meta|table|caption|definition|symbol|div|keyword/.test(t.scope ?? '')), `${name}: ${JSON.stringify(source)}`);
        }
        for (const block of ['---', '+', '|---|']) {
            const source = `${block}${separator}tail\n`;
            assert.ok(tokenize(source).every(t => !/thematic-break|meta|continuation|table-separator/.test(t.scope ?? '')), `${name}: trailing ${JSON.stringify(source)}`);
        }
        const fence = `\`\`\`\ncode${separator}\`\`\`\n# Hidden\n\`\`\`\n`;
        assert.ok(tokenize(fence).filter(t => t.text.includes('Hidden')).every(t => !/title|section/.test(t.scope ?? '')), `${name}: opaque fence closer`);
        for (const block of ['> First', '^ First', ':: First', '*[ABC]: First', '%% First', '%%% First', '- %% First', '# First %% Comment']) {
            const source = `${block}${separator}Second\n`;
            assert.ok(tokenize(source).filter(t => t.text.includes('Second')).every(t => /%%/.test(block) ? /comment/.test(t.scope ?? '') : block.startsWith('*[') && name === 'prism' ? /string/.test(t.scope ?? '') : t.scope), `${name}: full payload ${JSON.stringify(source)}`);
        }
        const literalComment = `text${separator}%% literal\n`;
        assert.ok(tokenize(literalComment).every(t => !/comment/.test(t.scope ?? '')), `${name}: comment needs a space or tab`);
        const source = `# First${separator}Second\n`;
        const tokens = tokenize(source);
        assert.ok(tokens.filter(t => t.text.includes('Second')).every(t => /title|section/.test(t.scope ?? '')), `${name}: heading payload`);
    }
}
const grammar = readFileSync(new URL('../textmate/carve.tmLanguage.json', import.meta.url), 'utf8');
const keys = [...grammar.matchAll(/^    "([^"\n]+)": \{/gm)].map(m => m[1]);
assert.ok(keys.length > 50, 'Repository keys were found');
assert.equal(new Set(keys).size, keys.length, 'TextMate repository keys must be unique');
console.log('Logical block boundaries and unique TextMate repository keys pass.');
