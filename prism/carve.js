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
 * INDENTED BLOCK OPENERS, and why this file differs from the TextMate grammar
 * in the same package (carve-grammars#138, #89, #71):
 *
 * Carve opens a block at column 0, or at an enclosing container's content
 * column - nowhere in between. ` # H`, ` > q`, ` *[A]: x` and an indented fence
 * are all paragraphs at document level, while the same four openers at a list
 * item's content column are real blocks. Telling those apart needs block
 * context, and Prism is line-based: this grammar has no container model, so it
 * cannot ask the question.
 *
 * So every block opener here stays anchored `^[ \t]*` and knowingly
 * over-colours the indented-at-document-level case. Anchoring at column 0
 * instead would not buy accuracy - it would stop highlighting EVERY
 * legitimately indented construct inside a list item or a block quote, which
 * is the common valid shape, in exchange for correcting a rare invalid one.
 *
 * The TextMate grammar tracks a list item's content column (carve-grammars#137)
 * and therefore CAN split the two: its `heading`, `fenced_code`, `blockquote`
 * and `abbreviation` rules are anchored at column 0, with `_in_container`
 * twins reachable only from inside a container. That divergence is deliberate
 * and is written up in the README ("Where the three grammars deliberately
 * differ"). Do not "fix" the anchors here to match it.
 *
 * A LEADING BYTE ORDER MARK (carve-grammars#154):
 *
 * A byte order mark at the START OF THE DOCUMENT is not content - the spec says
 * so ("Line endings and a byte order mark"), and carve-js, carve-rs and
 * carve-php all strip it before the block scanner runs. It is neither a space
 * nor a tab, so without an allowance it sat between the line start and the
 * marker and defeated every opener below: a BOM-led heading went unscoped, and
 * a BOM-led fence was claimed by the inline `code` rule instead.
 *
 * The allowance is `(?:(?<![\s\S])\uFEFF)?`, and the assertion is the point.
 * These patterns carry the `m` flag, so a plain `^\uFEFF?` would admit the mark
 * at EVERY line start - and a mark that is not at offset 0 is an ordinary
 * zero-width character that opens nothing. Measured: `# T\n\n\uFEFF- item\n`
 * is a paragraph holding literal text in carve-rs and in carve-php. Only
 * carve-js reads it as a list, because JavaScript's own `\s` class is Unicode
 * White_Space plus U+FEFF (markup-carve/carve#806), and that is the outlier.
 * `(?<![\s\S])` is true only where nothing precedes, which is the document-start
 * anchor `^` cannot be under `m`.
 *
 * Inside a rule's `inside`, the sub-pattern runs against the matched token's own
 * text, whose first character IS the mark when the opener carried one. Most of
 * those sub-patterns have no `m` flag and match a single-line token, so there the
 * allowance is an unconditional `\uFEFF?` - `^` already means "start of this
 * token" and there is no second line for it to leak onto.
 *
 * Two sub-patterns DO carry `m` and run against a multi-line token: the
 * definition term inside `definition-list`, and `div-delimiter` inside `div`
 * (which needs `m` to reach the closing fence). Those keep the full assertion.
 * Without it, `:: first\ndef one\n\uFEFF:: second` scoped that second line as a
 * term, which is the over-match this whole allowance exists to avoid - a mark
 * below the first line opens nothing. The assertion resolves against the token's
 * own offset 0 there, which is sound because a token can only BEGIN with the mark
 * when the top-level opener, itself document-anchored, consumed one.
 *
 * The codepoint is always written as the escape `\uFEFF`. No file in this repo
 * holds a literal byte order mark: it is invisible, and an editor or a
 * normalizing filter can drop the one character a rule is about.
 *
 * @module carve-grammars/prism/carve
 */
(function (Prism) {
    if (!Prism) {
        return;
    }

    // Inline attribute block: {#id .class key="val"} - reused by spans, divs,
    // headings and extension calls.
    // The payload is STRICT (spec PART 9 S14): a class/id/key is the grammar's
    // `identifier` production, a letter or `_` then letters, digits, `_` and `-`.
    // So `{2=v}`, `{-a}` and `{a:b}` stay literal text rather than scoping as an
    // attribute block, and one invalid name is enough to leave the whole run
    // literal. A colon belongs to the VALUE grammar, not the key: an unquoted
    // value may contain dots and colons, so `{k=a:b}` is a real attribute block.
    var attrItem = /(?::(?:[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8})*)?|[.#][A-Za-z_][\w-]*|[A-Za-z_][\w-]*(?:=(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|[^\s"'{}]+))?)/.source;
    // A LIST MARKER MAY BE GLUED TO AN ATTRIBUTE BLOCK (`-{#x} item`), so the
    // marker rule has to look past a whole block to decide it is a marker at
    // all. That lookahead spelled the item alternation out a second time, and
    // the copy went stale: when the language attribute (`{:fr}`) was added to
    // `attrItem`, `-{:fr} item` stopped scoping its `-` as a marker while
    // `-{.c} item` still did. Built from `attrItem` now, so there is one
    // spelling of what an attribute item is and the marker rule cannot drift
    // from the attribute rule again.
    var gluedAttrBlock =
        '(?=\\{\\s*(?:' + attrItem + '(?:\\s+' + attrItem + ')*\\s*)?\\}[ \\t]+[^ \\t\\n])';
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
        // TWO ROLES, ONE TOKEN. A standalone attribute LINE may span lines; an
        // INLINE block glued to a construct may not - `attributes` pads and
        // separates with `opt_ws`, "spaces/tabs only, no line breaks"
        // (markup-carve/carve#897), and only `attr_separator`'s continuation
        // crosses a newline. One `\\s`-separated pattern served both, so
        // `*x*{.a` + newline + `.b}` coloured as a block where every engine
        // renders it as prose (#164).
        //
        // The line-anchored branch is a LOOKBEHIND, and it does not consume the
        // indentation: the match still starts at the `{`, so token boundaries are
        // unchanged everywhere the decision is unchanged. Anchoring with `^` and
        // the `m` flag is the wrong tool here for the reason recorded on the
        // hard-break rule - Prism applies a pattern to the remaining text chunk,
        // so `^` matches at a chunk boundary rather than a real line start.
        pattern: RegExp(
            '(?<=(?:^|\\n)[ \\t]*)\\{\\s*' + attrItem + '(?:\\s+' + attrItem + ')*\\s*\\}'
            + '|\\{[ \\t]*' + attrItem + '(?:[ \\t]+' + attrItem + ')*[ \\t]*\\}',
        ),
        alias: 'attr-value',
        inside: {
            'id': /#[A-Za-z_][\w-]*/,
            'class-name': /\.[A-Za-z_][\w-]*/,
            'attr-name': /[A-Za-z_][\w-]*(?==)/,
            'string': /"[^"]*"|'[^']*'/,
            'language': {
                pattern: /(^|[\s{]):(?:[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8})*)?/,
                lookbehind: true,
            },
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

    // Definition-list term: `:: term` (grammar.ebnf `definition_term`).
    // Reused as a nested rule inside 'definition-list' below - not registered
    // as a top-level token, so it only ever colors a term that
    // 'definition-list' has already decided is inside a real entry.
    var definitionTerm = {
        // MARKER REQUIRES CONTENT: `::<space>` with nothing after it is prose.
        pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*:: +(?![ \t]*$).*$/m,
        alias: 'title',
        inside: Object.assign({
            'punctuation': /^\uFEFF?[ \t]*::/,
        }, inline),
    };

    // An OTHER block opener ends a definition-list entry: a heading, a
    // list/task marker, a blockquote, a fence (code/div), a horizontal rule,
    // a caption or a table row. Blank lines and lazy-continuation prose are
    // NOT block openers and fold into the entry instead - that is what keeps
    // a folded term line (`term_continuation_line`, corpus
    // 25-definition-lists-6) and a definition separated from its term by one
    // blank line (corpus 25-definition-lists-7) scoped correctly.
    var otherBlockOpener = /[ \t]*(?:#{1,6} |-{3,}[ \t]*$|\*{3,}[ \t]*$|_{3,}[ \t]*$|`{3,}|~{3,}|:{3,}|>(?: |$)|\^ |\||[-*][ \t]|[-*]\{|\d+[.)][ \t]|[A-Za-z]+[.)][ \t]|\.[ \t])/.source;

    // A definition-list entry: the opening term line plus every following
    // line that is not some OTHER block opener (see above).
    var definitionListPattern = RegExp(
        '^(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*:: +(?![ \\t]*$)[^\\n]*(?:\\n(?!' + otherBlockOpener + ')[^\\n]*)*',
        'm',
    );

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
                pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*(%{3,})(?!%)[^\n]*\n[\s\S]*?^[ \t]*\1(?!%)[^\n]*$/m,
                greedy: true,
            },
            {
                pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*%%(?!%).*$/m,
                greedy: true,
            },
            {
                // An UNTERMINATED `%%%` run opens nothing (PART 9 §28); it
                // degrades to a line comment, so it must still scope as one.
                // Placed after the block form, which consumes matched fences.
                pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*%{3,}.*$/m,
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
            pattern: /^\uFEFF?---[ \t]*[A-Za-z0-9_-]*[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/,
            alias: 'comment',
            greedy: true,
            inside: {
                'punctuation': /---/,
            },
        },

        // Fenced code blocks: ``` lang ... ``` or ~~~ lang ... ~~~
        'code-block': {
            // Anchored `^[ \t]*` on purpose - no container model here, see the
            // indented-block-openers note in the module docblock (carve-grammars#138).
            pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*(`{3,}|~{3,})[ \t]*[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/m,
            greedy: true,
            inside: {
                'punctuation': /^\uFEFF?(?:`{3,}|~{3,})|(?:`{3,}|~{3,})$/,
                'language': {
                    pattern: /(^\uFEFF?(?:`{3,}|~{3,})[ \t]*)[^\s`~]+/,
                    lookbehind: true,
                    alias: 'class-name',
                },
            },
        },

        // Thematic break: a whole line of three or more `-`, `*` or `_`.
        // Prism had no rule at all, so `***` and `___` rendered as prose and
        // `---` was claimed by the smart-typography rule as an em dash - the
        // construct looked covered while nothing was matching the block. It
        // sits AFTER `code-block`, which is greedy, so a `---` line inside a
        // fence stays code; and after `front-matter`, whose greedy pattern owns
        // the document's opening delimiters. A table delimiter row (`|---|`)
        // is not a whole-line run, so the anchors exclude it.
        'thematic-break': {
            pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/m,
            alias: 'punctuation',
        },

        // ATX headings # .. ######
        'title': {
            // `.+` matches a run of spaces, so `#<space><space>` was a heading.
            // MARKER REQUIRES CONTENT: carve-rs renders it `<p>#</p>`.
            //
            // THE SEPARATOR IS A LITERAL SPACE. `[ \t]+` accepted a tab, so
            // `#<TAB>Heading` was scoped as a heading where every engine renders
            // it as a paragraph (spec markup-carve/carve#802, corpus
            // `231-a-tab-after-a-heading-quote-or-caption-marker-leaves-the-line-as-prose`,
            // carve-grammars#140). Whitespace AFTER the separator space is still
            // heading text, which is why the run stays optional behind it.
            // Anchored `^[ \t]*` on purpose - no container model here, see the
            // indented-block-openers note in the module docblock (carve-grammars#138).
            pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*#{1,6} [ \t]*(?![ \t]*$).+$/m,
            alias: 'important',
            inside: Object.assign({
                'punctuation': /^\uFEFF?#{1,6}/,
                // A tag is still a tag even inside a heading's literal
                // trailing brace run (carve-grammars#125, corpus 213): a
                // heading takes no trailing attribute block, so `{#id .cls}`
                // is ordinary heading text (that half already worked - it was
                // never scoped as 'attributes'), but `#id` inside it is still
                // a tag construct. Deliberately narrow: the rest of the
                // shared `inline` set already covers emphasis; the full
                // inline repertoire (links, mentions) is not added here,
                // matching this repo's preference for a targeted fix over
                // modeling everything a heading could theoretically hold.
                //
                // NOT the same regex as the top-level 'tag' token below: this
                // one also excludes a `#` immediately after `</`, because
                // Prism has no cross-reference token at all
                // (`auto_text_link = "</#", crossref_id, '>'`,
                // grammar.ebnf) - without the exclusion this rule claimed the
                // `#a` inside a heading cross-reference `</#a>` and broke
                // corpus 118 (`# A </#a>`), which pins the whole thing
                // staying unscoped. The `(?<!<\/)` is real JS lookbehind
                // (already used elsewhere in this file, e.g. 'highlight'
                // above) rather than Prism's own single-char lookbehind
                // trick, because the exclusion needs to see two characters
                // back.
                'tag': {
                    pattern: /(^|[^\w])(?<!<\/)#[A-Za-z0-9_][\w-]*/,
                    lookbehind: true,
                    alias: 'variable',
                },
            }, inline),
        },

        // Composite figure ::: figure  (PART 9 §4c, markup-carve/carve#1215)
        //
        // The kind word `figure` is RESERVED among the `:::` types: a BARE
        // opener - the fence, its separator, the word `figure`, and NOTHING
        // else - is ONE figure of ordered panels, not an admonition. It gets
        // its own token so a consumer can tell the two readings apart, and it
        // sits BEFORE 'div' because both patterns match the same line and
        // Prism takes the first rule that does.
        //
        // The `[ \t]*$` tail is the whole distinction. An opener carrying a
        // quoted title or a [label] (`::: figure "T"`, `::: figure [g]`) does
        // not match here at all and falls through to 'div', which is the
        // generic Tier-2 container the clause says it stays.
        //
        // The separator is a SPACE run, never a tab (grammar.ebnf PART 7,
        // MARKER SEPARATORS; corpus 254 renders `:::<TAB>note` as a paragraph).
        // A tab-separated opener is not claimed here and falls to 'div', which
        // over-colours it exactly as it does today - a pre-existing trade this
        // rule neither widens nor fixes. Trailing whitespace after the kind
        // word is insignificant and may be a tab.
        //
        // The whole-container span, the lazy tail and the `\1` backreference
        // to the opener's colon run are 'div' below, unchanged - see its
        // comment for why the pattern reaches its own closer.
        //
        // GROUPS DO NOT NEST: a bare `::: figure` inside an open group is a
        // generic container, which is what the `inside` composed after this
        // object literal arranges (the group's body holds no 'figure-group').
        'figure-group': {
            pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*(:{3,}) +figure[ \t]*$(?:\n[\s\S]*?^[ \t]*\1[ \t]*$)?/m,
            alias: 'tag',
            inside: {
                // THIS container's own two delimiter lines, each claimed whole
                // by one sub-pattern, for the same reason 'div-delimiter' below
                // is: an ungrabbed run on a delimiter line is re-scanned as its
                // own fresh string and a `^`-anchored body pattern can match
                // into it.
                //
                // Deliberately NOT `m`-flagged, which is where this differs from
                // 'div-delimiter'. That rule wants every delimiter line in its
                // token, because a nested `:::` is the SAME rule. Here a nested
                // one is not: an `m`-flagged pattern claimed the inner opener of
                // `::: figure` > `:::: figure` as a group delimiter, which is
                // the one shape PART 9 \u00A74c says degrades. So the two
                // alternatives anchor to the token's own ends instead - the
                // first alternative to its start (`^` with no `m` is offset 0
                // of the token, and the token begins at the opener), the second
                // to its end (`$` with no `m` is the end of the token, and an
                // unclosed group has no closer line to match).
                'figure-group-delimiter': {
                    pattern: /^\uFEFF?[ \t]*:{3,} +figure[ \t]*(?=\n|$)|(?<=\n)[ \t]*:{3,}[ \t]*$/,
                    inside: {
                        'punctuation': /:{3,}/,
                        'class-name': /figure/,
                    },
                },
            },
        },

        // Container divs ::: class  /  :::
        // Strict opener shapes only: type word, optional "title" (straight
        // quotes), optional [label], the | / \ layout tokens, or a typeless
        // [label]. Trailing junk makes the line a paragraph, so it must not
        // highlight as a fence.
        //
        // The pattern spans the WHOLE container (opener through its matching
        // closer), not just the opener line (carve-grammars#125): a per-line
        // match left the body wide open to the full top-level pattern set,
        // which incorrectly let 'abbreviation-definition' fire inside a div
        // (PART 9: abbreviation definitions are recognized at document level
        // only). The optional tail is a lazy scan up to a closer that
        // backreferences the SAME colon run captured by the opener (group 1),
        // so it closes on an EXACT length match (PART 9's colon-fence depth
        // rule: a longer or shorter run does not close it, which is what lets
        // equal-length fences nest and `::::` hold `:::`). The tail is
        // OPTIONAL so an unclosed opener still matches as a div on its own
        // line rather than failing to match at all.
        //
        // `inside` is composed below (after the grammar object is built) from
        // the full language minus 'abbreviation-definition', plus a
        // self-reference for nested divs - see the assignment after this
        // object literal. That preserves everything else that already worked
        // inside a div body (headings - corpus 170, nested lists, blockquotes)
        // while suppressing only the one construct this fix targets.
        'div': {
            pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*(:{3,})(?:[ \t]*(?:\||\\)|[ \t]*[a-zA-Z_][\w-]*(?:[ \t]+"[^"\n]*")?(?:[ \t]+\[[^\]\n]*\])?|[ \t]*\[[^\]\n]*\])?[ \t]*$(?:\n[\s\S]*?^[ \t]*\1[ \t]*$)?/m,
            alias: 'tag',
            inside: {
                // Any delimiter line (opener OR closer - the same shape as
                // the whole match this rule used to be, before
                // carve-grammars#125) is claimed WHOLE by one sub-pattern,
                // rather than several independently-anchored siblings
                // (punctuation/string/symbol/class-name used to be top-level
                // keys here). That is load-bearing now that the body
                // patterns are also present below: Prism re-scans an
                // unmatched "gap" between two matches as its own fresh
                // string, so a `^`-anchored body pattern (e.g. 'table') could
                // match at the START of that gap even when it is really
                // mid-line residue after the type/title/label, not a real
                // line start - `::: |` mis-scoped its own `|` layout token
                // as a table row. Leaving nothing ungrabbed on a delimiter
                // line closes that gap.
                'div-delimiter': {
                    pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*:{3,}(?:[ \t]*(?:\||\\)|[ \t]*[a-zA-Z_][\w-]*(?:[ \t]+"[^"\n]*")?(?:[ \t]+\[[^\]\n]*\])?|[ \t]*\[[^\]\n]*\])?[ \t]*$/m,
                    inside: {
                        'punctuation': /:{3,}/,
                        'string': /"[^"\n]*"/,
                        'symbol': /\[[^\]\n]*\]/,
                        'class-name': /[a-zA-Z_][\w-]*|\||\\/,
                    },
                },
            },
        },

        // Table rows: | a | b |   (plus header `|=`, caption `^`, span markers)
        'table': {
            pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*\|.*$/m,
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
            pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*\+(?:[ \t]*$|[^\n]*\|[ \t]*$)/m,
            inside: Object.assign({
                'punctuation': /^\uFEFF?[ \t]*\+|\|/,
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
            // MARKER REQUIRES CONTENT: `^` followed by whitespace only is prose,
            // the same as every other marker - carve-rs renders `^ ` as `<p>^</p>`.
            pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*\^ +(?![ \t]*$).*$/m,
            alias: 'title',
            inside: Object.assign({
                'punctuation': /^\uFEFF?\^/,
            }, inline),
        },

        // Blockquotes: a `>` marker followed by a SPACE, or alone on its line.
        //
        // Not `>+`, and not `\s`. Verified against carve-rs: `>> x` is a
        // paragraph (nesting is written `> > x`, each marker taking its own
        // space), `>no space` is a paragraph, and a TAB does not separate -
        // `>\tx` is a paragraph too. Matching a run, or accepting any
        // whitespace, colored `>>= operator` and `>=3 items` as quotes when the
        // language calls them prose (markup-carve/carve#525).
        'blockquote': {
            // Anchored `^[ \t]*` on purpose - no container model here, see the
            // indented-block-openers note in the module docblock (carve-grammars#138).
            pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*>(?: .*)?$/m,
            inside: Object.assign({
                'punctuation': /^\uFEFF?[ \t]*>/,
            }, inline),
        },

        // List markers: -, * and ordered (1. a) i.), task [ ]/[x]. The
        // definition-list description marker `:  ` used to be a third branch
        // here, matched unconditionally - see 'definition-list' below for why
        // it moved out.
        //
        // `task_state` is ` `, `x`, `X`, `-`, `_`, `>` or `?` (grammar.ebnf
        // `task_state`). Only `x`/`X` render checked; the rest are still task
        // markers, and corpus 06-task-lists-2 uses all four of the others.
        'list': {
            // A ROMAN RUN IS CASE-CONSISTENT: two classes, not one
            // `[ivxlcdmIVXLCDM]`, which matched any mixture and coloured `Vim. text`
            // and `Mix. text` as lists where the engine renders paragraphs (#118).
            // `mix.`, `civil.` and `did.` DO open lists, so the fix is the case split,
            // not rejecting multi-letter words.
            // A BULLET MAY BE GLUED TO AN ATTRIBUTE BLOCK too, and then the space
            // comes after the block - `-{#x} item` went uncoloured while the ordered
            // branch already had the guard (#126). Same guard, and it is a lookahead
            // rather than a consuming group so the attribute rule keeps the block.
            // MARKER REQUIRES CONTENT: each branch ends with a line-end lookahead,
            // so `- ` and `1. ` with nothing after them stay prose. The
            // ordered branch spells out a glued attribute block in full rather
            // than skipping it, because `1.{#x}` with nothing after the block
            // is a paragraph too, and a `\{[^}]*\}` run stops in the wrong
            // place: a quoted value may contain `}` and may escape its own
            // quote, and `{title="a}b"} x` is a valid item (#85).
            pattern: RegExp(
                '^(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*(?:(?:[-*] +)*[-*](?:(?= )|' + gluedAttrBlock
                + ') *(?:\\[[ xX\\-_>?]\\] +)?(?![ \\t]*$)|(?:(?:[0-9]+|[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)[.)]|\\.)(?:(?= )|'
                + gluedAttrBlock + ') *(?![ \\t]*$))',
                'm',
            ),
            alias: 'punctuation',
            inside: {
                'constant': /\[[ xX\-_>?]\]/,
            },
        },

        // Definition-list entry: `:: term` through its `:  def` line(s)
        // (grammar.ebnf `definition_entry`). `:::` opens a div and that rule
        // runs earlier - the space required after exactly two colons keeps
        // the two apart in any case.
        //
        // A `:` description line scopes only INSIDE an entry that a real
        // `:: ` term opened (carve-grammars#91) - it used to be matched by
        // the 'list' token unconditionally, so a bare `:  d` with no term
        // above it (or a term the separator rule disqualified, e.g.
        // `::\tterm` - the marker separator is a literal space per the
        // tab-and-separator ruling on markup-carve/carve#698, a tab never
        // satisfies it) was scoped as a definition even though the engines
        // render it as a paragraph. The entry runs forward from the term
        // through any number of lines that are not some OTHER block opener
        // (see `otherBlockOpener` above `Prism.languages.carve`).
        'definition-list': {
            pattern: definitionListPattern,
            inside: {
                'definition-term': definitionTerm,
                // The description marker itself; the body text is left for
                // the inline rules to tokenize as ordinary content, same as
                // it was when this lived in 'list'.
                'punctuation': /^[ \t]*: +(?![ \t]*$)/m,
            },
        },

        // Reference link / abbreviation definitions
        'reference-definition': {
            pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*\[[^\]]+\]: +\S+.*$/m,
            alias: 'url',
            inside: {
                'constant': /^\uFEFF?[ \t]*\[[^\]]+\]:/,
            },
        },
        // `abbreviation_term = (letter | digit)+`, and `letter` is enumerated
        // ASCII - so the term is case-blind and may be digits. This required
        // the whole term to be uppercase, which is the reading carve-js also
        // had (carve-js#720) and dropped.
        'abbreviation-definition': {
            // Anchored `^[ \t]*` on purpose - no container model here, see the
            // indented-block-openers note in the module docblock (carve-grammars#138).
            pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*\*\[[A-Za-z0-9]+\]: +.*$/m,
            inside: {
                // BEFORE punctuation, and anchored to the brackets. Prism
                // applies these in order, so a punctuation rule that eats `*[`
                // first leaves nothing for a lookbehind to anchor on. Unanchored
                // it scoped runs of the EXPANSION instead - with the old
                // uppercase-only class that showed up as the `H` of `HyperText`
                // carrying `symbol`, which the goldens pinned.
                'symbol': {
                    pattern: /(^\uFEFF?[ \t]*\*\[)[A-Za-z0-9]+(?=\]:)/,
                    lookbehind: true,
                },
                // The expansion is the abbreviation's TITLE, not more markup.
                // TextMate has always scoped it (`string.unquoted.abbreviation`)
                // and this grammar left it to whatever the term rule spilled
                // onto it.
                'string': {
                    pattern: /(\]:[ \t]+).+$/,
                    lookbehind: true,
                },
                'punctuation': /^\uFEFF?[ \t]*\*|\[|\]|:/,
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

    // A div's body holds the full language MINUS 'abbreviation-definition'
    // (carve-grammars#125 - see the comment on 'div' above). Composed here,
    // after the grammar object is fully built, rather than hand-duplicated:
    // `Object.assign` with a shallow copy keeps every entry a REFERENCE to
    // the same token object Prism already uses at the top level (including
    // 'div' itself), so this stays in sync with the rest of the grammar and
    // gives nested divs their own recursive scoping for free - a `:::` inside
    // this div's body is tokenized by the very same 'div' rule. The
    // delimiter-specific 'div-delimiter' entry already on 'div'.inside is
    // spread first, so it still wins over the body patterns for the
    // opener/closer lines themselves.
    var divDelimiterOnly = Prism.languages.carve.div.inside;
    var figureGroupDelimiterOnly = Prism.languages.carve['figure-group'].inside;
    var divBody = Object.assign({}, Prism.languages.carve);
    delete divBody['abbreviation-definition'];
    Prism.languages.carve.div.inside = Object.assign(
        {},
        divDelimiterOnly,
        divBody
    );

    // A composite figure's body is the div body MINUS 'figure-group' (PART 9
    // §4c: GROUPS DO NOT NEST - a bare `::: figure` inside an open group is a
    // generic container at any depth, corpus 318-composite-figures-9). Removing
    // the entry is what makes the inner opener fall to 'div', which is exactly
    // the generic reading the clause asks for.
    //
    // 'div' inside a group is its OWN token object, so the exclusion survives a
    // level of nesting: the top-level 'div' still offers 'figure-group' (a bare
    // opener inside a `::: note` IS a group - only a group suppresses one), and
    // this copy does not, so `::: figure` > `::: note` > `::: figure` reads
    // generic too.
    //
    // RESIDUAL, written down rather than left to be rediscovered: a bare opener
    // reached through a LIST ITEM or a BLOCKQUOTE inside a group is tokenized by
    // the top-level rules again, so it over-colours as a group there. That is
    // the same block-context limit every rule in this file has (see the
    // indented-block-openers note in the module docblock); tree-sitter-carve is
    // where a real container model lives.
    var figureGroupBody = Object.assign({}, divBody);
    delete figureGroupBody['figure-group'];
    var divInGroup = Object.assign({}, Prism.languages.carve.div);
    figureGroupBody.div = divInGroup;
    divInGroup.inside = Object.assign({}, divDelimiterOnly, figureGroupBody);
    Prism.languages.carve['figure-group'].inside = Object.assign(
        {},
        figureGroupDelimiterOnly,
        figureGroupBody
    );

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
