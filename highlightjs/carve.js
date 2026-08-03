/**
 * Carve language definition for highlight.js
 *
 * Carve is a Djot-derived markup language with distinct inline delimiters:
 * emphasis is /text/ (not _text_), underline is _text_, strikethrough is
 * ~text~ (Djot uses ~ for subscript), subscript is ,text, and highlight is
 * =text= (Djot uses {=text=}). Strong (*text*), superscript (^text^),
 * insert ({+text+}) and delete ({-text-}) match Djot.
 *
 * This file is a UMD module so it works in every documented integration:
 *
 * - ESM: `import carve from 'carve-grammars/highlightjs/carve.js'` (resolved to
 *   the carve.mjs shim via the package `exports` map), then
 *   `hljs.registerLanguage('carve', carve)`.
 * - Classic `<script src=".../highlightjs/carve.js">` after highlight.js: it
 *   self-registers against the global `hljs` (and exposes `globalThis.carveHljs`).
 * - CommonJS contexts that load this file as CommonJS get the factory on
 *   `module.exports`.
 *
 * A top-level `export default` is intentionally NOT used: that would be a
 * syntax error when the file is loaded as a classic browser script.
 *
 * @see https://github.com/markup-carve/carve for the Carve specification
 */
(function (root, factory) {
    var carve = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = carve;
    }
    if (root) {
        // Exposed for the ESM shim (carve.mjs) and for classic <script> use.
        root.carveHljs = carve;
        if (root.hljs && typeof root.hljs.registerLanguage === 'function') {
            root.hljs.registerLanguage('carve', carve);
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    /**
     * @param {object} [hljs] - the highlight.js instance (unused, kept for the
     *   standard language-definition signature).
     * @returns {object} a highlight.js language definition.
     */
    return function carve(hljs) {
    // Block attributes: {.class #id key=value} or boolean {reversed}
    // Excludes special inline syntax like {= {+ {- {%
    // The payload is STRICT (spec PART 9 S14): a class/id/key identifier may not
    // start with a digit, so `{2=v}` stays literal text rather than scoping as
    // an attribute block. An unquoted value may contain dots and colons.
    const ATTR_ITEM = /(?:[.#][A-Za-z_][\w-]*|[A-Za-z_][\w:-]*(?:=(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|[^\s"'{}]+))?)/.source;
    // Forced intraword family (PART 9 S22). Content may contain the delimiter
    // (`{/a/b/}` is <em>a/b</em>), so the run ends at the closing `X}`. These
    // must precede ATTRIBUTE, or `{_path_}` reads as a boolean attribute.
    const FORCED_STRONG = { className: 'strong', begin: /\{\*(?=\S)/, end: /\*\}/, relevance: 5 };
    const FORCED_EMPHASIS = { className: 'emphasis', begin: /\{\/(?=\S)/, end: /\/\}/, relevance: 5 };
    const FORCED_UNDERLINE = { className: 'emphasis', begin: /\{_(?=\S)/, end: /_\}/, relevance: 5 };
    const FORCED_STRIKE = { className: 'deletion', begin: /\{~(?=\S)(?!.*~>)/, end: /~\}/, relevance: 5 };

    const ATTRIBUTE_EMPTY = {
        className: 'attr',
        // Valid only glued to a preceding `]` (`[x]{}`); a bare `{}` is literal.
        begin: /(?<=\])\{\s*\}/,
        relevance: 5,
    };
    const ATTRIBUTE = {
        className: 'attr',
        begin: new RegExp('\\{\\s*' + ATTR_ITEM + '(?:\\s+' + ATTR_ITEM + ')*\\s*\\}'),
        relevance: 5,
    };

    // Headings: # to ######
    const HEADING = {
        className: 'section',
        begin: /^#{1,6}[ \t](?![ \t]*$)/,
        end: /$/,
        relevance: 10,
    };

    // Emphasis (Carve): /text/ - the begin guard avoids URLs and paths
    // (a/b, ://); the end is a closing slash not followed by word char/slash.
    const EMPHASIS = {
        className: 'emphasis',
        begin: /(?<![\w:/])\/(?=\S)/,
        end: /\/(?![\w/])/,
        relevance: 0,
    };

    // Underline (Carve): _text_ - not in the middle of words
    const UNDERLINE = {
        className: 'emphasis',
        begin: /(?<!\w)_(?!\s)/,
        end: /_(?!\w)/,
        relevance: 0,
    };

    // Strong: *text* - not in the middle of words, can contain emphasis.
    // Excludes *[ which is abbreviation-definition syntax.
    const STRONG = {
        className: 'strong',
        begin: /(?<!\w)\*(?![\s\[])/,
        end: /\*(?!\w)/,
        relevance: 0,
        contains: [EMPHASIS, UNDERLINE],
    };

    // Highlight (Carve): =text= (single-char; intraword as {=text=})
    const HIGHLIGHT = {
        className: 'addition',
        begin: /(?<![=\w])=(?=\S)/,
        end: /=(?![=\w])/,
        relevance: 3,
    };

    // Insert: {+text+}
    const INSERT = {
        className: 'addition',
        begin: /\{\+/,
        end: /\+\}/,
        relevance: 5,
    };

    // Delete: {-text-}
    const DELETE = {
        className: 'deletion',
        begin: /\{-/,
        end: /-\}/,
        relevance: 5,
    };

    // Strikethrough (Carve): ~text~ (Djot uses ~ for subscript instead)
    const STRIKETHROUGH = {
        className: 'deletion',
        begin: /(?<!\w)~(?=\S)/,
        end: /~(?!\w)/,
        relevance: 2,
    };

    // Subscript (Carve): braced-only `{,text,}` - a bare `,` is literal text.
    const SUBSCRIPT = {
        className: 'built_in',
        begin: /\{,(?=\S)/,
        end: /,\}/,
        relevance: 3,
    };

    // Superscript (Carve): braced-only `{^text^}` - a bare `^` is literal text.
    const SUPERSCRIPT = {
        className: 'built_in',
        begin: /\{\^(?=\S)/,
        end: /\^\}/,
        relevance: 3,
    };

    /**
     * A verbatim span whose fence WIDTH IS DYNAMIC: an optional sigil plus a
     * run of N backticks opens it, and a run of EXACTLY N backticks closes it.
     *
     * highlight.js has no begin->end backreference, which is why these families
     * used to declare the two common widths explicitly (double first, then
     * single). A fence of three or more backticks then opened on the first two
     * and closed at the first shorter run inside it, leaking the rest of the
     * span as prose - and widened fences are the whole point of the widening
     * rule, since content holding a backtick run needs a longer fence (#52).
     *
     * The width is instead captured at `begin`, carried in `resp.data`, and
     * enforced at `end` by rejecting a wrong-width candidate with
     * `ignoreMatch()`. That is the idiom highlight.js's own bundled markdown
     * grammar uses for fenced code.
     *
     * Both patterns match a MAXIMAL run, so a longer run never closes a shorter
     * fence by matching a prefix of itself: with a 2-wide fence, a 4-backtick
     * run inside the span is content, not a closer.
     */
    function verbatimFence({ className, sigil = '', relevance = 0 }) {
        const RUN = '(?<!`)`+(?!`)';
        // The width is read off match[0], NOT a capture group: highlight.js
        // concatenates every sibling mode's `begin` into one alternation, so
        // group NUMBERS shift with unrelated modes and an index-based read
        // silently grabs the wrong group (it threw here, which made the mode
        // disappear entirely rather than fail loudly).
        const widthOf = (text) => /`*$/.exec(text)[0].length;
        return {
            className,
            begin: new RegExp(sigil + RUN),
            'on:begin': (m, resp) => {
                resp.data._fenceWidth = widthOf(m[0]);
            },
            end: new RegExp(RUN),
            'on:end': (m, resp) => {
                if (widthOf(m[0]) !== resp.data._fenceWidth) resp.ignoreMatch();
            },
            relevance,
        };
    }

    // Math: $$`...` (display) and $`...` (inline). Per grammar.ebnf PART 9 SS18
    // the `$` / `$$` prefix opens a verbatim span with NO closing sentinel, so
    // the backtick run alone ends it. Must precede the inline code modes - the
    // leading $ keeps them from matching, but order is clearer.
    const MATH_DISPLAY = verbatimFence({ className: 'string', sigil: '\\$\\$', relevance: 5 });
    const MATH_INLINE = verbatimFence({ className: 'string', sigil: '\\$', relevance: 5 });

    // Inline literal: !`...` - a `!` prefix on a verbatim backtick run,
    // rendered as prose (no <code>). Parallel to the math modes above and,
    // like them, must precede the inline-code modes so the leading `!` claims
    // the span rather than leaving a stray `!` before a code span. The `!` +
    // backtick never collides with an image (`![`), whose next char is `[`.
    const LITERAL_INLINE = verbatimFence({ className: 'string', sigil: '!', relevance: 0 });

    // Inline code: `code`, ``code``, or any wider fence.
    const INLINE_CODE = verbatimFence({ className: 'code', relevance: 0 });

    // Inline links: [text](url) with optional trailing attributes
    const LINK = {
        className: 'link',
        begin: /\[[^\]]*\]\([^)]*\)(\{[^}]+\})?/,
        relevance: 5,
    };

    // Autolinks: <https://...> or <mailto:...>
    const AUTOLINK = {
        className: 'link',
        begin: /<(?:https?:\/\/|mailto:)[^>]+>/,
        relevance: 5,
    };

    // Email autolinks: <user@example.com>
    const EMAIL_AUTOLINK = {
        className: 'link',
        begin: /<[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}>/,
        relevance: 5,
    };

    // Images: ![alt](url) with optional trailing attributes
    const IMAGE = {
        className: 'link',
        begin: /!\[[^\]]*\]\([^)]*\)(\{[^}]+\})?/,
        relevance: 5,
    };

    // Reference links: [text][ref] with optional trailing attributes
    const REFERENCE_LINK = {
        className: 'link',
        begin: /\[[^\]]+\]\[[^\]]*\](\{[^}]+\})?/,
        relevance: 5,
    };

    // Spans with attributes: [text]{.class} or [text]{#id}
    const SPAN = {
        className: 'string',
        // Only the bracket run; the trailing `{...}` is left to ATTRIBUTE so it
        // scopes as an attribute block rather than vanishing into the span.
        begin: /\[[^\]]+\](?=\{)/,
        relevance: 5,
    };

    // Reference definitions: [ref]: url
    const REFERENCE_DEF = {
        className: 'symbol',
        begin: /^\[[^\]^\]]+\]:/,
        end: /$/,
        relevance: 10,
    };

    // Footnote references: [^note]
    const FOOTNOTE_REF = {
        className: 'symbol',
        begin: /\[\^[^\]]+\]/,
        relevance: 5,
    };

    // Inline footnote: ^[content] (corpus 23-inline-footnotes). The caret
    // leads, which is what separates it from the reference above.
    const INLINE_FOOTNOTE = {
        className: 'symbol',
        begin: /\^\[[^\]\n]*\]/,
        relevance: 5,
    };

    // Definition-list term: `:: term` (grammar.ebnf `definition_term`).
    // DEFINITION_TERM above matches the `: definition` line; this is the term
    // itself, which had no rule. `:::` opens a div and DIV_BLOCK_START runs
    // first, so the two do not compete.
    const DEFINITION_TERM_MARKER = {
        className: 'title',
        begin: /^::[ \t](?![ \t]*$)/,
        end: /$/,
        relevance: 5,
    };

    // Table/list continuation: a lone `+` (grammar.ebnf `continuation_marker`)
    // or a continuation ROW carrying cells (`continuation_row`, corpus
    // 63-table-multi-line-cell-continuation). The row form has to end in `|`,
    // so `one + two` in prose stays literal.
    const TABLE_CONTINUATION = {
        className: 'punctuation',
        begin: /^[ \t]*\+(?:[ \t]*$|[^\n]*\|[ \t]*$)/,
        relevance: 5,
    };

    // Smart typography, the same set the Prism grammar carries. Not invented
    // here: dashes, arrows, comparisons and the symbol trio.
    const TYPOGRAPHY = {
        className: 'literal',
        begin: /\.\.\.|---|--|<->|<-|->|=>|!=|<=|>=|\+-|\(c\)|\(r\)|\(tm\)/,
        relevance: 0,
    };

    // Citations (Tier-2 §22): [@key], [+@key], [@key, p.10], [@a; @b]
    // A bracket whose content holds at least one `@key` with no trailing
    // `(url)`, `[ref]`, or `{attrs}` suffix. The negative lookahead is handled
    // by position in the contains array (SPAN and REFERENCE_LINK are checked
    // first to claim those suffixed forms).
    const CITATION = {
        className: 'symbol',
        begin: /\[\+?(?:[^\]@]*@[A-Za-z0-9_][A-Za-z0-9_.:#$%&+?<>~\/-]*[^\]]*)\](?!\(|\[|\{)/,
        relevance: 8,
    };

    // Code callouts (Tier-2 §10): <n> markers trailing a code-fence line or
    // leading a callout-list item.
    const CODE_CALLOUT = {
        className: 'symbol',
        begin: /<\d+>/,
        relevance: 5,
    };

    // Footnote definitions: [^note]: content
    const FOOTNOTE_DEF = {
        className: 'symbol',
        begin: /^\[\^[^\]]+\]:/,
        end: /$/,
        relevance: 10,
    };

    // Abbreviation definitions: *[ABBR]: text
    const ABBREVIATION_DEF = {
        className: 'symbol',
        begin: /^\*\[[^\]]+\]:/,
        end: /$/,
        relevance: 10,
    };

    // Blockquotes: a `>` marker followed by a SPACE, or alone on its line.
    //
    // Verified against carve-rs: `>no space`, `>>x`, `>> x` and `>\tx` are all
    // paragraphs - the separator must be a space, and nesting is written
    // `> > x` with a space per marker. A bare `^>` colored `>=3 items` as a
    // quote when the language calls it prose (markup-carve/carve#525).
    const BLOCKQUOTE = {
        className: 'quote',
        begin: /^>(?= |$)/,
        end: /$/,
        relevance: 0,
    };

    // Horizontal rules: --- or *** or ___
    const HORIZONTAL_RULE = {
        className: 'meta',
        begin: /^(-{3,}|\*{3,}|_{3,})$/,
        relevance: 10,
    };

    // Bullet list items: - or *
    const LIST_BULLET = {
        className: 'bullet',
        // A marker line may carry several markers (`- - A`, corpus 103).
        begin: /^[ \t]*(?:[-*][ \t]+)*[-*](?=[ \t])(?![ \t]*$)/,
        relevance: 0,
    };

    // Numbered list items: decimal (1.), alpha (a. A.), roman (i. I.)
    const LIST_NUMBER = {
        className: 'bullet',
        begin: /^[ \t]*(\d+[.)]|[a-zA-Z][.)]|[ivxlcdmIVXLCDM]+[.)]|\.)(?=[ \t]|\{)(?![ \t]*$)/,
        relevance: 0,
    };

    // Task list items: - [ ] or - [x]
    // `task_state` is ` `, `x`, `X`, `-`, `_`, `>` or `?` (grammar.ebnf
    // `task_state`). Only `x`/`X` render checked; the rest are still task
    // markers, and corpus 06-task-lists-2 uses all four of the others.
    const TASK_LIST = {
        className: 'bullet',
        begin: /^[ \t]*[-*][ \t]\[[ xX\-_>?]\](?=[ \t])(?![ \t]*$)/,
        relevance: 5,
    };

    // Definition list terms: : term
    const DEFINITION_TERM = {
        className: 'title',
        begin: /^: (?![ \t]*$)/,
        end: /$/,
        relevance: 5,
    };

    // Code fence opening: ``` or ~~~ with optional language
    const CODE_FENCE_START = {
        className: 'keyword',
        begin: /^[`~]{3,}\s*[a-zA-Z]*$/,
        relevance: 10,
    };

    // Code fence closing: ``` or ~~~
    const CODE_FENCE_END = {
        className: 'keyword',
        begin: /^[`~]{3,}$/,
        relevance: 10,
    };

    // Div block opening: ::: with optional type, "title", [label], or the
    // | / \ layout tokens. Strict shapes only - unquoted or curly-quoted
    // trailing text is a paragraph, not a fence, and must not highlight.
    const DIV_BLOCK_START = {
        className: 'keyword',
        begin: /^:{3,}(?:[ \t]*(?:\||\\)|[ \t]*[a-zA-Z_][\w-]*(?:[ \t]+"[^"\n]*")?(?:[ \t]+\[[^\]\n]*\])?|[ \t]*\[[^\]\n]*\])?[ \t]*$/,
        relevance: 10,
    };

    // Div block closing: :::
    const DIV_BLOCK_END = {
        className: 'keyword',
        begin: /^:{3,}$/,
        relevance: 10,
    };

    // Carve comments: `%%` to end of line, a `%%%` fenced block, and the
    // CriticMarkup comment `{# ... #}`. (An earlier rule here matched
    // `{% ... %}`, which is Jinja/Liquid syntax and does not exist in Carve.)
    const LINE_COMMENT = {
        className: 'comment',
        begin: /(?:^|(?<=\s))%%(?!%)/,
        end: /$/,
        relevance: 5,
    };
    // A `%%%` fence line is a DELIMITER plus an INSIGNIFICANT TAIL (spec
    // PART 9 §28): only the leading run of `%` is structural, so `%%% TODO`
    // opens and `%%% end` closes. `%%%` carries NO info string - a raw
    // passthrough block is a CODE fence whose info string is `=FORMAT`
    // (```=html) - so `%%% html` is a comment, not raw output.
    //
    // The closer must match the opener's length EXACTLY (a longer run does not
    // close a shorter fence, which is what lets `%%%%` nest `%%%`). There is no
    // begin->end backreference in highlight.js, so the width is carried across
    // in `resp.data` and a wrong-width candidate is rejected with
    // `ignoreMatch()` - the same idiom the bundled markdown grammar uses.
    const BLOCK_COMMENT = {
        className: 'comment',
        begin: /^(%{3,})[^\n]*$/,
        'on:begin': (m, resp) => {
            resp.data._fenceWidth = m[1].length;
        },
        end: /^(%{3,})[^\n]*$/,
        'on:end': (m, resp) => {
            if (m[1].length !== resp.data._fenceWidth) resp.ignoreMatch();
        },
        relevance: 10,
    };
    const CRITIC_SUB = {
        className: 'meta',
        // The `~>` arrow is what distinguishes a substitution from a forced
        // strikethrough (`{~gone~}`), so it is required here.
        begin: /\{~(?=[^}\n]*~>)/,
        end: /~\}/,
        relevance: 10,
    };
    const CRITIC_COMMENT = {
        className: 'comment',
        // The closing `#}` is required, or this would swallow an attribute
        // block whose id comes first (`{#id .class}`).
        begin: /\{#(?=[^}\n]*#\})/,
        end: /#\}/,
        relevance: 5,
    };

    // Mentions and tags: @name / #name (a heading `#` is line-anchored and is
    // matched earlier, so an inline `#tag` is unambiguous).
    const MENTION = {
        className: 'symbol',
        begin: /(?<![\w@])@[A-Za-z0-9][\w-]*(?:\.[\w-]+)*/,
        relevance: 5,
    };
    const TAG = {
        className: 'symbol',
        begin: /(?<![\w#])#[A-Za-z0-9][\w-]*(?:\.[\w-]+)*/,
        relevance: 5,
    };

    // Table separator: |---|---|
    const TABLE_SEPARATOR = {
        className: 'meta',
        begin: /^\|[-:| ]+\|$/,
        relevance: 5,
    };

    // Line blocks: | text (for poetry) - must precede TABLE_ROW
    const LINE_BLOCK = {
        className: 'string',
        begin: /^\| /,
        end: /$/,
        relevance: 3,
    };

    // Table rows: | cell | cell |
    const TABLE_ROW = {
        className: 'string',
        begin: /^\|/,
        end: /\|(\{[^}]*\})?$/,
        relevance: 2,
    };

    // Captions: ^ caption text
    const CAPTION = {
        className: 'title',
        begin: /^\^ (?![ \t]*$)/,
        end: /$/,
        relevance: 5,
    };

    // Raw format marker: {=html} or {=latex}
    const RAW_FORMAT = {
        className: 'meta',
        begin: /\{=[a-zA-Z]+\}/,
        relevance: 5,
    };

    // Escaped characters: \* \[ etc
    const ESCAPE = {
        className: 'symbol',
        begin: /\\[!"#$%&'()*+,.\/:;<=>?@\[\\\]^_`{|}~-]/,
        relevance: 0,
    };

    // Hard line break: \ at end of line
    const HARD_BREAK = {
        className: 'meta',
        begin: /\\$/,
        relevance: 2,
    };

    // Inline extension call: :name[content] (corpus 45-inline-extensions).
    // Matched before SYMBOL, whose `:name:` shape cannot claim this one but
    // reads similarly.
    //
    // A trailing `{...}` is deliberately NOT consumed here: an attribute value
    // may itself contain braces (`:kbd[x]{k="{y}"}`), so a `\{[^}]*\}` tail
    // stops at the inner `}` and swallows half the block. ATTRIBUTE already
    // matches it correctly as its own scope.
    const INLINE_EXTENSION = {
        className: 'function',
        begin: /:[A-Za-z][\w-]*\[[^\]\n]*\]/,
        relevance: 5,
    };

    // Symbol shortcodes (e.g. emoji): :name: (parser shape - name starts
    // alphanumeric, then word chars, `+` or `-`; no whitespace, so
    // `a : b : c` stays text)
    const SYMBOL = {
        className: 'symbol',
        begin: /(?<!\w):[A-Za-z0-9+-][\w+-]*:/,
        relevance: 0,
    };

    return {
        name: 'Carve',
        aliases: ['carve'],
        case_insensitive: false,
        contains: [
            // NOTE: front matter is intentionally NOT highlighted. It is valid
            // only at the very top of the document, but highlight.js has no
            // document-start anchor, so a `^---$` begin would also match a bare
            // `---` horizontal rule mid-document and swallow everything up to
            // the next `---`. The horizontal-rule rule below handles `---`
            // lines instead. (Prism anchors front matter via `^` with no `m`
            // flag; see prism/carve.js.)

            // Block-level elements (order matters - more specific first)
            HEADING,
            CODE_FENCE_START,
            CODE_FENCE_END,
            DIV_BLOCK_START,
            DIV_BLOCK_END,
            HORIZONTAL_RULE,
            TABLE_SEPARATOR,
            TABLE_CONTINUATION,  // `+` rows - before TABLE_ROW, which needs a leading `|`
            LINE_BLOCK,        // Must be before TABLE_ROW (both start with |)
            TABLE_ROW,
            BLOCKQUOTE,
            CAPTION,
            TASK_LIST,         // Must be before LIST_BULLET
            LIST_BULLET,
            LIST_NUMBER,
            DEFINITION_TERM_MARKER,  // `:: term` - before DEFINITION_TERM (`: definition`)
            DEFINITION_TERM,
            FOOTNOTE_DEF,      // Must be before REFERENCE_DEF
            ABBREVIATION_DEF,  // Must be before REFERENCE_DEF (*[ABBR]: vs [ref]:)
            REFERENCE_DEF,

            // Inline elements (order matters - more specific first)
            INLINE_FOOTNOTE,   // ^[content] - before FOOTNOTE_REF ([^label])
            FOOTNOTE_REF,
            IMAGE,             // Must be before LINK (starts with !)
            SPAN,              // Must be before LINK ([text]{attr} vs [text](url))
            REFERENCE_LINK,    // Must be before LINK ([text][ref] vs [text](url))
            CITATION,          // Must be after SPAN/REF_LINK (no (url)/[ref]/{attr} tail)
            CODE_CALLOUT,      // <n> callout markers
            INLINE_EXTENSION,  // :name[content] - before SYMBOL and LINK
            SYMBOL,            // :name: shortcodes
            LINK,
            AUTOLINK,
            EMAIL_AUTOLINK,
            RAW_FORMAT,        // {=html} - must be before INSERT/DELETE braces
            INSERT,            // {+text+}
            DELETE,            // {-text-}
            BLOCK_COMMENT,     // %%% fence - before LINE_COMMENT
            LINE_COMMENT,      // %% to end of line
            CRITIC_SUB,        // {~old~>new~} - before FORCED_STRIKE
            CRITIC_COMMENT,    // {# ... #} - must be before ATTRIBUTE
            MENTION,
            TAG,
            HIGHLIGHT,         // =text=
            SUBSCRIPT,         // ,text,
            SUPERSCRIPT,       // ^text^
            STRONG,
            EMPHASIS,          // /text/
            UNDERLINE,         // _text_
            STRIKETHROUGH,     // ~text~
            MATH_DISPLAY,      // $$`...` - before $`...` and inline code
            MATH_INLINE,       // $`...` - before inline code (leading $)
            LITERAL_INLINE,    // !`...` - before inline code (leading !)
            INLINE_CODE,       // `code` at any fence width
            FORCED_STRONG,
            FORCED_EMPHASIS,
            FORCED_UNDERLINE,
            FORCED_STRIKE,
            ATTRIBUTE_EMPTY,
            ATTRIBUTE,
            ESCAPE,
            HARD_BREAK,
            TYPOGRAPHY,        // dashes/arrows - after the structural rules
        ],
    };
    };
}));
