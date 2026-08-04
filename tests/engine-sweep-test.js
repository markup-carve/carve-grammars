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
import { prismTokens, hljsTokens } from './lib/engines.js';

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
    ['inline literal', 'a !`/kaet/` b', '/kaet/', false],
    // A wider fence carries an inner backtick. Unlike math, a literal has no
    // closing sentinel, so the span must not stop at the first backtick.
    ['inline literal multi', 'a !``x ` y`` b', 'x ` y', false],

    // Constructs the corpus has carried for a while that this sweep did not
    // reach. Two of them had no rule at all in one engine and snapshotted
    // happily as prose, which is the exact hole this file was written to close:
    // highlight.js had no inline-extension rule, and Prism had no caption rule.
    ['inline extension', 'Press :kbd[Ctrl+C] to copy.', 'Ctrl+C', false],
    // The attribute tail belongs to the call. Prism's `span` rule matches any
    // `[x]` followed by `{`, so it claimed this one and left `:kbd` as prose.
    ['inline extension with attrs', 'a :kbd[Ctrl]{.k} b', 'Ctrl', false],
    ['symbol shortcode', 'a :rocket: b', ':rocket:', false],
    ['citation', 'see [@smith2020]', '@smith2020', false],
    ['code callout', 'x <1>', '<1>', false],

    // Constructs the TextMate sweep carries that this one did not reach. Each
    // had no rule at all in one or both engines and snapshotted as prose.
    ['inline footnote', 'A note^[see later] inline.', 'see later', false],
    ['smart typography', 'a -- b', '--', false],
    ['hard break', 'line\\\nnext', '\\', false],

    // Blocks.
    // The bare dot continues an ordered sequence (carve#472). Every ordered
    // rule required a value before the `.`, so this line scoped as prose.
    ['ordered marker bare dot', '. first\n. second', '.', false],
    ['task state deferred', '- [>] deferred', '[>]', false],
    ['task state dropped', '- [-] dropped', '[-]', false],
    ['definition term', ':: color\n:  the property', 'color', false],
    ['table continuation row', '| a | b |\n+   | c |', '+', false],
    ['continuation marker', '- step\n+\n> note', '+', false],
    ['caption', '^ A caption', 'A caption', false],
    ['numbered caption', '^ Figure #: A sunset', 'A sunset', false],
    ['heading', '# Title', 'Title', false],
    ['fenced code', '```php\n$x = 1;\n```', 'php', false],
    ['blockquote', '> quoted', 'quoted', false],
    ['list marker', '- item', '-', false],
    ['nested list markers', '- - A', '-', false],
    ['task marker', '- [x] done', '[x]', false],
    ['table header', '|= H |= I |', '|=', false],
    ['admonition', '::: note\nBody\n:::', 'note', false],
    ['line comment', '%% comment line', 'comment line', false],

    // The same blocks INSIDE a list item. Carve has no indented code block, so
    // a block construct sits at its container's content column - two spaces in
    // a list item is ordinary indentation. Every sample above starts at column
    // zero, so a rule anchored to `^` with no allowance for leading whitespace
    // passed this sweep while highlighting nothing inside any container. Six
    // constructs were in that state: the heading and caption rules in both
    // engines, and blockquote, admonition, table row and abbreviation in
    // highlight.js. Measured against the TextMate sweep, which carries the
    // in-list-item forms and did not go stale the same way.
    ['heading in a list item', '- item\n\n  # Title', 'Title', false],
    ['blockquote in a list item', '- item\n\n  > quoted', 'quoted', false],
    ['caption in a list item', '- item\n\n  | a |\n  ^ Attribution', 'Attribution', false],
    ['admonition in a list item', '- item\n\n  ::: note\n  body\n  :::', 'note', false],
    ['table row in a list item', '- item\n\n  | a | b |', '|', false],
    ['abbreviation in a list item', '- item\n\n  *[HTML]: HyperText', 'HTML', false],
    ['fenced code in a list item', '- item\n\n  ```php\n  $x = 1;\n  ```', 'php', false],
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
