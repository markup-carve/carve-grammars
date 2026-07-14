/**
 * Cross-engine construct sweep for the Prism and highlight.js grammars.
 *
 * The snapshot tests pin whatever the grammars currently do -- so a construct
 * with NO rule at all snapshots happily as unscoped text, and a construct
 * claimed by the WRONG rule snapshots happily under the wrong scope. Both went
 * unnoticed that way: the forced brace family (`{_path_}`, `{/a/b/}`) had no
 * rules in either engine and was being swallowed by the attribute rule.
 *
 * This sweep asserts two engine-agnostic invariants over every construct, so a
 * missing or mis-ordered rule fails instead of being pinned:
 *
 *   1. COVERED   -- the construct's payload text carries some scope (it is not
 *                   plain text).
 *   2. NOT-ATTRS -- it is not scoped as an attribute block, unless it IS one.
 *                   This is the failure mode the `{...}` family keeps hitting:
 *                   the attribute rule opens on any brace and steals the span.
 *
 * Deliberately NOT asserting exact scope names: Prism and highlight.js use
 * different vocabularies, and pinning those is what the snapshots are for.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ----- Prism -----
const Prism = require('prismjs');
globalThis.Prism = Prism;
await import('../prism/carve.js');
delete globalThis.Prism;
const carveGrammar = Prism.languages.carve;

function prismLeaves(tokens, parentPath = '') {
    const out = [];
    for (const tok of tokens) {
        if (typeof tok === 'string') {
            out.push({ scope: parentPath || null, text: tok });
            continue;
        }
        const path = parentPath ? `${parentPath}>${tok.type}` : tok.type;
        if (Array.isArray(tok.content)) {
            out.push(...prismLeaves(tok.content, path));
        } else if (tok.content && typeof tok.content === 'object') {
            out.push(...prismLeaves([tok.content], path));
        } else {
            out.push({ scope: path, text: String(tok.content) });
        }
    }
    return out;
}
const prismTokens = (src) => prismLeaves(Prism.tokenize(src, carveGrammar));

// ----- highlight.js -----
const hljs = require('highlight.js');
const hljsCarve = (await import('../highlightjs/carve.mjs')).default;
hljs.registerLanguage('carve', hljsCarve);

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };
const unescapeHtml = (s) => s.replace(/&(?:lt|gt|amp|quot|#x27|#39);/g, (m) => ENTITIES[m]);

function hljsTokens(source) {
    const { value } = hljs.highlight(source, { language: 'carve' });
    const out = [];
    const stack = [];
    const re = /<span class="([^"]*)">|<\/span>|([^<]+)/g;
    let m;
    while ((m = re.exec(value)) !== null) {
        if (m[1] !== undefined) stack.push(m[1].replace(/^hljs-/, ''));
        else if (m[2] !== undefined) out.push({ scope: stack.at(-1) ?? null, text: unescapeHtml(m[2]) });
        else stack.pop();
    }
    return out;
}

// [label, sample, payload-that-must-be-scoped, isAttributeConstruct]
const CASES = [
    ['italic', 'some /italic/ text', 'italic', false],
    ['bold', 'some *bold* text', 'bold', false],
    ['bold-italic', 'some /*both*/ text', 'both', false],
    ['underline', 'some _under_ text', 'under', false],
    ['strike', 'some ~strike~ text', 'strike', false],
    ['highlight bare', 'a =mark= b', 'mark', false],
    ['inline code', 'a `code` b', 'code', false],

    // The braced family. Every one of these is a `{...}` span that the
    // attribute rule will happily claim if it is ordered first or the span has
    // no rule of its own.
    ['forced bold', 'foo{*bar*}baz', 'bar', false],
    ['forced italic', 'a{/b/}c', 'b', false],
    ['forced underline', 'my{_path_}name', 'path', false],
    ['forced strike', 'x{~gone~}y', 'gone', false],
    ['forced italic spanning its delimiter', '{/a/b/}', 'a/b', false],
    ['highlight brace', 'wo{=mark=}rd', 'mark', false],
    ['superscript brace', 'mc{^2^} end', '2', false],
    ['subscript brace', 'H{,2,}O', '2', false],
    ['critic insert', 'a {+ins+} b', 'ins', false],
    ['critic delete', 'a {-del-} b', 'del', false],
    ['critic substitution', 'a {~old~>new~} b', 'old', false],
    ['critic comment', 'a {# note #} b', 'note', false],

    // Attribute constructs: these MAY (and must) scope as attributes.
    ['span attrs', '[span]{.class}', '.class', true],
    ['block attrs line', '{#id .class key=value}\n# H', '#id', true],
    ['quoted attr value', '[x]{title="a b"}', 'title', true],
    ['escaped quote in attr value', '[x]{title="a\\"b"}', 'title', true],

    // Other inline constructs.
    ['link text', '[text](https://x.de)', 'text', false],
    ['link url', '[text](https://x.de)', 'https://x.de', false],
    ['escaped-quote link title', '[t](/url "ti\\"tle")', '/url', false],
    ['autolink', '<https://example.com>', 'https://example.com', false],
    ['image', '![alt](img.jpg)', 'img.jpg', false],
    ['footnote ref', 'text[^1] end', '1', false],
    ['mention', 'hi @user here', '@user', false],
    ['tag', 'a #tagname here', '#tagname', false],
    ['inline math', 'a $`e=mc^2` b', 'e=mc^2', false],

    // Blocks.
    ['heading', '# Title', 'Title', false],
    ['fenced code', '```php\n$x = 1;\n```', 'php', false],
    ['blockquote', '> quoted', 'quoted', false],
    ['list marker', '- item', '-', false],
    ['nested list markers', '- - A', '-', false],
    ['task marker', '- [x] done', '[x]', false],
    ['table header', '|= H |= I |', '|=', false],
    ['admonition', '::: note\nBody\n:::', 'note', false],
    ['line comment', '%% comment line', 'comment line', false],
];

const ATTR_SCOPE = /attr/i;

function check(engineName, tokenize) {
    let pass = 0;
    const fails = [];
    for (const [label, sample, payload, isAttr] of CASES) {
        const tokens = tokenize(sample);
        // every token whose text overlaps the payload
        const hits = tokens.filter((t) => t.text.includes(payload) || payload.includes(t.text.trim()) && t.text.trim() !== '');
        const carrying = hits.filter((t) => t.scope);
        const covered = carrying.length > 0;
        const attrScoped = carrying.some((t) => ATTR_SCOPE.test(t.scope));

        let problem = null;
        if (!covered) problem = 'NOT SCOPED (no rule matches it)';
        else if (!isAttr && attrScoped) problem = `scoped as an ATTRIBUTE block (${carrying.find((t) => ATTR_SCOPE.test(t.scope)).scope})`;
        else if (isAttr && !attrScoped) problem = 'attribute construct is NOT scoped as attributes';

        if (problem) {
            const dump = tokens.map((t) => `${JSON.stringify(t.text)}:${t.scope ?? '-'}`).join(' | ');
            fails.push(`FAIL [${engineName}] ${label}  ${problem}\n   payload: ${JSON.stringify(payload)}\n   got: ${dump.slice(0, 300)}`);
        } else pass++;
    }
    console.log(`  ${fails.length ? '✗' : '✓'} ${engineName} sweep: ${pass}/${CASES.length} constructs scoped correctly`);
    fails.forEach((f) => console.log(f + '\n'));
    return fails.length;
}

console.log('carve-grammars engine sweep:');
const failed = check('prism', prismTokens) + check('highlightjs', hljsTokens);
if (failed) {
    console.error(`\n${failed} construct(s) mis-scoped. A construct must carry a scope, and must not be`);
    console.error('claimed by the attribute rule unless it is an attribute block.');
    process.exit(1);
}
