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
 * import '@markup-carve/carve-grammars/prism/carve.js'; // registers Prism.languages.carve
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
 * @module @markup-carve/carve-grammars/prism/carve
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
    // BALANCED BRACKET TEXT - the body of a link label, an image alt text and a
    // bracketed span.
    //
    // The spec (`resources/grammar.ebnf`, `link_text`) says the label ends at
    // the MATCHING `]`, and that the scan is escape-aware. A `[^\]]*` body says
    // neither: it stops at the FIRST `]`, so `![t[z]](/i.png)` closed the label
    // at `z]`, wanted a `(` and found the second `]`, and the whole image went
    // unscoped (carve-grammars#226). The same body also accepted an UNBALANCED
    // opener - `[t[z](/u)` scoped from the outer `[`, where the engine reads
    // `[t` as prose and `[z](/u)` as the link.
    //
    // Escape-awareness is not an extra: without it `\[` would read as an
    // unbalanced opener and `[t\[z](/u)` would STOP being scoped. It also makes
    // `[a\]b](/u)` a link, which it always was in the engine.
    //
    // LINKS NEVER NEST (grammar.ebnf, SEMANTIC CONSTRAINT): an inner bracket
    // run is part of the TEXT, never a second link, so there is one scope over
    // the whole construct and no `inside` recursion here.
    //
    // A regex cannot count, so the nesting is unrolled to FOUR levels. Deeper
    // than that the construct stays unscoped - which is what every depth did
    // before, so the bound loses nothing that used to work.
    // Every quantifier here is BOUNDED. Unbounded, the body is a scan to the
    // end of the document at every `[` the tokenizer tries, and Prism tries
    // each position - which is quadratic in the document, not in the label. An
    // escaped bracket is an ordinary body character, so `\[` repeated is one
    // long label candidate and was the worst shape of all.
    var bracketChar = /(?:[^\[\]\\]|\\[\s\S])/.source;
    var BRACKET_SCAN = '{0,512}';
    var bracketText = bracketChar + BRACKET_SCAN;
    for (var bracketDepth = 0; bracketDepth < 3; bracketDepth++) {
        bracketText = '(?:' + bracketChar + '|\\[' + bracketText + '\\])' + BRACKET_SCAN;
    }
    // The same body, required to be non-empty, for the rules that reject `[]`.
    var bracketTextNonEmpty = '(?!\\])' + bracketText;
    // ... and additionally not opening on the `^` that marks a footnote
    // reference, for the two span rules that guarded against it before.
    var bracketTextSpan = '(?![\\]^])' + bracketText;
    // An EMPTY block is valid only glued to a preceding `]` (`[x]{}` ->
    // <span>x</span>); a bare `{}` in prose is literal text (corpus 123).
    // An EMPTY attribute block is valid only where it is glued to a preceding
    // `]` (`[x]{}` -> <span>x</span>); a bare `{}` in prose is literal text
    // (corpus 123). Prism tokenizes left to right, so the span and its empty
    // block have to be ONE rule -- a lookbehind would lose its `]` to the span.
    var spanEmptyAttrs = {
        pattern: new RegExp('\\[' + bracketTextSpan + '\\]\\{\\s*\\}'),
        inside: {
            'attr-value': { pattern: /\{\s*\}/, inside: { 'punctuation': /[{}]/ } },
            'string': new RegExp('\\[' + bracketText + '\\]'),
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

    var bracedCommentPattern = /\{%(?:[^%\n]|\n(?![ \t\r]*\n)){0,4096}(?:%(?!\})(?:[^%\n]|\n(?![ \t\r]*\n)){0,4096}){0,32}%\}/;

    // Shared inline emphasis/markup, referenced from block tokens that contain
    // running text (headings, list items, table cells, quotes).
    var inline = {
        // BOTH NESTING ORDERS. The engine renders `/*both*/` and `*/both/*`
        // identically - each is <strong><em>both</em></strong> - and only the
        // canonical order had a branch, so the mirrored one fell through to
        // 'bold' and came back a bold run holding two literal slashes
        // (carve-grammars#375).
        //
        // The mirrored branch carries guards the canonical one must not have,
        // and each is the engine's own asymmetry:
        //
        //   - `x/*b*/y` IS bold-italic and `x*/b/*y` is `x*<em>b</em>*y`,
        //     because the mirrored opener leads with `*` and a `*` glued to a
        //     word opens nothing.
        //   - a `/` before the opener makes the pair ambiguous with a canonical
        //     opener: `a /*/a/* b` is `a <em>*/a</em>* b`.
        //   - the closer may not follow a `*`: `a */b*/* c` is
        //     `a <strong>/b</strong>/* c`, while `a */*b/* c` IS combined - so
        //     it is the character before the closer that decides.
        //
        // Both bodies are non-space at each end, and both may cross a line
        // without crossing a blank one - corpus 208 is a combined run spanning
        // two lines, and the highlight.js rule spells the same body. `a /*b */ c`
        // is `<em>*b *</em>` and not a combined run; the old `[^*]+` body,
        // guarded only at the opener, read it as one.
        'bold-italic': {
            pattern: /\/\*(?=\S)(?:[^*\n]|\n(?!\s*\n)){1,4096}(?<=\S)\*\/|(?<![\w*/])\*\/(?=\S)(?:[^/\n]|\n(?!\s*\n)){1,4096}(?<![\s*])\/\*(?!\w)/,
            alias: 'important',
        },
        // The "no leading/trailing space" rule is expressed without JS
        // lookbehind (unsupported on Safari < 16.4 and some engines): the first
        // and last content chars are required to be non-space directly.
        // Forced intraword family (PART 9 S22): `{*x*}` `{/x/}` `{_x_}` `{~x~}`.
        // Content may contain the delimiter -- `{/a/b/}` is <em>a/b</em> -- so the
        // run ends at the closing `X}`. These MUST precede 'attributes', or
        // `{_path_}` reads as a boolean attribute instead of <u>path</u>.
        // UNROLLED SO AN UNCLOSED OPENER GIVES UP AT THE NEXT DELIMITER.
        // Written `[^\n]*?` these scan to end of LINE from every position, so a
        // document made of openers is quadratic in its own length - the same
        // defect `{%` had in #298, on nine more rules (#300; `{~` at 145 ms and
        // `{-`/`{+` at 211-215 ms on 24 KB, x4 per doubling, in a file the
        // package ships). Each body is now a run that stops at the closer's own
        // first character, then a bounded repetition of that character NOT
        // followed by `}` plus another such run. Same language - the content may
        // still contain the delimiter, so `{/a/b/}` is one <em> - but every step
        // is forced. Bounds match the `{%` rule's `{0,4096}`/`{0,32}`; a body
        // past them is simply not matched and the `{` stays plain text, which is
        // the safe direction.
        'forced-bold': {
            pattern: /\{\*(?=\S)[^*\n]{0,4096}(?:\*(?!\})[^*\n]{0,4096}){0,32}\*\}/,
            alias: 'bold',
        },
        'forced-italic': {
            pattern: /\{\/(?=\S)[^/\n]{0,4096}(?:\/(?!\})[^/\n]{0,4096}){0,32}\/\}/,
            alias: 'italic',
        },
        'forced-underline': {
            pattern: /\{_(?=\S)[^_\n]{0,4096}(?:_(?!\})[^_\n]{0,4096}){0,32}_\}/,
            alias: 'underline',
        },
        'forced-strike': {
            // `~` is tempered against BOTH `>` and `}` here: `(?!~>)` in the
            // old form barred a substitution arrow from the body, and the lazy
            // scan stopped at the first `~}`, so a `~` inside the body is
            // neither.
            pattern: /\{~(?=\S)[^~\n]{0,4096}(?:~(?![>}])[^~\n]{0,4096}){0,32}~\}/,
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
            // A BARE `=` THAT BEGINS OR ENDS A SMART-TYPOGRAPHY PATTERN IS NOT
            // AN OPENER (grammar.ebnf, Inline parsing precedence: "a delimiter
            // that begins a multi-char smart-typography pattern: `=>` is the
            // arrow, never a highlight opener - the pattern is consumed
            // first"). Corpus 386's third paragraph is the shape it cost -
            // `key => value stays literal, and p <= q is a comparison` renders
            // with no mark, and the `=` of `=>` reached the `=` of `<=` and
            // scoped the sentence (carve-grammars#325). The guard is one
            // character on each side: not AFTER `<`, `>` or `!`, which is
            // every character the language puts in front of a `=` to make a
            // comparison (grammar.ebnf `comparison`) or an arrow tail (`<==`);
            // and not BEFORE `>`, which is `=>` and the tail of `==>`.
            //
            // ALL FOUR ARE LOAD-BEARING HERE and only here, which is a fact
            // about Prism rather than about the language: Prism applies TOKENS
            // IN THE ORDER THEY ARE DECLARED, and 'highlight' is declared
            // before 'typography', so this rule reaches a `<=` before the rule
            // that owns it does. highlight.js and the TextMate family resolve
            // by POSITION instead, so there the comparison starts one column
            // earlier and wins on its own; each of those grammars carries only
            // the characters that changed a measurement when reverted, which
            // is why the three spellings are not identical.
            //
            // AND AN ESCAPED FLANK IS NOT A FLANK (carve-grammars#380). A
            // lookbehind sees a character, not whether it was escaped, so
            // `a \\!=b c= d` - where the `!` is literal and the `=` after it
            // is an ordinary opener the engine marks - was refused, and
            // `a \\=b c= d`, whose `=` cannot open at all, was taken. The
            // opener now refuses a `=` that follows a backslash and admits
            // one that follows an ESCAPED `<`, `>` or `!`. The other two
            // grammars need none of this: their escape rule is in front of
            // their highlight rule, so the flank is gone before it is asked
            // about, and Prism applies tokens IN ORDER with 'escape' behind
            // 'highlight'.
            // The closer is deliberately unguarded - once a highlight is open
            // the closer wins over the pattern in the engine too, so
            // `x =y z<= w` marks `y z<`.
            // ONE SHAPE IT COSTS: `<https://e.example>=hi=`, where the `>`
            // closes an autolink rather than opening a comparison; a
            // fixed-width lookbehind cannot tell the two apart, and this takes
            // the under-colouring side of that trade.
            // ONE TOKEN, TWO FORMS, so the bare `=x=` alternative shares a
            // line with the braced one. Its `[^=\n]+?` was never the defect
            // this rule was fixed for - the class already excludes its own
            // closer, so an unclosed `=` gives up at the next one - but it is
            // the last unbounded quantifier on a line that spells a braced
            // construct, and the derived family check below reads lines. Given
            // a bound, at the same 4096 the rest of the file uses.
            pattern: /\{=(?=\S)[^=\n]{0,4096}(?:=(?!\})[^=\n]{0,4096}){0,32}=\}|(?<!\\)(?:(?<![\w=<>!])|(?<=\\[<>!]))=(?=\S)(?!>)[^=\n]{1,4096}?(?<=\S)=(?![\w=])/,
            alias: 'important',
        },
        // Braced-only: a bare `^` / `,` is literal text (no bare sup/sub).
        'superscript': {
            pattern: /\{\^(?=\S)[^\^\n]{0,4096}(?:\^(?!\})[^\^\n]{0,4096}){0,32}\^\}/,
            alias: 'important',
        },
        'subscript': {
            pattern: /\{,(?=\S)[^,\n]{0,4096}(?:,(?!\})[^,\n]{0,4096}){0,32},\}/,
            alias: 'important',
        },
    };

    // A delimited comment is an inline leaf, so it does not split the strong
    // or emphasis span that contains it. `greedy` lets the outer token reclaim
    // a comment Prism found first; the nested rule then restores the comment
    // scope without interpreting its hidden payload.
    for (var emphasisName of [
        'bold-italic', 'forced-bold', 'forced-italic', 'forced-underline',
        'forced-strike', 'bold', 'italic', 'underline', 'strike', 'highlight',
        'superscript', 'subscript',
    ]) {
        inline[emphasisName].greedy = true;
        inline[emphasisName].inside = {
            'comment': { pattern: bracedCommentPattern, greedy: true },
        };
    }

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

    /*
     * THE PIECES OF AN UNPARTNERED VERBATIM RUN (carve-grammars#312).
     *
     * A backtick run with no closing partner still opens a verbatim span in
     * the engine, and it reaches the end of its PARAGRAPH: `` a `x *b* y ``
     * renders `<p>a <code>x *b* y</code></p>`, across soft line breaks and
     * all. Written only as a paired pattern, none of that matched and the
     * body stayed live markup.
     *
     * `notEscaped` is backslash PARITY, not "no backslash before it". An odd
     * run of backslashes escapes the backtick and there is no span; an even
     * one is escaped backslashes and the backtick opens as usual - the engine
     * reads `` a \\`x `` as a literal backslash followed by a code span.
     * Bounded at 32 pairs, past which the guard gives up and the run opens.
     *
     * The `\r` in the blank-line guards is for CRLF input, where a blank line
     * is `\r\n\r\n` and a guard written on `\n` alone never sees one.
     *
     * `maximalRun` and `narrowRun` differ only in width, and the difference is
     * where the fence ambiguity lives: a bare run of three or more cannot be
     * told from an unterminated code fence without a container model, so the
     * bare form takes one or two. Behind a `$`, `$$` or `!` sigil there is no
     * such ambiguity - a fence never carries one - so those take any width.
     *
     * `unpartneredTail` is the rest of the paragraph: to a blank line, and to
     * any line that opens or closes another block. That second bound is the
     * one that matters. A span with no closer ahead that ran on would swallow
     * its container's own closer and every block after it - the hazard
     * `fencedVerbatim` states in the highlight.js grammar - so `::: note` /
     * `` a `x `` / `:::` ends the span before the closer. `otherBlockOpener` is
     * the same line test the definition-list rule below uses, so there is one
     * answer in this file to "where does a paragraph stop". It is wider than
     * the engine on one shape: a bullet does not interrupt an open run there
     * and it does here, which is the span giving ground rather than taking a
     * line it should not.
     */
    var notEscaped = '(?<!(?<!\\\\)(?:\\\\\\\\){0,32}\\\\)';
    var maximalRun = '(?<!`)`+(?!`)';
    var narrowRun = '(?<!`)`{1,2}(?!`)';
    var unpartneredTail =
        '[^\\n]{0,4096}(?:\\n(?![ \\t\\r]*$)(?!' + otherBlockOpener + ')[^\\n]{0,4096}){0,64}';

    /**
     * An unpartnered verbatim run behind `sigil`, to the end of its paragraph.
     *
     * @param {string} sigil - the construct's prefix, as regex source.
     * @param {string} run - `maximalRun` or `narrowRun`.
     * @returns {RegExp} the pattern.
     */
    function unpartneredRun(sigil, run) {
        return RegExp(notEscaped + sigil + run + unpartneredTail, 'm');
    }

    // A definition-list entry: the opening term line plus every following
    // line that is not some OTHER block opener (see above).
    var definitionListPattern = RegExp(
        '^(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*:: +(?![ \\t]*$)[^\\n]*(?:\\n(?!' + otherBlockOpener + ')[^\\n]*)*',
        'm',
    );

    // A list item's MARKER, as it may appear before a block opener on the same
    // line (the marker branches of the 'list' pattern below, plus the optional
    // task box). Used by the marker-line comment fence.
    // EVERY SEPARATOR IS A LITERAL SPACE, never a tab: `-<TAB>a`, `1.<TAB>a` and
    // `- [x]<TAB>a` are paragraphs in the engine, which the shared block battery
    // already pins per marker. Written `[ \t]+` this admitted `-<TAB>%%%` as a
    // marker-line fence, and once the quote rules started sharing the prefix it
    // would have coloured `-<TAB>> q` as a quote on a line the language renders
    // as prose (carve-grammars#259).
    var listMarkerBeforeBlock =
        '[ \\t]*(?:(?:[-*] +)*[-*] +(?:\\[[ xX\\-_>?]\\] +)?'
        + '|(?:[0-9]+|[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)[.)] +|\\. +)';

    // A line that is blank, or indented by at least one column. A COLUMN-0 line
    // is neither, and that is the point: it ends the container and with it an
    // open fence, so the scan for a closer must not cross one (corpus 326-6 -
    // `- %%%` / `c` / `%%%` leaves `c` and the trailing paragraph VISIBLE).
    // Both alternatives are DISJOINT and each decomposes ONE way, which is what
    // keeps the repetition below linear. `[ \t]+[^\n]*\n` was neither: a
    // whitespace-only line satisfies it AND the blank branch, and `[^\n]`
    // itself accepts a space, so `  x` splits two ways at the same end
    // position. A `*?` repetition of that group then had 2^n parses of an n-line
    // body, and an UNCLOSED fence makes the engine walk all of them before it
    // gives up - `- %%%` plus 24 indented lines took 421 ms, plus 30 does not
    // finish (carve-grammars#294). Requiring a NON-BLANK character after the
    // indent removes both: the branches no longer overlap, and `[ \t]+` can no
    // longer trade characters with what follows it. The matched LANGUAGE is
    // unchanged - a whitespace-only indented line is still the blank branch -
    // so no highlighting moves.
    var blankOrIndentedLine = '(?:[ \\t]*\\n|[ \\t]+[^ \\t\\n][^\\n]*\\n)';

    // A BLOCK-QUOTE marker run, as it appears before a block opener on the same
    // line. `> `, not `>+` and not `>\s`: the separator is a literal space and
    // nesting is written one marker per space (`> > x`), which is what the
    // 'blockquote' pattern below already enforces.
    //
    // The run may itself sit after a LIST ITEM'S MARKER (`- > %%%`), which is
    // why `listMarkerBeforeBlock` is an alternative to the plain indent rather
    // than a separate pattern: a quote opens on an item's own marker line and
    // takes the rest of it, and carve-js nests both the quote and whatever
    // follows the marker inside the item. carve-grammars#246 left this out
    // because two of the three grammars here could not reach it; both can now,
    // so the reason for leaving it out has inverted - a shape one grammar
    // handles and two do not is exactly the drift `tests/lib/
    // marker-line-fences.js` exists to prevent.
    var quoteMarkerBeforeBlock = '(?:' + listMarkerBeforeBlock + '|[ \\t]*)((?:> )+)';

    // A line that carries a quote marker. Everything from a quote-marked fence
    // opener to its closer has to be one of these: an UNMARKED line is where
    // the quote can end, and a fence that scanned across one would hide text
    // the engine renders (see the note on the quote branch below).
    var quoteMarkedLine = '(?:[ \\t]*>[^\\n]*\\n)';

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
                // Inline comment `{% ... %}`. The body may contain a `%` that
                // is not the closer's (`{% 50% off %}` is one comment in the
                // engine), so the scan cannot simply exclude `%` the way the
                // critic rule excludes `}` - but written `[^\n]*?` it scans to
                // end of LINE from every position and never finds a closer in
                // a document made of openers, which is quadratic in the
                // document (carve-grammars#298: 5.2 ms at 6 KB, 312 ms at
                // 48 KB, x4 per doubling, and it ships).
                //
                // Unrolled instead: a run of non-`%`, then any number of `%`
                // that is NOT the closer followed by another such run. Same
                // language - "no newline and no `%}`" - but every step is
                // forced, so an unclosed `{%` gives up at the next `%` rather
                // than at the end of the line, and both repetitions are
                // BOUNDED, which is what `tests/scans-are-bounded-test.js`
                // pins. The run bound matches the critic comment's `{0,4096}`
                // next door, and raising it costs nothing on an unclosed
                // opener - the run stops at the next `%` either way, so the
                // bound caps a body, not a failure. A body past the bounds
                // (over 4 KB between two `%`, or over 32 non-closing `%`) is
                // not matched and the `{%` stays plain text, which is the safe
                // direction.
                //
                // A LINE BREAK IS PART OF THE BODY. `a {% x` / `*b* y %} z`
                // renders `<p>a  z</p>` - one comment, spanning the break -
                // and the line-bounded class matched none of it, so the run
                // inside a hidden comment coloured as bold
                // (carve-grammars#312). The newline is TEMPERED rather than
                // admitted: a BLANK line ends the paragraph and therefore the
                // comment, measured - `a {% x` / `` / `*b* y %} z` is two
                // paragraphs with the delimiters literal in both.
                //
                // The unrolling is untouched by that. `[^%\n]` and
                // `\n(?![ \t]*\n)` are disjoint, so each character is still
                // matched by exactly one branch and an unclosed `{%` still
                // gives up at the next `%` rather than scanning ahead.
                pattern: bracedCommentPattern,
                greedy: true,
            },
            {
                // A fence may open on a list item's MARKER LINE (`- %%%`), and
                // then its body is hidden exactly as it is anywhere else - §24
                // S2 and §28 make a comment's body verbatim and invisible
                // WHEREVER the fence sits (corpus 337). The column-anchored
                // pattern below cannot reach that shape, so the hidden body
                // came back as LIVE syntax: the reference definition inside the
                // fence scoped as a `reference-definition`, and the real closer
                // as a separate line comment.
                //
                // The marker is capture group 1 and `lookbehind` keeps it out
                // of the token, so it stays available to the 'list' rule -
                // tree-sitter-carve models it the same way, with the
                // `fenced_comment_block` INSIDE `list_item_content` beside the
                // `list_marker_*` rather than over it.
                //
                // The closer is group 2 (group 1 being the lookbehind), matched
                // as a backreference for the exact-width rule, and it must be
                // INDENTED: a column-0 run is a different block (see
                // `blankOrIndentedLine`).
                pattern: RegExp(
                    '^((?:(?<![\\s\\S])\\uFEFF)?' + listMarkerBeforeBlock + ')'
                    + '(%{3,})(?!%)[^\\n]*\\n' + blankOrIndentedLine + '*?[ \\t]+\\2(?!%)[^\\n]*$',
                    'm',
                ),
                lookbehind: true,
                greedy: true,
            },
            {
                // The same rule at a BLOCK-QUOTE marker (`> %%%`): §24 S2 and
                // §28 hide a comment's body WHEREVER the fence sits, and corpus
                // 70 pins this spelling - `> q` / `> %%%` / `> x` / `> %%%` /
                // `> body` renders the quote with `q` and `body` only.
                // The column-anchored pattern below cannot reach it either, so
                // the two `%%%` runs scoped as trailing line comments while the
                // hidden `x` between them came back as live quote content.
                //
                // The marker run is group 2 inside the group-1 lookbehind, so
                // it stays available to the 'blockquote' rule. tree-sitter-carve
                // splits it the same way: the `fenced_comment_block` sits inside
                // the quote's `content`, beside the `block_quote_marker`.
                //
                // The closer repeats the marker run (`\2`) as well as the fence
                // width (`\3`), so a fence opened at `> > ` is not closed at
                // `> `. Every line between them must carry a marker of its own:
                // an unmarked line is where the quote can END, and the engine
                // degrades an unclosed opener to a line comment rather than
                // hiding anything (`> %%%` / `> c` / blank leaves `c` VISIBLE).
                // The engine does absorb an unmarked LAZY continuation into a
                // fence that closes later; refusing it here costs a mis-scope
                // on that shape and buys never hiding a visible block.
                pattern: RegExp(
                    '^((?:(?<![\\s\\S])\\uFEFF)?' + quoteMarkerBeforeBlock + ')'
                    + '(%{3,})(?!%)[^\\n]*\\n' + quoteMarkedLine + '*?[ \\t]*\\2\\3(?!%)[^\\n]*$',
                    'm',
                ),
                lookbehind: true,
                greedy: true,
            },
            {
                // The closer is a backreference, so it matches the opener's
                // length EXACTLY: a longer run does not close a shorter fence
                // (hence the `(?!%)`), which is what lets `%%%%` nest `%%%`.
                //
                // THE SCAN IS BOUNDED, for the reason the highlight.js grammar
                // states beside its own copy of this rule: proving there is no
                // closer costs a scan to end of input, and a document can hold
                // one unmatched run per fence WIDTH, so an adversarial file pays
                // it many times over. 2000 runs of increasing width (2 MB) took
                // 1801 ms here unbounded, and 8 MB took 14.2 s; the bounded form
                // grows linearly (carve-grammars#260).
                //
                // A closer further than 8000 characters below its opener is not
                // found and the run degrades to the unterminated pattern below,
                // which is the SAFE direction: a run that opens nothing leaves
                // the text under it VISIBLE.
                pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*(%{3,})(?!%)[^\n]*\n[\s\S]{0,8000}?^[ \t]*\1(?!%)[^\n]*$/m,
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
            //
            // THE CLOSER MATCHES ITS OPENER on three counts, and `\1` alone
            // carried only one of them (carve-grammars#312):
            //
            //   SAME CHARACTER, group 3. `\1` already gave that, since it
            //   repeats the opener's own run.
            //
            //   AT LEAST AS LONG, `\2\3*`. PART 9 §2 is `len(close) >=
            //   len(open)`, and the engine agrees: `~~~` closed by `~~~~` is
            //   ONE code block. On an exact-width `\1` the fence stayed
            //   unmatched and `*b*` under it coloured as bold - a payload the
            //   engine keeps verbatim, scoped as markup.
            //
            //   AT THE OPENER'S OWN COLUMN, `\1`. A run indented past the
            //   opener is CONTENT, which is what lets a fence hold a fence as
            //   sample text - the shape every document describing Carve in
            //   Carve is made of. With `[ \t]*` the block ended at the
            //   indented run and everything after it went live.
            //
            // The width rule is the code fence's and not the colon fence's,
            // which wants an exact length (§12) - the same distinction
            // `fencedVerbatim` states next to highlight.js's copy of this rule.
            pattern: /^(?:(?<![\s\S])\uFEFF)?([ \t]*)((`|~)\3{2,})[ \t]*[^\n]{0,512}\n[\s\S]*?^\1\2\3*[ \t]*$/m,
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
                // one also excludes a `#` immediately after `</`, because this
                // nested set does not offer 'cross-ref' - without the
                // exclusion this rule claimed the `#a` inside a heading
                // cross-reference `</#a>` and broke corpus 118 (`# A </#a>`),
                // which pins the whole thing staying unscoped. Until
                // carve-grammars#307 this comment read "Prism has no
                // cross-reference token at all", and the exclusion was the
                // only place in the file that knew the construct existed: at
                // document level the unguarded 'tag' token coloured every
                // `</#id>` as a hashtag. The `(?<!<\/)` is real JS lookbehind
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
            pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*(:{3,})(?: +(?:\||\\|>)| +[a-zA-Z_][\w-]*(?: +"[^"\n]*")?(?: +\[[^\]\n]*\])?| *\[[^\]\n]*\])?[ \t]*$(?:\n[\s\S]*?^[ \t]*\1[ \t]*$)?/m,
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
                    pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*:{3,}(?: +(?:\||\\|>)| +[a-zA-Z_][\w-]*(?: +"[^"\n]*")?(?: +\[[^\]\n]*\])?| *\[[^\]\n]*\])?[ \t]*$/m,
                    inside: {
                        'punctuation': /:{3,}/,
                        'string': /"[^"\n]*"/,
                        'symbol': /\[[^\]\n]*\]/,
                        'class-name': /[a-zA-Z_][\w-]*|\||\\|>/,
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
        // AFTER 'list', deliberately, and that placement is the whole of the
        // marker-line fix (carve-grammars#259).
        //
        // A quote may open on a list item's OWN MARKER LINE - `- > x`, `1. > x`,
        // `- - > x`, `- [ ] > x` - and it takes the rest of that line: carve-js
        // renders `<ul><li><blockquote><p>x</p></blockquote></li></ul>`. This
        // pattern is line-anchored and cannot see past a marker, so while it ran
        // BEFORE 'list' the whole line reached 'list', the marker was scoped and
        // everything after it carried no scope at all.
        //
        // Run after 'list', the marker is a token before this rule is reached and
        // what is left of the line is a string beginning at the `>`, which `^`
        // matches - so both scopes land: the marker stays a list (its checkbox
        // included) and the quote takes the rest. That is tree-sitter-carve's
        // split too, with the `block_quote` inside `list_item_content` beside
        // the `list_marker_*` rather than over it.
        //
        // A LOOKBEHIND WAS THE OTHER OPTION AND IS WORSE. Keeping the marker in
        // a Prism `lookbehind` group leaves `- ` as a fragment with nothing
        // after it, and 'list' requires content past its marker (MARKER REQUIRES
        // CONTENT, below), so the marker ends up scoped as nothing - which is
        // what the marker-line comment fence above does today. Measured both
        // ways against the 2490 goldens: the same 20 move either way, and only
        // this one keeps the marker.
        //
        // No line-start conflict is created by the move: 'list' needs a bullet
        // or ordered marker at the line start and this rule needs a `>` there,
        // so no line can match both at the same position, and only the leftover
        // of a marker line behaves differently.
        'blockquote': {
            // Anchored `^[ \t]*` on purpose - no container model here, see the
            // indented-block-openers note in the module docblock (carve-grammars#138).
            pattern: /^(?:(?<![\s\S])\uFEFF)?[ \t]*>(?: .*)?$/m,
            inside: Object.assign({
                'punctuation': /^\uFEFF?[ \t]*>/,
            }, inline),
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
            /*
             * The closing run is the WHOLE run, as in the `code` rule below
             * and for the same reason: a run longer than the opener's is
             * content, so pairing the opener with part of a wider run ended
             * the span early and coloured what followed (carve-grammars#312).
             * Guarded on BOTH sides here where the `code` rule needs only the
             * trailing guard: this body is a lazy any-character run, so it can
             * end ON a backtick and leave the closer as the second half of a
             * pair, where the `code` rule's body ends on a non-backtick by
             * construction.
             */
            {
                pattern: /\$\$(`+)[\s\S]*?(?<!`)\1(?!`)/,
                greedy: true,
                alias: 'string',
            },
            {
                pattern: /\$(`+)[\s\S]*?(?<!`)\1(?!`)/,
                greedy: true,
                alias: 'string',
            },
            // ... and with no closing run at all, which is still math and not
            // a stray `$` before a code span. Any width: the sigil is what
            // opens it, so there is no fence to be confused with.
            {
                pattern: unpartneredRun('\\$\\$', maximalRun),
                greedy: true,
                alias: 'string',
            },
            {
                pattern: unpartneredRun('\\$', maximalRun),
                greedy: true,
                alias: 'string',
            },
        ],

        // Inline literal: !`...` - a `!` prefix on a verbatim backtick run,
        // rendered as prose (no <code>). Parallel to the `$`-prefixed math
        // token above; must precede `code` so the leading `!` claims the span.
        'literal': [
            {
                // The closing run is the WHOLE run - see the note on `math` above.
                pattern: /!(`+)[\s\S]*?(?<!`)\1(?!`)/,
                greedy: true,
                alias: 'string',
            },
            {
                // ... and with no closing run, which is still a literal: the
                // engine renders `` !`unclosed `` as `!<code>unclosed</code>`,
                // so the `!` belongs to this token and not to the prose.
                pattern: unpartneredRun('!', maximalRun),
                greedy: true,
                alias: 'string',
            },
        ],

        // Raw inline passthrough: `code`{=format}
        'raw-inline': {
            pattern: /(`{1,16})(?:[^`]|[^`][\s\S]{0,4096}?[^`])\1\{=[A-Za-z_][\w-]*\}/,
            greedy: true,
            alias: 'string',
        },

        // Inline code spans
        'code': [
            {
                /*
                 * THE CLOSING RUN IS THE WHOLE RUN, which the trailing
                 * not-a-backtick is what says. A code span closes on a run of
                 * the SAME length, so a longer run is content: the engine
                 * reads `` a `*``*b* `` as one span running to the end of the
                 * paragraph, and this rule paired the opener with the FIRST of
                 * the two backticks, ended the span early and coloured the
                 * `*b*` after it (carve-grammars#312). The leading guard is
                 * the same statement about the opener - a run is entered at
                 * its own start, never one character in.
                 */
                pattern: /(?<!`)(`{1,16})(?:[^`]|[^`][\s\S]{0,4096}?[^`])\1(?!`)/,
                greedy: true,
            },
            {
                /*
                 * A BACKTICK RUN WITH NO PARTNER IS STILL A CODE SPAN, and it
                 * runs to the end of its PARAGRAPH: `` a `x *b* y `` renders
                 * `<p>a <code>x *b* y</code></p>`, and it keeps going across a
                 * soft line break (`` a `x `` / `second line` is one code span
                 * holding both). The pattern above requires a closing run, so
                 * none of that matched and the body stayed live markup - the
                 * carve-grammars#312 leak.
                 *
                 * NO CLOSER IS LOOKED FOR, because none is left to find: this
                 * entry runs after the paired pattern in the same token and
                 * Prism applies the entries of an array in order, so every run
                 * that HAS a partner is already consumed. A
                 * `(?![\s\S]*?\1)` lookahead would answer the same question
                 * at O(n) per backtick, which is the quadratic shape
                 * carve-grammars#298 and #300 took out of this file.
                 *
                 * THE SPAN STOPS WHERE THE BLOCK DOES - at a blank line, and
                 * at any line that opens or closes another block. Both are
                 * measured: `` a `x *b* y `` / `` / `next *c*` leaves the
                 * second paragraph's bold live, and `::: note` / `` a `x *b* y ``
                 * / `:::` ends the span before the closer rather than eating
                 * it. That second bound is the one that matters, and it is the
                 * hazard `fencedVerbatim` states next door: a span with no
                 * closer ahead that ran on would swallow its container's own
                 * closer and every block after it. `otherBlockOpener` is the
                 * same line test the definition-list rule uses, so there is one
                 * answer in this file to "where does a paragraph stop".
                 *
                 * It is wider than the engine on exactly one shape: a bullet
                 * does NOT interrupt an open run there (`` a `x `` / `- item`
                 * is one code span holding the bullet), and it does here. That
                 * is the safe direction - the span gives ground rather than
                 * taking a line it should not.
                 *
                 * `tests/unclosed-delimiter-test.js` pins that an unpartnered
                 * opener never reaches past the break.
                 *
                 * The pieces, and why each is shaped the way it is, are on
                 * `unpartneredRun` above `Prism.languages.carve`. The width
                 * bound is the one that matters here: a bare run of three or
                 * more cannot be told from an unterminated code fence, which
                 * is a residual this grammar keeps on purpose rather than
                 * guessing at (tests/opaque-payload-test.js).
                 */
                pattern: unpartneredRun('', narrowRun),
                greedy: true,
            },
        ],

        // Images: ![alt](src "title"); the title may contain
        // backslash-escaped quotes like the link title.
        'image': {
            pattern: new RegExp('!\\[' + bracketText + '\\]\\([^\\s)]{1,2048}(?:[ \\t]+"(?:[^"\\\\]|\\\\[\\s\\S])*")?\\)'),
            greedy: true,
            alias: 'url',
            inside: {
                'string': /"(?:[^"\\]|\\[\s\S])*"/,
                'punctuation': /!\[|\]\(|\)/,
            },
        },

        // Reference images: ![alt][ref] and the collapsed ![alt][].
        //
        // The spec gives an image the same three forms a link has
        // (grammar.ebnf `reference_image`, `collapsed_reference_image`) and
        // says only the leading `!` and the `<img src>` output differ. This
        // file had a rule for the inline form alone, so both reference forms
        // fell through to 'url' below, which matched from the `[` and scoped
        // them as a reference LINK with the `!` left as prose. That is worse
        // than leaving them unscoped: the output says the document holds a
        // link where it holds an image. It also read IMPLEMENTED on the
        // construct ledger, because the per-surface naming table asserted a
        // fold onto 'image' that this grammar did not make.
        //
        // BEFORE 'url' for that reason, and after 'image', which needs a `](`
        // and so cannot claim either of these.
        //
        // RESIDUAL, the same one the inline 'image' rule above already has: an
        // image inside an INLINE NOTE takes the note's scope with it. The note
        // rule's body is `[^\]\n]{0,512}`, which cannot hold a `]`, so
        // `^[see ![z][r]]` was never one note token - it was a note ending at
        // the image's first `]`, with `[r]] b` left as prose. This rule claims
        // the image instead, so the image is right and the note is unscoped,
        // which is exactly what `^[see ![z](/i.png)]` has always done one
        // spelling over. Making the note bracket-balanced (and giving it the
        // image and link tokens inside) is what fixes both, and it is a change
        // to the note rule rather than to this one.
        //
        // ONE RULE FOR BOTH FORMS: the reference label is `[^\]\n]{0,512}`, whose
        // `{0,512}` accepts the EMPTY label - the same fold vim-carve and
        // sublime-carve make for the collapsed reference link
        // (carve-grammars#318), and the one 'url' already makes here. The alt
        // text may be empty too, so it uses `bracketText` rather than the
        // non-empty body: `![][r]` is an image, where `[][r]` is not a link.
        'reference-image': {
            pattern: new RegExp('!\\[' + bracketText + '\\]\\[[^\\]\\n]{0,512}\\]'),
            greedy: true,
            alias: 'url',
            inside: {
                'constant': /(?<=\]\[)[^\]\n]+(?=\]$)/,
                'punctuation': /!\[|\]\[|\]/,
            },
        },

        // Inline footnote: ^[content] (corpus 23-inline-footnotes). Distinct
        // from the reference `[^label]` below - the caret leads here - and
        // matched first so neither rule claims the other's brackets.
        'inline-footnote': {
            pattern: /\^\[[^\]\n]{0,512}\]/,
            alias: 'symbol',
            // The body is ordinary inline content - `^[see *later*]` keeps its
            // bold - so the shared inline rules apply inside it.
            inside: Object.assign({
                'punctuation': /^\^\[|\]$/,
            }, inline),
        },

        // Footnote references: [^label]
        'footnote': {
            pattern: /\[\^[^\]]{1,512}\]/,
            alias: 'symbol',
        },

        // Citations (Tier-2 §22): [@key], [+@key], [@key, p.10], [@a; @b; @c]
        // Distinguished from links/spans/refs by the absence of a trailing
        // `(url)`, `[ref]`, or `{attrs}` suffix. The bracket MUST contain at
        // least one `@key` item.
        'citation': {
            pattern: /\[\+?(?:[^\]@]{0,512}@[A-Za-z0-9_][A-Za-z0-9_.:#$%&+?<>~\/-]*(?:[^\]]{0,512})?)\](?!\(|\[|\{)/,
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

        // Cross-reference with auto text: </#id> (grammar.ebnf
        // `auto_text_link`).
        //
        // This grammar had no rule for it, and the run was not left alone: the
        // id begins with `#`, so 'tag' below claimed `#sec-intro` and coloured
        // the crossref as a hashtag - the same shape tree-sitter-carve#245
        // found, where a construct parsed as the wrong node made every editor
        // colour a crossref as a web address. So it sits before 'tag'.
        //
        // The id charset is the spec's `crossref_id` - anything that is not
        // `>`, whitespace or a newline - because an automatic heading id
        // PRESERVES Unicode and case, so `</#Cafe-Notes>` must scope.
        'cross-ref': {
            pattern: /<\/#[^>\s]{1,512}>/,
            greedy: true,
            alias: 'url',
            inside: {
                'punctuation': /^<\/#|>$/,
            },
        },

        // Inline links: [text](url "title") and reference [text][id]
        'url': [
            {
                // The link text may be empty ([](url), spec corpus 03-links-8)
                // and the title may contain backslash-escaped quotes:
                // [t](/url "ti\"tle") (spec corpus 03-links-4).
                pattern: new RegExp('\\[' + bracketText + '\\]\\([^\\s)]+(?:[ \\t]+"(?:[^"\\\\]|\\\\[\\s\\S])*")?\\)'),
                greedy: true,
                inside: {
                    'string': /"(?:[^"\\]|\\[\s\S])*"/,
                    'punctuation': /\[|\]\(|\)/,
                },
            },
            {
                pattern: new RegExp('\\[' + bracketTextNonEmpty + '\\]\\[[^\\]]{0,512}\\]'),
                greedy: true,
                inside: {
                    'punctuation': /\[|\]\[|\]/,
                },
            },
            {
                // autolink <https://...> and <mailto-ish>
                pattern: /<[a-zA-Z][a-zA-Z0-9+.-]*:[^>\s]{1,2048}>|<[^>\s@]{1,2048}@[^>\s]{1,2048}>/,
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
            pattern: new RegExp('\\[' + bracketTextSpan + '\\](?=\\{)'),
            alias: 'string',
        },

        // CriticMarkup: {+ins+} {-del-} {~old~>new~} {#comment#}
        //
        // WORSE THAN THE LINE-SCANNING FAMILY ABOVE, WHICH IS WHY THESE TWO WERE
        // THE SLOWEST ROWS IN THE SWEEP. `[^}]*` excludes neither the closer's
        // own character NOR the newline, so an unclosed `{+` scanned to the end
        // of the DOCUMENT rather than the end of the line (#300: 215 ms for `{+`
        // and 211 ms for `{-` on 24 KB against 42-145 ms for the seven
        // line-scanning rules). Unrolled the same way, tempered on `+`/`-`
        // instead of on `\n`, so the run still crosses lines the way `[^}]*`
        // did and a body may still hold a non-closing `+`.
        'inserted': {
            pattern: /\{\+[^+}]{0,4096}(?:\+(?!\})[^+}]{0,4096}){0,32}\+\}/,
            alias: 'inserted',
        },
        // THE BODY IS NOT EMPTY. `{--}` is a braced EN DASH, not an empty
        // deletion - the engine renders `a {--} b` as `a \u2013 b` - and this rule
        // read it as `{-` plus nothing plus `-}` (carve-grammars#378). One
        // character is enough: `{- -}`, `{---}` and `{----}` are all deletions.
        'deleted': {
            pattern: /\{-(?!-\})[^\-}]{0,4096}(?:-(?!\})[^\-}]{0,4096}){0,32}-\}/,
            alias: 'deleted',
        },
        // The one `{~ ... ~}` rule the sweep did NOT flag - a substitution's two
        // halves are each delimited by `~`, so the scan already stops at the
        // next one. Bounded anyway: it is the last unbounded scan in the braced
        // family, and the derived check below asserts the family as a whole
        // rather than a list somebody has to remember to extend.
        'changed': {
            pattern: /\{~[^~]{0,4096}~>[^~]{0,4096}~\}/,
            alias: 'important',
        },
        'critic-comment': {
            pattern: /\{#[^}]{0,4096}#\}/,
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
        // The doubled run is canonical in both arrow families (carve#1442), so
        // `-->` `<--` `<-->` and `==>` `<==` `<=>` are listed BEFORE the single
        // forms and before the dash rule - otherwise `-->` scopes as an en dash
        // followed by a stray `>`. `=>` alone is no longer an arrow and is gone
        // from the set; `<=` stays, as the comparison it always was.
        //
        // A hyphen run that OPENS a word after whitespace is a command-line
        // flag and stays literal (carve#1443), so `--oneline` is not an en dash
        // while `1--10`, `Mon--Fri` and `a -- b` still are. That is the guard
        // around the dash alternatives: preceded by a non-space, or not
        // followed by a word character.
        'typography': {
            pattern: /\{--\}|\.\.\.|<-->|<--|-->|<=>|<==|==>|<->|<-|->|(?:(?<=\S)(?:---|--)|(?:---|--)(?!\w))|!=|<=|>=|\+-|\(c\)|\(r\)|\(tm\)/,
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

    // The canonical file extension is a fence word too, and every surface this
    // package ships answers it (tests/lib/aliases.js). Lowercase because
    // `Prism.util.getLanguage` lowercases the `language-xxx` class, so an
    // uppercase key would be assignable and unreachable.
    Prism.languages.crv = Prism.languages.carve;
})(
    (typeof globalThis !== 'undefined' && globalThis.Prism)
        ? globalThis.Prism
        : (typeof window !== 'undefined' && window.Prism)
            ? window.Prism
            : (typeof global !== 'undefined' && global.Prism)
                ? global.Prism
                : undefined
);
