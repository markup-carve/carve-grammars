/**
 * Structural + smoke tests for the Prism and highlight.js Carve grammars.
 *
 * These run without `prismjs` / `highlight.js` installed: the grammars are
 * loaded against minimal stubs and checked for shape and valid patterns.
 * If the real libraries happen to be installed, an extra highlight smoke test
 * runs and asserts non-empty token output.
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

const SAMPLE = [
    '---',
    'title: Demo',
    '---',
    '',
    '# Heading /italic/ *bold* _under_',
    '',
    'Text with ==mark==, ~strike~, ^sup^, ,,sub,, and `code`.',
    'A {+ins+}, {-del-}, [span]{.note}, [^fn] and a [link](https://example.com).',
    '',
    '- item',
    '- [x] done',
    '',
    '> quote',
    '',
    '```' + ' php',
    'echo 1;',
    '```',
    '',
    '::: warning',
    'body',
    ':::',
    '',
    '| a | b |',
    '|= h |= h |',
].join('\n');

console.log('carve-grammars highlight grammars:');

// ----- Prism -----
function isRegExp(v) {
    return Object.prototype.toString.call(v) === '[object RegExp]';
}
function validateToken(tok, path) {
    if (Array.isArray(tok)) {
        tok.forEach((t, i) => validateToken(t, `${path}[${i}]`));
        return;
    }
    if (isRegExp(tok)) {
        return;
    }
    assert.ok(tok && typeof tok === 'object', `${path} must be RegExp or token object`);
    assert.ok('pattern' in tok, `${path} missing pattern`);
    assert.ok(isRegExp(tok.pattern), `${path}.pattern must be RegExp`);
    if (tok.inside) {
        for (const k of Object.keys(tok.inside)) {
            validateToken(tok.inside[k], `${path}.inside.${k}`);
        }
    }
}

// Load the Prism grammar exactly once. If prismjs is installed, register
// against it (so the real tokenizer/highlighter is available below); otherwise
// register against a minimal stub. The grammar reads globalThis.Prism at import
// time, so the host is chosen before the single import - no query-string
// cache-busting (which Node's ESM loader rejects on some versions).
const realPrism = (() => { try { return require('prismjs'); } catch { return null; } })();
const prismHost = realPrism || { languages: {} };
globalThis.Prism = prismHost;
await import('../prism/carve.js');
delete globalThis.Prism;
const carvePrism = prismHost.languages.carve;

ok('prism: grammar registered on Prism.languages.carve', () => {
    assert.ok(carvePrism, 'Prism.languages.carve not defined');
});

ok('prism: required token names present', () => {
    const required = [
        'comment', 'front-matter', 'code-block', 'raw-block', 'title', 'div',
        'table', 'blockquote', 'list', 'math', 'code', 'image', 'footnote',
        'url', 'span', 'inserted', 'deleted', 'bold', 'italic', 'underline',
        'strike', 'highlight', 'superscript', 'subscript', 'escape',
    ];
    for (const key of required) {
        assert.ok(key in carvePrism, `prism grammar missing token: ${key}`);
    }
});

ok('prism: every token pattern is a valid RegExp', () => {
    for (const key of Object.keys(carvePrism)) {
        if (key === 'carvemd') continue; // alias reference
        validateToken(carvePrism[key], `carve.${key}`);
    }
});

// Regression tokenizer tests (need the real Prism engine). Front matter before
// a body must tokenize as front-matter, a `%%% format` opener must be a raw
// block (not the bare-fence comment), and math spans keep their closing $.
if (realPrism) {
    const typesOf = (src) => realPrism.tokenize(src, carvePrism)
        .filter((t) => typeof t !== 'string')
        .map((t) => t.type);

    ok('prism: front matter before a body is tokenized', () => {
        const types = typesOf('---\ntitle: Demo\n---\n\n# Heading\n');
        assert.ok(types.includes('front-matter'), `expected front-matter token, got: ${types.join(',')}`);
    });

    ok('prism: %%% raw block with a format is not a comment', () => {
        const types = typesOf('%%% html\n<b>x</b>\n%%%\n');
        assert.ok(types.includes('raw-block'), `expected raw-block token, got: ${types.join(',')}`);
        assert.ok(!types.includes('comment'), `raw block must not be a comment, got: ${types.join(',')}`);
    });

    ok('prism: bare %%% block is still a comment', () => {
        const types = typesOf('%%%\nhidden\n%%%\n');
        assert.ok(types.includes('comment'), `expected comment token, got: ${types.join(',')}`);
    });

    ok('prism: math spans include the trailing $ / $$', () => {
        const html = realPrism.highlight('$`x`$ and $$`y`$$', carvePrism, 'carve');
        // both closing delimiters must be inside a token span, not bare text
        assert.ok(!/`<\/span>\$/.test(html), `trailing $ left outside math token: ${html}`);
        assert.ok(html.includes('`x`$</span>') || html.includes('`x`$'), `inline math close missing: ${html}`);
    });
} else {
    console.log('  – (prismjs not installed, skipping tokenizer regression tests)');
}

// ----- highlight.js -----
// Import the ESM shim (carve.js is UMD with no default export; the package
// `exports` map routes `import` of carve.js here in real consumers).
const hljsDef = (await import('../highlightjs/carve.mjs')).default;

ok('hljs: default export is a language factory', () => {
    assert.strictEqual(typeof hljsDef, 'function', 'export must be a function');
});

const def = hljsDef({});

ok('hljs: carve.js loads as a classic <script> and self-registers', () => {
    // Regression: the file must remain a classic-script-safe UMD (no top-level
    // `export`), so a browser <script src=".../carve.js"> still registers.
    const code = readFileSync(new URL('../highlightjs/carve.js', import.meta.url), 'utf8');
    let registered = null;
    const sandbox = { hljs: { registerLanguage: (name, fn) => { registered = { name, fn }; } } };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox); // must not throw a SyntaxError
    assert.ok(registered && registered.name === 'carve', 'classic script did not register the carve language');
    assert.strictEqual(typeof registered.fn, 'function', 'registered value is not a language factory');
    assert.strictEqual(typeof sandbox.carveHljs, 'function', 'globalThis.carveHljs not exposed for the ESM shim');
});

ok('hljs: definition has name, aliases, contains', () => {
    assert.strictEqual(def.name, 'Carve');
    assert.ok(Array.isArray(def.aliases) && def.aliases.includes('carve'), 'aliases must include carve');
    assert.ok(Array.isArray(def.contains) && def.contains.length > 0, 'contains must be a non-empty array');
});

ok('hljs: every mode begin/end is RegExp or string', () => {
    const seen = new Set();
    function walk(mode, path) {
        if (!mode || typeof mode !== 'object' || seen.has(mode)) return;
        seen.add(mode);
        for (const k of ['begin', 'end']) {
            if (k in mode) {
                const v = mode[k];
                assert.ok(isRegExp(v) || typeof v === 'string', `${path}.${k} must be RegExp or string`);
            }
        }
        (mode.contains || []).forEach((m, i) => walk(m, `${path}.contains[${i}]`));
    }
    def.contains.forEach((m, i) => walk(m, `contains[${i}]`));
});

// ----- Optional real-library smoke tests -----
// realPrism + carvePrism are already set up above (single registration).
if (realPrism) {
    ok('prism: real highlight produces token markup', () => {
        const html = realPrism.highlight(SAMPLE, carvePrism, 'carve');
        assert.ok(html.length > SAMPLE.length, 'expected wrapped token markup');
        assert.ok(html.includes('token'), 'expected Prism token spans');
    });
} else {
    console.log('  – (prismjs not installed, skipping real highlight test)');
}

let realHljs = null;
try { realHljs = require('highlight.js'); } catch { /* not installed */ }
if (realHljs) {
    realHljs.registerLanguage('carve', hljsDef);
    ok('hljs: real highlight produces token markup', () => {
        const { value } = realHljs.highlight(SAMPLE, { language: 'carve' });
        assert.ok(value.length > 0, 'expected highlighted output');
        assert.ok(value.includes('hljs-'), 'expected hljs token classes');
    });

    ok('hljs: a mid-document --- does not swallow the rest of the document', () => {
        // The `---` is a horizontal rule (meta), but it must NOT start a
        // front-matter span that eats everything up to the next `---`. The
        // heading that follows must still be highlighted as a section.
        const { value } = realHljs.highlight('para\n---\n# h\n', { language: 'carve' });
        assert.ok(value.includes('hljs-section'), `heading after --- must still be a section: ${value}`);
    });

    ok('hljs: fence lines are highlighted and following content survives', () => {
        const src = '```\n~~~\nstill code\n```\n# after\n';
        const { value } = realHljs.highlight(src, { language: 'carve' });
        // the heading after the fences must still be a section
        assert.ok(value.includes('hljs-section'), 'content after fences was lost: ' + value);
    });

    ok('hljs: double-backtick inline code keeps an embedded backtick', () => {
        // ``a ` b`` must stay one code span, not close on the inner single `
        const { value } = realHljs.highlight('``a ` b`` rest', { language: 'carve' });
        const m = value.match(/<span class="hljs-code">([\s\S]*?)<\/span>/);
        assert.ok(m, 'expected an inline code span: ' + value);
        assert.ok(m[1].includes('`'), 'inline code span dropped the embedded backtick: ' + value);
    });
} else {
    console.log('  – (highlight.js not installed, skipping real highlight test)');
}

console.log(`\n${passed} passed`);
