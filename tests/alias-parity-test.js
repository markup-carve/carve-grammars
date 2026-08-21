/**
 * The three highlighting surfaces answer the same fence words.
 *
 * A shared alias set is only worth writing down if something checks it on
 * every surface: the surfaces are three files with three registration APIs,
 * and each one's own tests assert what that surface already implements, so an
 * alias present in one and missing in another is invisible from inside either.
 * That is how `crv` - the canonical file extension - came to highlight under
 * Shiki and stay plain text under Prism and highlight.js.
 *
 * Each surface is probed through ITS OWN API, never inferred from another's
 * source: Prism by the key its resolver would reach, highlight.js by
 * `getLanguage`, Shiki by asking a real highlighter to render with the name.
 * Where the real library is installed the check runs through it; otherwise it
 * falls back to the definition's own shape, so the invariant is still asserted
 * on a bare checkout.
 *
 * See `tests/lib/aliases.js` for the set and for the per-surface API
 * constraints that decide which extras are reachable.
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { REQUIRED_ALIASES, SURFACE_EXTRAS } from './lib/aliases.js';

const require = createRequire(import.meta.url);

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ aliases: ${name}`);
}
async function okAsync(name, fn) {
    await fn();
    passed++;
    console.log(`  ✓ aliases: ${name}`);
}

// ----- the test is only alive if the runner names it -----
//
// `npm test` is an explicit chain of `node tests/*.js` invocations, not a
// glob, so a test file that is not named in it never runs and never fails.
// This assertion is the one that catches that, and it has to live in the file
// it is about.
ok('this test file is wired into the npm test chain', () => {
    const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    assert.ok(
        pkg.scripts.test.includes('node tests/alias-parity-test.js'),
        'package.json "test" does not run tests/alias-parity-test.js, so this file is dead',
    );
});

// ----- Prism -----
//
// Same single-import host dance as tests/grammar-test.js: the grammar reads
// globalThis.Prism at import time, so the host is chosen before the import.
const realPrism = (() => { try { return require('prismjs'); } catch { return null; } })();
const prismHost = realPrism || { languages: {} };
globalThis.Prism = prismHost;
await import('../prism/carve.js');
delete globalThis.Prism;

ok('prism: every required fence word resolves to the carve grammar', () => {
    const carve = prismHost.languages.carve;
    assert.ok(carve, 'Prism.languages.carve not defined');
    for (const name of REQUIRED_ALIASES) {
        // Compared with `ok`, not `strictEqual`: a mismatch here would print
        // the entire grammar object as a diff.
        assert.ok(
            prismHost.languages[name] === carve,
            `Prism.languages.${name} does not resolve to the carve grammar`,
        );
    }
});

ok('prism: every alias key is lowercase, as Prism resolution requires', () => {
    // Prism.util.getLanguage lowercases the `language-xxx` class, so an
    // uppercase key is assignable but unreachable from markup.
    const keys = [...REQUIRED_ALIASES, ...Object.keys(SURFACE_EXTRAS.prism)];
    for (const name of keys) {
        assert.strictEqual(name, name.toLowerCase(), `Prism alias ${name} is unreachable: keys must be lowercase`);
    }
});

ok('prism: the documented extras resolve too', () => {
    const carve = prismHost.languages.carve;
    for (const name of Object.keys(SURFACE_EXTRAS.prism)) {
        assert.ok(prismHost.languages[name] === carve, `Prism.languages.${name} does not resolve to the carve grammar`);
    }
});

if (realPrism) {
    ok('prism: a real highlight under every required fence word emits tokens', () => {
        for (const name of REQUIRED_ALIASES) {
            const html = realPrism.highlight('# Heading /italic/', realPrism.languages[name], name);
            assert.ok(html.includes('token'), `Prism produced no tokens for language ${name}`);
        }
    });
} else {
    console.log('  - (prismjs not installed, skipping the real highlight check)');
}

// ----- highlight.js -----
const hljsDef = (await import('../highlightjs/carve.mjs')).default;
const def = hljsDef({});

ok('hljs: the definition answers every required fence word', () => {
    // registerLanguage registers the name it is given and every entry of the
    // definition's own `aliases`, both lowercased.
    const answered = new Set([
        String(def.name).toLowerCase(),
        ...(def.aliases ?? []).map((a) => String(a).toLowerCase()),
    ]);
    for (const name of REQUIRED_ALIASES) {
        assert.ok(answered.has(name), `highlight.js definition answers no fence word ${name}`);
    }
});

ok('hljs: no alias differs from another only by case', () => {
    // getLanguage lowercases its argument, so a casing variant would be a dead
    // entry rather than an alias.
    const aliases = def.aliases ?? [];
    const seen = new Set();
    for (const alias of aliases) {
        const lower = String(alias).toLowerCase();
        assert.ok(!seen.has(lower), `highlight.js alias ${alias} duplicates another entry once lowercased`);
        seen.add(lower);
    }
});

let realHljs = null;
try { realHljs = require('highlight.js'); } catch { /* not installed */ }
if (realHljs) {
    realHljs.registerLanguage('carve', hljsDef);
    ok('hljs: getLanguage answers every required fence word after registration', () => {
        for (const name of REQUIRED_ALIASES) {
            assert.ok(realHljs.getLanguage(name), `highlight.js getLanguage(${name}) is undefined`);
        }
    });
    ok('hljs: a real highlight under every required fence word emits token classes', () => {
        for (const name of REQUIRED_ALIASES) {
            const { value } = realHljs.highlight('# Heading /italic/', { language: name });
            assert.ok(value.includes('hljs-'), `highlight.js produced no token classes for language ${name}`);
        }
    });
} else {
    console.log('  - (highlight.js not installed, skipping the real registration check)');
}

// ----- Shiki -----
const { carveGrammar, carveLightTheme } = await import('../shiki/index.js');

ok('shiki: the grammar answers every required fence word', () => {
    const answered = new Set([carveGrammar.name, ...(carveGrammar.aliases ?? [])]);
    for (const name of REQUIRED_ALIASES) {
        assert.ok(answered.has(name), `the Shiki grammar answers no fence word ${name}`);
    }
});

ok('shiki: the documented extras are listed', () => {
    const answered = new Set([carveGrammar.name, ...(carveGrammar.aliases ?? [])]);
    for (const name of Object.keys(SURFACE_EXTRAS.shiki)) {
        assert.ok(answered.has(name), `the Shiki grammar does not list the documented extra ${name}`);
    }
});

let shiki = null;
try { shiki = await import('shiki'); } catch { /* not installed */ }
if (shiki) {
    await okAsync('shiki: a real highlighter renders under every required fence word', async () => {
        const highlighter = await shiki.createHighlighter({
            langs: [carveGrammar],
            themes: [carveLightTheme],
        });
        try {
            for (const name of REQUIRED_ALIASES) {
                const html = highlighter.codeToHtml('# Heading /italic/', {
                    lang: name,
                    theme: carveLightTheme.name,
                });
                assert.ok(html.includes('<span'), `Shiki produced no spans for language ${name}`);
            }
        } finally {
            highlighter.dispose?.();
        }
    });
} else {
    console.log('  - (shiki not installed, skipping the real highlighter check)');
}

console.log(`\n${passed} passed`);
