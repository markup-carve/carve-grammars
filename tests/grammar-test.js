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

// Load the Prism grammar against a stub so it registers without the real lib.
const prismStub = { languages: {} };
globalThis.Prism = prismStub;
await import('../prism/carve.js');
const carvePrism = prismStub.languages.carve;
delete globalThis.Prism;

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

// Regression: top-of-file front matter followed by a body must tokenize as
// front-matter (not typography), and a `%%% format` opener must be a raw block
// (not swallowed by the bare-fence comment rule).
await (async () => {
    const realPrismMod = (() => { try { return require('prismjs'); } catch { return null; } })();
    if (!realPrismMod) {
        console.log('  – (prismjs not installed, skipping tokenizer regression tests)');
        return;
    }
    globalThis.Prism = realPrismMod;
    await import('../prism/carve.js?regress');
    delete globalThis.Prism;
    const typesOf = (src) => realPrismMod.tokenize(src, realPrismMod.languages.carve)
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
        const html = realPrismMod.highlight('$`x`$ and $$`y`$$', realPrismMod.languages.carve, 'carve');
        // both closing delimiters must be inside a token span, not bare text
        assert.ok(!/`<\/span>\$/.test(html), `trailing $ left outside math token: ${html}`);
        assert.ok(html.includes('`x`$</span>') || html.includes('`x`$'), `inline math close missing: ${html}`);
    });
})();

// ----- highlight.js -----
const hljsDef = (await import('../highlightjs/carve.js')).default;

ok('hljs: default export is a language factory', () => {
    assert.strictEqual(typeof hljsDef, 'function', 'export must be a function');
});

const def = hljsDef({});

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
let realPrism = null;
try { realPrism = require('prismjs'); } catch { /* not installed */ }
if (realPrism) {
    // Register against the real Prism (the grammar reads globalThis.Prism).
    globalThis.Prism = realPrism;
    await import('../prism/carve.js?real');
    delete globalThis.Prism;
    ok('prism: real highlight produces token markup', () => {
        const html = realPrism.highlight(SAMPLE, realPrism.languages.carve, 'carve');
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
