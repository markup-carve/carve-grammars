/**
 * Prism.js grammar for the Carve markup language.
 *
 * Mirrors the canonical token set in markup-carve/carve
 * (`resources/grammar.ebnf`) and the TextMate grammar in vscode-carve
 * (`syntaxes/carve.tmLanguage.json`). Carve's inline delimiters differ from
 * Markdown/Djot: emphasis is `/italic/`, `*bold*`, `_underline_`,
 * `~strike~`, `=highlight=`, `^sup^`, `,sub,` (the doubled forms `==x==` /
 * `,,x,,` are literal in Carve; the forced brace forms `{=x=}` / `{,x,}` /
 * `{^x^}` render intraword).
 *
 * Usage (ESM):
 *
 * ```js
 * import Prism from 'prismjs';
 * import 'carve-grammars/prism/carve.js'; // registers Prism.languages.carve
 *
 * const html = Prism.highlight(src, Prism.languages.carve, 'carve');
 * ```
 *
 * Usage (browser / bundler): load `prismjs` first (which sets the global
 * `Prism`), then import this file for its side effect - it reads the global
 * `Prism` (`globalThis` / `window` / `global`) and registers the grammar.
 *
 * @module carve-grammars/prism/carve
 */
(function (Prism) {
    if (!Prism) {
        return;
    }

    // Inline attribute block: {#id .class key="val"} - reused by spans, divs,
    // headings and extension calls.
    // The payload is STRICT (spec PART 9 S14): a class/id/key identifier may not
    // start with a digit, so `{2=v}` stays literal text rather than scoping as
    // an attribute block. An unquoted value may contain dots and colons.
    var attrItem = /(?:[.#][A-Za-z_][\w-]*|[A-Za-z_][\w:-]*(?:=(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|[^\s"'{}]+))?)/.source;
    // An EMPTY block is valid only glued to a preceding `]` (`[x]{}` ->
    // <span>x</span>); a bare `{}` in prose is literal text (corpus 123).
    // An EMPTY attribute block is valid only where it is glued to a preceding
    // `]` (`[x]{}` -> <span>x</span>); a bare `{}` in prose is literal text
    // (corpus 123). Prism tokenizes left to right, so the span and its empty
    // block have to be ONE rule -- a lookbehind would lose its `]` to the span.
    var spanEmptyAttrs = {
        pattern: /\[[^\^\]][^\]]*\]\{\s*\}/,
        inside: {
            'attr-value': { pattern: /\{\s*\}/, inside: { 'punctuation': /[{}]/ } },
            'string': /\[[^\]]*\]/,
        },
    };
    var attributes = {
        pattern: RegExp('\\{\\s*' + attrItem + '(?:\\s+' + attrItem + ')*\\s*\\}'),
        alias: 'attr-value',
        inside: {
            'id': /#[A-Za-z_][\w-]*/,
            'class-name': /\.[A-Za-z_][\w-]*/,
            'attr-name': /[A-Za-z_:][\w:-]*(?==)/,
            'string': /"[^"]*"|'[^']*'/,
            'punctuation': /[{}=]/,
        },
    };

    // Shared inline emphasis/markup, referenced from block tokens that contain
    // running text (headings, list items, table cells, quotes).
    var inline = {
        'bold-italic': {
            pattern: /\/\*(?=\S)[^*]+\*\//,
            alias: 'important',
        },
        // The "no leading/trailing space" rule is expressed without JS
        // lookbehind (unsupported on Safari < 16.4 and some engines): the first
        // and last content chars are required to be non-space directly.
        // Forced intraword family (PART 9 S22): `{*x*}` `{/x/}` `{_x_}` `{~x~}`.
        // Content may contain the delimiter -- `{/a/b/}` is <em>a/b</em> -- so the
        // run ends at the closing `X}`. These MUST precede 'attributes', or
        // `{_path_}` reads as a boolean attribute instead of <u>path</u>.
        'forced-bold': {
            pattern: /\{\*(?=\S)[^\n]*?\*\}/,
            alias: 'bold',
        },
        'forced-italic': {
            pattern: /\{\/(?=\S)[^\n]*?\/\}/,
            alias: 'italic',
        },
        'forced-underline': {
            pattern: /\{_(?=\S)[^\n]*?_\}/,
            alias: 'underline',
        },
        'forced-strike': {
            pattern: /\{~(?=\S)(?:(?!~>)[^\n])*?~\}/,
            alias: 'deleted',
        },
        'bold': {
            pattern: /\*[^*\s\n](?:[^*\n]*?[^*\s\n])?\*/,
            alias: 'bold',
        },
        'italic': {
            // leading guard via Prism lookbehind (avoids URLs, paths); the
            // trailing `(?![\w/])` lookahead is fine (lookahead is universal).
            pattern: /(^|[^\w/])\/[^/\s\n](?:[^/\n]*?[^/\s\n])?\/(?![\w/])/,
            lookbehind: true,
            alias: 'italic',
        },
        'underline': {
            pattern: /(^|[^\w_])_[^_\s\n](?:[^_\n]*?[^_\s\n])?_(?![\w_])/,
            lookbehind: true,
            alias: 'underline',
        },
        'strike': {
            pattern: /~[^~\s\n](?:[^~\n]*?[^~\s\n])?~/,
            alias: 'deleted',
        },
        'highlight': {
            pattern: /\{=(?=\S)[^\n]*?=\}|(?<![\w=])=(?=\S)[^=\n]+?(?<=\S)=(?![\w=])/,
            alias: 'important',
        },
        // Braced-only: a bare `^` / `,` is literal text (no bare sup/sub).
        'superscript': {
            pattern: /\{\^(?=\S)[^\n]*?\^\}/,
            alias: 'important',
        },
        'subscript': {
            pattern: /\{,(?=\S)[^\n]*?,\}/,
            alias: 'important',
        },
    };

    Prism.languages.carve = {
        // Block comments %%% ... %%% and line comments %% ...
        // A `%%%` fence line is a DELIMITER plus an INSIGNIFICANT TAIL (spec
        // PART 9 §28): only the leading run of `%` is structural, so
        // `%%% TODO` opens and `%%% end` closes. `%%%` carries NO info string -
        // a raw passthrough block is a CODE fence whose info string is
        // `=FORMAT` (```=html), matched by #code-block below - so `%%% html`
        // is a comment and its body must stay scoped as one.
        'comment': [
            {
                // The closer is a backreference, so it matches the opener's
                // length EXACTLY: a longer run does not close a shorter fence
                // (hence the `(?!%)`), which is what lets `%%%%` nest `%%%`.
                pattern: /^[ \t]*(%{3,})(?!%)[^\n]*\n[\s\S]*?^[ \t]*\1(?!%)[^\n]*$/m,
                greedy: true,
            },
            {
                pattern: /^[ \t]*%%(?!%).*$/m,
                greedy: true,
            },
            {
                // An UNTERMINATED `%%%` run opens nothing (PART 9 §28); it
                // degrades to a line comment, so it must still scope as one.
                // Placed after the block form, which consumes matched fences.
                pattern: /^[ \t]*%{3,}.*$/m,
                greedy: true,
            },
            {
                // trailing comment after whitespace (Prism lookbehind, no JS
                // lookbehind: the leading space is captured and excluded).
                pattern: /([ \t])%%.*$/m,
                lookbehind: true,
                greedy: true,
            },
        ],

        // YAML/typed front matter delimited by --- at the very top of the file.
        // `^` (no `m` flag) anchors to the start of the document; the close is
        // matched at end-of-line so a document body may follow.
        'front-matter': {
            pattern: /^---[ \t]*[A-Za-z0-9_-]*[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/,
            alias: 'comment',
            greedy: true,
            inside: {
                'punctuation': /---/,
            },
        },

        // Fenced code blocks: ``` lang ... ``` or ~~~ lang ... ~~~
        'code-block': {
            pattern: /^(`{3,}|~{3,})[ \t]*[^\n]*\n[\s\S]*?^\1[ \t]*$/m,
            greedy: true,
            inside: {
                'punctuation': /^(?:`{3,}|~{3,})|(?:`{3,}|~{3,})$/,
                'language': {
                    pattern: /(^(?:`{3,}|~{3,})[ \t]*)[^\s`~]+/,
                    lookbehind: true,
                    alias: 'class-name',
                },
            },
        },

        // ATX headings # .. ######
        'title': {
            pattern: /^#{1,6}[ \t]+.+$/m,
            alias: 'important',
            inside: Object.assign({
                'punctuation': /^#{1,6}/,
            }, inline),
        },

        // Container divs ::: class  /  :::
        // Strict opener shapes only: type word, optional "title" (straight
        // quotes), optional [label], the | / \ layout tokens, or a typeless
        // [label]. Trailing junk makes the line a paragraph, so it must not
        // highlight as a fence.
        'div': {
            pattern: /^[ \t]*:{3,}(?:[ \t]*(?:\||\\)|[ \t]*[a-zA-Z_][\w-]*(?:[ \t]+"[^"\n]*")?(?:[ \t]+\[[^\]\n]*\])?|[ \t]*\[[^\]\n]*\])?[ \t]*$/m,
            alias: 'tag',
            inside: {
                'punctuation': /:{3,}/,
                'string': /"[^"\n]*"/,
                'symbol': /\[[^\]\n]*\]/,
                'class-name': {
                    pattern: /(^[ \t]*:{3,}[ \t]*)(?:[a-zA-Z_][\w-]*|\||\\)/,
                    lookbehind: true,
                },
            },
        },

        // Table rows: | a | b |   (plus header `|=`, caption `^`, span markers)
        'table': {
            pattern: /^[ \t]*\|.*$/m,
            inside: Object.assign({
                // rowspan `^` / colspan `<` markers - must precede `punctuation`
                // so the surrounding `|` is not consumed first.
                'operator': {
                    pattern: /(\|)[ \t]*[\^<](?=[ \t]*\|)/,
                    lookbehind: true,
                },
                'punctuation': /\|=|\|/,
                'attributes': attributes,
                'url': /\[[^\]]+\]\([^\s)]+\)/,
            }, inline),
        },

        // Table continuation / list continuation: a lone `+`
        // Table/list continuation: a lone `+` (grammar.ebnf
        // `continuation_marker`) or a continuation ROW carrying cells
        // (`continuation_row`, corpus 63-table-multi-line-cell-continuation).
        // The row form has to end in `|`, so `one + two` in prose stays
        // literal.
        'table-continuation': {
            pattern: /^[ \t]*\+(?:[ \t]*$|[^\n]*\|[ \t]*$)/m,
            inside: Object.assign({
                'punctuation': /^[ \t]*\+|\|/,
            }, inline),
        },

        // Caption / attribution line: `^ text` (corpus 08-image-with-caption,
        // 07-blockquote-with-attribution, and the numbered `^ Figure #: …`
        // form). Placed after `table`, whose rows use `^` as a rowspan marker
        // INSIDE a `|` row - that rule claims those lines first, so this one
        // only sees a caret opening its own line. The body keeps inline
        // markup: a caption is ordinary inline content.
        'caption': {
            // Column 0 only. An INDENTED caret is literal text at top level
            // (corpus 156-indented-image-and-caption-stay-literal), and inside
            // a list item a caption sits at the item's content column - which a
            // highlighter cannot track. Allowing leading whitespace here scoped
            // that literal line as a caption; highlight.js has always been
            // strict about this, so the two engines now agree.
            pattern: /^\^[ \t].*$/m,
            alias: 'title',
            inside: Object.assign({
                'punctuation': /^\^/,
            }, inline),
        },

        // Blockquotes: leading > (possibly nested >>)
        'blockquote': {
            pattern: /^[ \t]*>+[ \t]?.*$/m,
            inside: Object.assign({
                'punctuation': /^[ \t]*>+/,
            }, inline),
        },

        // List markers: -, *, ordered (1. a) i.), task [ ]/[x], definition `: `
        //
        // `task_state` is ` `, `x`, `X`, `-`, `_`, `>` or `?` (grammar.ebnf
        // `task_state`). Only `x`/`X` render checked; the rest are still task
        // markers, and corpus 06-task-lists-2 uses all four of the others.
        'list': {
            pattern: /^[ \t]*(?:(?:[-*][ \t]+)*[-*][ \t]+(?:\[[ xX\-_>?]\][ \t]+)?|(?:(?:[0-9]+|[A-Za-z]|[ivxlcdmIVXLCDM]+)[.)]|\.)(?=[ \t]|\{)[ \t]*|:[ \t]+)/m,
            alias: 'punctuation',
            inside: {
                'constant': /\[[ xX\-_>?]\]/,
            },
        },

        // Definition-list term: `:: term` (grammar.ebnf `definition_term`).
        // The `:  definition` line is a list marker above; this is the term.
        // `:::` opens a div and those rules run earlier - the space required
        // after exactly two colons keeps the two apart in any case.
        'definition-term': {
            pattern: /^[ \t]*::[ \t].*$/m,
            alias: 'title',
            inside: Object.assign({
                'punctuation': /^[ \t]*::/,
            }, inline),
        },

        // Reference link / abbreviation definitions
        'reference-definition': {
            pattern: /^[ \t]*\[[^\]]+\]:[ \t]+\S+.*$/m,
            alias: 'url',
            inside: {
                'constant': /^[ \t]*\[[^\]]+\]:/,
            },
        },
        'abbreviation-definition': {
            pattern: /^[ \t]*\*\[[A-Z][A-Z0-9]*\]:[ \t]+.*$/m,
            inside: {
                'punctuation': /^[ \t]*\*|\[|\]|:/,
                'symbol': /[A-Z][A-Z0-9]*/,
            },
        },

        // Display + inline math: $$`...` and $`...`. Per grammar.ebnf PART 9
        // §18, math is a `$` / `$$` prefix on a verbatim span and has NO
        // closing sentinel - the backtick run alone delimits it. The prefix is
        // what disambiguates currency: `$5` has no following backtick run and
        // stays literal text.
        'math': [
            {
                pattern: /\$\$(`+)[\s\S]*?\1/,
                greedy: true,
                alias: 'string',
            },
            {
                pattern: /\$(`+)[\s\S]*?\1/,
                greedy: true,
                alias: 'string',
            },
        ],

        // Inline literal: !`...` - a `!` prefix on a verbatim backtick run,
        // rendered as prose (no <code>). Parallel to the `$`-prefixed math
        // token above; must precede `code` so the leading `!` claims the span.
        'literal': {
            pattern: /!(`+)[\s\S]*?\1/,
            greedy: true,
            alias: 'string',
        },

        // Raw inline passthrough: `code`{=format}
        'raw-inline': {
            pattern: /(`+)(?:[^`]|[^`][\s\S]*?[^`])\1\{=[A-Za-z_][\w-]*\}/,
            greedy: true,
            alias: 'string',
        },

        // Inline code spans
        'code': {
            pattern: /(`+)(?:[^`]|[^`][\s\S]*?[^`])\1/,
            greedy: true,
        },

        // Images: ![alt](src "title"); the title may contain
        // backslash-escaped quotes like the link title.
        'image': {
            pattern: /!\[[^\]]*\]\([^\s)]+(?:[ \t]+"(?:[^"\\]|\\[\s\S])*")?\)/,
            greedy: true,
            alias: 'url',
            inside: {
                'string': /"(?:[^"\\]|\\[\s\S])*"/,
                'punctuation': /!\[|\]\(|\)/,
            },
        },

        // Inline footnote: ^[content] (corpus 23-inline-footnotes). Distinct
        // from the reference `[^label]` below - the caret leads here - and
        // matched first so neither rule claims the other's brackets.
        'inline-footnote': {
            pattern: /\^\[[^\]\n]*\]/,
            alias: 'symbol',
            // The body is ordinary inline content - `^[see *later*]` keeps its
            // bold - so the shared inline rules apply inside it.
            inside: Object.assign({
                'punctuation': /^\^\[|\]$/,
            }, inline),
        },

        // Footnote references: [^label]
        'footnote': {
            pattern: /\[\^[^\]]+\]/,
            alias: 'symbol',
        },

        // Citations (Tier-2 §22): [@key], [+@key], [@key, p.10], [@a; @b; @c]
        // Distinguished from links/spans/refs by the absence of a trailing
        // `(url)`, `[ref]`, or `{attrs}` suffix. The bracket MUST contain at
        // least one `@key` item.
        'citation': {
            pattern: /\[\+?(?:[^\]@]*@[A-Za-z0-9_][A-Za-z0-9_.:#$%&+?<>~\/-]*(?:[^\]]*)?)\](?!\(|\[|\{)/,
            greedy: true,
            alias: 'string',
            inside: {
                // Integral marker `+` and suppress-author `-`
                'operator': /(?<=^\[)\+|(?<=[@;]\s*)-(?=@)/,
                // The `@key` itself
                'function': /@[A-Za-z0-9_][A-Za-z0-9_.:#$%&+?<>~\/-]*/,
                // Separators and locator punctuation
                'punctuation': /\[|\]|;|,/,
            },
        },

        // Code callouts (Tier-2 §10): <n> markers trailing a code-fence line
        // or leading a callout-list item. Only pure-digit content.
        'code-callout': {
            pattern: /<\d+>/,
            alias: 'symbol',
        },

        // Inline links: [text](url "title") and reference [text][id]
        'url': [
            {
                // The link text may be empty ([](url), spec corpus 03-links-8)
                // and the title may contain backslash-escaped quotes:
                // [t](/url "ti\"tle") (spec corpus 03-links-4).
                pattern: /\[[^\]]*\]\([^\s)]+(?:[ \t]+"(?:[^"\\]|\\[\s\S])*")?\)/,
                greedy: true,
                inside: {
                    'string': /"(?:[^"\\]|\\[\s\S])*"/,
                    'punctuation': /\[|\]\(|\)/,
                },
            },
            {
                pattern: /\[[^\]]+\]\[[^\]]*\]/,
                greedy: true,
                inside: {
                    'punctuation': /\[|\]\[|\]/,
                },
            },
            {
                // autolink <https://...> and <mailto-ish>
                pattern: /<[a-zA-Z][a-zA-Z0-9+.-]*:[^>\s]+>|<[^>\s@]+@[^>\s]+>/,
                greedy: true,
            },
        ],

        // An EMPTY attribute block, only where it is glued to a preceding `]`
        // (`[x]{}` -> <span>x</span>). A bare `{}` in prose is literal text
        // (corpus 123). Must precede 'span', which would otherwise consume the
        // `]` this rule anchors on.
        'span-empty-attrs': spanEmptyAttrs,

        // Bracketed span with attributes: [text]{.class}
        // Extension inline call: :name[content]. Must precede `span`: that rule
        // matches any `[x]` followed by `{`, so an extension call carrying an
        // attribute block (`:kbd[Ctrl]{.k}`) was scoped as a span with its
        // `:kbd` left as prose.
        //
        // The trailing `{...}` is left to `attributes`. An attribute value may
        // itself contain braces (`:kbd[x]{k="{y}"}`), so a `\{[^}]*\}` tail here
        // would stop at the inner `}` and split the block in half.
        'extension': {
            pattern: /:[a-zA-Z][\w-]*\[[^\]]*\]/,
            alias: 'function',
            inside: {
                'function': /:[a-zA-Z][\w-]*/,
                'attributes': attributes,
                'punctuation': /\[|\]/,
            },
        },

        'span': {
            pattern: /\[[^\^\]][^\]]*\](?=\{)/,
            alias: 'string',
        },

        // CriticMarkup: {+ins+} {-del-} {~old~>new~} {#comment#}
        'inserted': {
            pattern: /\{\+[^}]*\+\}/,
            alias: 'inserted',
        },
        'deleted': {
            pattern: /\{-[^}]*-\}/,
            alias: 'deleted',
        },
        'changed': {
            pattern: /\{~[^~]*~>[^~]*~\}/,
            alias: 'important',
        },
        'critic-comment': {
            pattern: /\{#[^}]*#\}/,
            alias: 'comment',
        },

        // Forced brace emphasis must beat the attribute rule (`{_path_}`).
        'forced-bold': inline['forced-bold'],
        'forced-italic': inline['forced-italic'],
        'forced-underline': inline['forced-underline'],
        'forced-strike': inline['forced-strike'],

        // Attribute blocks attached to the preceding element
        'attributes': attributes,

        // Inline emphasis family (must come after code/links/attributes)
        'bold-italic': inline['bold-italic'],
        'bold': inline['bold'],
        'italic': inline['italic'],
        'underline': inline['underline'],
        'strike': inline['strike'],
        'highlight': inline['highlight'],
        'superscript': inline['superscript'],
        'subscript': inline['subscript'],

        // Mentions @name, tags #tag, symbols :name:
        'mention': {
            pattern: /(^|[^\w.])@[A-Za-z0-9_][\w-]*/,
            lookbehind: true,
            alias: 'variable',
        },
        'tag': {
            pattern: /(^|[^\w])#[A-Za-z0-9_][\w-]*/,
            lookbehind: true,
            alias: 'variable',
        },
        'symbol': {
            // Symbol shortcode (e.g. emoji). Parser shape: name starts
            // alphanumeric, then word chars, `+` or `-` (`:+1:` stays literal).
            pattern: /(^|[^\w]):[A-Za-z0-9+-][\w+-]*:/,
            lookbehind: true,
            alias: 'constant',
        },

        // Escapes and smart typography
        'escape': {
            pattern: /\\[\\`*_{}[\]()#+\-.!~^/<>@%|=,]/,
            alias: 'constant',
        },
        // Hard break: a backslash ending the line (highlight.js scopes this as
        // `meta`; Prism had no rule at all). The escape rule above cannot
        // claim it - there is no character after it to escape.
        //
        // Anchored on an explicit newline rather than `$`+`m`. Prism applies a
        // pattern to the REMAINING text chunk, so `$` matches at the chunk
        // boundary and a mid-line backslash left over by the escape rule was
        // scoped as a hard break (corpus 163-quote-flanking-after-an-escaped-
        // character, 137-inline-literal-3).
        'hard-break': {
            pattern: /\\(?=\n)/,
            alias: 'constant',
        },
        'typography': {
            pattern: /\.\.\.|---|--|<->|<-|->|=>|!=|<=|>=|\+-|\(c\)|\(r\)|\(tm\)/,
            alias: 'constant',
        },
    };

    // Allow Carve to be embedded and to embed itself (e.g. inside ```carve).
    Prism.languages.carvemd = Prism.languages.carve;
})(
    (typeof globalThis !== 'undefined' && globalThis.Prism)
        ? globalThis.Prism
        : (typeof window !== 'undefined' && window.Prism)
            ? window.Prism
            : (typeof global !== 'undefined' && global.Prism)
                ? global.Prism
                : undefined
);
