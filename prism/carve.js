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
    var attributes = {
        pattern: /\{[^}\n]+\}/,
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
        'superscript': {
            pattern: /\{\^(?=\S)[^\n]*?\^\}|\^(?=\S)[^\s^\n]+?\^/,
            alias: 'important',
        },
        'subscript': {
            pattern: /\{,(?=\S)[^\n]*?,\}|(?<![\w,]),(?=\S)[^,\n]+?(?<=\S),(?![\w,])/,
            alias: 'important',
        },
    };

    Prism.languages.carve = {
        // Block comments %%% ... %%% and line comments %% ...
        // The comment fence is a *bare* %%% line; a `%%% format` opener is a
        // raw passthrough block instead (handled by #raw-block below).
        'comment': [
            {
                pattern: /^[ \t]*%%%[ \t]*\n[\s\S]*?^[ \t]*%%%[ \t]*$/m,
                greedy: true,
            },
            {
                pattern: /^[ \t]*%%(?!%).*$/m,
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

        // Raw passthrough blocks: %%% format ... %%%  (rendered verbatim)
        'raw-block': {
            pattern: /^%{3,}[ \t]*\S*[ \t]*\n[\s\S]*?^%{3,}[ \t]*$/m,
            greedy: true,
            alias: 'string',
            inside: {
                'punctuation': /^%{3,}|%{3,}$/,
                'language': {
                    pattern: /(^%{3,}[ \t]*)\S+/,
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
        'div': {
            pattern: /^[ \t]*:{3,}[ \t]*[^\s{]*.*$/m,
            alias: 'tag',
            inside: {
                'punctuation': /:{3,}/,
                'class-name': {
                    pattern: /(^[ \t]*:{3,}[ \t]*)[^\s{]+/,
                    lookbehind: true,
                },
                'attributes': attributes,
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
        'table-continuation': {
            pattern: /^[ \t]*\+[ \t]*$/m,
            alias: 'punctuation',
        },

        // Blockquotes: leading > (possibly nested >>)
        'blockquote': {
            pattern: /^[ \t]*>+[ \t]?.*$/m,
            inside: Object.assign({
                'punctuation': /^[ \t]*>+/,
            }, inline),
        },

        // List markers: -, *, ordered (1. a) i.), task [ ]/[x], definition `: `
        'list': {
            pattern: /^[ \t]*(?:[-*][ \t]+(?:\[[ xX]\][ \t]+)?|(?:[0-9]+|[A-Za-z]|[ivxlcdmIVXLCDM]+)[.)][ \t]+|:[ \t]+)/m,
            alias: 'punctuation',
            inside: {
                'constant': /\[[ xX]\]/,
            },
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

        // Display + inline math: $$`...`$$ and $`...`$
        'math': [
            {
                pattern: /\$\$(`+)[\s\S]*?\1\$\$/,
                greedy: true,
                alias: 'string',
            },
            {
                pattern: /\$(`+)[\s\S]*?\1\$/,
                greedy: true,
                alias: 'string',
            },
        ],

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

        // Images: ![alt](src "title")
        'image': {
            pattern: /!\[[^\]]*\]\([^\s)]+(?:[ \t]+"[^"]*")?\)/,
            greedy: true,
            alias: 'url',
            inside: {
                'string': /"[^"]*"/,
                'punctuation': /!\[|\]\(|\)/,
            },
        },

        // Footnote references: [^label]
        'footnote': {
            pattern: /\[\^[^\]]+\]/,
            alias: 'symbol',
        },

        // Inline links: [text](url "title") and reference [text][id]
        'url': [
            {
                pattern: /\[[^\]]+\]\([^\s)]+(?:[ \t]+"[^"]*")?\)/,
                greedy: true,
                inside: {
                    'string': /"[^"]*"/,
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

        // Bracketed span with attributes: [text]{.class}
        'span': {
            pattern: /\[[^\^\]][^\]]*\](?=\{)/,
            alias: 'string',
        },

        // Extension inline call: :name[content]{attrs}
        'extension': {
            pattern: /:[a-zA-Z][\w-]*\[[^\]]*\](?:\{[^}]*\})?/,
            alias: 'function',
            inside: {
                'function': /:[a-zA-Z][\w-]*/,
                'attributes': attributes,
                'punctuation': /\[|\]/,
            },
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

        // Mentions @name, tags #tag, emoji :name:
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
        'emoji': {
            pattern: /:[A-Za-z0-9_+-]+:/,
            alias: 'constant',
        },

        // Escapes and smart typography
        'escape': {
            pattern: /\\[\\`*_{}[\]()#+\-.!~^/<>@%|=,]/,
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
