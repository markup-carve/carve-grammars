/**
 * Structural tests for the shared Shiki kit (shiki/index.js).
 * Runs without shiki installed; @shikijs/themes is a dev dependency.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
    carveGrammar,
    carveLightExtras,
    carveDarkExtras,
    carveLightTheme,
    carveDarkTheme,
    carveStylingTransformer,
    carveMarkdown,
    extendTheme,
} from '../shiki/index.js';

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ shiki: ${name}`);
}

ok('grammar is named carve and has the repository', () => {
    assert.strictEqual(carveGrammar.name, 'carve');
    assert.ok(carveGrammar.repository.subscript);
    assert.ok(carveGrammar.repository.math_inline);
});

ok('light and dark extras cover the same scopes', () => {
    const scopes = (extras) => extras.map((e) => JSON.stringify(e.scope)).sort();
    assert.deepStrictEqual(scopes(carveLightExtras), scopes(carveDarkExtras));
});

ok('list continuation markers use a distinct color in both themes', () => {
    for (const extras of [carveLightExtras, carveDarkExtras]) {
        const rule = (scope) => extras.find((entry) => entry.scope === scope
            || Array.isArray(entry.scope) && entry.scope.includes(scope));
        const list = rule('punctuation.definition.list').settings.foreground;
        const continuation = rule('punctuation.definition.list.continuation').settings.foreground;
        assert.notStrictEqual(continuation, list);
    }
});

ok('table boundaries, headers, alignment, spans and continuation use separate colors', () => {
    for (const [extras, boundaryColor, headerColor, alignmentColor, spanColor, continuationColor] of [
        [carveLightExtras, '#959da5', '#005cc5', '#e36209', '#6f42c1', '#22863a'],
        [carveDarkExtras, '#6a737d', '#79b8ff', '#ffab70', '#b392f0', '#85e89d'],
    ]) {
        const rule = (scope) => extras.find((entry) => entry.scope === scope
            || Array.isArray(entry.scope) && entry.scope.includes(scope));
        assert.strictEqual(rule('punctuation.separator.table').settings.foreground, boundaryColor);
        assert.strictEqual(rule('keyword.operator.table.header').settings.foreground, headerColor);
        assert.strictEqual(rule('keyword.operator.table.alignment').settings.foreground, alignmentColor);
        for (const marker of ['colspan', 'rowspan']) {
            assert.strictEqual(rule(`keyword.operator.table.${marker}`).settings.foreground, spanColor);
        }
        assert.strictEqual(rule('keyword.operator.table.continuation').settings.foreground, continuationColor);
    }
});

ok('extended themes append the extras', () => {
    assert.ok(carveLightTheme.tokenColors.length > carveLightExtras.length);
    assert.ok(carveDarkTheme.tokenColors.length > carveDarkExtras.length);
    const dummy = extendTheme({ name: 't', tokenColors: [] }, carveLightExtras);
    assert.strictEqual(dummy.tokenColors.length, carveLightExtras.length);
});

ok('transformer tags strike/super/sub/highlight tokens', () => {
    const mk = (scopeName, fontStyle = 0) => ({
        fontStyle,
        explanation: [{ scopes: [{ scopeName }] }],
    });
    const tokens = [[
        mk('markup.strikethrough.carve'),
        mk('markup.superscript.carve'),
        mk('markup.subscript.carve'),
        mk('markup.highlight.carve'),
        mk('markup.bold.carve'),
        mk('irrelevant', 8), // strikethrough via fontStyle bit
    ]];
    carveStylingTransformer.tokens(tokens);
    const attrs = tokens[0].map((t) => Object.keys(t.htmlAttrs ?? {}));
    assert.deepStrictEqual(attrs, [
        ['data-carve-strike'],
        ['data-carve-super'],
        ['data-carve-sub'],
        ['data-carve-highlight'],
        [],
        ['data-carve-strike'],
    ]);
});

ok('carveMarkdown returns a spreadable vitepress markdown config', () => {
    const md = carveMarkdown();
    assert.deepStrictEqual(md.languages.map((lang) => lang.name), ['carve', 'carve-csv', 'carve-tsv']);
    assert.ok(md.theme.light.tokenColors.length);
    assert.ok(md.theme.dark.tokenColors.length);
    assert.strictEqual(md.codeTransformers[0].name, 'carve-extras');
    const extraLang = { name: 'other' };
    assert.strictEqual(carveMarkdown({ languages: [extraLang] }).languages.at(-1), extraLang);
});

const browser = await import('../shiki/themes.js');
ok('the browser entry carries the same themes and needs no Node.js module', () => {
    assert.strictEqual(browser.carveLightTheme, carveLightTheme);
    assert.strictEqual(browser.carveDarkTheme, carveDarkTheme);
    assert.strictEqual(browser.carveStylingTransformer, carveStylingTransformer);
    const source = readFileSync(new URL('../shiki/themes.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from ['"]node:/);
});

console.log(`${passed} shiki-kit tests passed`);
