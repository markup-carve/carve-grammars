/**
 * Structural tests for the shared Shiki kit (shiki/index.js).
 * Runs without shiki installed; @shikijs/themes is a dev dependency.
 */
import assert from 'node:assert';
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
import { REQUIRED_ALIASES } from './lib/aliases.js';

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

ok('grammar answers every required alias', () => {
    for (const alias of REQUIRED_ALIASES) {
        assert.ok(
            carveGrammar.name === alias || (carveGrammar.aliases ?? []).includes(alias),
            `grammar answers neither name nor alias ${alias}`,
        );
    }
});

ok('light and dark extras cover the same scopes', () => {
    const scopes = (extras) => extras.map((e) => JSON.stringify(e.scope)).sort();
    assert.deepStrictEqual(scopes(carveLightExtras), scopes(carveDarkExtras));
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
    assert.strictEqual(md.languages[0].name, 'carve');
    assert.ok(md.theme.light.tokenColors.length);
    assert.ok(md.theme.dark.tokenColors.length);
    assert.strictEqual(md.codeTransformers[0].name, 'carve-extras');
    const extraLang = { name: 'other' };
    assert.strictEqual(carveMarkdown({ languages: [extraLang] }).languages[1], extraLang);
});

console.log(`${passed} shiki-kit tests passed`);
