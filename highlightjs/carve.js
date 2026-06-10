/**
 * highlight.js language definition for the Carve markup language.
 *
 * Mirrors the canonical token set in markup-carve/carve
 * (`resources/grammar.ebnf`) and the TextMate grammar in vscode-carve.
 * Carve's inline delimiters differ from Markdown/Djot: emphasis is
 * `/italic/`, `*bold*`, `_underline_`, `~strike~`, `==highlight==`,
 * `^sup^`, `,,sub,,`.
 *
 * The definition is self-contained: it does not rely on any `hljs.*` helper
 * modes, so it can be registered before or after the core library loads.
 *
 * Usage (ESM):
 *
 * ```js
 * import hljs from 'highlight.js';
 * import carve from 'carve-grammars/highlightjs/carve.js';
 *
 * hljs.registerLanguage('carve', carve);
 * const { value } = hljs.highlight(src, { language: 'carve' });
 * ```
 *
 * @module carve-grammars/highlightjs/carve
 * @param {object} [hljs] - the highlight.js instance (unused, kept for the
 *   standard language-definition signature).
 * @returns {object} a highlight.js language definition.
 */
export default function carve(hljs) {
    var ATTRIBUTES = {
        className: 'attr',
        begin: /\{/,
        end: /\}/,
        contains: [
            { className: 'symbol', begin: /#[A-Za-z_][\w-]*/ },
            { className: 'selector-class', begin: /\.[A-Za-z_][\w-]*/ },
            { className: 'attribute', begin: /[A-Za-z_:][\w:-]*(?==)/ },
            { className: 'string', begin: /"/, end: /"/ },
            { className: 'string', begin: /'/, end: /'/ },
        ],
    };

    // highlight.js mishandles lookbehind in a mode `end` (the close never
    // fires and the span runs to end of line), so each inline delimiter is a
    // single begin-only regex that matches the whole `open..close` span.
    var INLINE = [
        // bold-italic /*...*/
        { className: 'strong', begin: /\/\*(?=\S)[\s\S]*?\*\//, relevance: 0 },
        // bold *...*
        { className: 'strong', begin: /\*(?=\S)[^*\n]+?\*/, relevance: 0 },
        // italic /.../ - guard against URLs and paths
        { className: 'emphasis', begin: /(?<![\w/])\/(?=\S)[^/\n]+?(?<=\S)\/(?![\w/])/, relevance: 0 },
        // underline _..._
        { className: 'emphasis', begin: /(?<![\w_])_(?=\S)[^_\n]+?(?<=\S)_(?![\w_])/, relevance: 0 },
        // strikethrough ~...~
        { className: 'deletion', begin: /~(?=\S)[^~\n]+?(?<=\S)~/, relevance: 0 },
        // highlight ==...==
        { className: 'strong', begin: /==[^=\n]+?==/, relevance: 0 },
        // superscript ^...^
        { className: 'literal', begin: /\^(?=\S)[^\s^]+?\^/, relevance: 0 },
        // subscript ,,...,,
        { className: 'literal', begin: /,,(?=\S)[^,\n]+?,,/, relevance: 0 },
    ];

    // highlight.js cannot link a fence's open length to its close (no
    // backreference between begin/end), so handle the two common inline fence
    // widths explicitly: double backticks (may wrap a single backtick) first,
    // then single. Triple+ inline fences are rare and fall back to plain text.
    var CODE_INLINE = [
        { className: 'code', begin: /``/, end: /``/, relevance: 0 },
        { className: 'code', begin: /`/, end: /`/, relevance: 0 },
    ];

    var LINK = {
        // [text](url "title")
        begin: /\[[^\]^]/, returnBegin: true,
        contains: [
            { className: 'string', begin: /\[/, end: /\]/, excludeBegin: true, excludeEnd: true },
            { className: 'link', begin: /\(/, end: /\)/, excludeBegin: true, excludeEnd: true },
        ],
        relevance: 0,
    };

    var IMAGE = {
        className: 'link',
        begin: /!\[[^\]]*\]\([^\s)]+(?:\s+"[^"]*")?\)/,
        relevance: 0,
    };

    var FOOTNOTE = { className: 'symbol', begin: /\[\^[^\]]+\]/, relevance: 0 };

    var AUTOLINK = {
        className: 'link',
        begin: /<[a-zA-Z][a-zA-Z0-9+.-]*:[^>\s]+>|<[^>\s@]+@[^>\s]+>/,
        relevance: 0,
    };

    var MATH = [
        { className: 'string', begin: /\$\$`+/, end: /`+\$\$/, relevance: 0 },
        { className: 'string', begin: /\$`+/, end: /`+\$/, relevance: 0 },
    ];

    // CriticMarkup
    var CRITIC = [
        { className: 'addition', begin: /\{\+/, end: /\+\}/, relevance: 0 },
        { className: 'deletion', begin: /\{-/, end: /-\}/, relevance: 0 },
        { className: 'addition', begin: /\{~[^~]*~>[^~]*~\}/, relevance: 0 },
        { className: 'comment', begin: /\{#/, end: /#\}/, relevance: 0 },
    ];

    var ESCAPE = { begin: /\\[\\`*_{}[\]()#+\-.!~^/<>@%|=,]/, relevance: 0 };

    var SYMBOLS = [
        { className: 'variable', begin: /(?<![\w.])@[A-Za-z0-9_][\w-]*/, relevance: 0 },
        { className: 'variable', begin: /(?<!\w)#[A-Za-z0-9_][\w-]*/, relevance: 0 },
        { className: 'literal', begin: /:[A-Za-z0-9_+-]+:/, relevance: 0 },
    ];

    // Inline content shared by headings, lists, quotes, table cells.
    var INLINE_CONTENT = []
        .concat(CODE_INLINE, MATH, IMAGE, FOOTNOTE, LINK, AUTOLINK, CRITIC, INLINE, SYMBOLS, [ATTRIBUTES, ESCAPE]);

    return {
        name: 'Carve',
        aliases: ['carve', 'crv'],
        contains: [
            // NOTE: front matter is intentionally not highlighted here. It is
            // only valid at the very top of the document, but highlight.js has
            // no document-start anchor, so a `^---$` begin would also match a
            // bare `---` horizontal rule mid-document and swallow everything up
            // to the next `---`. Better to leave front matter plain than to
            // corrupt ordinary documents. (Prism anchors it via `^` with no
            // `m` flag; see prism/carve.js.)

            // Block comment %%% ... %%%
            { className: 'comment', begin: /^[ \t]*%%%[ \t]*$/, end: /^[ \t]*%%%[ \t]*$/ },
            // Line / trailing comment %%
            { className: 'comment', begin: /%%(?!%)/, end: /$/, relevance: 0 },
            // Fenced code block - separate backtick and tilde modes so a fence
            // only closes on its own delimiter type (highlight.js has no
            // begin->end backreference, so a single mixed rule would let a ```
            // block close on a ~~~ line and vice versa). Fences are matched at
            // exactly three characters (the common case, as in hljs-markdown);
            // a four-plus opener is not consumed early because the trailing
            // fence chars fail the `[^\s`~]*` language slot.
            {
                className: 'code',
                begin: /^```[ \t]*[^\s`~]*[ \t]*$/,
                end: /^```[ \t]*$/,
                relevance: 0,
            },
            {
                className: 'code',
                begin: /^~~~[ \t]*[^\s`~]*[ \t]*$/,
                end: /^~~~[ \t]*$/,
                relevance: 0,
            },
            // Raw passthrough block %%% format ... %%%
            {
                className: 'code',
                begin: /^%%%[ \t]*\S+[ \t]*$/,
                end: /^%%%[ \t]*$/,
                relevance: 0,
            },
            // Headings
            {
                className: 'section',
                begin: /^#{1,6}[ \t]+/, end: /$/,
                contains: INLINE_CONTENT,
                relevance: 0,
            },
            // Container div ::: class
            {
                className: 'keyword',
                begin: /^[ \t]*:{3,}[ \t]*/, end: /$/,
                contains: [ATTRIBUTES, { className: 'type', begin: /[^\s{]+/ }],
                relevance: 0,
            },
            // Reference / abbreviation definitions
            { className: 'symbol', begin: /^[ \t]*\*?\[[\^A-Za-z0-9][^\]]*\]:/, relevance: 0 },
            // Blockquote
            {
                className: 'quote',
                begin: /^[ \t]*>+[ \t]?/, end: /$/,
                contains: INLINE_CONTENT,
                relevance: 0,
            },
            // List markers (bullet, ordered, task, definition) + continuation `+`
            {
                className: 'bullet',
                begin: /^[ \t]*(?:[-*][ \t]+(?:\[[ xX]\][ \t]+)?|(?:[0-9]+|[A-Za-z]|[ivxlcdmIVXLCDM]+)[.)][ \t]+|:[ \t]+|\+[ \t]*$)/,
                relevance: 0,
            },
            // Table rows
            {
                begin: /^[ \t]*\|/, end: /$/,
                contains: [
                    { className: 'punctuation', begin: /\|=|\|/ },
                    { className: 'operator', begin: /(?<=\|)[ \t]*[\^<](?=[ \t]*\|)/ },
                ].concat(INLINE_CONTENT),
                relevance: 0,
            },
        ].concat(INLINE_CONTENT),
    };
}
