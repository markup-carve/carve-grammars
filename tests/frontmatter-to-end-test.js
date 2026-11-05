// carve#5016: a first-line opener with no closer runs to the end of the document.
import assert from 'node:assert/strict';
import { carveToHtml } from '@markup-carve/carve';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { textmateTokenizer } from './lib/textmate-engine.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const textmate = await textmateTokenizer(new URL('../textmate/carve.tmLanguage.json', import.meta.url).pathname);
let passed = 0;

const SOURCES = ['---\n\nPara *b*\n\n# Heading\n', '---\nx *b*', '--- json\n{"a": *b*}\n', '---toml\na = 1\n*b*\n', '﻿---\n*b*\n'];
console.log('front matter without a closer:');
for (const source of SOURCES) {
    assert.equal(carveToHtml(source).trim(), '', `engine: ${JSON.stringify(source)}`);
    assert.ok(!prismTokens(source).some((t) => /bold|heading|title/.test(t.scope ?? '')), `prism: ${JSON.stringify(source)}`);
    assert.ok(!hljsTokens(source).some((t) => t.scope === 'strong' || t.scope === 'section'), `highlight.js: ${JSON.stringify(source)}`);
    assert.ok(!textmate(source).some((t) => /markup\.(bold|heading)/.test(t.scope ?? '')), `textmate: ${JSON.stringify(source)}`);
    passed++;
    console.log(`  ✓ ${JSON.stringify(source)}`);
}

const LATER = 'x\n---\n*b*\n';
assert.match(carveToHtml(LATER), /<hr>/);
assert.ok(prismTokens(LATER).some((t) => /bold/.test(t.scope ?? '')), 'prism: a later dash run is no front matter');
assert.ok(hljsTokens(LATER).some((t) => t.scope === 'strong'), 'highlight.js: a later dash run is no front matter');
passed++;
console.log('  ✓ a dash run after the first line is a thematic break');
console.log(`${passed} passed`);
