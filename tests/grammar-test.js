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
    'See [@smith2020] and [+@jones2021, p. 5].',
    '',
    '- item',
    '- [x] done',
    '',
    '> quote',
    '',
    '```' + ' php',
    'echo 1;  <1>',
    '```',
    '',
    '<1> the first marked line',
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
// `seen` guards against a token whose `inside` recursively references an
// ancestor object - a normal, supported Prism idiom (Prism's own bundled
// `markup`/`css` grammars do this: `doctype.inside['internal-subset'].inside
// = Prism.languages.markup`, `atrule.inside.rest = Prism.languages.css`), and
// one this grammar's own 'div' token now uses too (carve-grammars#125): a
// div's body includes the language recursively (minus
// 'abbreviation-definition') so a nested div still scopes, which makes
// `div.inside.div === carvePrism.div` a literal object identity cycle. A
// walker with no cycle guard recurses forever on that; every object is
// validated once and re-visits are skipped rather than re-walked.
function validateToken(tok, path, seen = new Set()) {
    if (Array.isArray(tok)) {
        tok.forEach((t, i) => validateToken(t, `${path}[${i}]`, seen));
        return;
    }
    if (isRegExp(tok)) {
        return;
    }
    assert.ok(tok && typeof tok === 'object', `${path} must be RegExp or token object`);
    if (seen.has(tok)) {
        return;
    }
    seen.add(tok);
    assert.ok('pattern' in tok, `${path} missing pattern`);
    assert.ok(isRegExp(tok.pattern), `${path}.pattern must be RegExp`);
    if (tok.inside) {
        for (const k of Object.keys(tok.inside)) {
            validateToken(tok.inside[k], `${path}.inside.${k}`, seen);
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
        // No 'raw-block': there is no percent-fence raw block in the spec, and
        // the `=FORMAT` raw form is a code fence, covered by 'code-block'.
        'comment', 'front-matter', 'code-block', 'title', 'div',
        'table', 'blockquote', 'list', 'math', 'literal', 'code', 'image', 'footnote',
        'url', 'span', 'inserted', 'deleted', 'bold', 'italic', 'underline',
        'strike', 'highlight', 'superscript', 'subscript', 'escape',
        'citation', 'code-callout',
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
// a body must tokenize as front-matter, a `%%% format` opener must be a COMMENT
// (there is no percent-fence raw block in the spec), and math spans keep their
// closing $.
if (realPrism) {
    const typesOf = (src) => realPrism.tokenize(src, carvePrism)
        .filter((t) => typeof t !== 'string')
        .map((t) => t.type);

    ok('prism: front matter before a body is tokenized', () => {
        const types = typesOf('---\ntitle: Demo\n---\n\n# Heading\n');
        assert.ok(types.includes('front-matter'), `expected front-matter token, got: ${types.join(',')}`);
    });

    // This test used to assert the opposite - that `%%% html` is a `raw-block`
    // token. There is no such construct: a raw passthrough block is a CODE
    // fence with an `=FORMAT` info string (```=html), and a `%%%` run is always
    // a comment (spec PART 9 §28). The old assertion is what kept the wrong
    // rule alive, so it is inverted rather than deleted.
    ok('prism: a %%% opener with a trailing word is a comment, not a raw block', () => {
        const types = typesOf('%%% html\n<b>x</b>\n%%%\n');
        assert.ok(types.includes('comment'), `expected comment token, got: ${types.join(',')}`);
        assert.ok(!types.includes('raw-block'), `there is no %%% raw block, got: ${types.join(',')}`);
    });

    ok('prism: bare %%% block is still a comment', () => {
        const types = typesOf('%%%\nhidden\n%%%\n');
        assert.ok(types.includes('comment'), `expected comment token, got: ${types.join(',')}`);
    });

    ok('prism: a trailing tail on the closer still closes the comment', () => {
        const tokens = realPrism.tokenize('%%%\nx\n%%% end\nafter\n', carvePrism);
        const comment = tokens.find((t) => typeof t !== 'string' && t.type === 'comment');
        assert.ok(comment, 'expected a comment token');
        assert.ok(
            String(comment.content).includes('%%% end'),
            `closer with a tail must be part of the comment, got: ${JSON.stringify(String(comment.content))}`,
        );
        assert.ok(
            !String(comment.content).includes('after'),
            'the comment must end at its closer, not swallow the next block',
        );
    });

    // A comment is recognized at ANY column, fence form included (PART 9
    // §24 C3, carve#624/#634 and corpus 186), so an INDENTED opener is closed
    // by an equally indented closer. Generated across the columns rather than
    // written once: the snapshot for corpus 186 pinned highlight.js swallowing
    // the rest of the document here, because a snapshot pins whatever the
    // grammar does - only an assertion about CLOSING can fail.
    for (const indent of ['', ' ', '  ', '\t']) {
        const label = indent === '' ? 'column 0' : `indent ${JSON.stringify(indent)}`;
        ok(`prism: a comment fence at ${label} closes and does not swallow the next block`, () => {
            const src = `${indent}%%%\n${indent}x\n${indent}%%%\nafter\n`;
            const tokens = realPrism.tokenize(src, carvePrism);
            const comments = tokens
                .filter((t) => typeof t !== 'string' && t.type === 'comment')
                .map((t) => String(t.content));
            assert.ok(comments.length > 0, `expected a comment token for ${JSON.stringify(src)}`);
            assert.ok(
                !comments.some((c) => c.includes('after')),
                `the comment must end at its closer, got: ${JSON.stringify(comments)}`,
            );
        });
    }

    ok('prism: the closer matches the opener width exactly', () => {
        // `%%%%` does not close `%%%` (that is what lets a longer fence nest a
        // shorter one), so neither fence line opens a block here: each degrades
        // to a line comment and the body between them stays plain text.
        const tokens = realPrism.tokenize('%%%\nx\n%%%%\n', carvePrism);
        const texts = tokens.filter((t) => typeof t === 'string').join('');
        assert.ok(texts.includes('x'), `body must stay text, got: ${JSON.stringify(texts)}`);
        const comments = tokens.filter((t) => typeof t !== 'string' && t.type === 'comment');
        assert.equal(comments.length, 2, 'both percent-run lines are line comments');
    });

    ok('prism: an unterminated %%% opener still scopes as a comment', () => {
        const types = typesOf('%%% TODO\nsecret\n');
        assert.ok(types.includes('comment'), `expected comment token, got: ${types.join(',')}`);
    });

    ok('prism: a ```=html fence is the raw passthrough path', () => {
        const types = typesOf('```=html\n<b>x</b>\n```\n');
        assert.ok(types.includes('code-block'), `expected code-block token, got: ${types.join(',')}`);
    });

    ok('prism: math is the $ prefix on a verbatim span, with no closing $', () => {
        // grammar.ebnf PART 9 §18: math_inline = '$', code_span. There is no
        // trailing sentinel, so the whole `$`x`` run must be one math token -
        // previously the pattern demanded a closing $ and left `a $` as text
        // with the span falling through to `code`.
        const types = typesOf('a $`x` b');
        assert.ok(types.includes('math'), `expected math token, got: ${types.join(',')}`);
        assert.ok(!types.includes('code'), `math span fell through to code: ${types.join(',')}`);

        const display = typesOf('a $$`y` b');
        assert.ok(display.includes('math'), `expected display math token, got: ${display.join(',')}`);
    });

    ok('prism: a bare $ amount stays literal text', () => {
        // The backtick run is what disambiguates math from currency.
        const types = typesOf('cost $5 today');
        assert.ok(!types.includes('math'), `currency tokenized as math: ${types.join(',')}`);
    });

    ok('prism: inline literal !`x` is a literal token, not code', () => {
        const types = typesOf('a !`/kaet/` b');
        assert.ok(types.includes('literal'), `expected literal token, got: ${types.join(',')}`);
        assert.ok(!types.includes('code'), `!\`…\` must not tokenize as code: ${types.join(',')}`);
    });

    ok('prism: image ![alt](src) is still an image, not a literal', () => {
        const types = typesOf('see ![alt](/u) here');
        assert.ok(types.includes('image'), `expected image token, got: ${types.join(',')}`);
        assert.ok(!types.includes('literal'), `![…] must not tokenize as a literal: ${types.join(',')}`);
    });

    ok('prism: citation [@key] is a citation token', () => {
        const types = typesOf('See [@smith2020] for details.');
        assert.ok(types.includes('citation'), `expected citation token, got: ${types.join(',')}`);
    });

    ok('prism: citation [+@key] integral form is a citation token', () => {
        const types = typesOf('[+@jones2021] argues that...');
        assert.ok(types.includes('citation'), `expected citation token, got: ${types.join(',')}`);
    });

    ok('prism: citation with locator [@key, p.10] is a citation token', () => {
        const types = typesOf('As noted in [@doe2019, p. 42].');
        assert.ok(types.includes('citation'), `expected citation token, got: ${types.join(',')}`);
    });

    ok('prism: citation with multiple items [@a; @b] is a citation token', () => {
        const types = typesOf('See [@alpha; @beta].');
        assert.ok(types.includes('citation'), `expected citation token, got: ${types.join(',')}`);
    });

    ok('prism: link [text](url) is NOT a citation', () => {
        const types = typesOf('[text](https://example.com)');
        assert.ok(!types.includes('citation'), `link was wrongly classified as citation: ${types.join(',')}`);
    });

    ok('prism: code callout <1> is a code-callout token', () => {
        const types = typesOf('    echo hello  <1>');
        assert.ok(types.includes('code-callout'), `expected code-callout token, got: ${types.join(',')}`);
    });

    ok('prism: callout list item <1> text is a code-callout token', () => {
        const types = typesOf('<2> the second marked line');
        assert.ok(types.includes('code-callout'), `expected code-callout token, got: ${types.join(',')}`);
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

ok('hljs: an inline-literal mode (begins with !`) is registered before inline code', () => {
    // Matched on shape, not on an exact prefix: the verbatim families build
    // their begin pattern dynamically (a sigil plus a maximal backtick run), so
    // a literal begins with `!` followed by backtick machinery rather than a
    // literal "!`" pair.
    const beginsOf = (m) => (m && m.begin && (m.begin.source || String(m.begin))) || '';
    const litIdx = def.contains.findIndex((m) => /^!\(\?|^!`/.test(beginsOf(m)));
    const codeIdx = def.contains.findIndex((m) => /^\(\?<!`\)|^`/.test(beginsOf(m)));
    assert.ok(litIdx !== -1, 'expected an inline-literal mode beginning with !`');
    assert.ok(codeIdx === -1 || litIdx < codeIdx, 'literal mode must precede inline-code modes');
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

    for (const indent of ['', ' ', '  ', '\t']) {
        const label = indent === '' ? 'column 0' : `indent ${JSON.stringify(indent)}`;
        ok(`hljs: a comment fence at ${label} closes and does not swallow the next block`, () => {
            // The opener was already column-free here; the CLOSER was anchored
            // at column 0, so an indented fence never closed and the comment
            // ran to the end of the document (carve-grammars, corpus 186).
            const src = `${indent}%%%\n${indent}x\n${indent}%%%\nafter\n`;
            const { value } = realHljs.highlight(src, { language: 'carve' });
            const comments = [...value.matchAll(/<span class="hljs-comment">([\s\S]*?)<\/span>/g)].map(
                (m) => m[1],
            );
            assert.ok(comments.length > 0, `expected a comment span for ${JSON.stringify(src)}`);
            assert.ok(
                !comments.some((c) => c.includes('after')),
                `the comment must end at its closer, got: ${JSON.stringify(comments)}`,
            );
        });
    }

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

    ok('hljs: a %%% opener with a trailing word is a comment, not raw output', () => {
        // `%%% html` is a comment (spec PART 9 §28); there is no percent-fence
        // raw block. The body must be inside the comment span, and the block
        // after the closer must survive.
        const src = '%%% html\n<b>secret</b>\n%%%\n# after\n';
        const { value } = realHljs.highlight(src, { language: 'carve' });
        const m = value.match(/<span class="hljs-comment">([\s\S]*?)<\/span>/);
        assert.ok(m, 'expected a comment span: ' + value);
        assert.ok(m[1].includes('secret'), 'comment body escaped the comment span: ' + value);
        assert.ok(value.includes('hljs-section'), 'content after the closer was lost: ' + value);
    });

    ok('hljs: a trailing tail on the closer still closes the comment', () => {
        const { value } = realHljs.highlight('%%%\nx\n%%% end\n# after\n', { language: 'carve' });
        assert.ok(value.includes('hljs-section'), 'closer with a tail did not close: ' + value);
    });

    ok('hljs: the closer matches the opener width exactly', () => {
        // A `%%%` line must not close a `%%%%` fence, which is what lets a
        // longer fence nest a shorter one.
        const { value } = realHljs.highlight('%%%%\nhas %%% inner\n%%%%\n# after\n', { language: 'carve' });
        const m = value.match(/<span class="hljs-comment">([\s\S]*?)<\/span>/);
        assert.ok(m, 'expected a comment span: ' + value);
        assert.ok(m[1].includes('inner'), 'inner shorter fence closed the block early: ' + value);
        assert.ok(value.includes('hljs-section'), 'content after the closer was lost: ' + value);
    });

    ok('hljs: double-backtick inline code keeps an embedded backtick', () => {
        // ``a ` b`` must stay one code span, not close on the inner single `
        const { value } = realHljs.highlight('``a ` b`` rest', { language: 'carve' });
        const m = value.match(/<span class="hljs-code">([\s\S]*?)<\/span>/);
        assert.ok(m, 'expected an inline code span: ' + value);
        assert.ok(m[1].includes('`'), 'inline code span dropped the embedded backtick: ' + value);
    });

    // Widened verbatim fences (#52). highlight.js has no begin->end
    // backreference, so these families used to declare only the double and
    // single widths: a fence of three or more opened on the first two and closed
    // at the first shorter run inside it, leaking the rest of the span as prose.
    // The width is now carried across in `resp.data`.
    for (const [family, src, cls] of [
        ['inline math', 'a $```p `` q``` b', 'string'],
        ['display math', 'a $$```p `` q``` b', 'string'],
        ['inline literal', 'a !```p `` q``` b', 'string'],
        ['inline code', 'a ```p `` q``` b', 'code'],
    ]) {
        ok(`hljs: a widened fence closes at its own width (${family})`, () => {
            const { value } = realHljs.highlight(src, { language: 'carve' });
            const re = new RegExp(`<span class="hljs-${cls}">([\\s\\S]*?)</span>`);
            const m = value.match(re);
            assert.ok(m, `expected a ${cls} span for ${family}: ${value}`);
            assert.ok(
                m[1].includes('``'),
                `${family} closed at the embedded shorter run: ${value}`,
            );
            assert.ok(
                m[1].includes('q'),
                `${family} lost content before its real closer: ${value}`,
            );
            // The trailing prose must survive outside the span.
            assert.ok(
                value.replace(/<[^>]+>/g, '').endsWith(' b'),
                `${family} swallowed the trailing prose: ${value}`,
            );
        });
    }

    ok('hljs: citation [@key] produces a symbol span', () => {
        const { value } = realHljs.highlight('See [@smith2020] and [@jones].', { language: 'carve' });
        assert.ok(value.includes('hljs-symbol'), `citation did not get a symbol class: ${value}`);
    });

    ok('hljs: link [text](url) is not classified as citation', () => {
        const { value } = realHljs.highlight('[click here](https://example.com)', { language: 'carve' });
        // should be hljs-link, not hljs-symbol from the citation mode
        assert.ok(value.includes('hljs-link'), `link did not get link class: ${value}`);
    });

    ok('hljs: code callout <1> produces a symbol span', () => {
        const { value } = realHljs.highlight('    echo hello  <1>', { language: 'carve' });
        assert.ok(value.includes('hljs-symbol'), `code callout did not get symbol class: ${value}`);
    });
} else {
    console.log('  – (highlight.js not installed, skipping real highlight test)');
}

console.log(`\n${passed} passed`);
