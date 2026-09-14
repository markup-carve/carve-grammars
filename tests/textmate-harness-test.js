import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHighlighter } from 'shiki';

import { textmateTokenizer } from './lib/textmate-engine.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tokenize = await textmateTokenizer(resolve(repoRoot, 'textmate/carve.tmLanguage.json'));

const BOLD = 'markup.bold.carve';
const covered = (source) => tokenize(source)
    .filter((leaf) => leaf.scope.split(' ').includes(BOLD))
    .map((leaf) => leaf.text)
    .join('');

for (const source of ['a *b c\n\nnext paragraph', 'a *b c\n \t\nnext paragraph']) {
    assert.equal(tokenize(source).map((leaf) => leaf.text).join(''), source);
    assert.equal(covered(source), 'b c');
}

assert.doesNotThrow(() => tokenize('a *b\nc* d'));
assert.doesNotThrow(() => tokenize('a *b* c\n'));
assert.deepEqual(tokenize(''), []);

const grammar = JSON.parse(await import('node:fs').then(({ readFileSync }) =>
    readFileSync(resolve(repoRoot, 'textmate/carve.tmLanguage.json'), 'utf8')));
const frontmatter = grammar.repository.frontmatter.patterns;
for (const name of ['json', 'toml', 'yaml']) {
    const rules = frontmatter.filter((candidate) => candidate.name === `meta.frontmatter.${name}.carve`);
    assert.ok(rules.every((rule) => rule.contentName === `meta.embedded.block.${name}`));
    assert.ok(rules.some((rule) => rule.patterns.some((pattern) => pattern.include === `source.${name}`)), `${name} should delegate to its host grammar`);
    assert.ok(rules.some((rule) => rule.patterns.length > 2), `${name} should retain standalone fallback patterns`);
}
assert.ok(frontmatter.some((rule) => rule.name === 'meta.frontmatter.unknown.carve'));

const embedded = await createHighlighter({
    themes: ['github-light'],
    langs: ['json', 'toml', 'yaml', { ...grammar, name: 'carve' }],
});
for (const [format, payload, expectedScope] of [
    ['yaml', 'description: |\n  one\n  two', 'string.unquoted.block.yaml'],
    ['toml', '[[products]]', 'entity.name.section.toml'],
    ['json', '{"nested":{"enabled":true}}', 'constant.language.json'],
]) {
    const opener = format === 'yaml' ? '---' : `---${format}`;
    const result = embedded.codeToTokens(`${opener}\n${payload}\n---`, {
        lang: 'carve', theme: 'github-light', includeExplanation: 'scopeName',
    });
    const scopes = result.tokens.flatMap((line) => line).flatMap((token) =>
        (token.explanation ?? []).flatMap((part) => part.scopes.map((scope) => scope.scopeName)));
    assert.ok(scopes.includes(expectedScope), `${format} should delegate advanced syntax to ${expectedScope}`);
}

console.log('textmate harness: blank lines reach the TextMate state machine');
