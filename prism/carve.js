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
    var attrItem = /(?::(?:[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8})*)?|[.#][A-Za-z0-9_][\w-]*|[A-Za-z_][\w-]*(?:=(?:"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'|[^\s"'{}|\\]+))?)/.source;
    // The parts of C2-I-029 to C2-I-032: an unquoted value holds no pipe or backslash.
    var strictAttrItem = /(?::(?:[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)?|[.#][\w-]+|[A-Za-z_][\w-]*=(?:"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'|[^\s"'\\|}]+)|[A-Za-z][\w-]*)/.source;
    // A LIST MARKER MAY BE GLUED TO AN ATTRIBUTE BLOCK (`-{#x} item`), so the
    // marker rule has to look past a whole block to decide it is a marker at
    // all. That lookahead spelled the item alternation out a second time, and
    // the copy went stale: when the language attribute (`{:fr}`) was added to
    // `attrItem`, `-{:fr} item` stopped scoping its `-` as a marker while
    // `-{.c} item` still did. Built from `attrItem` now, so there is one
    // spelling of what an attribute item is and the marker rule cannot drift
    // from the attribute rule again.
    var gluedAttrBlock =
        '(?=\\{\\s*(?:' + attrItem + '(?:\\s+' + attrItem + ')*\\s*)?\\}[ \\t]+[^ \\t\\r\\n])';
    var gluedAttrRun = '\\{\\s*(?:' + attrItem + '(?:\\s+' + attrItem + ')*\\s*)?\\}';
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
    // An inline note's body: the same nesting, but a soft line break and not a
    // blank line.
    var noteChar = '(?:[^\\[\\]\\\\\\n]|\\\\[^\\r\\n]|\\\\?(?:\\r\\n?|\\n)(?![ \\t\\r]*(?:\\r\\n?|\\n)))';
    var noteText = noteChar + '{0,512}';
    for (var noteDepth = 0; noteDepth < 3; noteDepth++) {
        noteText = '(?:' + noteChar + '|\\[' + noteText + '\\])' + BRACKET_SCAN;
    }
    // The same body, required to be non-empty, for the rules that reject `[]`.
    var bracketTextNonEmpty = '(?!\\])' + bracketText;
    // ... and additionally not opening on the `^` that marks a footnote
    // reference, for the two span rules that guarded against it before.
    var bracketTextSpan = '(?![\\]^])' + bracketText;
    // An escaped opener is text: `\[x](u)` is not a link (carve-grammars#460).
    // The lookbehind sits after the opener, so it only runs where one matched.
    var unescaped = function (opener) {
        return opener + '(?<!(?:^(?<![^\\r\\n])|[^\\\\])(?:\\\\\\\\)*\\\\' + opener + ')';
    };
    // Not behind an odd backslash run: an even run is escaped backslashes. Bounded at 32 pairs.
    var notEscaped = '(?<!(?<!\\\\)(?:\\\\\\\\){0,32}\\\\)';
    // Snippets (C2-B-236, C2-I-128), the TextMate rules' spelling. A
    // definition's marker parts and glued blocks take no id; the blocks glued
    // after a use may.
    var snippetName = '[A-Za-z0-9_][A-Za-z0-9_-]*';
    var snippetPartTail = /:(?:[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8})*)?|[A-Za-z_][A-Za-z0-9_-]*=(?:"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'|[^\s"'{}|\\]+)|[A-Za-z][A-Za-z0-9_-]*/.source;
    var snippetDefinitionPart = '(?:\\.[A-Za-z0-9_-]+|' + snippetPartTail + ')';
    var snippetUsePart = '(?:[.#][A-Za-z0-9_-]+|' + snippetPartTail + ')';
    var snippetDefinitionHead = '\\{\\$' + snippetName + '(?:(?: +' + snippetDefinitionPart + ')+ *)?\\}'
        + '(?:\\{ *' + snippetDefinitionPart + '(?: +' + snippetDefinitionPart + ')* *\\})*:';
    // C2-I-026: the characters on the two sides of braced comments are tested as if glued.
    var bracedComments = '(?:\\{%(?:[^%]|%(?!\\})){0,4096}?%\\})*';
    // A mention or tag name (C2-I-092): runs of letters, digits, `_` and `-`
    // joined by single dots, holding a letter, not ending in a hyphen; a run
    // directly followed by a Unicode letter, number or mark is text. Needs `u`.
    var tagName = '(?!(?=(?<run>[A-Za-z0-9_.-]*))\\k<run>[\\p{L}\\p{N}\\p{M}])'
        + '(?=(?:[A-Za-z0-9_-]|\\.(?=[A-Za-z0-9_-]))*[A-Za-z])[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*(?<!-)';
    // An EMPTY block is valid only glued to a preceding `]` (`[x]{}` ->
    // <span>x</span>); a bare `{}` in prose is literal text (corpus 123).
    // An EMPTY attribute block is valid only where it is glued to a preceding
    // `]` (`[x]{}` -> <span>x</span>); a bare `{}` in prose is literal text
    // (corpus 123). Prism tokenizes left to right, so the span and its empty
    // block have to be ONE rule -- a lookbehind would lose its `]` to the span.
    var spanEmptyAttrs = {
        pattern: new RegExp(unescaped('\\[') + bracketTextSpan + '\\]\\{\\s*\\}'),
        inside: {
            'attr-value': { pattern: /\{\s*\}/, inside: { 'punctuation': /[{}]/ } },
            'string': new RegExp('\\[' + bracketText + '\\]'),
        },
    };
    // A fence's info string (grammar.ebnf `code_fence_info`), or a raw format.
    var codeFenceInfo = '[A-Za-z0-9_+#./-]+(?: +"[^"\\r\\n]*")?(?: +\\[[^\\]\\r\\n]*\\])?|"[^"\\r\\n]*"(?: +\\[[^\\]\\r\\n]*\\])?|\\[[^\\]\\r\\n]*\\]|=[A-Za-z_][\\w-]*';
    // A delimited comment joins no attribute run (carve#2932), so a glued block
    // fails when its run starts right after a comment's `%}`; the opener is
    // required because `{k=a%}` ends an attribute block the same way. Checked
    // only after a block matched; bounded, so a run past 64 blocks scopes its tail.
    // The closer a block glues to is not an escaped character: `x\]{.c}` is text.
    var afterEscape = '(?<!(?<!\\\\)(?:\\\\\\\\){0,32}\\\\[^\\r\\n])';
    var noCommentRun = '(?<!\\{%(?:[^%\\r\\n]|%(?!\\})|(?:\\r\\n?|\\n)(?![ \\t\\r]*(?:\\r\\n?|\\n))){0,4096}%\\}(?:[ \\t]{0,64}\\{[^{}\\r\\n]{0,512}\\}){1,64})';
    var linkDestinationBeforeAttr = '(?:(?=\\{)(?<=(?<!\\\\)(?:\\\\\\\\){0,32}\\[(?:[^\\[\\]\\\\\\n]|\\\\.){0,4096}\\]\\((?:[^()\\r\\n]|\\([^()\\r\\n]{0,256}\\)|\\([^()\\r\\n]{0,256}\\([^()\\r\\n]{0,256}\\)[^()\\r\\n]{0,256}\\)){0,2048}\\))|(?=\\{)(?<=(?:^(?<![^\\r\\n])|(?:\\r\\n?|\\n))[^\\[\\]\\r\\n]{0,4096}(?<!(?<!\\\\)(?:\\\\\\\\){0,32}\\\\)\\]\\((?:[^()\\r\\n]|\\([^()\\r\\n]{0,256}\\)|\\([^()\\r\\n]{0,256}\\([^()\\r\\n]{0,256}\\)[^()\\r\\n]{0,256}\\)){0,2048}\\)))';
    // `08-attributes.ebnf` `continuation`: an attribute line wraps only onto a
    // non-blank line indented past its `{`, so `{.a` + newline + `.b}` is text.
    // A regex cannot compare tab-expanded columns, so the pattern admits any
    // indented line and `pastOpenerColumn` checks the columns.
    var attrLineIndent = '[ \\t]+';
    var attrLinePad = '[ \\t]*(?:(?:\\r\\n?|\\n)' + attrLineIndent + ')?';
    var attrLineSep = '(?:[ \\t]*(?:\\r\\n?|\\n)' + attrLineIndent + '|[ \\t]+)';
    var indentColumn = function (text, from) {
        var column = 0;
        for (var at = from; at < text.length; at++) {
            var c = text.charAt(at);
            if (c === ' ') column++;
            else if (c === '\t') column += 4 - column % 4;
            else break;
        }
        return column;
    };
    // Group 1 is the opener's indentation, set only on the line-anchored branch:
    // a match is kept when every line it wraps onto sits past the `{` column
    // (tab stops of 4, PART 7), else the search resumes after its `{`.
    // A block glued to a `}` that closes no forced emphasis needs that `}` to
    // close an attached block: `a}{.b}`, `x {.a}{.b}` and a refused `{.a` + `}`
    // run are text (carve-grammars#847). An empty `{}` joins only a bracketed
    // span's run (`[a]{}{.b}`; `*x*{}{.b}` is text).
    function pastOpenerColumn(pattern) {
        var gated = RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
        var probe = RegExp(pattern.source, pattern.flags.replace('g', '') + 'y');
        var lineBreak = /\r\n?|\n/g;
        // The `{` that opens the block a `}` at `close` ends: quoted values are skipped, -1 when none.
        var blockOpener = function (source, close) {
            var open = source.lastIndexOf('{', close - 1);
            if (open === -1 || !/["']/.test(source.slice(open, close))) return open;
            open = -1;
            for (var i = Math.max(0, close - 4096); i < close; i++) {
                var c = source.charAt(i);
                if (c === '\\') { i++; continue; }
                if (c === '{') { open = i; continue; }
                if (c === '}') { open = -1; continue; }
                if (open !== -1 && (c === '"' || c === "'")) {
                    for (var j = i + 1; j < close && source.charAt(j) !== c && source.charAt(j) !== '\n'; j++) {
                        if (source.charAt(j) === '\\') j++;
                    }
                    if (source.charAt(j) === c) i = j;
                }
            }
            return open;
        };
        // The `[` that opens the bracket closed by the `]` before `at`, -1 when none.
        var bracketOpener = function (source, at) {
            var depth = 0;
            for (var i = at - 1, stop = Math.max(0, at - 4096); i >= stop && source.charAt(i) !== '\n'; i--) {
                var c = source.charAt(i);
                if (source.charAt(i - 1) === '\\' && source.charAt(i - 2) !== '\\') { i--; continue; }
                if (c === '`') {
                    var run = 1;
                    while (source.charAt(i - run) === '`') run++;
                    var tick = source.lastIndexOf('`'.repeat(run), i - run);
                    var line = source.lastIndexOf('\n', i);
                    if (tick > line) { i = tick; continue; }
                    i -= run - 1;
                    continue;
                }
                if (c === ']') depth++;
                else if (c === '[' && --depth === 0) return i;
            }
            return -1;
        };
        // A bracketed span, not a footnote reference or a reference link (`[a][r]`).
        var closesSpan = function (source, at) {
            var open = bracketOpener(source, at);
            return open !== -1 && source.charAt(open + 1) !== '^' && !(source.charAt(open - 1) === ']' && bracketOpener(source, open) !== -1);
        };
        // A block glued to a bare delimiter needs a run of that kind to close
        // there: `a*{.q}` and `x _a_ b_{.q}` are text (carve-grammars#867). A run
        // crosses soft breaks, so the scan covers the paragraph.
        var bareRunRules = { '*': ['bold', 'bold-italic'], '/': ['italic', 'bold-italic'], '_': ['underline'], '~': ['strike'], '=': ['highlight'] };
        var paragraphStart = function (source, at) {
            var start = source.lastIndexOf('\n', at - 1) + 1;
            while (start > 0 && at - start < 8192) {
                var previous = source.lastIndexOf('\n', start - 2) + 1;
                if (/^[ \t\r]*$/.test(source.slice(previous, start - 1))) break;
                start = previous;
            }
            return start;
        };
        var paragraphEnd = function (source, at) {
            var blank = /\n[ \t\r]*(?:\n|$)/g;
            blank.lastIndex = at;
            var found = blank.exec(source);
            return Math.min(found ? found.index : source.length, at + 8192);
        };
        // An escaped opener opens nothing: `x \*a*{.q}` is text.
        var bareRunEnds = function (source, rule, from, to) {
            var ends = [];
            rule.lastIndex = from;
            for (var run; (run = rule.exec(source)) && run.index < to;) {
                var opener = run.index + (rule.guarded ? run[1].length : 0);
                var slashes = 0;
                while (source.charAt(opener - 1 - slashes) === '\\') slashes++;
                if (slashes % 2) rule.lastIndex = opener + 1;
                else ends.push(run.index + run[0].length);
            }
            return ends;
        };
        var runEnds = { source: null, windows: null };
        var runRules = null;
        var closesBareRun = function (source, at) {
            if (runEnds.source !== source) runEnds = { source: source, windows: new Map() };
            var from = paragraphStart(source, at);
            var key = from + ':' + paragraphEnd(source, at);
            if (!runEnds.windows.has(key)) {
                runRules = runRules || ['bold', 'bold-italic', 'italic', 'underline', 'strike', 'highlight'].map(function (name) {
                    var rule = RegExp(inline[name].pattern.source, inline[name].pattern.flags.replace('g', '') + 'g');
                    rule.guarded = inline[name].lookbehind === true;
                    return [name, rule];
                });
                runEnds.windows.set(key, new Set([].concat.apply([], runRules.map(function (entry) {
                    return bareRunEnds(source, entry[1], from, +key.split(':')[1]).map(function (end) { return entry[0] + ':' + end; });
                }))));
            }
            var ends = runEnds.windows.get(key);
            return bareRunRules[source.charAt(at - 1)].some(function (name) { return ends.has(name + ':' + at); });
        };
        var memo = { source: null, hosts: null };
        // 'span', 'other', or null when the `}` before `at` closes nothing attached.
        var hostOf = function (source, at) {
            if (memo.source !== source) memo = { source: source, hosts: new Map() };
            if (!memo.hosts.has(at)) memo.hosts.set(at, findHost(source, at));
            return memo.hosts.get(at);
        };
        var findHost = function (source, at) {
            // The `=` of a header cell marker (`|={.c}`) is no delimiter.
            if (bareRunRules[source.charAt(at - 1)] && !/^\|=$/.test(source.slice(at - 2, at))) return closesBareRun(source, at) ? 'other' : null;
            if (source.charAt(at - 1) !== '}') return source.charAt(at - 1) === ']' && closesSpan(source, at) ? 'span' : 'other';
            var brace = blockOpener(source, at - 1);
            if (brace !== -1) {
                if (/^\{[ \t]*\}$/.test(source.slice(brace, at))) return hostOf(source, brace) === 'span' ? 'span' : null;
                probe.lastIndex = brace;
                var host = probe.exec(source);
                if (host && brace + host[0].length === at) return valid(source, host) ? hostOf(source, brace) : null;
            }
            return /[*\/_~=^,+-]/.test(source.charAt(at - 2)) ? 'other' : null;
        };
        var valid = function (source, match) {
            if (match[1] === undefined) return hostOf(source, match.index) !== null;
            var opener = indentColumn(match[1], 0);
            var end = match.index + match[0].length;
            lineBreak.lastIndex = match.index;
            for (var found; (found = lineBreak.exec(source)) && found.index < end;) {
                if (indentColumn(source, lineBreak.lastIndex) <= opener) return false;
            }
            return true;
        };
        gated.exec = function (source) {
            var match;
            while ((match = RegExp.prototype.exec.call(this, source))) {
                if (valid(source, match)) return match;
                this.lastIndex = match.index + 1;
            }
            return null;
        };
        return gated;
    }
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
        pattern: pastOpenerColumn(RegExp(
            // `(?=\{)` first: every branch starts at `{`, and checking it before the
            // line-prefix lookbehinds keeps a long run of spaces linear.
            // A block at a line start must fill its line: `{.c} para` and `- {.c} text` are text.
            '(?=\\{)(?:(?<=(?:^(?<![^\\r\\n])|(?:\\r\\n?|\\n))([ \\t]*))\\{(?!__\\})' + attrLinePad + attrItem + '(?:' + attrLineSep + attrItem + ')*' + attrLinePad + '\\}' + '(?=(?:[ \\t]*\\{(?:"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|[^{}"\'\\r\\n])*\\})*[ \\t]*(?:(?:\\r\\n?|\\n)|$(?![^\\r\\n])))'
            + '|(?:(?<=[*/_~=`>}:\\]$<|])|' + linkDestinationBeforeAttr + ')' + afterEscape + '\\{(?!__\\})[ \\t]*' + attrItem + '(?:[ \\t]+' + attrItem + ')*[ \\t]*\\}' + noCommentRun
            // Inside a lookbehind the engine reads right to left, so the `(?<=\.)` after
            // each marker lookahead tests the `.` before its 4096-character scan (#988).
            + '|(?<=(?:^(?<![^\\r\\n])|(?:\\r\\n?|\\n))[ \\t]*(?:[-+*]|\\d{1,9}[.)]|[A-Za-z]{1,8}(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2})(?<=\\.))|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. )(?<=\\.)))' + '\\{(?!__\\})[ \\t]*' + attrItem + '(?:[ \\t]+' + attrItem + ')*[ \\t]*\\}'
            + '|(?<=(?:^(?<![^\\r\\n])|(?:\\r\\n?|\\n))[ \\t]*(?:[-+*]|\\d{1,9}[.)]|[A-Za-z]{1,8}(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2})(?<=\\.))|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. )(?<=\\.))(?:\\{[^{}\\r\\n]*\\})?(?:[ \\t]+\\[[ xX]\\])?[ \\t]+)' + '\\{(?!__\\})' + attrLinePad + attrItem + '(?:' + attrLineSep + attrItem + ')*' + attrLinePad + '\\}' + '(?=[ \\t]*(?:(?:\\r\\n?|\\n)|$(?![^\\r\\n])))' + ')',
        )),
        greedy: true,
        alias: 'attr-value',
        inside: {
            // FIRST, so nothing inside a quoted value reads as an item.
            'string': /"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'/,
            // Anchored on an item start, so `.3` in `widths=33.3` stays value.
            'id': { pattern: /(^(?<![^\r\n])|[\s{])#[A-Za-z0-9_][\w-]*/, lookbehind: true },
            'class-name': { pattern: /(^(?<![^\r\n])|[\s{])\.[A-Za-z0-9_][\w-]*/, lookbehind: true },
            // Only the first letter of a name run may start a match: a later one shares
            // its end, and retrying each of them was quadratic on a long run (#951).
            'attr-name': /(?<![A-Za-z_][\d-]*)[A-Za-z_][\w-]*(?==)/,
            'language': {
                pattern: /(^(?<![^\r\n])|[\s{]):(?:[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8})*)?/,
                lookbehind: true,
            },
            'punctuation': /[{}=]/,
        },
    };

    // A block-attribute line as a whole body, such as the `{empty}` sentinel.
    var bodyAttributes = function (marker) {
        return {
            pattern: RegExp('(?=\\{)(?<=(?:^(?<![^\\r\\n])|(?:\\r\\n?|\\n))(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*' + marker + '[ \\t]+)'
                + '\\{(?!__\\})[ \\t]*' + attrItem + '(?:[ \\t]+' + attrItem + ')*[ \\t]*\\}(?=[ \\t]*(?:(?:\\r\\n?|\\n)|$(?![^\\r\\n])))'),
            greedy: true,
            alias: 'attr-value',
            inside: attributes.inside,
        };
    };

    /*
     * A `%%` INSIDE A CODE SPAN IS CODE CONTENT (carve-grammars#601,
     * markup-carve/carve#2682). In a PARAGRAPH the greedy `code` token already
     * won this on position; under a heading or caption the block rule wraps the
     * prefix into a token before `code` is reached, leaving the rewind nothing
     * to span. `commentAfterPrefix` walks the line forward instead, and a `%%`
     * opens a comment only where the walk arrives outside every span. A run with
     * no closer on the line is text (C2-I-017), so the walk passes it.
     *
     * FORWARD, NOT A LOOKBEHIND: width needs a backreference and an escape
     * needs reading left to right, and a JS lookbehind matches right-to-left.
     * The prefix is capture 1, which `lookbehind: true` strips.
     *
     * THE OPENER'S WIDTH IS BOUNDED AND MAXIMAL, which is what keeps it linear.
     * An unbounded ``+` backtracks over every width of a long run and pays a
     * closer check of that width at every byte inside it: 48000 backticks on one
     * line took 13.6 s against 412 ms. Sixteen is the bound the `code` token
     * uses, so a wider run opens no span here either.
     */
    var codeSpanRun = '(?<!`)(`{1,16})(?!`)(?:[^\\r\\n`]|(?!(?<!`)\\2(?!`))`)*(?<!`)\\2(?!`)';
    // A run with no closer on the line is text (C2-I-017), so the walk passes it.
    var unpartneredOnLine = '(?<!`)(`{1,16})(?!`)(?![^\\r\\n]*?(?<!`)\\3(?!`))';
    var outsideSpans = '(?:[^\\r\\n`\\\\]|\\\\[^\\r\\n]|' + codeSpanRun + '|' + unpartneredOnLine + ')*?';
    var commentAfterPrefix = '^(?<![^\\r\\n])(' + outsideSpans + '[ \\t])%%(?!%)';
    var listMarkerBeforeBlock =
        '[ \\t]*(?:(?:[-*] +)*[-*] +(?:\\[[ xX\\-_>\\/!?]\\] +)?'
        + '|(?:[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2}))) +|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. ) +)';
    var markerCodeForms = [];
    for (var depth = 1; depth <= 8; depth++) {
        markerCodeForms.push([Array(depth).fill('[-*] ').join(''), depth * 2]);
        markerCodeForms.push([Array(depth).fill('[-*] ').join('') + '\\[[ xX\\-_>\\/!?]\\] ', depth * 2]);
    }
    for (var digits = 1; digits <= 9; digits++) {
        markerCodeForms.push(['[0-9]{' + digits + '}[.)] ', digits + 2]);
    }
    for (var roman = 2; roman <= 6; roman++) {
        markerCodeForms.push(['(?:[ivxlcdm]{' + roman + '}|[IVXLCDM]{' + roman + '})\\) ', roman + 2]);
        markerCodeForms.push(['(?:[ivxlcdm]{' + roman + '}|[IVXLCDM]{' + roman + '})\\.  ', roman + 3]);
    }
    markerCodeForms.push(['[A-Za-z]\\) ', 3], ['[A-Za-z]\\.  ', 4], ['\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. ) ', 2]);

    // A list marker does not interrupt a paragraph: a marker line whose block
    // began with a plain unindented line (after a blank line, the start, or a
    // one-line block) continues that paragraph. Indented lines stay ambiguous.
    // 'list' is greedy so this lookbehind reads the real lines, not a fragment.
    var lonePlusBlock = '(?:\\+|[ \\t]*(?:> )+\\+)[ \\t\\r]*(?=(?:\\r\\n?|\\n))';
    var lonePlusLine = '(?:\\+|[ \\t]*(?:> )+\\+)[ \\t\\r]*(?:\\r\\n?|\\n)';
    var oneLineBlock = '(?:[ \\t]*(?:> ?)*(?:#{1,6} |(?:-{3,}|\\*{3,}|_{3,})[ \\t\\r]*(?=(?:\\r\\n?|\\n))|\\||:{2,}|`{3,}|~{3,}|\\{|%%|\\^ |\\*?\\[[^\\]\\r\\n]*\\]: )|' + lonePlusBlock + ')';
    var markerLine = '(?:: +|[-*][ {]|(?:[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2})))[ {]|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. )[ {])';
    // A lone `+` line, and an attribute line right after one, attach the next
    // block to the container, so neither starts a paragraph run.
    // A lookbehind matches right to left, so each line start is asserted right
    // after its `[^\n]*`: a mid-line split then fails at once.
    // A quoted item's paragraph takes no unquoted marker line (carve-grammars#856).
    var quotedItemLine = '>(?: ?>)* +' + markerLine;
    // A deeper quote below one opens a paragraph of its own.
    var deeperThanQuotedItem = '(?<![^\\r\\n])>[ \\t]+' + markerLine + '[^\\r\\n]{0,4096}(?:\\r\\n?|\\n)(?=>[ \\t]*>)'
        + '|(?<![^\\r\\n])>[ \\t]*>[ \\t]+' + markerLine + '[^\\r\\n]{0,4096}(?:\\r\\n?|\\n)(?=>[ \\t]*>[ \\t]*>)';
    var notParagraphContinuation = '(?<!(?:(?<![\\s\\S])|(?<![^\\r\\n])[ \\t\\r>]*(?:\\r\\n?|\\n)'
        + '|(?!' + lonePlusLine + ')(?!(?<=(?<![^\\r\\n])' + lonePlusLine + ')[ \\t]*\\{)(?=' + oneLineBlock + ')(?<![^\\r\\n])[^\\r\\n]*(?:\\r\\n?|\\n)'
        + '|' + deeperThanQuotedItem + ')'
        + '(?![ \\t\\r]|' + markerLine + '|' + oneLineBlock + '|' + quotedItemLine + ')(?<![^\\r\\n])[^\\r\\n]+(?:\\r\\n?|\\n)'
        + '(?:(?![ \\t\\r]*(?:\\r\\n?|\\n))(?!' + oneLineBlock + ')(?<![^\\r\\n])[^\\r\\n]*(?:\\r\\n?|\\n)){0,16})';


    // A caption needs a host above it, past any blank lines: an image alone on
    // its line (its reference label ends at the first `]`, C2-I-076, C2-B-197),
    // a table row, a code fence, a `$$` math line, a quote line, or the closer
    // of a `::: figure` group or a `::: >` quote. 'caption' is greedy so this
    // reads the real lines above it.
    var captionNl = '(?:\\r\\n|\\r(?!\\n)|\\n)';
    // A fence, a table row, a `***` break or a block comment ends a label even when indented (C2-B-234).
    var labelEnd = '(?:`{3,}|:{3,}|%|\\|[^\\r\\n]*\\||\\*{3,}[ \\t]*$(?![^\\r\\n]))';
    // The lines a label holds below its marker line: indented past the marker,
    // whose indent the named group holds, with comment-only lines between.
    var refDestination = ' [^\\S\\r\\n]*(?:\\S|\\uFEFF)+';
    var refTitle = '(?:"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')';
    var refAttrs = '\\{[^{}\\r\\n]*\\}';
    // One indented tail line of a link definition.
    function refTail(shape) {
        return '(?:' + captionNl + '[ \\t]+(?:' + shape + ')[ \\t]*$(?![^\\r\\n]))';
    }
    function labelLines(indent) {
        return '(?:' + captionNl + '(?:[ \\t]*%%(?!%)(?![ \\t]*#(?:region|endregion)\\b)[^\\r\\n]*' + captionNl + ')*'
            + '\\k<' + indent + '>[ \\t]+(?![ \\t]|' + labelEnd + '|$(?![^\\r\\n]))[^\\r\\n]*)*';
    }
    // The image's alt text may span lines; its destination or label may not.
    var captionImage = '!\\[(?:[^\\[\\]\\r\\n]|\\[[^\\[\\]\\r\\n]*\\]|' + captionNl + '(?![ \\t]*' + captionNl + ')){0,1024}\\]'
        + '(?:\\([^\\r\\n)]*\\)|\\[[^\\]\\r\\n]*\\])(?:\\{[^\\r\\n]*\\})?[ \\t]*';
    var captionHost = '(?<=(?:(?<![^\\r\\n])(?:' + listMarkerBeforeBlock + '|[ \\t]*)(?:!\\[[^\\r\\n]*\\](?:\\([^\\r\\n]*\\)|\\[[^\\]\\r\\n]*\\])(?:\\{[^\\r\\n]*\\})?[ \\t]*|' + captionImage + ')'
        + '|(?<![^\\r\\n])(?:[ \\t]*\\|[^\\r\\n]*|[ \\t]*\\+[^\\r\\n]*\\|[ \\t]*'
        + '|[ \\t]*(?:`{3,}|~{3,})[ \\t]*|[ \\t]*\\$\\$`[^\\r\\n]*`[ \\t]*|[ \\t]*>[^\\r\\n]*'
        + '|(?<=(?<![^\\r\\n])[ \\t]*:{3,} +(?:figure|>)[ \\t]*' + captionNl + '(?:[^\\r\\n]*' + captionNl + '){0,256}?)[ \\t]*:{3,}[ \\t]*))'
        + captionNl + '(?:[ \\t]*' + captionNl + ')*)';

    var namedContainerRanges = { source: null, ranges: [] };
    var namedContainerPrefix = ':{3,} +[-0-9A-Za-z_]+';
    var namedContainerLine = RegExp('^(?<![^\\r\\n])\\uFEFF?[ \\t]*' + namedContainerPrefix);
    var markerNamedContainerLine = RegExp('^\\uFEFF?' + listMarkerBeforeBlock + namedContainerPrefix);

    function metadataRanges(source) {
        if (namedContainerRanges.source === source) return namedContainerRanges.ranges;
        var lines = [];
        var linePattern = /[^\r\n]*(?:\r\n|\r|(?:\r\n?|\n)|$(?![^\r\n]))/g;
        var match;
        while ((match = linePattern.exec(source)) && match[0].length) {
            var text = match[0].replace(/[\r\n]+$(?![^\r\n])/, '');
            lines.push({ text: text, start: match.index, end: match.index + text.length });
        }
        var ranges = [];
        for (var index = 0; index < lines.length; ++index) {
            var line = lines[index];
            var opener = namedContainerLine.exec(line.text);
            if (!opener) {
                opener = markerNamedContainerLine.exec(line.text);
                var next = lines[index + 1];
                if (opener && next && next.text && !/^(?<![^\r\n])[ \t]/.test(next.text)) opener = null;
            }
            if (opener) ranges.push({ start: line.start + opener[0].length, end: line.end });
        }
        namedContainerRanges = { source: source, ranges: ranges };
        return ranges;
    }

    // Cache opener tails in one forward pass. Looking backward to the start
    // of the line at every comment opener makes long comment runs quadratic.
    /*
     * A candidate (`head`, group 1 its lookbehind) taken through to its line end
     * unless its line opens a block. The regex form tested that with a
     * lookbehind walking back to the line start at every candidate, which is
     * quadratic on a line of many `%%` runs; here the prefix is read once per
     * line. A line holding a bare `\r` keeps the exact per-candidate test.
     */
    var BLOCK_OPENER_PREFIX = '[ \\t]*(?:> )*(?:(?::{3,}(?: +[-0-9A-Za-z_]+)?|#{1,6}|[-*]|(?:[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2})))|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. ))|\\||\\^)';
    function toLineEndOutsideBlockOpeners(head) {
        var opener = RegExp(BLOCK_OPENER_PREFIX, 'y');
        var exact = RegExp('(?<!^(?<![^\\r\\n])' + BLOCK_OPENER_PREFIX + '[^\\r\\n]*)', 'my');
        var line = { source: null, start: 0, end: -1, stop: -1, bareReturn: false, openerEnd: -1 };
        var gated = RegExp(head.source, head.flags.includes('g') ? head.flags : head.flags + 'g');
        gated.exec = function (source) {
            var match;
            while ((match = RegExp.prototype.exec.call(this, source))) {
                var at = match.index + match[1].length;
                if (line.source !== source || at < line.start || at > line.end) {
                    line.source = source;
                    line.start = Math.max(source.lastIndexOf('\n', at - 1), source.lastIndexOf('\r', at - 1)) + 1;
                    var nextBreak = /[\r\n]/g;
                    nextBreak.lastIndex = at;
                    var breakMatch = nextBreak.exec(source);
                    line.end = breakMatch ? breakMatch.index : source.length;
                    line.stop = line.end;
                    line.bareReturn = source.slice(line.start, line.stop).indexOf('\r') !== -1;
                    opener.lastIndex = line.start;
                    line.openerEnd = opener.test(source) ? opener.lastIndex : -1;
                }
                var blocked;
                if (!line.bareReturn && line.openerEnd === -1) blocked = false;
                else if (!line.bareReturn && at >= line.openerEnd) blocked = true;
                else {
                    exact.lastIndex = at;
                    blocked = !exact.test(source);
                }
                if (blocked) {
                    this.lastIndex = match.index + 1;
                    continue;
                }
                var end = line.stop;
                if (line.bareReturn) {
                    var cr = source.indexOf('\r', at);
                    if (cr !== -1 && cr < end) end = cr;
                }
                var result = [source.slice(match.index, end), match[1]];
                result.index = match.index;
                result.input = source;
                this.lastIndex = end;
                return result;
            }
            return null;
        };
        return gated;
    }

    function outsideContainerMetadata(pattern) {
        var filtered = RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
        var baseExec = Object.prototype.hasOwnProperty.call(pattern, 'exec') ? pattern.exec : RegExp.prototype.exec;
        filtered.exec = function (source) {
            var ranges = metadataRanges(source);
            var match;
            while ((match = baseExec.call(this, source))) {
                var offset = match.index + (match[1] ? match[1].length : 0);
                var low = 0;
                var high = ranges.length;
                while (low < high) {
                    var middle = (low + high) >>> 1;
                    if (ranges[middle].start <= offset) low = middle + 1;
                    else high = middle;
                }
                var range = ranges[low - 1];
                if (!range || offset >= range.end) return match;
                this.lastIndex = Math.max(match.index + 1, range.end);
            }
            return null;
        };
        return filtered;
    }

    var bracedCommentPattern = RegExp(notEscaped + /\{%(?:[^%\r\n]|(?:\r\n?|\n)(?![ \t\r]*(?:\r\n?|\n))){0,4096}(?:%(?!\})(?:[^%\r\n]|(?:\r\n?|\n)(?![ \t\r]*(?:\r\n?|\n))){0,4096}){0,32}%\}/.source);

    // A bare delimiter cannot close through a braced inline. Keep each member
    // of the brace-pair family atomic while a surrounding bare span searches
    // for its closer. The bodies use the same bounded, tempered shape as the
    // individual forced/editorial rules below.
    var bracedKinds = ['\\*', '/', '_', '\\^', ',', '~', '=', '\\+', '-', '#', '%'];
    function bracedInline(kinds) {
        return '\\{(?:' + kinds.map(function (kind) {
            return kind + '(?:[^' + kind + '\\r\\n]|' + kind + '(?!\\})){1,4096}' + kind;
        }).join('|') + ')\\}';
    }
    var opaqueBracedInline = bracedInline(bracedKinds);
    // A braced emphasis span nests its own kind (carve#2904), and `{**}` is
    // literal text that never closes the run around it. The body never reads
    // `{` before its own delimiter as text, so the scan stays unambiguous.
    function sameKindBraced(kind, depth) {
        var body = '\\\\[^\\r\\n]|[^' + kind + '\\r\\n{\\\\]|' + kind + '(?!\\})|(?:\\r\\n?|\\n)(?![ \\t\\r]*(?:\\r\\n?|\\n))'
            + '|\\{' + kind + kind + '\\}|\\{(?!' + kind + ')'
            + (depth > 0 ? '|' + sameKindBraced(kind, depth - 1) : '');
        return '\\{' + kind + '(?!' + kind + '\\})(?:' + body + '){1,4096}' + kind + '\\}';
    }
    function sameKindAtoms(kind) {
        return '\\{' + kind + kind + '\\}|' + sameKindBraced(kind, 3);
    }

    // Link destinations and autolinks are opaque too (PART 9 section 9 E2a): the
    // `/` in `/see [x](http://a.b/c) now/` does not close the italic. Each part
    // accepts only what its production does: a complete label before `](`
    // (`link_text`, four levels deep), the destination and title escapes, one
    // space before a title, and the `url_char` and `email_autolink` alphabets.
    // Parentheses nest two levels inside a destination.
    var labelLineEnd = '(?:\\r\\n?|\\n)(?![ \\t]*(?:\\r\\n?|\\n))';
    var labelComment = '#(?:[^#\\r\\n]|#(?!\\})|' + labelLineEnd + '){1,512}#\\}';
    var labelCode = [3, 2, 1].map(function (n) {
        var run = '```'.slice(0, n);
        return run + '(?:[^`\\r\\n]|' + (n > 1 ? '`(?!' + run.slice(1) + ')|' : '') + labelLineEnd + '){1,512}' + run + '(?!`)';
    }).join('|');
    var labelChar = '\\\\(?:[^\\r\\n]|(?=(?:\\r\\n?|\\n)))|' + labelCode + '|\\{' + labelComment
        + '|\\{(?!' + labelComment + ')|[^\\[\\]\\\\`{\\r\\n]|' + labelLineEnd;
    var opaqueLabel = '(?:' + labelChar + '){0,512}';
    for (var labelDepth = 0; labelDepth < 3; labelDepth++) {
        opaqueLabel = '(?:' + labelChar + '|\\[' + opaqueLabel + '\\]){0,512}';
    }
    // `email_autolink` letters are Unicode letters. Without the `u` flag any
    // non-ASCII character that is not whitespace stands in for one.
    var emailClass = function (chars) {
        return '(?:[A-Za-z' + chars + ']|[^\\x00-\\x7F\\s])';
    };
    var destChar = '\\\\[()\\\\]|\\\\(?![()\\\\])|[^ \\t\\r\\n()\\\\]';
    var destination = '(?:' + destChar + '|\\((?:' + destChar + '|\\((?:' + destChar + '){0,256}\\)){0,256}\\)){0,2048}';
    var nonEmptyDestination = '(?![ \\t\\r\\n)])' + destination;
    var titled = function (quote) {
        return quote + '(?:\\\\' + quote + '|\\\\(?!' + quote + ')|[^' + quote + '\\\\\\r\\n]){0,512}' + quote;
    };
    // `url_char` outside ASCII excludes C1 controls, White_Space and format
    // characters; a format character above the BMP is caught at its surrogates.
    var urlChar = '(?:[A-Za-z0-9\\-._~:/?#\\[\\]@!$&\'()*+,;=%]'
        + '|(?!\\uD804[\\uDCBD\\uDCCD]|\\uD80D[\\uDC30-\\uDC3F]|\\uD82F[\\uDCA0-\\uDCA3]|\\uD834[\\uDD73-\\uDD7A]|\\uDB40[\\uDC01\\uDC20-\\uDC7F])'
        + '[^\\x00-\\xA0\\xAD\\u0600-\\u0605\\u061C\\u06DD\\u070F\\u0890\\u0891\\u08E2\\u1680\\u180E\\u2000-\\u200F\\u2028-\\u202F\\u205F-\\u2064\\u2066-\\u206F\\u3000\\uFEFF\\uFFF9-\\uFFFB])';
    // The same `url_char` for a pattern built with the `u` flag, where an astral
    // character is one code point rather than a surrogate pair.
    var urlCharUnicode = urlChar.replace(/\(\?!\\uD804.*?\)(?=\[\^)/,
        '(?![\\u{110BD}\\u{110CD}\\u{13430}-\\u{1343F}\\u{1BCA0}-\\u{1BCA3}\\u{1D173}-\\u{1D17A}\\u{E0001}\\u{E0020}-\\u{E007F}])');
    var linkTail = '\\]\\((?:' + nonEmptyDestination + '(?: (?:' + titled('"') + '|' + titled('\'') + '))?'
        + '|[ \\t]*(?=\\))| (?:' + titled('"') + '|' + titled('\'') + ')[ \\t]*)\\)';
    // Only a title directly before the closing `)` is a string.
    var linkTitle = /(?<= )(?:"(?:\\"|\\(?!")|[^"\\\r\n])*"|'(?:\\'|\\(?!')|[^'\\\r\n])*')(?=[ \t]*\)$(?![^\r\n]))/;
    var opaqueInline = '(?:' + opaqueBracedInline
        + '|\\[' + opaqueLabel + linkTail
        + '|<[a-zA-Z][a-zA-Z0-9+.\\-]{0,2047}:' + urlChar + '{1,2048}>'
        + '|<' + emailClass('0-9\\-_.+') + '{1,512}@(?:' + emailClass('0-9\\-_') + '{1,512}\\.){1,64}' + emailClass('') + '{1,512}>'
        + ')';

    // The bare run as markup-carve/vscode-carve#258 reads it: a closed code span
    // and a braced span of ANOTHER kind are atoms, and a delimiter of its own
    // kind is body text where it cannot close. Built with the `u` flag.
    var bareCode = '```(?:[^`\\r\\n]|`(?!``)){1,4096}```(?!`)|``(?:[^`\\r\\n]|`(?!`)){1,4096}``(?!`)|`[^`\\r\\n]{1,4096}`(?!`)';
    // A braced span's body: a braced span of another kind, a closed code span
    // and a link destination or autolink are atoms, so the closer is the first
    // one outside all three. `kinds` is empty for an insertion or deletion,
    // which closes at its first closer.
    function forcedBody(delimiter, kinds) {
        var atom = '(?:' + (kinds === undefined ? sameKindAtoms(delimiter) + '|' + bracedInline(bracedKinds.filter(function (kind) { return kind !== delimiter; })) + '|' : '')
            + bareCode + '|\\[' + opaqueLabel + linkTail
            + '|<[a-zA-Z][a-zA-Z0-9+.\\-]{0,2047}:' + urlChar + '{1,2048}>'
            + '|<' + emailClass('0-9\\-_.+') + '{1,512}@(?:' + emailClass('0-9\\-_') + '{1,512}\\.){1,64}' + emailClass('') + '{1,512}>)';
        // The cheap scan, tempered on the delimiter, fails fast where no closer
        // exists at all.
        var run = '(?:[^' + delimiter + '\\r\\n]|(?:\\r\\n?|\\n)(?![ \\t\\r]*(?:\\r\\n?|\\n))){0,4096}';
        return '(?=' + run + '(?:' + delimiter + '(?!\\})' + run + '){0,32}' + delimiter + '\\})'
            + '(?:' + atom + '|\\\\[^\\r\\n]|(?!' + atom + ')[^\\r\\n\\\\]|(?:\\r\\n?|\\n)(?![ \\t\\r]*(?:\\r\\n?|\\n))){0,4096}?';
    }

    // An OTHER block opener ends a definition-list entry: a heading, a
    // list/task marker, a blockquote, a fence (code/div), a horizontal rule,
    // a caption or a table row. Blank lines and lazy-continuation prose are
    // NOT block openers and fold into the entry instead - that is what keeps
    // a folded term line (`term_continuation_line`, corpus
    // 25-definition-lists-6) and a definition separated from its term by one
    // blank line (corpus 25-definition-lists-7) scoped correctly.
    var otherBlockOpener = /[ \t]*(?:#{1,6} |-{3,}[ \t]*$(?![^\r\n])|\*{3,}[ \t]*$(?![^\r\n])|_{3,}[ \t]*$(?![^\r\n])|`{3,}|~{3,}|:{3,}|>(?: |$(?![^\r\n]))|\^ |\||[-*][ \t]|[-*]\{|\d+[.)][ \t]|[A-Za-z]+(?:\)|\.(?= {2}|\{[^}\r\n]{0,4096}\} {2}))[ \t]|\.(?! [ \t]*\. |\{[^}\r\n]{0,4096}\}[ \t]+\. )[ \t])/.source;

    function bareRun(delimiter) {
        var braced = bracedInline(bracedKinds.filter(function (kind) { return kind !== delimiter; }));
        var opaque = '(?:' + sameKindAtoms(delimiter) + '|' + braced
            + '|\\[' + opaqueLabel + linkTail
            + '|<[a-zA-Z][a-zA-Z0-9+.\\-]{0,2047}:' + urlCharUnicode + '{1,2048}>'
            + '|<' + emailClass('0-9\\-_.+') + '{1,512}@(?:' + emailClass('0-9\\-_') + '{1,512}\\.){1,64}' + emailClass('') + '{1,512}>'
            + ')';
        // The whitespace and letter cases must be disjoint: repeated `*a`
        // otherwise gives the closer search exponentially many partitions.
        // An own delimiter between two word characters ends the run: no span
        // forms (PART 9 §9 R2), so `*a*b*` and `_my_var_` stay text.
        var atom = '(?:\\\\[^\\r\\n]|' + bareCode + '|' + opaque
            + '|(?<=\\s' + bracedComments + ')' + delimiter + '(?!' + bracedComments + '[\\p{L}\\p{N}])|(?<![\\p{L}\\p{N}]\\p{M}*' + bracedComments + ')' + delimiter + '(?=' + bracedComments + '[\\p{L}\\p{N}])';
        // One soft break, never a blank line or a line opening another block.
        var softBreak = '(?:\\r\\n?|\\n)(?![ \\t\\r]*(?:(?:\\r\\n?|\\n)|$))(?!' + otherBlockOpener + ')';
        // A cheap scan for a possible closer in the paragraph, so an
        // opener with none fails without walking the atoms (each braced one
        // scans its line).
        // Escapes, code spans, links and autolinks are stepped over whole, so
        // a delimiter inside one is not taken for a closer the run can reach.
        // Every inner scan is bounded and stops at the next bracket: unbounded,
        // each `[` or backtick rescanned the rest of the line for every opener.
        var step = '(?:\\\\[^\\r\\n]|\\\\(?![^\\r\\n])|`[^`\\r\\n]{0,4096}`|`(?![^`\\r\\n]{0,4096}`)'
            + '|\\[[^\\[\\]\\r\\n]{0,512}\\]\\([^\\s)]{0,2048}\\)|\\[(?![^\\[\\]\\r\\n]{0,512}\\]\\([^\\s)]{0,2048}\\))'
            + '|<[a-zA-Z][a-zA-Z0-9+.\\-]{0,2047}:[^\\s<>]{0,2048}>|<(?![a-zA-Z][a-zA-Z0-9+.\\-]{0,2047}:[^\\s<>]{0,2048}>)|[^\\r\\n\\\\`\\[<])';
        var closerAhead = '(?=(?:' + step + '|(?:\\r\\n?|\\n)(?![ \\t\\r]*(?:(?:\\r\\n?|\\n)|$))){0,8192}?(?<=\\S)' + delimiter + '(?![\\p{L}\\p{N}]))';
        // The `=` of a comparison neither opens nor closes (PART 9 §9).
        if (delimiter === '=') atom += '|[>!]=|<=(?![=>])';
        var line = atom + '|(?!' + opaque + ')[^' + delimiter + '\\\\\\r\\n`]){1,4096}?';
        // A span runs over the lines of its paragraph, comment-only lines included (C2-I-024).
        return closerAhead + line + '(?:' + softBreak + line + '){0,31}?';
    }

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
        // THE CANONICAL BODY IS TEMPERED (carve-grammars#382): it admits any `*`
        // that does not start the closer. The MIRRORED body admits no `/`: one
        // between two word characters stops the inner italic from forming
        // (PART 9 §9 R2), so `a */b/c/* d` is a bold run, and any other is
        // ambiguous with a canonical opener (carve-grammars#882). The table
        // below measured the word-flanked temper this removed.
        //
        // The opener's `(?!\*[\s*])` is what pays for it. Over all 21,844
        // documents `x */ body /* y` for every body of up to seven characters
        // drawn from `* / space a`, judged by asking whether the engine renders
        // the WHOLE body as one combined run:
        //
        //   strict (before)                    over 440   missed 603   wrong 1043
        //   any non-closing slash (rejected)   over 5091  missed 161   wrong 5252
        //   word-flanked slash alone           over 510   missed 461   wrong 971
        //   word-flanked + opener guard (this) over 226   missed 461   wrong 687
        //
        // The temper alone RAISES over-colouring, and every shape it adds is
        // one the opener guard refuses - `a */**a/a/* d` and `a */* a/a/* d`
        // are bold runs in the engine. The guard costs nothing: `missed` is
        // unchanged with and without it. Repeated over `* / space a .` to
        // separate a word-character flank from a non-space one, the word-
        // character spelling wins there too (311 wrong against 454).
        //
        // Both bodies are non-space at each end, and both may cross a line
        // without crossing a blank one - corpus 208 is a combined run spanning
        // two lines, and the highlight.js rule spells the same body. `a /*b */ c`
        // is `<em>*b *</em>` and not a combined run; the old `[^*]+` body,
        // guarded only at the opener, read it as one.
        'bold-italic': {
            pattern: /\/\*(?=\S)(?:[^*\r\n]|\*(?!\/)|(?:\r\n?|\n)(?!\s*(?:\r\n?|\n))){1,4096}(?<=\S)\*\/|(?<![\p{L}\p{N}*/])\*\/(?=\S)(?!\*[\s*])(?:[^/\r\n]|(?:\r\n?|\n)(?!\s*(?:\r\n?|\n))){1,4096}(?<![\s*])\/\*(?![\p{L}\p{N}])/u,
            alias: 'important',
        },
        // Bare runs require non-space flanks. Forced runs do not: braces make
        // `{~ ~}` unambiguous, and the body only has to be non-empty.
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
            pattern: RegExp(notEscaped + '\\{\\*(?!\\*\\})' + forcedBody('\\*') + '\\*\\}'),
            alias: 'bold',
        },
        'forced-italic': {
            pattern: RegExp(notEscaped + '\\{/(?!/\\})' + forcedBody('/') + '/\\}'),
            alias: 'italic',
        },
        'forced-underline': {
            pattern: RegExp(notEscaped + '\\{_(?!_\\})' + forcedBody('_') + '_\\}'),
            alias: 'underline',
        },
        'forced-strike': {
            // An arrow is body text here: `changed` runs first and takes a
            // top-level one.
            // `(?!~\})` rejects the empty `{~~}` while admitting whitespace
            // as real content, including the corpus spelling `{~ ~}`.
            pattern: RegExp(notEscaped + '\\{~(?!~\\})' + forcedBody('~') + '~\\}'),
            alias: 'deleted',
        },
        'bold': {
            // A `*` glued to a closer opens nothing: `*a**b* c` bolds only `a`.
            pattern: new RegExp('(?<![\\p{L}\\p{N}*]' + bracedComments + ')' + notEscaped + '\\*(?![\\s*])' + bareRun('\\*') + '(?<=\\S)(?<!\\s(?=\\{%)' + bracedComments + ')\\*(?!' + bracedComments + '[\\p{L}\\p{N}])', 'u'),
            alias: 'bold',
        },
        'italic': {
            // The leading guard avoids URLs and paths.
            // A lookbehind, not a captured character: a capture would start the
            // match inside the token before it, which Prism then drops.
            pattern: new RegExp('(?<=^(?<![^\\r\\n])|[^\\p{L}\\p{N}/])(?<![\\p{L}\\p{N}/]' + bracedComments + ')' + notEscaped + '/(?![\\s/])' + bareRun('/') + '(?<=\\S)(?<!\\s(?=\\{%)' + bracedComments + ')/(?!' + bracedComments + '[\\p{L}\\p{N}])', 'u'),
            alias: 'italic',
        },
        'underline': {
            pattern: new RegExp('(^(?<![^\\r\\n])|[^\\w_/])' + notEscaped + '_(?![\\s_])' + bareRun('_') + '(?<=\\S)_(?![\\p{L}\\p{N}])', 'u'),
            lookbehind: true,
            alias: 'underline',
        },
        'strike': {
            pattern: new RegExp('(?<![\\w~])' + notEscaped + '~(?![\\s~])' + bareRun('~') + '(?<=\\S)~(?![\\p{L}\\p{N}])', 'u'),
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
            // `a \!=b c= d` - where the `!` is literal and the `=` after it is
            // an ordinary opener the engine marks - was refused, and
            // `a \=b c= d`, whose `=` cannot open at all, was taken.
            //
            // BACKSLASHES NEST, so both halves count them rather than looking
            // at one character: the opener needs an EVEN run behind it (`\\=`
            // is a literal backslash and an ordinary opener) and the admission
            // needs an ODD one in front of the flank (`\\!=` is a literal
            // backslash and a comparison, which the engine leaves alone). A
            // first draft looked one character back and got both of those
            // backwards.
            //
            // THE PAIR REPETITION IS BOUNDED, like every other scan in this
            // file. Written as an unbounded repetition inside a lookbehind it
            // backtracks superlinearly over a long backslash run - measured at
            // 7 / 30 / 91 / 346 ms for 4K / 8K / 16K / 32K backslashes, four
            // times per doubling, and 4 / 3 / 8 / 7 ms bounded. 64 backslashes
            // in front of a highlight opener is not a document; past the bound
            // the run does not open, which is the safe direction.
            //
            // A LOOKBEHIND IS WHAT THIS RULE HAS TO USE. Moving the `escape`
            // token in front of this one does not help: the rule is `greedy`,
            // so Prism runs it against the ORIGINAL text from the current
            // offset and the lookbehind still sees the flank an earlier token
            // consumed. Measured - with `escape` moved ahead of the inline
            // family, `a \!=b c= d` still scoped nothing. The other two
            // grammars need none of this, because their escape rule really
            // does consume the flank before the highlight rule is asked.
            // THE `=` OF A COMPARISON NEITHER OPENS NOR CLOSES (PART 9 §9), so
            // the body takes `<=`, `>=` and `!=` whole and the closer refuses an
            // unescaped `<`, `>` or `!` before it: `x =y z<= w` marks nothing. AN ESCAPE IS A
            // DIFFERENT QUESTION (carve-grammars#385): an escaped `=` is not a
            // delimiter at all, so `x =\= y` renders `x == y` with no mark and
            // this rule closed on it. THE BODY CONSUMES AN ESCAPE AS A PAIR and
            // refuses a bare backslash, which settles both directions at once -
            // the escaped `=` is eaten before the closer can see it, and a body
            // that could not hold one would stop there and never reach the real
            // closer past it, so `a =b c\= d= e`, which the engine marks, would
            // have gone from wrongly-coloured to uncoloured. The closer needs no
            // guard of its own as a CONSEQUENCE, not a simplification: the body
            // can only get past a backslash by taking the pair, so the position
            // immediately before an escaped `=` is never a body end.
            // #385 COUNTED THE RUN IN A LOOKBEHIND on the closer and its odd
            // twin on the body, and carve-grammars#390 replaced both. Every
            // bound is reachable: at `{0,32}` the guard stopped seeing the run
            // at 66 backslashes and this rule refused a highlight the engine
            // marks. A pair has no bound - and the same spelling is what the
            // TextMate family had to use, since one TextMate engine refuses a
            // variable-length lookbehind outright. The OPENER's two lookbehinds
            // stay: they are the escaped-FLANK guard from carve-grammars#380,
            // which is a different question and which this rule cannot avoid
            // for the `greedy` reason above.
            // ONE SHAPE IT COSTS: `<https://e.example>=hi=`, where the `>`
            // closes an autolink rather than opening a comparison; a
            // fixed-width lookbehind cannot tell the two apart, and this takes
            // the under-colouring side of that trade.
            // THE BOUND COUNTS ATOMS, and an escape pair is two characters, so
            // the worst case is 8192 characters rather than 4096. That is still
            // a constant per position, which is all the bound is for; measured,
            // an all-escape body costs what a plain body of the same LENGTH
            // costs. Halving it to keep the character count would halve every
            // ordinary body too.
            // ONE TOKEN, TWO FORMS, so the bare `=x=` alternative shares a
            // line with the braced one. Its `[^=\n]+?` was never the defect
            // this rule was fixed for - the class already excludes its own
            // closer, so an unclosed `=` gives up at the next one - but it is
            // the last unbounded quantifier on a line that spells a braced
            // construct, and the derived family check below reads lines. Given
            // a bound, at the same 4096 the rest of the file uses.
            pattern: new RegExp(
                notEscaped + '\\{=(?!=\\})' + forcedBody('=') + '=\\}|'
                + /(?:(?<=(?:^(?<![^\r\n])|[^\\])(?:\\\\){0,32})(?<![\w=<>!])|(?<=(?:^(?<![^\r\n])|[^\\])(?:\\\\){0,32}\\[<>!]))=(?=\S)(?![>=])/.source
                + bareRun('=')
                + /(?<=\S)(?<!(?<!\\)(?:\\\\){0,32}[>!])(?:(?<!(?<!\\)(?:\\\\){0,32}<)=|=(?=[=>]))(?![\p{L}\p{N}])/.source,
                'u',
            ),
            alias: 'important',
        },
        // Braced-only: a bare `^` / `,` is literal text (no bare sup/sub).
        'superscript': {
            pattern: RegExp(notEscaped + '\\{\\^(?!\\^\\})' + forcedBody('\\^') + '\\^\\}'),
            alias: 'symbol',
        },
        'subscript': {
            pattern: RegExp(notEscaped + '\\{,(?!,\\})' + forcedBody(',') + ',\\}'),
            alias: 'symbol',
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

    // A term line and the lines definitionListLines gave the term (C2-B-069).
    function termLinesMatcher() {
        var matcher = /(?:)/g;
        // MARKER REQUIRES CONTENT: `::<space>` with nothing after it is prose.
        var line = /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*:: +(?![ \t]*$(?![^\r\n]))[^\r\n]*$(?![^\r\n])/gm;
        matcher.exec = function (text) {
            line.lastIndex = this.lastIndex;
            var found = line.exec(text);
            if (!found) {
                this.lastIndex = 0;
                return null;
            }
            var stop = found.index + found[0].length;
            var entry = lastEntry && lastEntry.text === text ? lastEntry : null;
            var to = entry && entry.termEnds.get(entry.base + text.indexOf('::', found.index));
            if (to !== undefined && to !== null && to - entry.base > stop) stop = to - entry.base;
            var match = [text.slice(found.index, stop)];
            match.index = found.index;
            match.input = text;
            this.lastIndex = stop;
            return match;
        };
        return matcher;
    }

    // Definition-list term: `:: term` (grammar.ebnf `definition_term`).
    // Reused as a nested rule inside 'definition-list' below - not registered
    // as a top-level token, so it only ever colors a term that
    // 'definition-list' has already decided is inside a real entry.
    var definitionTerm = {
        pattern: termLinesMatcher(),
        greedy: true,
        alias: 'title',
        inside: Object.assign({
            'punctuation': /^(?<![^\r\n])\uFEFF?[ \t]*::/,
        }, inline),
    };

    // A backtick a quoted attribute value used up opens no code span
    // (carve#2074): `[a]{title="`"} and [n](u)` is a span, a text run and a
    // link. The attribute rules run after 'code', so the guard is here.
    var attrValueFree = '(?<!\\{[^{}\\r\\n]{0,512}=["\'][^"\'\\r\\n]{0,512})';
    // A quote line interrupts a paragraph, so a paired span does not reach it.
    var quoteOpener = '[ \\t]*>(?:[ \\t]|$(?![^\\r\\n]))';
    // A sigil span opens on a maximal run and closes on a run of the same width in its
    // paragraph. A run with no partner opens nothing, sigil included (C2-I-017).
    var sigilSpan = '(`+)(?!`)(?:[^`]|[^`](?:[^\\r\\n]|(?:\\r\\n?|\\n)(?![ \\t\\r]*(?:\\r\\n?|\\n))(?!' + quoteOpener + '))*?[^`])(?<!`)\\1(?!`)';

    /**
     * One PART of an include directive - what sits between two spaces inside
     * `{{ ... }}` - with a `}` admitted inside a quoted run.
     *
     * `quoted_value` is `character - '"' - '\' - newline`, so a brace between
     * the quotes is the value's. A part run spelled `[^\s}]+` stopped at it and
     * killed the WHOLE match: `{{ ch.crv @label:"a}b" }}` carried no scope
     * anywhere on the line, and the `#section` of such a directive fell back to
     * the tag rule - the defect the owning rule exists to prevent
     * (carve-grammars#412).
     *
     * THE QUOTE DECIDES THE BRANCH. A quote's two alternatives carry lookaheads
     * that negate each other, so exactly one is ever viable, and the ordinary
     * class excludes both quote characters so nothing else can claim one. The
     * alternation therefore offers the engine no second path to re-enter. That
     * is what keeps the scan linear: as a plain alternation a `"` is both an
     * opener and an ordinary character, and a directive with no closer on the
     * line makes the engine try both at every quote
     * (scripts/scan-superlinear.mjs, tests/scans-are-bounded-test.js).
     *
     * A QUOTED RUN MAY HOLD THE `}}` PAIR, and the directive's closer is the
     * first pair OUTSIDE one (markup-carve/carve#2013, superseding the
     * `\}(?!\})` bound of #413). It is the QUOTE'S TERMINATION that decides,
     * not the pair: `@label:"a }} more" }} end` closes at the second pair
     * because the run is terminated, while an unterminated quote opens no run,
     * falls to the negative branch above, and leaves the closer at the first
     * pair - which is what still leaves a malformed directive as text (#403,
     * #409).
     *
     * @param {string} quote - `"` or `'`.
     * @returns {string} that quote's two alternatives, as regex source.
     */
    function includeQuotedPart(quote) {
        var body = '(?:\\\\[^\\r\\n]|[^' + quote + '\\\\\\r\\n])*';
        return quote + '(?=' + body + quote + ')' + body + quote
            + '|' + quote + '(?!' + body + quote + ')';
    }

    var includePart =
        '(?:' + includeQuotedPart('"') + '|' + includeQuotedPart("'") + '|[^\\s}"\'@])';

    /*
     * DEFINITION-LIST LINES BY OWNER (PART 0 CARVE-P0-003, CARVE-P0-024 S2/S3).
     *
     * A `: ` line is a description marker when the deepest open frame it
     * reaches (item, description, footnote body or quote) holds a definition
     * list; a `:: ` term opens or continues one there, and any other block in
     * that frame ends it. One forward pass per input, memoized; a tab in the
     * indentation counts from each frame's column (PART 9 §24 C5).
     * `terms` and `markers` hold the offsets of the `::` and `:`, and `lists`
     * the [start, end) of each outermost list from its first term. `fences`
     * holds each fence the walk opened: its run's offset, the end of its last
     * line, its character, whether it closed and whether a quote marker
     * stands before it on its line.
     * Keep this block identical in prism/carve.js and highlightjs/carve.js.
     */
    var definitionListMemo = [];
    function definitionListLines(text) {
        for (var m = 0; m < definitionListMemo.length; m++) {
            if (definitionListMemo[m].text === text) return definitionListMemo[m];
        }
        var result = { text: text, terms: new Set(), markers: new Set(), termEnds: new Map(), termLines: new Set(), lists: [], fenced: new Set(), fences: [] };
        definitionListMemo.unshift(result);
        if (definitionListMemo.length > 4) definitionListMemo.pop();

        var frames = [{ kind: 'document', width: 0, list: null }];
        var para = -1;
        var fence = null;
        // The open term: its frame, the column of its `::` and the offset of the mark.
        var openTerm = null;
        // A line block's span pairing is not modeled here, so a fence after
        // one in the same frame is not reported in `fences`; nor is one in a
        // frame a `+` shifted.
        var lineBlock = null;
        var region = null;
        // A `+` that hands the next visible line to a frame, and the blank run.
        var attach = null;
        var blanks = 0;
        var lineRe = /[^\r\n]*(?:\r\n|\r|\n)?/g;
        var start = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
        lineRe.lastIndex = start;
        var listMarker = /^(?:[-*]|\.(?! [ \t]*\. |\{[^}\r\n]{0,4096}\}[ \t]+\. )|[0-9]+[.)]|[A-Za-z]+\)|[A-Za-z]+\.(?= {2}|\{[^}\r\n]{0,4096}\} {2}))( +(?=[^ \t])|$)/;
        var opener = /^(?:#{1,6}(?:[ \t]|$)|`{3,}|~{3,}|%{3,}|:{3,}|>|\[\^[^\]\r\n]+\]:|\|[^\r\n]*\|(?:\{[^{}\r\n]*\})?[ \t]*$|\^ |(?:-[ \t]*){3,}$|(?:\*[ \t]*){3,}$|(?:_[ \t]*){3,}$)/;
        // The lines that end a label even indented past its marker (C2-B-234).
        var labelEnd = /^(?:`{3,}|:{3,}|%{3,}|%%[ \t]*#(?:region|endregion)\b|\|[^\r\n]*\||\*{3,}[ \t]*$)/;
        var line, at, end;
        // Closerless front matter runs to the end of the text.
        var frontMatter = start === lineRe.lastIndex && /^\uFEFF?---(?: ?[A-Za-z0-9]+)?[ \t]*(?:\r\n|\r|\n|$)/.test(text.slice(start));

        function closeTo(depth) {
            while (frames.length - 1 > depth) frames.pop();
            if (para > depth) para = -1;
        }
        function endList(frame) {
            frame.list = null;
        }
        function extend(to) {
            if (region) region[1] = to;
        }
        function openList(frame, offset) {
            if (frame.list) return;
            frame.list = {};
            var inside = false;
            for (var f = 0; f < frames.length; f++) if (frames[f] !== frame && frames[f].list) inside = true;
            if (!inside || !region) {
                region = [offset, offset];
                result.lists.push(region);
            }
        }
        function walk(line, plain) {
            var i = 0;
            var carry = 0;
            var reached = 0;
            var shifted = -1;
            var starts = [0];
            for (var k = 1; k < frames.length; k++) {
                var frame = frames[k];
                starts[k] = i;
                var useShift = frame.shift !== undefined && (frame.list || k + 1 < frames.length) && k !== plain && shifted === -1;
                if (frame.kind === 'quote') {
                    var q = /^[ \t]*>/.exec(line.slice(i));
                    if (!q) {
                        if (!useShift) break;
                        shifted = k;
                        reached = k;
                        continue;
                    }
                    i += q[0].length;
                    carry = 0;
                    if (line.charAt(i) === ' ') i++;
                    reached = k;
                    continue;
                }
                if (/^[ \t]*$/.test(line.slice(i))) {
                    reached = k;
                    continue;
                }
                var need = useShift ? frame.shift : frame.width;
                var col = carry;
                var j = i;
                while (col < need && j < line.length && (line.charAt(j) === ' ' || line.charAt(j) === '\t')) {
                    col = line.charAt(j) === '\t' ? col + 4 - (col % 4) : col + 1;
                    j++;
                }
                if (col < need) break;
                if (useShift) shifted = k;
                i = j;
                carry = col - need;
                reached = k;
            }
            return { i: i, carry: carry, reached: reached, shifted: shifted, starts: starts };
        }
        function anyList() {
            for (var f = 0; f < frames.length; f++) if (frames[f].list) return true;
            return false;
        }

        while (lineRe.lastIndex < text.length) {
            at = lineRe.lastIndex;
            line = lineRe.exec(text)[0];
            if (!line) break;
            end = at + line.replace(/(?:\r\n|\r|\n)$/, '').length;
            line = text.slice(at, end);
            if (frontMatter) {
                if (at !== start && /^(?:---|\.\.\.)[ \t]*$/.test(line)) frontMatter = false;
                continue;
            }

            // S2: walk the open frames from the outside in. A frame holding a
            // list that a `+` attached reads that list's lines from the
            // attached column first.
            var blank = /^[ \t]*$/.test(line);
            var walked = walk(line, -1);
            if (walked.shifted !== -1) {
                var shiftedRest = line.slice(walked.i).replace(/^[ \t]*/, '');
                if (!(walked.reached > walked.shifted || (frames[walked.shifted].list && /^::? +[^ \t]/.test(shiftedRest)))) walked = walk(line, walked.shifted);
            }
            var i = walked.i;
            var carry = walked.carry;
            var reached = walked.reached;
            var lead = /^[ \t]*/.exec(line.slice(i))[0];
            var indent = carry;
            for (var c = 0; c < lead.length; c++) indent = lead.charAt(c) === '\t' ? indent + 4 - (indent % 4) : indent + 1;
            var rest = line.slice(i + lead.length);
            var restAt = at + i + lead.length;

            if (fence) {
                // A fence ends with its frame. A comment fence closes on an
                // exact-width run anywhere, a lazy one included.
                var closes = fence.ch === '%'
                    ? /^%{3,}/.test(rest) && /^%+/.exec(rest)[0].length === fence.len
                    : reached === fence.owner && indent <= fence.indent && /^(`{3,}|~{3,})[ \t]*$/.test(rest)
                        && rest.charAt(0) === fence.ch && /^[`~]+/.exec(rest)[0].length >= fence.len;
                if (reached >= fence.owner || closes) {
                    if (!blank) fence.run.end = end;
                    if (closes) {
                        fence.run.closed = true;
                        fence = null;
                    }
                    result.fenced.add(at);
                    if (anyList()) extend(end);
                    continue;
                }
                fence = null;
            }
            // A term holds the lines indented past its `::`; a comment-only line between is not seen (C2-B-069, C2-B-234).
            if (openTerm && /^%%(?!%)(?![ \t]*#(?:region|endregion)\b)/.test(rest)) openTerm.comments.push(at);
            else if (openTerm) {
                if (!blank && rest && reached >= openTerm.depth && indent > openTerm.indent && !labelEnd.test(rest)) {
                    result.termEnds.set(openTerm.at, end);
                    openTerm.comments.push(at);
                    openTerm.comments.forEach(function (line) { result.termLines.add(line); });
                    openTerm.comments = [];
                    blanks = 0;
                    extend(end);
                    continue;
                }
                openTerm = null;
            }
            // S1: a line comment and a one-line link definition are erased.
            if (/^%%(?!%)/.test(rest) || /^\[(?!\^)[^\]\r\n]+\]:(?:[ \t]+[^ \t]+)?[ \t]*$/.test(rest)) {
                blanks = 0;
                continue;
            }
            // A `%%%` comment span ends the paragraph and leaves every frame open.
            if (/^%{3,}/.test(rest)) {
                fence = { owner: reached, indent: indent, ch: '%', len: /^%+/.exec(rest)[0].length };
                fence.run = { at: restAt, end: end, ch: '%', closed: false, quoted: line.slice(0, restAt - at).indexOf('>') !== -1, depth: reached };
                result.fences.push(fence.run);
                para = -1;
                blanks = 0;
                if (anyList()) extend(end);
                continue;
            }
            if (blank || !rest) {
                para = -1;
                attach = null;
                closeTo(reached);
                // Three blank lines end every open list.
                if (++blanks >= 3) {
                    for (var b = 0; b < frames.length; b++) endList(frames[b]);
                    region = null;
                }
                continue;
            }
            blanks = 0;
            var owner = frames[reached];
            var term = /^::( +)(?![ \t]*$)(?!:)/.test(rest);
            var marker = /^:( +)(?![ \t]*$)/.test(rest) && !/^::/.test(rest);
            // The line after an accepted `+` belongs to its host whatever its
            // column, unless it is a term, a marker or an attribute line.
            if (attach) {
                var host = attach;
                attach = null;
                if (host.frame.kind === 'quote' && frames[host.depth] === host.frame && reached >= host.depth) {
                    // A quoted line after it is the quote's first block as written, marker and all.
                    var from = walked.starts[host.depth];
                    lead = /^[ \t]*/.exec(line.slice(from))[0];
                    rest = line.slice(from + lead.length);
                    restAt = at + from + lead.length;
                    indent = 0;
                    reached = host.depth;
                    owner = host.frame;
                    endList(owner);
                    term = marker = false;
                } else if (frames[host.depth] === host.frame && reached >= host.parent && reached < host.depth
                    && (reached > host.parent || indent >= host.column)
                    && !(host.frame.kind === 'description' && /^::? /.test(rest)) && !/^\{[^\r\n]*\}[ \t]*$/.test(rest)) {
                    // An attached block keeps its later lines at the attached column.
                    if (reached === host.parent) host.frame.shift = host.frame.kind === 'quote' ? 0 : host.column;
                    reached = host.depth;
                    owner = host.frame;
                    indent = 0;
                    if (para !== -1 && para < host.depth) para = -1;
                }
            }
            // A lone `+` at the marker column of the frame just past its owner
            // hands that frame the next line; any other `+` is a letter.
            if (/^\+[ \t]*$/.test(rest) && reached + 1 < frames.length && frames[reached + 1].column === indent) {
                attach = { frame: frames[reached + 1], depth: reached + 1, parent: reached, column: indent };
                para = -1;
                continue;
            }
            // A line short of the open paragraph's frames is lazy text unless it opens a block there.
            if (reached < frames.length - 1 && para !== -1 && !term && !(marker && owner.list)
                && !opener.test(rest) && !(listMarker.test(rest) && frames[para].kind !== 'document' && frames[para].kind !== 'quote')) {
                if (anyList()) extend(end);
                continue;
            }
            closeTo(reached);
            if (!anyList()) region = null;

            // S3: read the line's form in its owner, opening containers in turn.
            for (var guard = 0; guard < 64; guard++) {
                owner = frames[frames.length - 1];
                var depth = frames.length - 1;
                var termMatch = /^::( +)(?![ \t]*$)(?!:)/.exec(rest);
                var markerMatch = !termMatch && !/^::/.test(rest) && /^:( +)(?![ \t]*$)/.exec(rest);
                var item = !termMatch && !markerMatch && listMarker.exec(rest);
                if (termMatch) {
                    openList(owner, restAt);
                    result.terms.add(restAt);
                    openTerm = { depth: depth, indent: indent, at: restAt, comments: [] };
                    para = -1;
                    break;
                }
                if (markerMatch && owner.list) {
                    result.markers.add(restAt);
                    var width = indent + 1 + markerMatch[1].length;
                    frames.push({ kind: 'description', width: width, column: indent, list: null });
                    rest = rest.slice(1 + markerMatch[1].length);
                    restAt += 1 + markerMatch[1].length;
                    indent = 0;
                    para = frames.length - 1;
                    if (/^\+[ \t]*$/.test(rest)) {
                        attach = { frame: frames[frames.length - 1], depth: frames.length - 1, parent: depth, column: frames[frames.length - 1].column };
                        para = -1;
                        break;
                    }
                    if (/^::( +)(?![ \t]*$)(?!:)/.test(rest)) continue;
                    break;
                }
                if (!termMatch && !markerMatch && /^(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(rest)) {
                    endList(owner);
                    para = -1;
                    break;
                }
                if (item && !((owner.kind === 'document' || owner.kind === 'quote') && para === depth)) {
                    endList(owner);
                    frames.push({ kind: 'item', width: indent + item[0].length, column: indent, list: null });
                    rest = rest.slice(item[0].length);
                    restAt += item[0].length;
                    indent = 0;
                    para = -1;
                    // A task box is content: the item's column stays at its marker's.
                    var box = /^\[[ xX\-_>\/!?]\]( +(?=[^ \t])|$)/.exec(rest);
                    if (box) {
                        rest = rest.slice(box[0].length);
                        restAt += box[0].length;
                        indent = box[0].length;
                    }
                    if (/^\+[ \t]*$/.test(rest)) attach = { frame: frames[frames.length - 1], depth: frames.length - 1, parent: depth, column: frames[frames.length - 1].column };
                    if (!rest || attach) break;
                    continue;
                }
                if (/^>/.test(rest)) {
                    endList(owner);
                    frames.push({ kind: 'quote', width: 0, column: indent, list: null });
                    var after = rest.charAt(1) === ' ' ? 2 : 1;
                    rest = rest.slice(after);
                    restAt += after;
                    if (/^%%(?!%)/.test(rest) || /^\[(?!\^)[^\]\r\n]+\]:(?:[ \t]+[^ \t]+)?[ \t]*$/.test(rest)) rest = '';
                    lead = /^[ \t]*/.exec(rest)[0];
                    indent = 0;
                    for (var d = 0; d < lead.length; d++) indent = lead.charAt(d) === '\t' ? indent + 4 - (indent % 4) : indent + 1;
                    rest = rest.slice(lead.length);
                    restAt += lead.length;
                    para = -1;
                    if (!rest) break;
                    continue;
                }
                var footnote = /^\[\^[^\]\r\n]+\]:/.exec(rest);
                if (footnote) {
                    endList(owner);
                    frames.push({ kind: 'footnote', width: indent + 2, column: indent, list: null });
                    var body = /^[ \t]*/.exec(rest.slice(footnote[0].length))[0].length;
                    rest = rest.slice(footnote[0].length + body);
                    restAt += footnote[0].length + body;
                    indent = 0;
                    para = -1;
                    if (!rest) break;
                    continue;
                }
                var fenceOpen = /^(`{3,}|~{3,}|%{3,})/.exec(rest);
                if (fenceOpen) {
                    // A `%%%` comment span is invisible to the list around it.
                    if (fenceOpen[1].charAt(0) !== '%') endList(owner);
                    fence = { owner: depth, indent: indent, ch: fenceOpen[1].charAt(0), len: fenceOpen[1].length };
                    fence.run = { at: restAt, end: end, ch: fence.ch, closed: false, quoted: line.slice(0, restAt - at).indexOf('>') !== -1, depth: depth };
                    var shiftedFrame = false;
                    for (var sf = 0; sf <= depth; sf++) if (frames[sf].shift !== undefined) shiftedFrame = true;
                    if (!shiftedFrame && !(lineBlock && frames[lineBlock.owner] === lineBlock.frame && lineBlock.owner <= depth)) result.fences.push(fence.run);
                    para = -1;
                    break;
                }
                if (opener.test(rest) || /^\{[^\r\n]*\}[ \t]*$/.test(rest)) {
                    if (/^:{3,} +\|[ \t]*$/.test(rest)) lineBlock = { owner: depth, frame: owner };
                    endList(owner);
                    para = -1;
                    break;
                }
                if (para !== depth) {
                    endList(owner);
                    para = depth;
                }
                break;
            }
            if (anyList()) extend(end);
            else region = null;
        }
        return result;
    }

    // The sorted term and marker offsets of a definitionListLines result.
    function markIndex(lines) {
        if (!lines.index) {
            var marks = [];
            lines.terms.forEach(function (at) { marks.push(at); });
            lines.markers.forEach(function (at) { marks.push(at); });
            marks.sort(function (x, y) { return x - y; });
            lines.index = { marks: marks, starts: lines.lists.map(function (range) { return range[0]; }) };
        }
        return lines.index;
    }
    function firstAtOrAfter(sorted, at) {
        var low = 0;
        var high = sorted.length;
        while (low < high) {
            var middle = (low + high) >>> 1;
            if (sorted[middle] < at) low = middle + 1;
            else high = middle;
        }
        return low;
    }

    /**
     * The entries of the definition lists in a text, for a greedy rule (which
     * hands `exec` the whole text). An entry runs from a term or marker line
     * over the lines below it that open no other block, across blank lines only
     * into another term or marker line, and never past the list's last line.
     * An unquoted entry whose line holds more than indentation before its `:`
     * or `::` matches from the marker, any other from the line start.
     *
     * @param {boolean} quoted - match the quoted entries, else the unquoted ones.
     * @returns {RegExp} the matcher.
     */
    function definitionListLineMatcher(quoted) {
        var matcher = /(?:)/g;
        var prefix = /^\uFEFF?[ \t]*(?:>(?: ?>)*[ \t]*)?/;
        // A `+` line (a lone marker, a continuation row) is left to the
        // top-level rules, which read the lines above it.
        var other = RegExp('^(?:' + otherBlockOpener + '|%%|\\[[^\\]\\r\\n]+\\]:|\\+)');
        matcher.exec = function (text) {
            var lines = definitionListLines(text);
            var from = this.lastIndex;
            var index = markIndex(lines);
            var marks = index.marks;
            var lineEnd = function (at) {
                var stop = /[\r\n]/g;
                stop.lastIndex = at;
                return stop.exec(text) ? stop.lastIndex - 1 : text.length;
            };
            var nextLine = function (end) {
                return text.charAt(end) === '\r' && text.charAt(end + 1) === '\n' ? end + 2 : end + 1;
            };
            var isMark = function (lineStart, stop) {
                var m = firstAtOrAfter(marks, lineStart);
                return m < marks.length && marks[m] < stop;
            };
            for (var n = firstAtOrAfter(marks, from); n < marks.length; n++) {
                var best = marks[n];
                var lineStart = best;
                while (lineStart > 0 && text.charAt(lineStart - 1) !== '\n' && text.charAt(lineStart - 1) !== '\r') lineStart--;
                var before = text.slice(lineStart, best);
                if ((before.indexOf('>') !== -1) !== quoted) continue;
                var limit = text.length;
                var list = lines.lists[firstAtOrAfter(index.starts, best + 1) - 1];
                if (list && best < list[1]) limit = list[1];
                var end = lineEnd(best);
                // The content column of the run's last marker line: past blank
                // lines a line indented to it is still that description's.
                var bodyColumn = -1;
                var markerAt = function (lineStart, stop) {
                    var marker = /^\uFEFF?([ \t]*(?:>(?: ?>)*[ \t]*)?):( +)/.exec(text.slice(lineStart, stop));
                    if (marker && lines.markers.has(lineStart + marker[1].length)) bodyColumn = marker[1].length + 1 + marker[2].length;
                };
                markerAt(lineStart, end);
                for (var at = nextLine(end); at < limit;) {
                    var stop = lineEnd(at);
                    if (lines.termLines.has(at)) {
                        end = stop;
                        at = nextLine(stop);
                        continue;
                    }
                    var body = text.slice(at, stop);
                    var lead = prefix.exec(body)[0];
                    if ((lead.indexOf('>') !== -1) !== quoted) break;
                    var content = body.slice(lead.length);
                    if (!content) {
                        // Past blank lines only into a term or marker line.
                        var ahead = nextLine(stop);
                        while (ahead < limit && !text.slice(ahead, lineEnd(ahead)).replace(prefix, '')) ahead = nextLine(lineEnd(ahead));
                        if (ahead >= limit) break;
                        var below = text.slice(ahead, lineEnd(ahead));
                        if (!isMark(ahead, lineEnd(ahead))
                            && !(bodyColumn !== -1 && /^[ \t]*/.exec(below)[0].length >= bodyColumn && !other.test(below.replace(prefix, '')))) break;
                        at = ahead;
                        continue;
                    }
                    if (!isMark(at, stop) && other.test(content)) break;
                    markerAt(at, stop);
                    end = stop;
                    at = nextLine(stop);
                }
                // As a paragraph does, an entry at the end of the text takes its last line break.
                if (/^(?:\r\n?|\n)$/.test(text.slice(end))) end = text.length;
                // Never before `lastIndex`: a list marker in front is a token already.
                var start = Math.max(from, quoted || /^\uFEFF?[ \t]*$/.test(before) ? lineStart : best);
                var match = [text.slice(start, end)];
                match.index = start;
                match.input = text;
                this.lastIndex = end;
                lastEntry = { text: match[0], base: start, markers: lines.markers, termEnds: lines.termEnds };
                return match;
            }
            this.lastIndex = 0;
            return null;
        };
        return matcher;
    }

    /**
     * The fences inside a container (an item, a description, a footnote or a
     * quote), as definitionListLines reads them: each runs to its closer or to
     * the end of its container and takes no lazy line (PART 0 S1, S2). Used
     * after the regex rules, for the fences they miss.
     *
     * @param {function(object): boolean} test - which fences to match.
     * @returns {RegExp} the matcher, for a greedy rule.
     */
    var containerFenceOpener = RegExp('^(?:`{3,}|~{3,})(?: ?(?:' + codeFenceInfo + '))?[ \\t]*$');
    function lineEndAt(text, at) {
        var stop = /[\r\n]/g;
        stop.lastIndex = at;
        return stop.exec(text) ? stop.lastIndex - 1 : text.length;
    }
    function containerFenceMatcher(test) {
        var matcher = /(?:)/g;
        matcher.exec = function (text) {
            var lines = definitionListLines(text);
            var runs = lines.fences;
            if (!lines.fenceStarts) lines.fenceStarts = runs.map(function (run) { return run.at; });
            for (var n = firstAtOrAfter(lines.fenceStarts, this.lastIndex); n < runs.length; n++) {
                var run = runs[n];
                if (run.depth === 0 || !test(run)) continue;
                // A code run opens only on a whole opener line; `  ```{x}` is a span.
                if (run.ch !== '%' && !containerFenceOpener.test(text.slice(run.at, lineEndAt(text, run.at)))) continue;
                var start = run.at;
                var line = start;
                while (line > 0 && text.charAt(line - 1) !== '\n' && text.charAt(line - 1) !== '\r') line--;
                // A quoted code fence starts at its line's first quote marker,
                // an indented fence at its line start: a later line-anchored
                // greedy rule would take the line over otherwise.
                if (run.quoted && run.ch !== '%') start = text.indexOf('>', line);
                else if (/^[ \t]*$/.test(text.slice(line, start))) start = line;
                if (start < this.lastIndex) continue;
                var match = [text.slice(start, run.end)];
                match.index = start;
                match.input = text;
                this.lastIndex = run.end;
                return match;
            }
            this.lastIndex = 0;
            return null;
        };
        return matcher;
    }
    // The entry definitionListLineMatcher returned last, which Prism tokenizes
    // right away: its markers, with the entry's offset in the whole text.
    var lastEntry = null;

    /**
     * The description markers of the entry being tokenized: `lead` (regex
     * source) is the text before the `:` on its line, which the match takes
     * too unless `bare`, and then the match is the `:` alone.
     *
     * @param {string} lead - the text before the marker on its line.
     * @param {boolean} bare - match the `:` alone.
     * @returns {RegExp} the matcher, for a greedy rule.
     */
    function entryMarkerMatcher(lead, bare) {
        var matcher = /(?:)/g;
        var shape = RegExp('(' + lead + '):(?!:) +(?![ \\t]*$)', 'y');
        matcher.exec = function (text) {
            var entry = lastEntry && lastEntry.text === text ? lastEntry : null;
            var at = this.lastIndex;
            while (entry && at < text.length) {
                var lineStart = at === 0 || /[\r\n]/.test(text.charAt(at - 1)) ? at : null;
                if (lineStart === null) {
                    var br = /[\r\n]/g;
                    br.lastIndex = at;
                    if (!br.exec(text)) break;
                    at = br.lastIndex;
                    continue;
                }
                shape.lastIndex = at;
                var found = shape.exec(text);
                if (found && entry.markers.has(entry.base + at + found[1].length)) {
                    var match = bare ? [':'] : [found[0]];
                    match.index = bare ? at + found[1].length : at;
                    match.input = text;
                    this.lastIndex = match.index + match[0].length;
                    return match;
                }
                at++;
            }
            this.lastIndex = 0;
            return null;
        };
        return matcher;
    }

    // A list item's MARKER, as it may appear before a block opener on the same
    // line (the marker branches of the 'list' pattern below, plus the optional
    // task box). Used by the marker-line comment fence.
    // EVERY SEPARATOR IS A LITERAL SPACE, never a tab: `-<TAB>a`, `1.<TAB>a` and
    // `- [x]<TAB>a` are paragraphs in the engine, which the shared block battery
    // already pins per marker. Written `[ \t]+` this admitted `-<TAB>%%%` as a
    // marker-line fence, and once the quote rules started sharing the prefix it
    // would have coloured `-<TAB>> q` as a quote on a line the language renders
    // as prose (carve-grammars#259).

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
    var blankOrIndentedLine = '(?:[ \\t]*(?:\\r\\n?|\\n)|[ \\t]+[^ \\t\\r\\n][^\\r\\n]*(?:\\r\\n?|\\n))';

    // A `:::` container opens at a line start, or on a LIST ITEM'S OWN MARKER
    // LINE (`- ::: note`), which the spec nests inside the item (corpus
    // 116-fence-opener-with-a-nested-list-body-inside-a-list-item-2). Without
    // the second form the opener was prose and its indented closer opened a
    // container running to the NEXT closer instead.
    //
    // The marker-line form keeps the marker in group 1, a Prism lookbehind, so
    // the leftover `- ` has no content of its own and 'list' leaves it
    // unscoped - the marker-line comment fence's trade. Its closer scan stops
    // at a column-0 line, which ends the item, so it cannot pair with a later
    // item's closer. A column-0 line straight after the opener is lazy text and
    // demotes the opener (corpus 364-2); a next line indented but still below
    // the content column demotes it too (corpus 161, 482), which a regex cannot
    // measure, so that case over-colours.
    // Any other colon fence line in a body opens a nested container, which must
    // close at its own exact length before the outer closer counts. The inner
    // run is made atomic (lookahead plus backreference) so it never re-splits.
    // An inner body past 512 lines leaves the outer unclosed; unbounded, a run
    // of unclosable inner openers goes quadratic.
    var colonFenceLine = '[ \\t]*(:{3,})(?=[ \\t]*$(?![^\\r\\n])| +[^ \\t\\r\\n])';
    // A column-0 code fence in a body is skipped whole through its own closer, so
    // a colon line inside it neither nests nor closes. An unclosed one takes the
    // rest of the document (PART 0 S1), so its container never reaches a closer.
    // Atomic, and a fence line takes no other branch.
    var bodyFenceOpener = '(?:`{3,}|~{3,})(?: ?(?:' + codeFenceInfo + '))?[ \\t]*(?:\\r\\n?|\\n)';
    // A nested body skips its own closed fences the same way; an unclosed one
    // leaves the nested container unclosed too (carve-grammars#840).
    var containerBody = '(?:(?=(^(?<![^\\r\\n])' + colonFenceLine + '[^\\r\\n]*(?:\\r\\n?|\\n)'
        + '(?:(?=(((`|~)\\8{2,})(?: ?(?:' + codeFenceInfo + '))?[ \\t]*(?:\\r\\n?|\\n)(?:[^\\r\\n]*(?:\\r\\n?|\\n)){0,512}?\\7\\8*[ \\t]*(?:\\r\\n?|\\n)))\\6'
        + '|(?!' + bodyFenceOpener + ')[^\\r\\n]*(?:\\r\\n?|\\n)){0,512}?[ \\t]*\\5[ \\t]*$(?![^\\r\\n])(?:\\r\\n?|\\n)))\\4'
        + '|(?=(((`|~)\\11{2,})(?: ?(?:' + codeFenceInfo + '))?[ \\t]*(?:\\r\\n?|\\n)(?:[^\\r\\n]*(?:\\r\\n?|\\n)){0,512}?\\10\\11*[ \\t]*(?:\\r\\n?|\\n)))\\9'
        + '|(?!' + colonFenceLine.replace('(:{3,})', ':{3,}') + '|' + bodyFenceOpener + ')[^\\r\\n]*(?:\\r\\n?|\\n))*?';
    var containerPattern = function (opener) {
        return RegExp(
            '^(?<![^\\r\\n])((?:(?<![\\s\\S])\\uFEFF)?' + listMarkerBeforeBlock + '(?=:))(:{3,})' + opener
            + '(?!(?:\\r\\n?|\\n)[^ \\t\\r\\n])(?:(?:\\r\\n?|\\n)' + blankOrIndentedLine + '*?[ \\t]+\\2[ \\t]*$(?![^\\r\\n]))?'
            + '|^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*(:{3,})' + opener + '(?:(?:\\r\\n?|\\n)' + containerBody + '^(?<![^\\r\\n])[ \\t]*\\3[ \\t]*$(?![^\\r\\n]))?',
            'm',
        );
    };

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
    var quoteMarkedLine = '(?:[ \\t]*>[^\\r\\n]*(?:\\r\\n?|\\n))';

    var continuationInside = {
        'punctuation': /\+/,
    };

    // The continuation marker at RELATIVE column 0 (markup-carve/carve#3445,
    // CARVE-P9-031). A lone `+` is the marker only where the lines around it
    // prove it: it sits at the marker column of an item, quote, description or
    // footnote opened above and still open, and the next line starts at that
    // column. Everything else is text. Lookbehinds read right to left, so a
    // group is captured on the `+` line before the lines above it are read;
    // the `(?=\+)` in front of each keeps them off every other position.
    function relativePlusSource(g) {
        var item = '(?:[-*]|(?:[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2})))|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. ))';
        var notItem = '(?!' + item + '(?:[ \\t]|\\r?$|\\{))';
        // A list item does not interrupt a paragraph, so one under prose opens nothing.
        var notUnderProse = '(?<!(?<![^\\r\\n])[^ \\t\\r\\n>|#:`~*\\-+\\d[{%][^\\r\\n]*(?:\\r\\n?|\\n))';
        var listOpener = notUnderProse + item + '(?:[ \\t]|\\{)';
        var holderOpener = '(?:>|:[ \\t]|\\[\\^[^\\]\\r\\n]+\\]:[ \\t])';
        var opener = '(?:' + listOpener + '|' + holderOpener + ')';
        var comment = '[ \\t]*%%[^\\r\\n]*';
        // `(?=[^\\r\\n])` is each inner lookbehind's sentinel: these lines are never empty.
        var underText = '(?=[^\\r\\n])(?<=(?<![^\\r\\n])[ \\t>]*[^ \\t\\r\\n>][^\\r\\n]*(?:\\r\\n?|\\n))';
        var lazyText = '(?!#{1,6}(?:[ \\t]|\\r?$)|[>|:{]|%%|\\^[ \\t]|[`~]{3}|\\$\\$|\\[\\^|[-*+](?:[ \\t]|\\r?$)|(?:[-*_][ \\t]*){3,}\\r?$)[^ \\t\\r\\n][^\\r\\n]*';
        var lineAt = '(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?((?:> )*)( *)';
        var lone = '\\+[ \\t]*(?=(?:\\r\\n?|\\n)';
        // The lines between the opener and the `+` that keep the container
        // open, for quote prefix `q` and column `s`. The classes are disjoint,
        // so a run that reaches no opener fails once rather than once per way
        // of splitting it. A list item stays open across a blank line and a
        // comment; the other containers take neither. Bounded twice: 512 lines
        // between two `+` and 8 earlier `+` lines, so a document of `+` lines
        // costs a constant per line.
        var run = function (q, s, list) {
            var deeper = q + s + '[ \\t]+[^ \\t\\r\\n][^\\r\\n]*';
            var sibling = q + s + opener + '[^\\r\\n]*';
            var lazy = underText + q + '(?!' + s + opener + ')' + lazyText;
            var plus = q + s + '\\+[ \\t]*\\r?';
            // The lines of the block an earlier `+` attached, up to a blank line.
            var attached = '(?=[^\\r\\n])(?<=(?<![^\\r\\n])' + plus + '(?:\\r\\n?|\\n)(?:[ \\t>]*[^ \\t\\r\\n>][^\\r\\n]*(?:\\r\\n?|\\n)){0,64})'
                + '(?!' + deeper + '|' + sibling + '|' + plus + '(?:\\r\\n?|\\n)|' + comment + '|' + lazy + ')[ \\t>]*[^ \\t\\r\\n>][^\\r\\n]*';
            var kept = '(?<![^\\r\\n])(?:' + deeper + '|' + sibling + '|' + lazy + '|' + attached
                + (list ? '|[ \\t]*\\r?|[ \\t]*(?:>[ \\t]*)+\\r?|' + underText + q + '(?!' + s + opener + ')' + comment : '') + ')(?:\\r\\n?|\\n)';
            return '(?:(?:' + kept + '){0,512}(?<![^\\r\\n])' + plus + '(?:\\r\\n?|\\n)){0,8}(?:' + kept + '){0,512}';
        };
        var at = function (n) { return { q: '\\' + n, s: '\\' + (n + 1) }; };
        // Under a list item, a list item below is a sibling, not the attached block.
        var a = at(g);
        var listed = '(?=\\+)(?<=(?<![^\\r\\n])' + a.q + a.s + listOpener + '[^\\r\\n]*(?:\\r\\n?|\\n)' + run(a.q, a.s, true) + lineAt + ')'
            + lone + a.q + a.s + '(?![ \\t])' + notItem + '[^\\r\\n])';
        var b = at(g + 2);
        var held = '(?=\\+)(?<=(?<![^\\r\\n])' + b.q + b.s + holderOpener + '[^\\r\\n]*(?:\\r\\n?|\\n)' + run(b.q, b.s, false) + lineAt + ')'
            + lone + b.q + b.s + '(?![ \\t])[^\\r\\n])';
        // A quote's own first line (`> +`, `  > > +`), one branch per depth k:
        // the line above is no quote line of depth exactly k, and then the `+`
        // is the marker whatever follows. Every `>` needs its space
        // (markup-carve/carve#3421): `>+`, `>>+`, `>> +` are text.
        var opened = [];
        for (var k = 1; k <= 8; k++) {
            opened.push('(?=\\+)(?<=(?:(?<![\\s\\S])\\uFEFF?|(?<![^\\r\\n])(?!(?:[ \\t]*(?:' + item + ') +)*(?:[ \\t]*>){' + k + '}(?![ \\t]*>)[ \\t\\r\\n])[^\\r\\n]*(?:\\r\\n?|\\n))(?:[ \\t]*>(?= )){' + k + '} )'
                + '\\+[ \\t]*(?![^\\r\\n])');
        }
        opened = opened.join('|');
        // A quote's own first line inside a list item or description (`- a` /
        // `  > +`), at or right of the item's content column and under no quote
        // line: the follower is lazy text at the host's column 0, or a non-list
        // block at the quote's column with fewer `> ` prefixes (depth 8 at most).
        // The host may itself sit in a quote (`> - a` / `>   > +`), up to two
        // levels. One branch per prefix, indent and depth, so no group is captured.
        // An opening fence with no closer ahead is lazy text too (carve-js 0.1.13
        // folds it into the quote paragraph); a closed one is a block. The closer
        // scan is bounded to 32 KB.
        // A closer must carry the opener's own prefix `P`, no more and no less.
        // Group `f` captures the opening run. Past 32 KB with neither a closer nor
        // the end of its container the fence counts as closed.
        var unclosedFence = function (P, f) {
            return '(`{3,}(?!`)|~{3,}(?!~))(?=[\\s\\S]{0,32768}?(?:$(?![\\s\\S])|(?:\\r\\n?|\\n)(?!' + P + ')))(?![^\\r\\n]*(?:\\r\\n?|\\n)[\\s\\S]{0,32768}?(?<![^\\r\\n])' + P + '[ \\t]*\\' + f + '(?:(?<=`)`|(?<=~)~)*[ \\t]*\\r?(?:(?:\\r\\n?|\\n)|$(?![\\s\\S])))[^\\r\\n]*';
        };
        // `base` is the number of the first group this branch captures: the
        // prefix of a quote holding the host (often empty). The `+` line's own
        // prefixes are captured too, so a follower with fewer of them is one
        // check rather than one branch per depth.
        var hostedAt = function (base) {
            var next = base;
            var P = '\\' + next++;
            // The host sits in a quote: the captured prefix is not empty.
            var held = '(?!' + P + '(?<![^\\r\\n]))';
            var pf = '\\' + next++;
            var f = next++;
            var hosted = [];
            var follow = [];
            // An indented quote with fewer `> ` than the `+` line attaches too.
            var q = next++;
            var quoteFollow = held + '(?= )(?<=(?<![^\\r\\n])' + P + ' +((?:> ){2,})\\+[ \\t]*(?:\\r\\n?|\\n)' + P + ') +(?!\\' + q + ')(?:> )+(?![ \\t>])' + notItem + '[^\\r\\n]|';
            for (var n = 1; n <= 12; n++) {
                var host = '(?=[^\\r\\n]{0,' + n + '}(?=[^ \\t\\r\\n])(?<=(?<![^\\r\\n])' + P + '[ \\t]*(?:' + item + '|(?=:)(?<=(?<![^\\r\\n])' + P + '[ \\t]*::?[ \\t][^\\r\\n]*(?:\\r\\n?|\\n)' + P + '[ \\t]*):)[ \\t]+)[^ \\t\\r\\n])';
                hosted.push('(?=\\+)(?<=(?<![^\\r\\n])' + P + host + '[^\\r\\n]*(?:\\r\\n?|\\n)(?:' + P + '(?:[ \\t]*\\r?|[ \\t]+[^ \\t\\r\\n][^\\r\\n]*)(?:\\r\\n?|\\n)){0,64}' + P + ' {' + n + '}(?:> )+)'
                    + '(?=\\+)(?<=(?<![^\\r\\n])' + P + '(?![ \\t]*(?:' + item + '[ \\t]+)*>)[^\\r\\n]*(?:\\r\\n?|\\n)' + P + ' {' + n + '}(?:> )+)');
                var k = next++;
                follow.push('(?= {' + n + '})(?<=(?<![^\\r\\n])' + P + ' {' + n + '}((?:> )+)\\+[ \\t]*(?:\\r\\n?|\\n)' + P + ') {' + n + '}(?!\\' + k + ')(?:> )*');
            }
            // Under an outer quote, lazy text and an unclosed fence may drop
            // prefixes, and any non-list block indented past the prefix attaches.
            return '(?=\\+)(?<=[ ]> )(?=\\+)(?<=(?<![^\\r\\n])((?:> )*) +(?:> )+)(?:' + hosted.join('|') + ')' + lone
                + '(?:(?!' + P + '> )((?:> )*)(?:' + lazyText + '|' + unclosedFence(pf, f) + ')|' + P
                + '(?:' + held + ' +(?!>(?: |\\r?$))' + notItem + '[^ \\t\\r\\n]|' + quoteFollow + '(?:' + follow.join('|') + ')(?![ \\t>])' + notItem + '[^\\r\\n])))';
        };
        // Openers on one line with a quote innermost (`- > +`): the block
        // below starts at column 0 or at that line's column.
        // Every `>` needs its space: `- >+`, `- > >+` and `- >> +` are item text.
        var d = at(g + 4);
        var stacked = '(?=\\+)(?<=' + lineAt + '(?:(?:[-*] +(?:\\[[ xX\\-_>\\/!?]\\] +)?|' + item + ' +)+)(?:> )+)'
            + lone + '(?:' + d.q + d.s + ')?(?![ \\t])' + notItem + '[^\\r\\n])';
        // The hosted branches capture groups numbered after all of the above.
        var groups = function (source) { return RegExp(source + ')|').exec('').length - 1; };
        var before = '(?:' + listed + '|' + held + '|' + opened + '|' + stacked;
        return before + '|' + hostedAt(g + groups(before)) + ')';
    }

    var plusListMarker = '(?:[-*]|(?:[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2})))|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. ))';
    // A `+ ... |` line is a row only directly under a row at its indent: a
    // table row, not the separator under a header, or a `+` row continuing one.
    var plusRowSeparator = '[ \\t]*\\|(?:[ \\t]*:?-+:?[ \\t]*\\|)+[ \\t\\r]*(?:\\r\\n?|\\n)';
    // Group 1 is empty for a row at column 0, group 2 the indent of a row inside a
    // list item or description; the rule spells the indent as `\1\2`.
    var plusRowLine = '\\|[^\\r\\n]*\\|(?:\\{[^{}\\r\\n]*\\})?[ \\t\\r]*(?:\\r\\n?|\\n)';
    var plusRowAbove = '(?<=(?<![^\\r\\n])(?!' + plusRowSeparator + '(?<=\\|[ \\t\\r]*(?:\\r\\n?|\\n)[^\\r\\n]*(?:\\r\\n?|\\n)))'
        + '(?:()' + plusRowLine
        + '|(?<=(?<![^\\r\\n])[ \\t]*(?:' + plusListMarker + '|:)[ \\t]+[^ \\t\\r\\n][^\\r\\n]*(?:\\r\\n?|\\n)'
        + '(?:(?<![^\\r\\n])(?:[ \\t\\r]*|[ \\t]+[^ \\t\\r\\n][^\\r\\n]*)(?:\\r\\n?|\\n)){0,256})([ \\t]+)' + plusRowLine + '))';
    var plusRowOnMarker = '(?<=(?<![^\\r\\n])[ \\t]*(?:(?:[-*:]|(?:[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2})))|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. )) +)+'
        + '\\|[^\\r\\n]*\\|(?:\\{[^{}\\r\\n]*\\})?[ \\t\\r]*(?:\\r\\n?|\\n))';
    var plusRowTail = '\\+[^\\r\\n]*\\|[ \\t]*(?![^\\r\\n])';

    function delimitedBody(separator) {
        var escaped = separator === ',' ? ',' : '\\t';
        var string = {
            // A field opens at a separator or a row start; the row-start indent is a container's.
            pattern: new RegExp('(?<=(?:^|(?:\\r\\n?|\\n))' + (separator === ',' ? '[ \\t]*' : ' *') + '|' + escaped + ')"(?:[^"]|"")*"(?!")'),
            greedy: true,
            inside: { escape: { pattern: /""/, alias: 'char' } },
        };
        var punctuation = { pattern: new RegExp(escaped), alias: 'operator' };
        return {
            header: {
                pattern: /(?<![\s\S])[^\r\n]+/,
                inside: {
                    string: string,
                    separator: punctuation,
                    field: { pattern: new RegExp('[^' + escaped + '\\r\\n]+'), alias: 'property' },
                },
            },
            string: string,
            separator: punctuation,
            field: { pattern: new RegExp('[^' + escaped + '\\r\\n]+'), alias: 'string' },
        };
    }
    var csvBody = delimitedBody(',');
    var tsvBody = delimitedBody('\t');

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
                pattern: outsideContainerMetadata(bracedCommentPattern),
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
                    '^(?<![^\\r\\n])((?:(?<![\\s\\S])\\uFEFF)?' + listMarkerBeforeBlock + ')'
                    + '(%{3,})(?!%)[^\\r\\n]*(?:\\r\\n?|\\n)' + blankOrIndentedLine + '*?[ \\t]+\\2(?!%)[^\\r\\n]*$(?![^\\r\\n])',
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
                    '^(?<![^\\r\\n])((?:(?<![\\s\\S])\\uFEFF)?' + quoteMarkerBeforeBlock + ')'
                    + '(%{3,})(?!%)[^\\r\\n]*(?:\\r\\n?|\\n)' + quoteMarkedLine + '*?[ \\t]*\\2\\3(?!%)[^\\r\\n]*$(?![^\\r\\n])',
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
                pattern: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*(%{3,})(?!%)[^\r\n]*(?:\r\n?|\n)[\s\S]{0,8000}?^(?<![^\r\n])[ \t]*\1(?!%)[^\r\n]*$(?![^\r\n])/m,
                greedy: true,
            },
            {
                pattern: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*%%(?!%)[^\r\n]*$(?![^\r\n])/m,
                greedy: true,
            },
            {
                // A comment fence in a container ends with it (carve-grammars#873).
                pattern: containerFenceMatcher(function (run) { return run.ch === '%'; }),
                greedy: true,
            },
            {
                // An UNTERMINATED `%%%` run opens nothing (PART 9 §28); it
                // degrades to a line comment, so it must still scope as one.
                // Placed after the block form, which consumes matched fences.
                pattern: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*%{3,}[^\r\n]*$(?![^\r\n])/m,
                greedy: true,
            },
            {
                // trailing comment after whitespace (Prism lookbehind, no JS
                // lookbehind: the leading space is captured and excluded).
                // An unterminated percent run degrades to a line comment,
                // except in the metadata tail owned by a named container. Corpus
                // `326-...-6` (`- %%%` / `c` / `%%%`) pins the opener keeping
                // its comment scope.
                pattern: outsideContainerMetadata(RegExp('([ \\t])%{3,}[^\\r\\n]*$(?![^\\r\\n])', 'm')),
                lookbehind: true,
                greedy: true,
            },
            {
                // A comment that follows NOTHING BUT A BLOCK MARKER is left to
                // the block rule, which then scopes the marker and colours the
                // comment in its own `inside`. Without the exclusion the comment
                // is carved out first, the leftover `# ` / `- ` fails MARKER
                // REQUIRES CONTENT, and the marker loses its scope although the
                // engine renders a real heading or item (carve-grammars#578).
                // THE EXCLUSION IS SPACE-ONLY, because the block rules are:
                // a marker separated by a TAB leaves the line as prose (MARKER
                // SEPARATORS), so no block rule would claim `#<TAB>%% h` and the
                // comment has to stay a comment here.
                //
                // A named container owns its complete metadata tail. Leaving
                // percent runs in place lets valid labels retain their scope
                // and marks a rejected title or label as invalid metadata.
                // THE MARKER EXCLUSION SITS BEHIND THE `%%`. As a leading
                // lookbehind it would run at every space in the line, the
                // quadratic shape carve-grammars#576 took out of the row rule next
                // door. Same question either way - a marker, a LITERAL SPACE, then
                // the run - so the tab form is untouched.
                pattern: outsideContainerMetadata(RegExp(
                    commentAfterPrefix
                    + '(?<!^(?<![^\\r\\n])[ \\t]*(?::{3,}(?: +[-0-9A-Za-z_]+)?|#{1,6}|[-*]|(?:[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2})))|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. )) %%)'
                    + '[^\\r\\n]*$(?![^\\r\\n])',
                    'm',
                )),
                lookbehind: true,
                greedy: true,
            },
            {
                /*
                 * A CONTINUATION LINE, which the line-local walk cannot answer: a
                 * paragraph's span may open on an EARLIER line, and locally an
                 * unpartnered opener and an unpartnered closer are the same text.
                 * This entry takes the closer reading, confined to lines where that
                 * is the only one available.
                 *
                 * A line that OPENS A BLOCK starts its own inline run, so a run on
                 * it can only be an opener and the walk's refusal is final. Corpus
                 * 516-...-5 (a heading in a quote) and 532-...-5 (a container
                 * label) both get the comment back if this entry reaches them.
                 *
                 * A QUOTE MARKER IS NOT ITSELF SUCH AN OPENER, so it is consumed
                 * before the test: `> y` + backtick continues a paragraph, while
                 * `> # a` behind the same marker opens a block.
                 */
                pattern: outsideContainerMetadata(toLineEndOutsideBlockOpeners(RegExp(
                    '((?<!^(?<![^\\r\\n])[ \\t]*(?::{3,}(?: +[-0-9A-Za-z_]+)?|#{1,6}|[-*]|(?:[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2})))|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. ))) |\\t)%%(?!%)',
                    'm',
                ))),
                lookbehind: true,
                greedy: true,
            },
        ],

        // Typed front matter. Bare `---` is YAML; an opener with no closer runs to
        // the end of the document (carve#5016). Known payloads receive their
        // native Prism grammar when the host registered it, with compact local
        // fallbacks so the standalone Carve grammar still provides useful
        // highlighting. Unknown format tokens remain opaque metadata.
        'front-matter': [
            {
                pattern: /^(?<![^\r\n])\uFEFF?--- ?json[ \t]*(?:(?:\r\n?|\n)|$(?![\s\S]))(?:(?:[\s\S]*?(?:\r\n?|\n))?---[ \t]*(?:(?:\r\n?|\n)|$(?![^\r\n]))|[\s\S]*)/,
                greedy: true,
                inside: Object.assign({
                    'frontmatter-delimiter': { pattern: /^(?<![^\r\n])\uFEFF?--- ?json|^(?<![^\r\n])---[ \t]*$(?![^\r\n])/m, alias: 'punctuation' },
                }, Prism.languages.json || {
                    property: { pattern: /(^(?<![^\r\n])|[^\\])"(?:\\.|[^"\\])*"(?=\s*:)/, lookbehind: true },
                    string: { pattern: /(^(?<![^\r\n])|[^\\])"(?:\\.|[^"\\])*"/, lookbehind: true },
                    comment: /\/\*[\s\S]*?\*\/|\/\/.*/,
                    number: /\b-?(?:0x[\dA-Fa-f]+|\d*\.?\d+(?:[Ee][+-]?\d+)?)\b/,
                    punctuation: /[{}[\],]/,
                    operator: /:/,
                    boolean: /\b(?:false|true)\b/,
                    null: { pattern: /\bnull\b/, alias: 'keyword' },
                }),
            },
            {
                pattern: /^(?<![^\r\n])\uFEFF?--- ?toml[ \t]*(?:(?:\r\n?|\n)|$(?![\s\S]))(?:(?:[\s\S]*?(?:\r\n?|\n))?---[ \t]*(?:(?:\r\n?|\n)|$(?![^\r\n]))|[\s\S]*)/,
                greedy: true,
                inside: Object.assign({
                    'frontmatter-delimiter': { pattern: /^(?<![^\r\n])\uFEFF?--- ?toml|^(?<![^\r\n])---[ \t]*$(?![^\r\n])/m, alias: 'punctuation' },
                }, Prism.languages.toml || {
                    comment: /#.*/,
                    table: { pattern: /^(?<![^\r\n])\s*\[\[?.*?\]\]?\s*$(?![^\r\n])/m, alias: 'class-name' },
                    key: { pattern: /^(?<![^\r\n])[ \t]*[A-Za-z0-9_-]+(?=\s*=)/m, alias: 'property' },
                    string: /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'[^']*'/,
                    number: /\b[+-]?(?:0x[\dA-Fa-f_]+|0o[0-7_]+|0b[01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[Ee][+-]?\d[\d_]*)?)\b/,
                    boolean: /\b(?:false|true)\b/,
                    punctuation: /[=[\]{},.]/,
                }),
            },
            {
                pattern: /^(?<![^\r\n])\uFEFF?---(?: ?(?:yaml|yml))?[ \t]*(?:(?:\r\n?|\n)|$(?![\s\S]))(?:(?:[\s\S]*?(?:\r\n?|\n))?---[ \t]*(?:(?:\r\n?|\n)|$(?![^\r\n]))|[\s\S]*)/,
                greedy: true,
                inside: Object.assign({
                    'frontmatter-delimiter': { pattern: /^(?<![^\r\n])\uFEFF?---(?: ?(?:yaml|yml))?|^(?<![^\r\n])---[ \t]*$(?![^\r\n])/m, alias: 'punctuation' },
                }, Prism.languages.yaml || {
                    comment: /#.*/,
                    key: { pattern: /(^(?<![^\r\n])|(?:\r\n?|\n))[ \t]*[\w.-]+(?=\s*:)/, lookbehind: true, alias: 'property' },
                    string: /"(?:\\.|[^"\\])*"|'(?:''|[^'])*'/,
                    number: /\b[+-]?(?:0x[\dA-Fa-f]+|\d*\.?\d+(?:[Ee][+-]?\d+)?)\b/,
                    boolean: /\b(?:false|true|null)\b/,
                    punctuation: /---|[[\]{},:>|-]/,
                }),
            },
            {
                pattern: /^(?<![^\r\n])\uFEFF?--- ?[A-Za-z0-9]+[ \t]*(?:(?:\r\n?|\n)|$(?![\s\S]))(?:(?:[\s\S]*?(?:\r\n?|\n))?---[ \t]*(?:(?:\r\n?|\n)|$(?![^\r\n]))|[\s\S]*)/,
                alias: 'comment',
                greedy: true,
                inside: { 'frontmatter-delimiter': { pattern: /^(?<![^\r\n])\uFEFF?--- ?[A-Za-z0-9]+|^(?<![^\r\n])---[ \t]*$(?![^\r\n])/m, alias: 'punctuation' } },
            },
        ],

        // A fence opened on a list marker line leaves the marker to the list rule.
        'code-block-on-marker-line': markerCodeForms.map(function (form) {
            return {
                pattern: RegExp('^(?<![^\\r\\n])' + notParagraphContinuation
                    + '((?:(?<![\\s\\S])\\uFEFF)?([ \\t]*)' + form[0] + ')'
                    + '((`|~)\\4{2,})[ \\t]*[^\\r\\n]{0,512}(?:\\r\\n?|\\n)'
                    + '(?:[ \\t]*(?:\\r\\n?|\\n)|\\2[ ]{' + form[1]
                    + '}[ \\t]*[^ \\t\\r\\n][^\\r\\n]*(?:\\r\\n?|\\n))*?'
                    + '\\2[ ]{' + form[1] + '}\\3\\4*[ \\t]*\\r?$(?![^\\r\\n])', 'm'),
                lookbehind: true,
                greedy: true,
                alias: 'code-block',
                inside: null,
            };
        }),

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
            //   AT OR LEFT OF THE OPENER'S COLUMN: its own indent, or spaces not
            //   past it (a tab may reach past the opener's column). A run indented
            //   past the opener is CONTENT, which is what lets a fence hold a fence as
            //   sample text - the shape every document describing Carve in
            //   Carve is made of. With `[ \t]*` the block ended at the
            //   indented run and everything after it went live.
            //
            // The width rule is the code fence's and not the colon fence's,
            // which wants an exact length (§12) - the same distinction
            // `fencedVerbatim` states next to highlight.js's copy of this rule.
            pattern: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?([ \t]*)((`|~)\3{2,})[ \t]*[^\r\n]{0,512}(?:\r\n?|\n)[\s\S]*?^(?<![^\r\n])(?:\1|(?!\1[ \t])[ ]*)\2\3*[ \t]*$(?![^\r\n])/m,
            greedy: true,
            inside: {
                // An info string's quoted title and bracketed label, on the
                // opener line only.
                'csv-body': {
                    pattern: /(^\uFEFF?[ \t]*(?:`{3,}|~{3,})[ \t]?[cC][sS][vV](?![^\s"\[])[^\r\n]*(?:\r\n?|\n))[\s\S]*(?=(?:\r\n?|\n)[^\r\n]*$)/,
                    lookbehind: true,
                    inside: csvBody,
                },
                'tsv-body': {
                    pattern: /(^\uFEFF?[ \t]*(?:`{3,}|~{3,})[ \t]?[tT][sS][vV](?![^\s"\[])[^\r\n]*(?:\r\n?|\n))[\s\S]*(?=(?:\r\n?|\n)[^\r\n]*$)/,
                    lookbehind: true,
                    inside: tsvBody,
                },
                'string': { pattern: /(^[^\r\n]*?)"[^"\r\n]*"/, lookbehind: true },
                'symbol': { pattern: /(^[^\r\n]*?)\[(?:[^\]\r\n`]|`[^`\r\n]*`)*\]/, lookbehind: true },
                // BEFORE `punctuation`, which consumes the opening fence this
                // rule's lookbehind needs. Listed after it the language word
                // never matched, and carried the same class as the code body
                // while TextMate names it `fenced_code.block.language` and
                // highlight.js scopes the opener `keyword` (#523).
                'language': {
                    pattern: /(^(?<![^\r\n])\uFEFF?(?:`{3,}|~{3,})[ \t]*)[^\s`~]+/,
                    lookbehind: true,
                    alias: 'class-name',
                },
                'punctuation': /^(?<![^\r\n])\uFEFF?(?:`{3,}|~{3,})|(?:`{3,}|~{3,})$(?![^\r\n])/,
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
            pattern: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$(?![^\r\n])/m,
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
            pattern: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*#{1,6} [ \t]*(?![ \t]*$(?![^\r\n]))[^\r\n]+$(?![^\r\n])/m,
            alias: 'important',
            inside: Object.assign({
                'punctuation': /^(?<![^\r\n])\uFEFF?#{1,6}/,
                // A heading's inline run holds a trailing comment, and the
                // top-level comment rule steps aside when the comment is all
                // that follows the marker (carve-grammars#578). First in the
                // set so a comment body is never read as emphasis.
                // Same prefix walk as the top-level rule: that rule now steps
                // aside for a `%%` inside a code span, so this one must too, or
                // the comment simply reappears one level down. `^` here is the
                // start of the heading LINE - the title token's own text - which
                // is where the walk has to begin. No marker exclusion: the
                // top-level rule owns that case, and a marker-only comment is
                // meant to land here (carve-grammars#578).
                'comment': { pattern: RegExp(commentAfterPrefix + '[^\\r\\n]*$(?![^\\r\\n])'), lookbehind: true, greedy: true },
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
                    pattern: RegExp(/(^(?<![^\r\n])|[^\p{L}\p{N}])(?<!<\/)/.source + notEscaped + '#' + tagName, 'u'),
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
        // A line block (`::: |`) holds lines of text with hard breaks, so its
        // body is inline only (PART 9 line block, carve-grammars#853). It nests
        // nothing: the first colon line of the opener's exact length closes it,
        // and an unclosed one runs to the end. On a marker line its body ends
        // at the first unindented line, with the item.
        'line-block': {
            pattern: RegExp(
                '^(?<![^\\r\\n])' + notParagraphContinuation + '((?:(?<![\\s\\S])\\uFEFF)?' + listMarkerBeforeBlock + '(?=:))(:{3,}) +\\|[^\\r\\n]*$(?![^\\r\\n])'
                + '(?:(?:\\r\\n?|\\n)(?![ \\t]*\\2[ \\t]*$(?![^\\r\\n]))(?:[ \\t][^\\r\\n]*)?(?![^\\r\\n]))*(?:(?:\\r\\n?|\\n)[ \\t]+\\2[ \\t]*$(?![^\\r\\n]))?'
                + '|^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*(:{3,}) +\\|[^\\r\\n]*$(?![^\\r\\n])'
                + '(?:(?:\\r\\n?|\\n)(?![ \\t]*\\3[ \\t]*$(?![^\\r\\n]))[^\\r\\n]*)*(?:(?:\\r\\n?|\\n)[ \\t]*\\3[ \\t]*$(?![^\\r\\n]))?',
                'm',
            ),
            lookbehind: true,
            greedy: true,
            alias: 'div',
            inside: Object.assign({
                'div-delimiter': {
                    pattern: /^\uFEFF?[ \t]*:{3,} +\|[^\r\n]*(?=[\r\n]|$)|(?<=[\r\n])[ \t]*:{3,}[ \t]*$/,
                    inside: {
                        'punctuation': /:{3,}/,
                        'class-name': /\|/,
                    },
                },
            }, inline),
        },

        'figure-group': {
            pattern: containerPattern(' +figure[ \\t]*$(?![^\\r\\n])'),
            lookbehind: true,
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
                    pattern: /^(?<![^\r\n])\uFEFF?[ \t]*:{3,} +figure[ \t]*(?=(?:\r\n?|\n)|$(?![^\r\n]))|(?<=(?:\r\n?|\n))[ \t]*:{3,}[ \t]*$(?![^\r\n])/,
                    inside: {
                        'punctuation': /:{3,}/,
                        'class-name': /figure/,
                    },
                },
            },
        },

        // Container divs ::: class  /  :::
        // A separated kind word opens a container even when its metadata is
        // invalid (carve#2693). Sigil and typeless forms keep strict syntax.
        //
        // The pattern spans the WHOLE container (opener through its matching
        // closer), not just the opener line (carve-grammars#125): a per-line
        // match left the body wide open to the full top-level pattern set,
        // which let block rules see a closer as body text. The optional tail is a lazy scan up to a closer that
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
            pattern: containerPattern(
                '(?: +(?:\\||\\\\|>)[^\\r\\n]*| +[-0-9A-Za-z_]+[^\\r\\n]*| +"(?:\\\\.|[^"\\\\\\r\\n])*"[^\\r\\n]*| +\\[[^\\]\\r\\n]*\\]| +\\S[^\\r\\n]*)?[ \\t]*$(?![^\\r\\n])',
            ),
            lookbehind: true,
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
                'div-delimiter': [
                    {
                        pattern: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*:{3,}(?: +(?:\||\\|>)[^\r\n]*| +[-0-9A-Za-z_]+(?: +"[^"\r\n]*")?(?: +\[[^\]\r\n]*\])?| +"(?:\\.|[^"\\\r\n])*"(?: +\[[^\]\r\n]*\])?| +\[[^\]\r\n]*\])?[ \t]*$(?![^\r\n])/m,
                        inside: {
                            'punctuation': /:{3,}/,
                            'string': /"(?:\\.|[^"\\\r\n])*"/,
                            'symbol': /\[[^\]\r\n]*\]/,
                            'class-name': /[-0-9A-Za-z_]+|\||\\|>/,
                        },
                    },
                    {
                        pattern: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*:{3,} +[-0-9A-Za-z_]+[^\r\n]*$(?![^\r\n])/m,
                        inside: {
                            'invalid-metadata': {
                                pattern: /(^(?<![^\r\n])\uFEFF?[ \t]*:{3,} +[-0-9A-Za-z_]+)(?![-0-9A-Za-z_])[^\r\n]+/,
                                lookbehind: true,
                                alias: 'error',
                            },
                            'punctuation': /:{3,}/,
                            'class-name': /[-0-9A-Za-z_]+/,
                        },
                    },
                    {
                        pattern: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*:{3,} +"(?:\\.|[^"\\\r\n])*"[^\r\n]*$(?![^\r\n])/m,
                        inside: {
                            'invalid-metadata': { pattern: /(^[^"]*"(?:\\.|[^"\\\r\n])*")[^\r\n]*\S[^\r\n]*/, lookbehind: true, alias: 'error' },
                            'string': /"(?:\\.|[^"\\\r\n])*"/,
                            'punctuation': /:{3,}/,
                        },
                    },
                ],
            },
        },

        // A delimiter row has no inline content, so recognize the whole line
        // before the general table rule splits it around code and escapes.
        // An unclosed fence at column 0 interrupts a paragraph and runs to the end
        // of the document, closers of the divs around it included (PART 0 S1).
        // Greedy, so it runs over the
        // bare colon lines the div rule took as openers. An indented or quoted
        // fence may sit in a list or quote, so it is left alone.
        'code-block-unclosed': {
            pattern: RegExp('^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?(?:`{3,}|~{3,})(?: ?(?:' + codeFenceInfo + '))?[ \\t]*$(?![^\\r\\n])[\\s\\S]*', 'm'),
            greedy: true,
            alias: 'code-block',
            inside: {
                'language': { pattern: /^(\uFEFF?(?:`{3,}|~{3,}) ?)[A-Za-z0-9_+#.\/=-]+/, lookbehind: true, alias: 'class-name' },
                'punctuation': /^\uFEFF?(?:`{3,}|~{3,})/,
            },
        },
        // A code fence in a container ends with it (carve-grammars#871).
        'code-block-in-container': {
            pattern: containerFenceMatcher(function (run) { return run.ch !== '%' && !run.quoted; }),
            greedy: true,
            alias: 'code-block',
        },
        'table-separator': {
            pattern: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*\|(?: *:?-+:? *\|)+[ \t]*$(?![^\r\n])/m,
            inside: {
                'table-operator': /:?-+:?/,
                'table-boundary': /\|/,
            },
        },

        // Table rows: | a | b |   (plus header `|=`, caption `^`, span markers)
        'table': {
            // A row ends at its closing pipe, or at a row attribute block behind it.
            pattern: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*\|[^\r\n]*\|(?:[ \t]*\{[^{}\r\n]*\})?[ \t]*$(?![^\r\n])/m,
            greedy: true,
            inside: Object.assign({
                // A row attribute block may stand a space after the closing pipe.
                'row-attributes': { pattern: /(\|[ \t]+)\{[^{}\r\n]*\}(?=[ \t]*$)/, lookbehind: true, alias: 'attr-value', inside: attributes.inside },
                'code': /(?!)/,
                'escape': /(?!)/,
                // rowspan `^` / colspan `<` markers - must precede `punctuation`
                // so the surrounding `|` is not consumed first.
                'table-span': {
                    pattern: /(\|)[ \t]*[\^<](?=[ \t]*\|)/,
                    lookbehind: true,
                },
                'table-alignment': [
                    {
                        pattern: /(\|)=(?:[<~>][\^~v]?|\?[\^~v])(?= |\{)/,
                        lookbehind: true,
                        inside: { 'table-header': /^=/ },
                    },
                    {
                        pattern: /(\|)(?:[<~>][\^~v]?|\?[\^~v])(?= |\{)/,
                        lookbehind: true,
                    },
                ],
                'table-header': {
                    pattern: /\|=(?= |\{)/,
                    inside: { 'table-boundary': /^\|/ },
                },
                'table-boundary': /\|/,
                // Braced cell alignment leads the cell's attribute block: `|={>} a |`, `|{> .num} 1 |` (carve#5091 D3).
                'attributes': [{
                    pattern: new RegExp('(?<=(?<!\\\\)(?:\\\\\\\\)*\\|=?)\\{(?:[<>~][\\^~v]?|\\?[\\^~v])(?:[ \\t]+' + attrItem + ')*[ \\t]*\\}(?= )'),
                    greedy: true,
                    alias: 'attr-value',
                    inside: Object.assign({
                        'table-alignment': { pattern: /(^\{)(?:[<>~][\^~v]?|\?[\^~v])/, lookbehind: true },
                    }, attributes.inside),
                }, attributes],
                'url': new RegExp(unescaped('\\[') + /[^\]]+\]\([^\s)]+\)/.source),
            }, inline),
        },

        // A continuation ROW carrying cells (`continuation_row`, corpus
        // 63-table-multi-line-cell-continuation). It has to end in `|`, so
        // `one + two` in prose stays literal.
        'table-continuation': {
            pattern: RegExp('^(?<![^\\r\\n])(?=[ \\t]*\\+[^\\r\\n]*\\|[ \\t]*$(?![^\\r\\n]))(?:'
                + plusRowAbove + '\\1\\2' + plusRowTail + '(?:(?:\\r\\n?|\\n)\\1\\2' + plusRowTail + ')*'
                + '|' + plusRowOnMarker + '([ \\t]+)' + plusRowTail + '(?:(?:\\r\\n?|\\n)\\3' + plusRowTail + ')*)', 'm'),
            greedy: true,
            inside: Object.assign({
                'code': /(?!)/,
                'escape': /(?!)/,
                'table-continuation-marker': /^(?<![^\r\n])\uFEFF?[ \t]*\+/m,
                'table-boundary': /\|/,
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
            // AN EMPTY QUOTE IS NO HOST (CARVE-P9-080): below a run of bare `>`
            // lines opened at the start or after a blank line, the caret line is
            // a paragraph. The sentinel lookahead keeps the lookbehind off every
            // other line start, and each caret line reads back only over its own
            // run, so the lookbehind needs no bound. Below a prose line the run may close a quote
            // that line continues lazily, which a pattern cannot see; and the
            // start alternative is a token boundary too, so it needs the `>`
            // right there (a quote line can end in a comment token).
            pattern: RegExp('^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?(?=[ \\t]*\\^ )' + captionHost
                + /(?<!(?:(?<![\s\S])\uFEFF?|(?:\r\n|\r(?!\n)|\n)[ \t]*(?:\r\n|\r(?!\n)|\n))(?:>[ \t]*(?:\r\n|\r(?!\n)|\n))+(?:[ \t]*(?:\r\n|\r(?!\n)|\n))*)(?<capIndent>[ \t]*)\^ +(?![ \t]*$(?![^\r\n]))[^\r\n]*$(?![^\r\n])/.source
                + labelLines('capIndent'), 'm'),
            alias: 'title',
            greedy: true,
            inside: Object.assign({
                // Greedy, so a trailing comment the top-level rule found is
                // reclaimed; the same walk as the heading's restores it.
                'comment': { pattern: RegExp(commentAfterPrefix + '[^\\r\\n]*$(?![^\\r\\n])', 'm'), lookbehind: true, greedy: true },
                'punctuation': { pattern: /^(?<![^\r\n])(\uFEFF?[ \t]*)\^/, lookbehind: true },
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
        // `task_state` is ` `, `x`, `X`, `-`, `_`, `/`, `!`, `>` or `?` (grammar.ebnf
        // `task_state`). Only `x`/`X` render checked; the rest are still task
        // markers, and corpus 06-task-lists-2 covers the named states.
        // A marker line right after a quoted item with text is lazy: the item
        // opens, but a definition on it defines nothing (corpus 383,
        // carve-grammars#856).
        'lazy-marker-definition': {
            pattern: RegExp('^(?<![^\\r\\n])' + notParagraphContinuation
                + '(?<=(?<![^\\r\\n])[ \\t]*>(?: ?>)*[ \\t]+(?!#{1,6} |\\||`{3}|~{3}|:{2,}|%%|\\{|\\^ |\\*?\\[[^\\]\\r\\n]{0,512}\\]: )[^ \\t\\r\\n][^\\r\\n]{0,4096}(?:\\r\\n?|\\n))'
                + '[ \\t]*(?:(?:[-*] +)*[-*](?:\\{[^{}\\r\\n]{0,512}\\})? +(?:\\[[ xX\\-_>\\/!?]\\] +)?|(?:[0-9]+[.)]|[A-Za-z][.)])(?:\\{[^{}\\r\\n]{0,512}\\})? +)'
                + '(?:> (?:(?:[-*]|[0-9]+[.)]) +)*)*(?=\\*\\[[A-Za-z0-9]+\\]: +[^ \\t\\r\\n])[^\\r\\n]{0,4096}', 'm'),
            greedy: true,
            inside: { 'punctuation': /^[^*]+/ },
        },
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
                '^(?<![^\\r\\n])' + notParagraphContinuation + '(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*(?:(?:[-*] +)*[-*](?:(?= )|' + gluedAttrBlock
                + ')(?: *(?![ {])|' + gluedAttrRun + ' +(?![ {])|(?= *\\{))(?:\\[[ xX\\-_>\\/!?]\\](?: +(?![ {])|(?= +\\{)))?(?![ \\t]*$(?![^\\r\\n]))|(?:(?:[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2})))|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. ))(?:(?= )|'
                + gluedAttrBlock + ')(?: *(?![ {])|' + gluedAttrRun + ' +(?![ {])|(?= *\\{))(?![ \\t]*$(?![^\\r\\n])))'
                // A marker whose whole content is a comment takes the comment
                // with it, so the marker keeps its scope and the comment is
                // coloured by the set below. The top-level comment rule steps
                // aside for exactly this shape (carve-grammars#578); without the
                // tail the comment would be left unscoped instead.
                + '(?:%{2}(?!%)[^\\r\\n]*$(?![^\\r\\n]))?',
                'm',
            ),
            alias: 'punctuation',
            greedy: true,
            inside: {
                'comment': { pattern: /%%(?!%)[^\r\n]*$(?![^\r\n])/, greedy: true },
                // A glued block is taken with its marker, so the rest of the
                // line starts at the content (carve-grammars#947).
                'attributes': { pattern: RegExp(gluedAttrRun), alias: 'attr-value', inside: attributes.inside },
                'constant': /\[[ xX\-_>\/!?]\]/,
            },
        },
        // A lone `+` is grammar.ebnf `continuation_marker`, which attaches a
        // block to a list item, quote, footnote or description; it is not
        // table syntax (#523). AFTER 'list', so the same pattern also takes a
        // `+` left alone on a marker line once 'list' has the marker (`- +`).
        // A quote's or footnote's own first line takes it only when a
        // non-blank flush-left line follows (markup-carve/carve#3105).
        'continuation-marker': [
            {
                pattern: RegExp(relativePlusSource(1), 'm'),
                greedy: true,
                inside: continuationInside,
            },
            // On a list marker line once 'list' has the marker (`- +`).
            {
                pattern: /(?=\+)(?<=(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*(?:[-*] +(?:\[[ xX\-_>\/!?]\] +)?|(?:(?:[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\)|\.(?= {2}|\{[^}\r\n]{0,4096}\} {2})))|\.(?! [ \t]*\. |\{[^}\r\n]{0,4096}\}[ \t]+\. )) +)+)\+[ \t]*$(?![^\r\n])/m,
                greedy: true,
                inside: continuationInside,
            },
            // After a marker glued to an attribute block (`-{.c} +`): 'list'
            // took only the marker, so the fragment opens on the block, which
            // stays in the lookbehind group for 'attributes'. `(?<![\s\S])`
            // is the fragment start, so a line merely beginning with a block
            // does not match - except as the document's first line.
            {
                pattern: RegExp('(^(?<![\\s\\S])' + gluedAttrRun + ' +)\\+[ \\t]*$(?![^\\r\\n])', 'm'),
                lookbehind: true,
                inside: continuationInside,
            },
            {
                pattern: /(^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?\[\^[^\]\r\n]+\]: +)\+[ \t]*(?=(?:\r\n?|\n)(?!(?:[-*]|(?:[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\)|\.(?= {2}|\{[^}\r\n]{0,4096}\} {2})))|\.(?! [ \t]*\. |\{[^}\r\n]{0,4096}\}[ \t]+\. ))(?:[ \t]|\r?$|\{))[^ \t\r\n])/m,
                lookbehind: true,
                greedy: true,
                inside: continuationInside,
            },
        ],
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
        'blockquote': [
            {
                // A closed code fence inside a quote, every line carrying the
                // opener's marker run; its body stays verbatim. A line's own
                // indent is its container's, as on a marker line (`- > ```).
                pattern: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*((?:> )*>) ((`|~)\3{2,})(?:(?!\3)[^\r\n]){0,512}(?:(?:\r\n?|\n)[ \t]*\1(?: [^\r\n]*|\r)?(?![^\r\n]))*?(?:\r\n?|\n)[ \t]*\1 \2\3*[ \t]*$(?![^\r\n])/m,
                greedy: true,
                inside: {
                    'code-block': [
                        {
                            pattern: /((?:\r\n?|\n)[ \t]*(?:> )*>) [ \t]*(?:`{3,}|~{3,})[ \t]*$/,
                            lookbehind: true,
                            inside: { 'punctuation': /`{3,}|~{3,}/ },
                        },
                        {
                            pattern: /^(\uFEFF?[ \t]*(?:> )*>) [^\r\n]+/,
                            lookbehind: true,
                            inside: {
                                'language': {
                                    pattern: /(^ [ \t]*(?:`{3,}|~{3,})[ \t]*)[^\s`~]+/,
                                    lookbehind: true,
                                    alias: 'class-name',
                                },
                                'punctuation': /^ [ \t]*(?:`{3,}|~{3,})/,
                            },
                        },
                        { pattern: /((?:\r\n?|\n)[ \t]*(?:> )*>)(?! >)[^\r\n]+(?=[\r\n]|$)/, lookbehind: true },
                    ],
                    'punctuation': /^(?<![^\r\n])\uFEFF?[ \t]*>(?: >(?= |$))*/m,
                },
            },
            {
                // A closed fence behind an item marker inside a quote (`> - ```,
                // carve-grammars#849). Its body lines are indented past the quote
                // marker; a line back at the quote's content column ends the
                // item, and then this does not match.
                pattern: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*((?:> )*>) (?:[-*](?: +\[[ xX\-_>\/!?]\])?|[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\)|\.(?= {2}))) +((`|~)\3{2,})(?:(?!\3)[^\r\n]){0,512}(?:(?:\r\n?|\n)[ \t]*\1(?: {2}[^\r\n]*| ?\r?)(?![^\r\n]))*?(?:\r\n?|\n)[ \t]*\1 +\2\3*[ \t]*$(?![^\r\n])/m,
                greedy: true,
                inside: {
                    'code-block': [
                        {
                            pattern: /((?:\r\n?|\n)[ \t]*(?:> )*>) +(?:`{3,}|~{3,})[ \t]*$/,
                            lookbehind: true,
                            inside: { 'punctuation': /`{3,}|~{3,}/ },
                        },
                        {
                            pattern: /(^\uFEFF?[ \t]*(?:> )*> [^ \t\r\n]+(?: +\[.\])? +)(?:`{3,}|~{3,})[^\r\n]*/,
                            lookbehind: true,
                            inside: {
                                'language': {
                                    pattern: /(^(?:`{3,}|~{3,})[ \t]*)[^\s`~]+/,
                                    lookbehind: true,
                                    alias: 'class-name',
                                },
                                'punctuation': /^(?:`{3,}|~{3,})/,
                            },
                        },
                        { pattern: /((?:\r\n?|\n)[ \t]*(?:> )*>)[^\r\n]+(?=(?:\r\n?|\n))/, lookbehind: true },
                    ],
                    'list': {
                        pattern: /(^\uFEFF?[ \t]*(?:> )*>) [^ \t\r\n]+(?: +\[.\])?(?= )/,
                        lookbehind: true,
                        inside: { 'punctuation': /[\s\S]+/ },
                    },
                    'punctuation': /^(?<![^\r\n])\uFEFF?[ \t]*>(?: >(?= |$))*/m,
                },
            },
            {
                // Anchored `^[ \t]*` on purpose - no container model here, see the
                // indented-block-openers note in the module docblock (carve-grammars#138).
                pattern: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*>(?: [^\r\n]*)?$(?![^\r\n])/m,
                inside: Object.assign({
                    'punctuation': /^(?<![^\r\n])\uFEFF?[ \t]*>/,
                }, inline),
            },
        ],

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
        // render it as a paragraph. Which lines are terms and markers is
        // definitionListLines' call, one token per line.
        'definition-list': {
            pattern: definitionListLineMatcher(false),
            greedy: true,
            inside: {
                // The description marker itself; the body text is left for
                // the inline rules to tokenize as ordinary content.
                'punctuation': {
                    pattern: entryMarkerMatcher('[ \\t]*'),
                    greedy: true,
                },
                'definition-term': definitionTerm,
                'description-attributes': bodyAttributes(':'),
                'continuation-marker': {
                    pattern: RegExp(relativePlusSource(1) + '|(?=\\+)(?<=(?<![^\\r\\n])[ \\t]*: +)\\+[ \\t]*$(?![^\\r\\n])', 'm'),
                    greedy: true,
                    inside: continuationInside,
                },
            },
        },

        // A snippet definition `{$name}: value` (C2-B-236), as TextMate's
        // `snippet_definition`: column 0 and no lazy line of an open
        // paragraph. A marker part or glued block holds no id. The value is
        // inline content of this line only; its set is filled in below.
        'snippet-definition': {
            pattern: RegExp('(?<![^\\r\\n])' + notParagraphContinuation + '(?:(?<![\\s\\S])\\uFEFF)?' + snippetDefinitionHead
                + ' (?=[ \\t]*[^ \\t\\r\\n])[^\\r\\n]*', 'm'),
            greedy: true,
            // The marker alone, for the run check below the grammar.
            head: snippetDefinitionHead + ' (?=[ \\t]*[^ \\t\\r\\n])',
            inside: {
                'snippet-value': {
                    pattern: RegExp('(^\\uFEFF?' + snippetDefinitionHead + ' )[^]+'),
                    lookbehind: true,
                    inside: null,
                },
                // Before 'variable': the marker parts are found behind the name.
                'attributes': [
                    {
                        pattern: RegExp('(^\\uFEFF?\\{\\$' + snippetName + ')(?: +' + snippetDefinitionPart + ')+'),
                        lookbehind: true,
                        alias: 'attr-value',
                        inside: null,
                    },
                    {
                        pattern: RegExp('\\{ *' + snippetDefinitionPart + '(?: +' + snippetDefinitionPart + ')* *\\}'),
                        alias: 'attr-value',
                        inside: null,
                    },
                ],
                'variable': {
                    pattern: RegExp('(^\\uFEFF?\\{\\$)' + snippetName),
                    lookbehind: true,
                },
                'punctuation': /^\uFEFF?\{\$|[}:]/,
            },
        },

        // Reference link / abbreviation definitions
        // Anchored at end of line (grammar.ebnf `reference_definition`):
        // `[a]: /u zzz` is prose, not a definition (#533).
        'reference-definition': {
            // The indented lines below it continue it while they hold the rest of
            // its tail: a title, an attribute block, at most one of each, in that
            // order (C2-B-083).
            pattern: RegExp('^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*\\[(?!@|\\^[^\\]])(?!\\^\\]:[ \\t]*$)[^\\]]+\\]:(?:'
                + refDestination + '[ \\t]*$(?![^\\r\\n])(?:' + refTail(refTitle) + refTail(refAttrs) + '?|' + refTail(refTitle + ' ' + refAttrs + '|' + refAttrs) + ')?'
                + '|' + refDestination + ' ' + refTitle + '[ \\t]*$(?![^\\r\\n])' + refTail(refAttrs) + '?'
                + '|' + refDestination + '(?: ' + refTitle + ')?(?: ' + refAttrs + ')?[ \\t]*$(?![^\\r\\n]))', 'm'),
            alias: 'url',
            inside: {
                'constant': /^(?<![^\r\n])\uFEFF?[ \t]*\[[^\]]+\]:/,
                // `link_title`, one space after the destination, scoped as an
                // inline link's title is rather than as part of the URL (#523).
                'string': {
                    pattern: /(^(?<![^\r\n]) [^\S\r\n]*(?:\S|\uFEFF)+ |[\r\n][ \t]+)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')(?=(?: \{[^\r\n]*\})?[ \t]*$(?![^\r\n]))/m,
                    lookbehind: true,
                },
            },
        },
        // `abbreviation_term = (letter | digit)+`, and `letter` is enumerated
        // ASCII - so the term is case-blind and may be digits. This required
        // the whole term to be uppercase, which is the reading carve-js also
        // had (carve-js#720) and dropped.
        'abbreviation-definition': {
            // Anchored `^[ \t]*` on purpose - no container model here, see the
            // indented-block-openers note in the module docblock (carve-grammars#138).
            // Every line below it indented past its `*` continues the expansion; a
            // block line or a comment-only line ends it (C2-B-084).
            pattern: RegExp(/^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?(?<abbrIndent>[ \t]*)\*\[[A-Za-z0-9]+\]: +(?![ \t]*$(?![^\r\n]))[^\r\n]*$(?![^\r\n])/.source
                + '(?:' + captionNl + '\\k<abbrIndent>[ \\t]+(?![ \\t]|' + labelEnd + '|$(?![^\\r\\n]))[^\\r\\n]*)*', 'm'),
            inside: {
                // BEFORE punctuation, and anchored to the brackets. Prism
                // applies these in order, so a punctuation rule that eats `*[`
                // first leaves nothing for a lookbehind to anchor on. Unanchored
                // it scoped runs of the EXPANSION instead - with the old
                // uppercase-only class that showed up as the `H` of `HyperText`
                // carrying `symbol`, which the goldens pinned.
                'symbol': {
                    pattern: /(^(?<![^\r\n])\uFEFF?[ \t]*\*\[)[A-Za-z0-9]+(?=\]:)/,
                    lookbehind: true,
                },
                // The expansion is the abbreviation's TITLE, not more markup.
                // TextMate has always scoped it (`string.unquoted.abbreviation`)
                // and this grammar left it to whatever the term rule spilled
                // onto it.
                'string': {
                    pattern: /(\]:[ \t]+|[\r\n][ \t]+)[^\r\n]+/,
                    lookbehind: true,
                },
                'punctuation': /^(?<![^\r\n])\uFEFF?[ \t]*\*|\[|\]|:/,
            },
        },

        // The same after an item marker's glued attribute block (`-{#x} *[HTML]: X`,
        // carve-grammars#850). The block stays for 'attributes'; `inside` is the
        // definition's own, set below.
        'glued-abbreviation-definition': {
            pattern: RegExp('(?<=(?<![^\\r\\n])' + notParagraphContinuation + '(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*'
                + '(?:[-*]|[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)[.)]))(\\{[^{}\\r\\n]*\\} +)'
                + '\\*\\[[A-Za-z0-9]+\\]: +(?![ \\t]*$(?![^\\r\\n]))[^\\r\\n]*$(?![^\\r\\n])', 'm'),
            lookbehind: true,
            greedy: true,
            alias: 'abbreviation-definition',
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
                pattern: RegExp(notEscaped + '\\$\\$' + sigilSpan),
                greedy: true,
                alias: 'string',
            },
            {
                pattern: RegExp(notEscaped + '\\$' + sigilSpan),
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
                pattern: RegExp(notEscaped + '!' + sigilSpan),
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
        // CriticMarkup: {+ins+} {-del-} {#comment#}
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
            pattern: RegExp(notEscaped + '\\{\\+(?!\\+\\})' + forcedBody('\\+', []) + '\\+\\}'),
            alias: 'inserted',
        },
        // THE BODY IS NOT EMPTY. `{--}` is a braced EN DASH, not an empty
        // deletion - the engine renders `a {--} b` as `a \u2013 b` - and this rule
        // read it as `{-` plus nothing plus `-}` (carve-grammars#378). One
        // character is enough: `{- -}`, `{---}` and `{----}` are all deletions.
        'deleted': {
            pattern: RegExp(notEscaped + '\\{-(?!-\\})' + forcedBody('-', []) + '-\\}'),
            alias: 'deleted',
        },

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
                pattern: RegExp(attrValueFree + notEscaped + '(?<!`)(`{1,2})(?:[^`]|[^`](?:[^\\r\\n]|(?:\\r\\n?|\\n)(?![ \\t\\r]*(?:\\r\\n?|\\n))(?!' + quoteOpener + ')){0,4096}?[^`])\\1(?!`)'),
                greedy: true,
            },
            {
                // A run of three or more is a fence spelling, and a fence's
                // payload may hold a blank line. A narrow run may not: a code
                // span ends with its paragraph (carve#2074).
                // A quote line ends the paragraph for both widths
                // (carve-grammars#856).
                pattern: RegExp(attrValueFree + notEscaped + '(?<!`)(`{3,16})(?:[^`]|[^`](?:[^\\r\\n]|(?:\\r\\n?|\\n)(?!' + quoteOpener + ')){0,4096}?[^`])\\1(?!`)'),
                greedy: true,
            },
        ],

        /*
         * Reserved processor syntax: `{{ path #section @key:value }}` (PART 9
         * section 19, grammar.ebnf `include_directive`). The core leaves it
         * literal; a processor expands it only when a host supplies a
         * resolver.
         *
         * One owning token with semantic child tokens, because its selector is spelled with other
         * constructs: `#section` is 'tag' syntax and an option slot is
         * 'mention' syntax, so without this rule `{{ ch.crv #intro }}`
         * coloured `#intro` as a hashtag. Same defect class as the
         * cross-reference one 'cross-ref' exists for (#307).
         *
         * It sits AFTER 'code' so a directive inside a code span stays
         * verbatim, and BEFORE 'attributes', 'mention' and 'tag', which would
         * otherwise claim parts of it.
         */
        // A snippet use `{{ $name }}` (C2-I-128), as TextMate's `snippet_use`:
        // ahead of 'include-directive', which would read `$name` as a path. A
        // name of another shape, no space, a tab or an option makes no use and
        // stays with the include rule. Every inline set gets both rules below.
        'snippet-use': {
            pattern: RegExp(notEscaped + '\\{\\{ +\\$' + snippetName + ' +\\}\\}'),
            greedy: true,
            inside: {
                'punctuation': /^\{\{|\}\}$/,
                'variable': /\$[A-Za-z0-9_][A-Za-z0-9_-]*/,
            },
        },
        // A use carries no attributes: valid blocks glued after it are text,
        // taken here so 'attributes' does not claim them. A braced or critic
        // comment there is no valid block and keeps its comment token.
        'snippet-use-blocks': {
            pattern: RegExp('(?<=' + notEscaped + '\\{\\{ +\\$' + snippetName + ' +\\}\\})(?:\\{ *' + snippetUsePart + '(?: +' + snippetUsePart + ')* *\\})+'),
            greedy: true,
        },

        'include-directive': {
            pattern: RegExp(
                notEscaped + '\\{\\{ +(?:"(?:\\\\.|[^"\\\\\\n])*"|[^#@} \\r\\n"][^#@} \\r\\n"]*)'
                + '(?: *#[A-Za-z0-9_][\\w-]*)?'
                // EACH OPTION OPENS ON ITS `@` (C2-B-156, C2-B-204), glued or
                // after spaces, and an unquoted value holds no `@`, so the
                // runs split one way only. A word that is no option ends the
                // scan: on a line of unclosed `{{`, each opener reads one word
                // rather than the rest of the line (#988).
                + '(?: *@' + includePart + '+)*'
                + ' +\\}\\}',
            ),
            greedy: true,
            alias: 'important',
            // BY PART. The outer pattern is what keeps the tag and mention
            // rules out of the directive, so painting the whole run one colour
            // buys nothing a reader wants - and a path should look like a path.
            //
            // A QUOTED RUN STOPS AT THE NEWLINE. `quoted_include_path` is
            // `character - ('"' | newline)` and the same bound is normative for
            // `quoted_value` [CARVE-P4-006]. Prism scans the whole document, so
            // without it the opening quote paired with one lines away and
            // painted everything between as directive (carve-grammars#409).
            inside: {
                'include-section': {
                    pattern: /(^(?<![^\r\n])\{\{[ \t]+(?:"(?:\\.|[^"\\\n])*"|[^#@}\s"][^#@}\s]*)[ \t]*)#[A-Za-z0-9_][\w-]*/,
                    lookbehind: true,
                    alias: 'symbol',
                },
                // FIRST, and anchored on the opening braces through a
                // lookbehind: `inside` tokenizes what earlier rules left, so a
                // path rule running after `punctuation` no longer sees the
                // `{{` it needs to anchor on, and a rule loose enough to match
                // without it would claim any leftover run.
                'include-path': {
                    pattern: /(\{\{[ \t]+)(?:"(?:\\.|[^"\\\r\n])*"|[^#@}\s"][^#@}\s]*)/,
                    lookbehind: true,
                    alias: 'url',
                },
                'punctuation': /^(?<![^\r\n])\{\{|\}\}$(?![^\r\n])/,
                // The value is an `attribute_value`, so it may be quoted and
                // then carries spaces. An unterminated quote falls back to the
                // unquoted run rather than pairing with a later one.
                'include-option': {
                    // NO WHITESPACE REQUIRED before the `@`: the slot admits a
                    // glued option, and `inside` has already tokenized the
                    // path and the section, so what is left to scan starts at
                    // the `@` itself.
                    // AN UNQUOTED VALUE ENDS AT THE NEXT MARKER:
                    // `include_unquoted_value` is `unquoted_value` less the
                    // `@`, so `@shift:1@lines:1-8` is two options and never
                    // one whose value is `1@lines:1-8`. A value that needs an
                    // `@` takes the quoted form.
                    // THE VALUE IS OPTIONAL: a bare `@code` (I1c) is an
                    // option too. `@k:` with nothing after the colon is not.
                    pattern: /@[A-Za-z_][\w-]*(?::(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^\s}@]+)|(?![\w:-]))/,
                    inside: {
                        'include-option-name': {
                            pattern: /^(?<![^\r\n])@[A-Za-z_][\w-]*/,
                            alias: 'keyword',
                        },
                        'punctuation': /^(?<![^\r\n]):/,
                        'include-option-value': {
                            pattern: /(?:"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|[^\s}@]+)$(?![^\r\n])/,
                            alias: 'string',
                        },
                    },
                },
            },
        },

        // Images: ![alt](src "title"); the title may contain
        // backslash-escaped quotes like the link title.
        'image': {
            pattern: new RegExp(unescaped('!') + '\\[' + bracketText + linkTail),
            greedy: true,
            alias: 'url',
            inside: {
                'string': linkTitle,
                'punctuation': /^(?<![^\r\n])!\[|\]\((?=(?:[^\]]|\](?!\())*$(?![^\r\n]))|\)$(?![^\r\n])/,
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
        // ONE RULE FOR BOTH FORMS: the reference label is `[^\]\n]{0,512}`, whose
        // `{0,512}` accepts the EMPTY label - the same fold vim-carve and
        // sublime-carve make for the collapsed reference link
        // (carve-grammars#318), and the one 'url' already makes here. The alt
        // text may be empty too, so it uses `bracketText` rather than the
        // non-empty body: `![][r]` is an image, where `[][r]` is not a link.
        'reference-image': {
            pattern: new RegExp(unescaped('!') + '\\[' + bracketText + '\\]\\[(?![ \\t]+\\]|\\^)[^\\]\\r\\n]{0,512}\\]'),
            greedy: true,
            alias: 'url',
            inside: {
                'constant': /(?<=\]\[)[^\]\r\n]+(?=\]$(?![^\r\n]))/,
                'punctuation': /!\[|\]\[|\]/,
            },
        },

        // Inline footnote: ^[content] (corpus 23-inline-footnotes). Distinct
        // from the reference `[^label]` below - the caret leads here - and
        // matched first so neither rule claims the other's brackets.
        'inline-footnote': {
            pattern: new RegExp(unescaped('\\^') + '\\[' + noteText + '\\]'),
            greedy: true,
            alias: 'symbol',
            // The body is ordinary inline content - `^[see *later*]` keeps its
            // bold - so the shared inline rules apply inside it.
            inside: Object.assign({
                'punctuation': /^(?<![^\r\n])\^\[|\]$(?![^\r\n])/,
            }, inline),
        },

        'footnote-body-attributes': bodyAttributes('\\[\\^[^\\]\\r\\n]+\\]:'),

        // Footnote references: [^label]
        'footnote': {
            pattern: new RegExp(unescaped('\\[') + /\^(?![ \t\r\n]+\])[^\[\]]{1,512}\]/.source),
            alias: 'symbol',
        },

        // Citations (Tier-2 §22): [@key], [+@key], [@key, p.10], [@a; @b; @c]
        // Distinguished from links/spans/refs by the absence of a trailing
        // `(url)`, `[ref]`, or `{attrs}` suffix. The bracket MUST contain at
        // least one `@key` item.
        'citation': {
            pattern: new RegExp(unescaped('\\[') + /\+?(?:[^\]@]{0,512}@[A-Za-z0-9_][A-Za-z0-9_.:#$%&+?<>~\/-]*(?:[^\]]{0,512})?)\](?!\(|\[|\{)/.source),
            greedy: true,
            alias: 'string',
            inside: {
                // Integral marker `+` and suppress-author `-`
                'operator': /(?<=^(?<![^\r\n])\[)\+|(?<=[@;]\s*)-(?=@)/,
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
            pattern: RegExp(notEscaped + /<\/#[^>\s]{1,512}>/.source),
            greedy: true,
            alias: 'url',
            inside: {
                'punctuation': /^(?<![^\r\n])<\/#|>$(?![^\r\n])/,
            },
        },

        // Inline links: [text](url "title") and reference [text][id]
        'url': [
            {
                // The link text may be empty ([](url), spec corpus 03-links-8)
                // and the title may contain backslash-escaped quotes:
                // [t](/url "ti\"tle") (spec corpus 03-links-4).
                pattern: new RegExp(unescaped('\\[') + bracketText + linkTail),
                greedy: true,
                inside: {
                    'string': linkTitle,
                    'punctuation': /^(?<![^\r\n])\[|\]\((?=(?:[^\]]|\](?!\())*$(?![^\r\n]))|\)$(?![^\r\n])/,
                },
            },
            {
                pattern: new RegExp(unescaped('\\[') + bracketTextNonEmpty + '\\]\\[(?![ \\t\\r\\n]+\\]|\\^)[^\\]]{0,512}\\]'),
                greedy: true,
                inside: {
                    'punctuation': /\[|\]\[|\]/,
                },
            },
            {
                // autolink <https://...> and <mailto-ish>
                pattern: RegExp(notEscaped + /(?:<[a-zA-Z][a-zA-Z0-9+.-]*:[^>\s]{1,2048}>|<[^>\s@]{1,2048}@[^>\s]{1,2048}>)/.source),
                greedy: true,
            },
        ],

        // An EMPTY attribute block, only where it is glued to a preceding `]`
        // (`[x]{}` -> <span>x</span>). A bare `{}` in prose is literal text
        // (corpus 123). Must precede 'span', which would otherwise consume the
        // `]` this rule anchors on.
        'escaped-bracket-literal': {
            pattern: new RegExp('(?=\\\\\\[)(?<!\\[(?:[^\\[\\]\\\\\\r\\n]|\\\\.){0,4096})(?<!(?<!\\\\)(?:\\\\\\\\){0,32}\\\\)\\\\\\[(?:[^\\[\\]\\\\\\r\\n]|\\\\.)*\\]\\{[ \\t]*(?:' + attrItem + '(?:[ \\t]+' + attrItem + ')*[ \\t]*)?\\}'),
            greedy: true,
            inside: { 'escape': /\\\[/, 'bold': inline.bold, 'italic': inline.italic, 'code': /(?<!`)(`{1,2})(?!`)[^`\r\n]+\1(?!`)/ },
        },

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
            pattern: new RegExp(unescaped('\\[') + bracketTextSpan + '\\](?=\\{)'),
            alias: 'string',
        },


        'critic-comment': {
            // A `}` inside the payload is text; glued to a construct and closed
            // by `}`, the braces are an attribute block instead.
            pattern: RegExp(notEscaped + /\{#(?!#\})(?=(?:[^#\r\n]|#(?!\})|(?:\r\n?|\n)(?![ \t\r]*(?:\r\n?|\n))){0,4096}#\})(?:(?<![^\s\w"'][{]#)|(?![^}\r\n]{0,4096}(?<!#)[}]))(?:[^#\r\n]|#(?!\})|(?:\r\n?|\n)(?![ \t\r]*(?:\r\n?|\n))){0,4096}#\}/.source),
            greedy: true,
            alias: 'comment',
        },

        // Forced brace emphasis must beat the attribute rule (`{_path_}`).
        'forced-bold': inline['forced-bold'],
        'forced-italic': inline['forced-italic'],
        'forced-underline': inline['forced-underline'],
        'forced-strike': inline['forced-strike'],

        // Attribute blocks attached to the preceding element
        'attributes': [{
            pattern: new RegExp('(?=\\{)(?<=(?<!\\\\)(?:\\\\\\\\){0,32}\\[(?:[^\\]\\r\\n\\\\]|\\\\[^\\r\\n])+\\])(?<!\\!\\[[^\\]\\r\\n]+\\])(?<!\\]\\[[^\\]\\r\\n]+\\])\\{(?=(?:[ \t]*' + attrItem + '[ \t]+)*[ \t]*(?:kbd(?=[ \t}])|(?:abbr|time)=))[ \t]*' + attrItem + '(?:[ \t]+' + attrItem + ')*[ \t]*\\}'),
            greedy: true,
            alias: 'attr-value',
            inside: {
                'string': attributes.inside.string,
                'builtin': { pattern: /(^|[\s{])(?:kbd(?=[\s}])|(?:abbr|time)(?==))/, lookbehind: true },
                ...Object.fromEntries(Object.entries(attributes.inside).filter(([name]) => name !== 'string')),
            },
        }, attributes],
        // A valid block glued to no host is one literal atom (C2-I-035, C2-I-036).
        'attributes-unattached': {
            pattern: RegExp(notEscaped + '\\{[ \\t]*' + strictAttrItem + '(?:[ \\t]+' + strictAttrItem + ')*[ \\t]*\\}'),
            greedy: true,
        },

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
            pattern: RegExp(/(^(?<![^\r\n])|[^\p{L}\p{N}])/.source + notEscaped + '@' + tagName, 'u'),
            lookbehind: true,
            alias: 'variable',
        },
        'tag': {
            pattern: RegExp(/(^(?<![^\r\n])|[^\p{L}\p{N}])/.source + notEscaped + '#' + tagName, 'u'),
            lookbehind: true,
            alias: 'variable',
        },
        'symbol': {
            // Symbol shortcode (e.g. emoji). Parser shape: name starts
            // alphanumeric, then word chars, `+` or `-` (`:+1:` stays literal).
            pattern: RegExp(/(^(?<![^\r\n])|[^\w])/.source + notEscaped + /:[A-Za-z0-9+-][\w+-]*:/.source),
            lookbehind: true,
            alias: 'constant',
        },

        // Escapes and smart typography
        'escape': {
            pattern: /\\(?:[!-\/:-@[-`{-~]| (?![ \t]*(?:\r?\n|$)))/,
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
            pattern: /\\(?=(?:\r\n?|\n))/,
            alias: 'constant',
        },
        // The doubled run is canonical in both arrow families (carve#1442), so
        // `-->` `<--` `<-->` and `==>` `<==` `<=>` are listed BEFORE the single
        // forms and before the dash rule - otherwise `-->` scopes as an en dash
        // followed by a stray `>`. `=>` alone is no longer an arrow and is gone
        // from the set; `<=` stays, as the comparison it always was.
        //
        // A hyphen run becomes dashes wherever it stands, `--oneline` included (C2-I-111).
        // An arrow needs its exact hyphen run (CARVE-P3-022). Prism matches each
        // remaining fragment on its own, so `(?<!-)` cannot see a hyphen an
        // earlier token took: `-{3,}(?=>)` keeps the run whole instead.
        'typography': {
            pattern: /\{--\}|\.\.\.|<-->|<--(?!-)|(?<!-)-->|(?<!-)-{3,}(?=>)|<=>|<==|==>|(?<!-)(?:---|--)|!=|<=|>=|\+-|\(tm\)/,
            alias: 'constant',
        },
    };

    // A marker after a marker (`- 1. x`) starts the fragment the first one
    // left, which the greedy guarded rule cannot see as a line start.
    var listRule = Prism.languages.carve.list;
    Prism.languages.carve.list = [listRule, Object.assign({}, listRule, {
        pattern: RegExp(listRule.pattern.source.replace('^(?<![^\\r\\n])' + notParagraphContinuation, '(?<![\\s\\S])'), 'm'),
        greedy: false,
    })];

    // A div's body holds the full language, abbreviation definitions included
    // (markup-carve/carve#4874, carve-grammars#852). Composed here,
    // after the grammar object is fully built, rather than hand-duplicated:
    // `Object.assign` with a shallow copy keeps every entry a REFERENCE to
    // the same token object Prism already uses at the top level (including
    // 'div' itself), so this stays in sync with the rest of the grammar and
    // gives nested divs their own recursive scoping for free - a `:::` inside
    // this div's body is tokenized by the very same 'div' rule. The
    // delimiter-specific 'div-delimiter' entry already on 'div'.inside is
    // spread first, so it still wins over the body patterns for the
    // opener/closer lines themselves.
    var inlineContent = { 'comment': { pattern: bracedCommentPattern, greedy: true } };
    ['math', 'literal', 'raw-inline', 'code', 'image', 'reference-image', 'inline-footnote',
        'footnote', 'cross-ref', 'url', 'span', 'critic-comment', 'forced-bold', 'forced-italic',
        'forced-underline', 'forced-strike', 'bold-italic', 'bold', 'italic', 'underline', 'strike',
        'highlight', 'superscript', 'subscript', 'inserted', 'deleted', 'mention', 'tag', 'escape', 'typography',
    ].forEach(function (name) { inlineContent[name] = Prism.languages.carve[name]; });
    // A bare or braced run's content is inline content too. Its own rules are
    // left out, or the run would match itself again, and inside a braced span
    // its own bare delimiter is text. A braced span of its own kind nests
    // (carve#2904); the nested rule cannot start at offset 0, where the run's
    // own opener is.
    var nestedRules = {};
    function nestedBraced(name, delimiter) {
        nestedRules[name] = nestedRules[name] || {
            pattern: RegExp('(?<=[\\s\\S])' + notEscaped + '\\{' + delimiter + '(?!' + delimiter + '\\})' + forcedBody(delimiter) + delimiter + '\\}'),
            greedy: true,
            alias: inline[name].alias,
        };
        return nestedRules[name];
    }
    [
        ['bold', ['bold'], 'forced-bold', '\\*'], ['italic', ['italic'], 'forced-italic', '/'],
        ['underline', ['underline'], 'forced-underline', '_'], ['strike', ['strike'], 'forced-strike', '~'],
        ['highlight', ['highlight'], 'highlight', '='], ['forced-bold', ['bold', 'forced-bold'], 'forced-bold', '\\*'],
        ['forced-italic', ['italic', 'forced-italic'], 'forced-italic', '/'],
        ['forced-underline', ['underline', 'forced-underline'], 'forced-underline', '_'],
        ['forced-strike', ['strike', 'forced-strike'], 'forced-strike', '~'], ['superscript', ['superscript'], 'superscript', '\\^'],
        // A deletion's own `-` delimiters would read as a dash.
        ['subscript', ['subscript'], 'subscript', ','], ['inserted', ['inserted']], ['deleted', ['deleted', 'typography']],
    ].forEach(function (pair) {
        var base = inlineContent;
        var content = {};
        Object.keys(base).forEach(function (name) {
            if (name === pair[2]) {
                content[name] = nestedBraced(name, pair[3]);
            } else if (pair[1].indexOf(name) === -1) {
                content[name] = base[name];
            }
        });
        (inline[pair[0]] || Prism.languages.carve[pair[0]]).inside = content;
    });
    // A nested span's content is the content of a braced span of its kind.
    Object.keys(nestedRules).forEach(function (name) {
        nestedRules[name].inside = inline[name].inside;
    });
    var divDelimiterOnly = Prism.languages.carve.div.inside;
    var figureGroupDelimiterOnly = Prism.languages.carve['figure-group'].inside;
    var divBody = Object.assign({}, Prism.languages.carve);
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

    /*
     * A HEADING OR CAPTION HOLDS A VERBATIM SPAN (carve-grammars#601,
     * markup-carve/carve#2682). Neither inside set had a `code` rule, so the
     * span painted as title text once the comment guard stopped claiming it.
     * Added here rather than at the object literal, because
     * `Prism.languages.carve.code` does not exist yet while that is built.
     */
    /*
     * A VERBATIM RULE IN A ONE-LINE BLOCK: ESCAPE-GUARDED, AND BOUND TO THE LINE
     * (carve-grammars#602).
     *
     * #600 put `escape` AHEAD of these rules so a backslashed backtick could not
     * open a span. That reading is right and the ordering was not: `escape`
     * tokenizes every \\ on the line, which splits it into hundreds of
     * fragments, and the greedy verbatim rules then retry from each one. A
     * heading carrying 800 units took 733 ms against 11 ms for the same text as a
     * paragraph, and `npm run perf:sweep` stopped finishing.
     *
     * The document level has no such problem because its `code` runs long before
     * its `escape`. So these entries carry the guard themselves - `notEscaped` is
     * the odd-backslash test the sigil entries already use - and the set
     * goes back to the document's order, with `escape` after it.
     */
    function blockVerbatim(token) {
        const bind = (entry) => {
            if (!(entry.pattern instanceof RegExp)) return entry;
            let source = entry.pattern.source;
            if (!source.includes(notEscaped)) source = notEscaped + source;
            if (source === entry.pattern.source) return entry;

            return Object.assign({}, entry, {
                pattern: RegExp(source, entry.pattern.flags),
            });
        };

        return Array.isArray(token) ? token.map(bind) : bind(token);
    }

    // The inline constructs beyond emphasis that a title or caption holds too.
    var linkFamily = ['image', 'reference-image', 'inline-footnote', 'footnote', 'citation', 'cross-ref', 'url',
        'span-empty-attrs', 'extension', 'span', 'critic-comment', 'inserted', 'deleted'];
    for (const block of ['title', 'caption']) {
        const own = Prism.languages.carve[block].inside;
        /*
         * ORDER CARRIES THREE DECISIONS. `comment` leads, so a comment body is
         * never read as emphasis and its `^`-anchored walk starts at the marker -
         * a rule consuming the `#` first costs `# %% h` the scope it earned in
         * carve-grammars#578. The sigil forms precede `code`, which would
         * otherwise take the run and leave the `$` or `!` behind. `escape` comes
         * AFTER them, as at document level, and the reason is on `blockVerbatim`.
         * All of it precedes the shared `inline` set, which would reach the `*`
         * in a verbatim payload.
         */
        Prism.languages.carve[block].inside = Object.assign(
            own['comment'] ? { 'comment': own['comment'] } : {},
            { 'punctuation': own['punctuation'] },
            lineVerbatim(),
            { 'escape': Prism.languages.carve['escape'] },
            pick(linkFamily),
            // A block glued to an inline host is its attributes (`# *a b*{.q}`).
            pick(['attributes']),
            own,
            pick(['mention', 'symbol', 'typography'])
        );
    }

    /*
     * A link's text, a span's text, an extension's content, a definition term
     * and a container's title or label are inline runs as well: the engine
     * renders `[a *b* `c`](u)` and `::: note "a *b*"` with the markup inside.
     * Each sits on one line, so the verbatim tails are line-bound here too.
     */
    function lineVerbatim() {
        return ['math', 'literal', 'raw-inline', 'code'].reduce(function (set, name) {
            set[name] = blockVerbatim(Prism.languages.carve[name]);

            return set;
        }, {});
    }
    function pick(names) {
        return names.reduce(function (set, name) {
            set[name] = Prism.languages.carve[name];

            return set;
        }, {});
    }
    var inlineRun = Object.assign(lineVerbatim(), { 'escape': Prism.languages.carve['escape'] },
        pick(linkFamily), inline, pick(['mention', 'tag', 'symbol', 'typography']));
    var runBetween = function (open, close) {
        return { pattern: RegExp('(' + open + ')[\\s\\S]+?(?=' + close + ')'), lookbehind: true, inside: inlineRun };
    };
    var url = Prism.languages.carve['url'];
    url[0].inside = Object.assign({ 'link-text': runBetween('^\\[', '\\]\\(') }, url[0].inside);
    url[1].inside = Object.assign({ 'link-text': runBetween('^\\[', '\\]\\[') }, url[1].inside);
    Prism.languages.carve['span'].inside = { 'span-text': runBetween('^\\[', '\\]$'), 'punctuation': /\[|\]/ };
    Prism.languages.carve['extension'].inside = Object.assign(
        { 'extension-content': runBetween('\\[', '\\]$') },
        Prism.languages.carve['extension'].inside
    );
    definitionTerm.inside = Object.assign({
        // A comment-only line among the term's lines.
        'comment': { pattern: /([\r\n][ \t]*)%%(?!%)[^\r\n]*/, lookbehind: true, greedy: true },
        'punctuation': definitionTerm.inside['punctuation'],
    }, inlineRun);
    // A note's content recognizes no note of either kind.
    Prism.languages.carve['inline-footnote'].inside = Object.assign(
        { 'punctuation': Prism.languages.carve['inline-footnote'].inside['punctuation'] },
        inlineRun
    );
    delete Prism.languages.carve['inline-footnote'].inside['inline-footnote'];
    delete Prism.languages.carve['inline-footnote'].inside['footnote'];
    var delimiterInside = Prism.languages.carve['div'].inside['div-delimiter'][0].inside;
    delimiterInside['string'] = { pattern: /"(?:\\.|[^"\\\r\n])*"/, inside: { 'title-text': runBetween('^"', '"$'), 'punctuation': /"/ } };
    delimiterInside['symbol'] = { pattern: /\[[^\]\r\n]*\]/, inside: { 'label-text': runBetween('^\\[', '\\]$'), 'punctuation': /\[|\]/ } };
    Prism.languages.carve['div'].inside['div-delimiter'][2].inside['string'] = delimiterInside['string'];
    // No name, sigil, title or label: an anonymous div, and the rest is further words (C2-B-119, C2-B-122).
    Prism.languages.carve['div'].inside['div-delimiter'].push({
        pattern: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*:{3,} +\S[^\r\n]*$(?![^\r\n])/m,
        inside: {
            'invalid-metadata': { pattern: /(^[^:]*:{3,} +)\S[^\r\n]*/, lookbehind: true, alias: 'error' },
            'punctuation': /:{3,}/,
        },
    });

    // A quoted line's code, math and literal spans stay verbatim
    // (carve-grammars#858), ahead of the inline rules.
    // A glued attribute block attaches on a quoted line too (carve-grammars#865),
    // after the forced spans as at the top level.
    var quotedInline = Object.assign({ 'escape': Prism.languages.carve['escape'] }, inline);
    quotedInline = Object.fromEntries(Object.entries(quotedInline).flatMap(function (entry) {
        return entry[0] === 'bold-italic' ? [['attributes', Prism.languages.carve['attributes']], entry] : [entry];
    }));
    var quotedRun = Object.assign(lineVerbatim(), quotedInline);
    // The same spans in a token that holds only paragraph lines: they cross
    // its lines, and the quote prefixes inside them are punctuation.
    function quotedSpans() {
        const prefix = { 'punctuation': { pattern: /((?:\r\n?|\n))[ \t]*>(?: >)*/, lookbehind: true } };
        return ['math', 'literal', 'raw-inline', 'code'].reduce(function (set, name) {
            set[name] = [].concat(Prism.languages.carve[name]).map(function (entry) {
                const source = entry.pattern.source.split('(?!' + quoteOpener + ')').join('');
                return Object.assign({}, entry, { pattern: RegExp(source, entry.pattern.flags), greedy: false, inside: prefix });
            });

            return set;
        }, {});
    }
    // A quoted line's heading and list markers scope as they do outside a quote
    // (carve-grammars#683), matching what follows the `> ` prefix once
    // 'punctuation' has taken it, nested prefixes included. They go ahead of
    // the inline rules, as at the top level.
    {
        const quoteLine = Prism.languages.carve.blockquote[Prism.languages.carve.blockquote.length - 1];
        const rest = Object.assign({}, quotedRun, quoteLine.inside);
        delete rest.punctuation;
        quoteLine.inside = Object.assign({
            // A `>` glued to a `+` is text (`> >+`, markup-carve/carve#3421).
            'punctuation': /^(?<![^\r\n])\uFEFF?[ \t]*>(?= |$)(?: >(?= |$))*(?!\+)/m,
            // A heading opens only right after the prefix (`>  # h` is prose),
            // while a list marker may stand further in, as at the top level.
            'title': {
                pattern: /(^ )#{1,6} [ \t]*(?![ \t]*$(?![^\r\n]))[^\r\n]+$(?![^\r\n])/m,
                lookbehind: true,
                alias: 'important',
                inside: Prism.languages.carve.title.inside,
            },
            // A quote line is tokenized after its prefix, so the paragraph
            // guard (which needs the lines above) is dropped here.
            'list': Object.assign({}, listRule, {
                pattern: RegExp(listRule.pattern.source.replace(notParagraphContinuation, ''), 'm'),
                greedy: false,
            }),
            // Only right after a marker 'list' took: a bare `> +` is decided
            // at the top level, where the next line is in view.
            'continuation-marker': [
                {
                    pattern: /^(?<![^\r\n])\+[ \t]*$(?![^\r\n])/m,
                    inside: continuationInside,
                },
                {
                    pattern: RegExp('(^(?<![\\s\\S])' + gluedAttrRun + ' +)\\+[ \\t]*$(?![^\\r\\n])', 'm'),
                    lookbehind: true,
                    inside: continuationInside,
                },
            ],
        }, rest);
    }

    // Reuse the full code and escape rules before looking for cell pipes.
    for (const table of ['table', 'table-continuation']) {
        Prism.languages.carve[table].inside.code = Prism.languages.carve.code;
        Prism.languages.carve[table].inside.escape = Prism.languages.carve.escape;
    }
    // 'table' is greedy so its closing-pipe test reads the whole line; the
    // comments it then covers are restored first.
    Prism.languages.carve.table.inside = Object.assign({
        'comment': Prism.languages.carve.comment.filter(function (entry) {
            return entry.pattern.source === bracedCommentPattern.source;
        }).concat([{
            // IN A TABLE ROW THE RUN ENDS AT THE CELL. A cell is an inline run
            // of its own (`CARVE-P9-041`), so `| a %% h | b |` keeps two cells
            // (corpus 518-...-6, carve-grammars#576). Any run width: `%%%`
            // cannot open a fence here. Only the row's own text reaches this
            // rule, so it needs no line-prefix test; internal whitespace runs
            // are consumed together so the closing lookahead stays linear.
            pattern: /([ \t])%{2,}(?:\\.|[^\\|\r\n \t]|[ \t]+(?![ \t]|\||$(?![^\r\n])))*(?=[ \t]*(?:\||$(?![^\r\n])))/m,
            lookbehind: true,
            greedy: true,
        }]),
    }, Prism.languages.carve.table.inside);

    // Tables, colon containers and definition lists inside a quote, read after
    // the `> ` prefix at any quote depth. A container needs its closer at the
    // same prefix, and a `: d` line counts only below a quoted `:: term`.
    {
        const quoteLine = Prism.languages.carve.blockquote[Prism.languages.carve.blockquote.length - 1];
        const own = { ...quoteLine.inside };
        // A quoted line collects an abbreviation definition as the document does,
        // behind the prefix and any item markers (carve-grammars#845).
        // A glued attribute block after a quoted marker stays text for the
        // attribute rules (carve-grammars#850).
        const quotedAbbreviation = {
            pattern: /(^(?<![^\r\n])(?:\{[^{}\r\n]*\} +)?[ \t]*)\*\[[A-Za-z0-9]+\]: +(?![ \t]*$(?![^\r\n]))[^\r\n]*$(?![^\r\n])/m,
            lookbehind: true,
            inside: Prism.languages.carve['abbreviation-definition'].inside,
        };
        // What a quoted item's marker leaves: a quote opened on it, a term.
        const head = {
            'punctuation': own.punctuation, 'title': own.title, 'list': own.list, 'continuation-marker': own['continuation-marker'],
            'definition-term': {
                pattern: /^(?<![^\r\n])::(?= +[^ \t\r\n])[^\r\n]*/m,
                alias: 'title',
                inside: Object.assign({ 'punctuation': /^::/ }, quotedRun),
            },
            'nested-quote': {
                pattern: /^(?<![^\r\n])>(?: >)*(?= +\*\[[A-Za-z0-9]+\]: +[^ \t\r\n])/m,
                alias: 'punctuation',
            },
            'abbreviation-definition': quotedAbbreviation,
        };
        quoteLine.inside = Object.assign(head, {
            'table': {
                pattern: /(^ )\|[^\r\n]*\|(?:\{[^{}\r\n]*\})?[ \t]*$(?![^\r\n])/m,
                lookbehind: true,
                inside: Prism.languages.carve.table.inside,
            },
        }, own);
        const fenceLine = '(?: +(?:\\||\\\\|>)[^\\r\\n]*| +[-0-9A-Za-z_]+(?: +"[^"\\r\\n]*")?(?: +\\[[^\\]\\r\\n]*\\])?| +"(?:\\\\.|[^"\\\\\\r\\n])*"(?: +\\[[^\\]\\r\\n]*\\])?| +\\[[^\\]\\r\\n]*\\])?[ \\t]*';
        // Further words after a name or a title (C2-B-122), as the top-level div reads them.
        const fenceWords = [' +[-0-9A-Za-z_]+[^\\r\\n]*', ' +"(?:\\\\.|[^"\\\\\\r\\n])*"[^\\r\\n]*', ' +\\S[^\\r\\n]*'];
        const fenceOpener = '(?:' + fenceLine + '|' + fenceWords.join('|') + ')';
        Prism.languages.carve.blockquote.splice(1, 0, {
            pattern: RegExp('^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?([ \\t]*(?:> )*>) (:{3,})' + fenceOpener + '$(?![^\\r\\n])'
                // An unclosed run ends with the quote.
                + '(?:(?:\\r\\n?|\\n)\\1(?: [^\\r\\n]*)?)*?(?:(?:\\r\\n?|\\n)\\1 \\2[ \\t]*$(?![^\\r\\n])|$(?![^\\r\\n])(?!(?:\\r\\n?|\\n)\\1(?: |$)))', 'm'),
            greedy: true,
            inside: Object.assign({
                'punctuation': own.punctuation,
                'div-delimiter': [delimiterInside].concat(Prism.languages.carve['div'].inside['div-delimiter'].slice(1).map((rule) => rule.inside))
                    .map((inside, i) => ({
                        pattern: RegExp('(^ ):{3,}' + [fenceLine].concat(fenceWords)[i] + '$(?![^\\r\\n])', 'm'),
                        lookbehind: true,
                        inside,
                    })),
            }, quoteLine.inside),
        });
        // A quoted term or description marker line, as definitionListLines reads it.
        Prism.languages.carve.blockquote.splice(1, 0, {
            pattern: definitionListLineMatcher(true),
            greedy: true,
            inside: Object.assign({
                // An entry opened on a quoted item's marker line (carve-grammars#850).
                'item-marker': {
                    pattern: /(^\uFEFF?[ \t]*(?:>(?: ?>)*)? *)(?:(?:[-*]|[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)[.)]) +)+(?=::)/m,
                    lookbehind: true,
                    alias: 'list',
                    inside: { 'punctuation': /[^ ]+/ },
                },
                'definition-term': {
                    pattern: /(?=::)(?<=(?<![^\r\n])\uFEFF?[ \t]*(?:>(?: ?>)*)?[ \t]*)::[^\r\n]*/,
                    alias: 'title',
                    inside: Object.assign({ 'punctuation': /^::/ }, quotedRun),
                },
                'punctuation': [
                    { pattern: entryMarkerMatcher('(?:\\uFEFF?[ \\t]*>(?: ?>)*)?[ \\t]*', true), greedy: true },
                    { pattern: /^\uFEFF?[ \t]*>(?: ?>)*/m, greedy: true },
                ],
                'list': head.list,
                'abbreviation-definition': quotedAbbreviation,
            }, quotedRun),
        });
    }

    // [content width, lookbehind source for the marker before it], filled below.
    var quoteMarkerWidths = [];

    // A quoted line block's body is inline text behind its prefix
    // (carve-grammars#853), ahead of the quoted colon container. An unclosed
    // one ends with the quote.
    {
        const quote = Prism.languages.carve.blockquote;
        Prism.languages.carve.blockquote.splice(1, 0, {
            pattern: RegExp('^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*((?:> )*>) (:{3,}) +\\|[^\\r\\n]*$(?![^\\r\\n])'
                + '(?:(?:\\r\\n?|\\n)[ \\t]*\\1(?! \\2[ \\t]*$(?![^\\r\\n]))(?: [^\\r\\n]*)?(?![^\\r\\n]))*'
                + '(?:(?:\\r\\n?|\\n)[ \\t]*\\1 \\2[ \\t]*$(?![^\\r\\n]))?', 'm'),
            greedy: true,
            inside: Object.assign({
                // The opener and the token's last line only: a colon line of
                // another width inside is text.
                'div-delimiter': [
                    {
                        pattern: /(^\uFEFF?[ \t]*(?:> )*> ):{3,} +\|[ \t]*(?=[\r\n]|$)/,
                        lookbehind: true,
                        inside: { 'punctuation': /:{3,}/, 'class-name': /\|/ },
                    },
                    {
                        pattern: /((?:\r\n?|\n)[ \t]*(?:> )*> ):{3,}[ \t]*$/,
                        lookbehind: true,
                        inside: { 'punctuation': /:{3,}/ },
                    },
                ],
            }, quotedSpans(), {
                'punctuation': /^(?<![^\r\n])\uFEFF?[ \t]*>(?: >(?= |$))*/m,
                'comment': Prism.languages.carve.comment,
            }, quotedInline),
        });
        // A quote opened on a list item's marker line (carve-grammars#849):
        // 'list' has taken the marker, which the lookbehind reads (group 1 is
        // the item's indent). Its lines stand at the item's content column; a
        // line left of it ends the item (carve-grammars#859).
        // A description's `: ` marker holds them too; a term above it is no
        // paragraph (carve-grammars#859).
        const widths = quoteMarkerWidths;
        widths.push([2, '(?<=(?<![^\\r\\n])::? [^\\r\\n]*(?:\\r\\n?|\\n))(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?([ \\t]*): ']);
        const byWidth = {};
        for (const form of markerCodeForms) (byWidth[form[1]] = byWidth[form[1]] || []).push(form[0]);
        for (const width of Object.keys(byWidth)) {
            widths.push([width, notParagraphContinuation + '(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?([ \\t]*)(?:' + byWidth[width].join('|') + ')']);
        }
        const head = '^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*';
        const behindMarker = (rule) => widths.map(([width, marker]) => {
            const source = rule.pattern.source.replace(/(?<!\\)\\([1-9])/g, (m, n) => '\\' + (Number(n) + 1));
            if (!source.startsWith(head)) throw new Error('quote fence rule changed shape');
            return {
                pattern: RegExp('(?<=' + marker + ')'
                    + source.slice(head.length).split('(?:\\r\\n?|\\n)[ \\t]*\\2').join('(?:\\r\\n?|\\n)\\1 {' + width + '}[ \\t]*\\2'), 'm'),
                greedy: true,
                inside: rule.inside,
            };
        });
        quote.splice(1, 0, ...behindMarker(quote[0]), ...behindMarker(quote[1]));
        // An unclosed code fence ends with the quote (carve-grammars#859). It
        // comes after the blocks whose payload may hold a fence line.
        const closer = '(?:\\r\\n?|\\n)[ \\t]*\\1 \\2\\3*[ \\t]*$(?![^\\r\\n])';
        if (!quote[0].pattern.source.endsWith(closer)) throw new Error('quote fence rule changed shape');
        // At column 0 only: an indented quote line's host is not in view.
        const unclosed = {
            pattern: RegExp(quote[0].pattern.source.slice(0, -closer.length).replace(/\*\?$/, '*') + '(?![^\\r\\n])(?!(?:\\r\\n?|\\n)[ \\t]*\\1(?: [^\\r\\n]*|\\r)?(?![^\\r\\n]))', 'm'),
            greedy: true,
            inside: quote[0].inside,
        };
        quote.splice(quote.length - 1, 0, Object.assign({}, unclosed, {
            pattern: RegExp(unclosed.pattern.source.replace(head, head.slice(0, -'[ \\t]*'.length)), 'm'),
        }), ...behindMarker(unclosed));
    }

    // A quoted paragraph holds the quoted list-marker lines below it as text:
    // a list item does not interrupt a paragraph inside a quote either
    // (carve-grammars#851). It runs over the quoted lines that continue it, at
    // its depth or shallower, and matches only where one of them is a marker
    // line; the quote-line rule reads every other paragraph.
    {
        const marker = '(?:[-*](?:[ \\t]|\\{|$)|(?:[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2})))(?:[ \\t]|\\{|$)|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. )(?:[ \\t]|\\{|$))';
        const breaks = '(?:#{1,6}(?: |$)|`{3,}|~{3,}|:{3,}|%{3,}|(?:-{3,}|\\*{3,}|_{3,})[ \\t]*$|\\||\\{[^{}\\r\\n]*\\}[ \\t]*$|%%|\\[\\^?[^\\]\\r\\n]+\\]:(?: |$)|\\*\\[[A-Za-z0-9]+\\]:|:: |\\+[ \\t]*$)';
        const opener = '(?:' + marker + '|\\^(?:[ \\t]|$)|' + breaks.slice(3, -1) + '|: |!\\[|\\$\\$`)';
        // Quoted lines only: an unquoted line after a quote may be a lazy line
        // or a sibling item of a `+`-attached quote, which no pattern can tell.
        const lead = '[ \\t]*>(?!\\2 >)(?: >)* [ \\t]*';
        const line = '(?:\\r\\n?|\\n)' + lead + '(?!' + breaks + ')[^ \\t\\r\\n>][^\\r\\n]*';
        const markerLine = '(?:\\r\\n?|\\n)' + lead + '(?=' + marker + '|\\^(?:[ \\t]|$))[^\\r\\n]*';
        const quote = Prism.languages.carve.blockquote;
        quote.splice(quote.length - 1, 0, {
            pattern: RegExp('^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?([ \\t]*)>((?: >)*) [ \\t]*(?!' + opener + ')[^ \\t\\r\\n>][^\\r\\n]*'
                + '(?:' + line + '){0,64}?' + markerLine + '(?:' + line + ')*', 'm'),
            greedy: true,
            inside: Object.assign(quotedSpans(), {
                'punctuation': /^(?<![^\r\n])\uFEFF?[ \t]*>(?: >)*/m,
                'comment': Prism.languages.carve.comment,
            }, quotedInline),
        });
        // A code, math or literal span left open on a quoted paragraph line
        // runs over the lines that continue the paragraph, to its closer or
        // to the paragraph's end (carve-grammars#858). Group 3 steps over the
        // spans the line closes itself, group 4 is the open run.
        const notCloser = '(?:[^`\\r\\n]|(?!(?<!`)\\4(?!`))`)';
        const quoteLine = quote[quote.length - 1];
        const spanInside = Object.assign(quotedSpans(), { 'punctuation': quoteLine.inside.punctuation, 'comment': Prism.languages.carve.comment });
        for (const name of Object.keys(quoteLine.inside)) if (!(name in spanInside)) spanInside[name] = quoteLine.inside[name];
        // A `$$` line opens a math block, which this token reads as math too.
        const spanOpener = opener.replace('|\\$\\$`', '');
        // At the line start (group 1 the indent), or behind an item marker,
        // whose lines stand at its content column.
        // An item's own paragraph ends at a sibling marker line.
        const openSpan = (start, indent, item) => ({
            pattern: RegExp((start + '>((?: >)*) [ \\t]*' + (item ? '(?=' + marker + ')(?![^ \\t\\r\\n]+(?: +\\[.\\])? +(?:`{3,}|~{3,}))' : '(?!' + spanOpener + ')') + '(?=[^ \\t\\r\\n>])(?=[^\\r\\n`]*`)'
                + '(?:(?!(?<=[ \\t])%%)[^\\r\\n`\\\\]|\\\\[^\\r\\n]|(?<!`)(`{1,16})(?!`)(?:[^\\r\\n`]|(?!(?<!`)\\3(?!`))`)*(?<!`)\\3(?!`))*?'
                + '(?<!`)(`{1,16})(?!`)' + notCloser + '*CONT(?:' + notCloser + '|CONT)*?'
                + '(?:(?<!`)\\4(?!`)[^\\r\\n]*|$(?![^\\r\\n])(?!CONT))').split('CONT').join(
                '(?:\\r\\n?|\\n)' + indent + '[ \\t]*>(?!\\2 >)(?: >)* [ \\t]*(?!' + breaks + (item ? '|' + marker : '') + ')(?=[^ \\t\\r\\n>])'), 'm'),
            // An item line's span stays in its own string: greedy, every match
            // here re-runs the earlier rules over the rest of the document.
            greedy: !item || start[0] !== '^',
            inside: spanInside,
        });
        for (const item of [true, false]) {
            quote.splice(quote.length - 1, 0, openSpan('^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?([ \\t]*)', '\\1', item),
                ...quoteMarkerWidths.map(([width, host]) => openSpan('(?<=' + host + ')', '\\1 {' + width + '}', item)));
        }
    }

    // A term's lazy lines and a description's body are inline runs, read with
    // the document-level inline rules, as a paragraph is.
    {
        const keys = Object.keys(Prism.languages.carve);
        Prism.languages.carve['definition-list'].inside = Object.assign(
            {},
            Prism.languages.carve['definition-list'].inside,
            pick(['abbreviation-definition', 'comment'].concat(keys.slice(keys.indexOf('math'))))
        );
    }

    // A `+` behind a quote prefix reads the quoted lines above it at the same
    // prefix (group 1): a lone `+` as at the top level, a `+ ... |` line only
    // directly under a quoted row. Ahead of the quote-line rule, which tokenizes
    // each line alone.
    {
        const quotePrefix = /^(?<![^\r\n])\uFEFF?[ \t]*>(?: ?>)*/m;
        Prism.languages.carve.blockquote.unshift({
            pattern: RegExp('^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?(?:> )+ *(?=' + relativePlusSource(1) + ')\\+[ \\t]*', 'm'),
            greedy: true,
            inside: {
                'punctuation': quotePrefix,
                'continuation-marker': { pattern: /\+/, inside: continuationInside },
            },
        }, {
            pattern: RegExp('^(?<![^\\r\\n])(?=[ \\t]*(?:>[ \\t]?)+[ \\t]*\\+[^\\r\\n]*\\|[ \\t]*$(?![^\\r\\n]))'
                + '(?<=(?<![^\\r\\n])[^\\r\\n>]*((?:>[ \\t]?)+)(?:' + plusListMarker + ' +)*(?!' + plusRowSeparator + ')' + plusRowLine + ')'
                + '[ \\t]*\\1[ \\t]*' + plusRowTail + '(?:(?:\\r\\n?|\\n)[ \\t]*\\1[ \\t]*' + plusRowTail + ')*', 'm'),
            greedy: true,
            inside: {
                'punctuation': quotePrefix,
                'table-continuation': {
                    pattern: /\+[^\r\n]*\|[ \t]*$(?![^\r\n])/m,
                    inside: Prism.languages.carve['table-continuation'].inside,
                },
            },
        });
    }

    Prism.languages.carve['glued-abbreviation-definition'].inside = Prism.languages.carve['abbreviation-definition'].inside;
    // A line block's lines are an inline run, multi-line spans included.
    {
        const keys = Object.keys(Prism.languages.carve);
        const lineBlock = Prism.languages.carve['line-block'];
        lineBlock.inside = Object.assign({ 'div-delimiter': lineBlock.inside['div-delimiter'] }, pick(['comment'].concat(keys.slice(keys.indexOf('math')))));
    }

    for (var markerFence of Prism.languages.carve['code-block-on-marker-line']) {
        markerFence.inside = Prism.languages.carve['code-block'].inside;
    }
    Prism.languages.carve['code-block-in-container'].inside = {
        'language': { pattern: /(^[ \t]*(?:`{3,}|~{3,}) ?)[A-Za-z0-9_+#.\/=-]+/, lookbehind: true, alias: 'class-name' },
        'punctuation': { pattern: /(^[ \t]*)(?:`{3,}|~{3,})/, lookbehind: true },
    };
    // A quoted code fence the rules above missed, read from the container
    // model (carve-grammars#871, #872).
    {
        const quote = Prism.languages.carve.blockquote;
        quote.splice(quote.length - 1, 0, {
            pattern: containerFenceMatcher(function (run) { return run.ch !== '%' && run.quoted; }),
            greedy: true,
            inside: quote.find(function (rule) { return rule.inside && rule.inside['code-block'] && !rule.inside.list; }).inside,
        });
    }

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


/** Carve 0.2 Prism grammar. Load Prism before this module. */

const Prism = globalThis.Prism;
if (Prism?.languages.carve) {
    let paragraphCacheSource;
    const paragraphCache = new Map();
    function inParagraph(source, offset) {
        if (source !== paragraphCacheSource) {
            paragraphCacheSource = source;
            paragraphCache.clear();
        }
        let end = offset;
        const visited = [];
        let result = false;
        while (end > 0) {
            if (paragraphCache.has(end)) {
                result = paragraphCache.get(end);
                break;
            }
            visited.push(end);
            if (source[end - 1] === '\n') {
                end--;
                if (source[end - 1] === '\r') end--;
            } else if (source[end - 1] === '\r') end--;
            const start = Math.max(source.lastIndexOf('\n', end - 1), source.lastIndexOf('\r', end - 1)) + 1;
            const line = source.slice(start, end).trim();
            if (!line) break;
            if (/^%%(?!%)(?![ \t]*#(?:region|endregion)\b)/.test(line)
                || /^(?:#{1,6}|={1,6}) +\S/.test(line)) {
                end = start;
                continue;
            }
            result = !/^\*{3,}$|^`{3,}|^\|.*\||^%%[ \t]*#(?:region|endregion)\b|^%{3,}/.test(line);
            break;
        }
        for (const position of visited) paragraphCache.set(position, result);
        return result;
    }
    const grammar = Prism.util.clone(Prism.languages.carve);
    const visited = new WeakSet();
    const removed = new Set(['underline', 'strike', 'table-separator', 'table-alignment', 'continuation-marker']);
    function visit(node) {
        if (!node || typeof node !== 'object' || visited.has(node)) return;
        visited.add(node);
        if (Array.isArray(node)) {
            node.forEach(visit);
            return;
        }
        for (const key of Object.keys(node)) {
            // 0.2 drops the glued `|=<` alignment; braced `{<}` keeps its own scope.
            if (removed.has(key) && !(key === 'table-alignment' && !Array.isArray(node[key]))) delete node[key];
            else if (node[key] instanceof RegExp) {
                const old = node[key];
                const source = old.source.replaceAll('~{3,}', '(?!)')
                    .replaceAll('(`|~)', '(`)')
                    .replaceAll('(?<=~)~', '(?!)');
                if (source !== old.source) node[key] = new RegExp(source, old.flags);
            }
            else if (key === 'highlight' && node[key]?.pattern) {
                node[key].pattern = /(?<!\\)\{=(?!=\})(?:[^\r\n]|\r?\n(?![ \t\r]*\r?\n)){1,4096}?=\}/;
                if (node[key].inside) delete node[key].inside.highlight;
                visit(node[key]);
            }
            else visit(node[key]);
        }
    }
    visit(grammar);
    function withoutTildeFence(pattern) {
        // Prism's clone keeps RegExp instances shared with the 0.1 grammar.
        const independent = new RegExp(pattern.source, pattern.flags);
        const originalExec = pattern.exec;
        independent.exec = function (source) {
            let match;
            while ((match = originalExec.call(this, source))) {
                const opener = match[0].split(/\r\n|\r|\n/, 1)[0];
                if (!/^[ \t]*(?:> ?)*~{3,}/.test(opener)) return match;
            }
            return null;
        };
        return independent;
    }
    grammar['code-block-in-container'].pattern = withoutTildeFence(grammar['code-block-in-container'].pattern);
    for (const rule of grammar.blockquote) {
        if (rule?.pattern?.source === '(?:)' && Object.hasOwn(rule.pattern, 'exec')) {
            rule.pattern = withoutTildeFence(rule.pattern);
        }
    }

    // C2-B-100: a block attribute run is one line in 0.2.
    const attributePattern = grammar.attributes[1].pattern;
    const singleLineAttributes = new RegExp(attributePattern.source, attributePattern.flags);
    const originalExec = attributePattern.exec;
    singleLineAttributes.exec = function (source) {
        let match;
        while ((match = originalExec.call(this, source))) {
            if (!/[\r\n]/.test(match[0])) return match;
            this.lastIndex = match.index + 1;
        }
        return null;
    };
    grammar.attributes[1].pattern = singleLineAttributes;
    for (const commentFence of grammar.comment.slice(1, 4)) {
        // C2-B-109, C2-B-110: the closer is a bare run of at least the opener's width.
        commentFence.pattern = new RegExp(commentFence.pattern.source.replace('[^\\r\\n]*$', '[ \\t]*$').replace('(?!%)[ \\t]*$', '%*[ \\t]*$'), commentFence.pattern.flags);
    }
    // A line comment in a line block is text (C2-B-135).
    for (const rule of [].concat(grammar['line-block'])) {
        rule.inside = { ...rule.inside, comment: rule.inside.comment.filter((entry) => !/%%\(\?!%\)/.test((entry.pattern || entry).source)) };
    }
    // C2-B-111: an unclosed comment block at column 0 runs to the end of the
    // document; a bare colon fence stands in for the end of an enclosing div.
    {
        const unterminated = grammar.comment.find((rule) => rule.pattern.source === '^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*%{3,}[^\\r\\n]*$(?![^\\r\\n])');
        // A run under a marker line that opened one closes that comment instead.
        unterminated.pattern = RegExp('^(?<![^\\r\\n])(?=\\uFEFF?%%%)(?<!^(?<![^\\r\\n])[ \\t]*(?:[-*+]|[0-9]+[.)]|:|\\[\\^[^\\]\\r\\n]+\\]:|(?:> ?)+)[ \\t]+%{3,}[ \\t]*(?:\\r\\n?|\\n))(?:(?<![\\s\\S])\\uFEFF)?(%{3,})(?!%)[^\\r\\n]*'
            + '(?![\\s\\S]*?(?:\\r\\n?|\\n)[ \\t]*\\1%*[ \\t]*$(?![^\\r\\n]))(?:(?:\\r\\n?|\\n)(?![ \\t]*:{3,}[ \\t]*$)[^\\r\\n]*)*'
            + '|' + unterminated.pattern.source, 'm');
    }

    // C2-B-152, C2-B-108, C2-B-171, C2-I-046.
    const lineStart = '^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*';
    // C2-B-040: an uppercase marker with a dot needs two spaces, a lowercase one needs one.
    const letterMarker = '(?:(?:[a-z]|[ivxlcdm]{2,9})\\.(?= \\S)|(?:[A-Z]|[IVXLCDM]{2,9})\\.(?= {2}\\S))';
    grammar['thematic-break'] = { pattern: new RegExp(lineStart + '\\*{3,}[ \\t]*$', 'm'), alias: 'punctuation' };
    grammar.table.inside['table-header'].pattern = /\|=(?=[ \t\{|<>?~]|$)/;
    const titlePattern = new RegExp(lineStart + '(?:#{1,6}|={1,6}) [ \\t]*\\S[^\\r\\n]*$', 'm');
    const titleScan = new RegExp(titlePattern.source, 'gm');
    // A heading is a label: it holds every line below it indented past its
    // marker by column, up to a blank line or an interrupter (C2-B-154, C2-B-234).
    const labelEnd = /^(?:`{3,}|:{3,}|%{3,}|%%[ \t]*#(?:region|endregion)\b|\|[^\r\n]*\||\*{3,}[ \t]*$)/;
    const columnOf = (lead) => {
        let column = 0;
        for (const ch of lead) column = ch === '\t' ? column + 4 - (column % 4) : column + 1;
        return column;
    };
    const labelLine = /(\r\n?|\n)([ \t]*)([^\r\n]*)/y;
    const commentOnly = /^%%(?!%)(?![ \t]*#(?:region|endregion)\b)/;
    titlePattern.exec = function (source) {
        titleScan.lastIndex = 0;
        let match;
        while ((match = titleScan.exec(source))) {
            if (inParagraph(source, match.index)) continue;
            const marker = columnOf(/^﻿?([ \t]*)/.exec(match[0])[1]);
            let end = match.index + match[0].length;
            let line;
            labelLine.lastIndex = end;
            while ((line = labelLine.exec(source)) && line[3]) {
                // A comment-only line is not seen, and is the heading's (C2-B-137, C2-B-138).
                if (commentOnly.test(line[3])) {
                    end = labelLine.lastIndex;
                    continue;
                }
                if (columnOf(line[2]) <= marker || labelEnd.test(line[3])) break;
                end = labelLine.lastIndex;
            }
            if (end === match.index + match[0].length) return match;
            const extended = [source.slice(match.index, end)];
            extended.index = match.index;
            extended.input = source;
            return extended;
        }
        return null;
    };
    grammar.title = {
        ...grammar.title,
        pattern: titlePattern,
        inside: {
            // A comment-only line inside the heading's lines.
            'comment-line': { pattern: /((?:\r\n?|\n)[ \t]*)%%(?!%)[^\r\n]*/, lookbehind: true, alias: 'comment' },
            ...grammar.title.inside,
            punctuation: /^(?<![^\r\n])\uFEFF?(?:#{1,6}|={1,6})/,
        },
    };
    const region = {
        pattern: new RegExp(lineStart + '%%[ \\t]*#(?:region[ \\t]+[A-Za-z_][A-Za-z_0-9-]*|endregion(?:[ \\t]+[A-Za-z_][A-Za-z_0-9-]*)?)[ \\t]*$', 'm'),
        greedy: true,
        alias: 'comment',
    };
    // C2-B-081, C2-B-236: a definition stands at column 0 outside every container and
    // is text below a paragraph line.
    const nested = new WeakSet();
    function dropNestedDefinitions(node) {
        if (!node || typeof node !== 'object' || nested.has(node) || node instanceof RegExp) return;
        nested.add(node);
        for (const [key, value] of Object.entries(node)) {
            if (key === 'inside' && value && typeof value === 'object') {
                delete value['reference-definition'];
                delete value['abbreviation-definition'];
                delete value['glued-abbreviation-definition'];
                delete value['snippet-definition'];
            }
            dropNestedDefinitions(value);
        }
    }
    dropNestedDefinitions(grammar);
    delete grammar['glued-abbreviation-definition'];
    // The lines a definition may stand under without continuing a paragraph:
    // other definitions and, above a snippet, an attribute line (C2-B-095).
    // A snippet run takes only valid markers and attribute lines with no id;
    // an attribute line with an id makes the line below a paragraph (#6865).
    const definitionLines = /^\uFEFF?(?:\[[^\]\r\n]+\]:|\*\[[A-Za-z0-9]+\]:)/;
    const snippetDefinitionLines = RegExp('^\\uFEFF?(?:\\[[^\\]\\r\\n]+\\]:|\\*\\[[A-Za-z0-9]+\\]:|' + grammar['snippet-definition'].head
        + '|\\{(?:"[^"\\r\\n]*"|\'[^\'\\r\\n]*\'|[^{}#"\'\\r\\n])*\\}[ \\t]*$)');
    const attributeLine = /^\uFEFF?\{[^\r\n]*\}[ \t]*$/;
    // The line a definition run is read under (C2-B-081). Comment-only and
    // attribute lines are passed over; a term line, with the description and
    // indented lines of its entry, is no paragraph text, so the paragraph check
    // reads above the entry: `:: t` then `[a]: /u` holds a definition, as do
    // `> :: t` and `- :: t`.
    const DEFINITION_SKIP = /^\uFEFF?(?:[ \t]*%%(?!%)(?![ \t]*#(?:region|endregion)\b)|\{[^\r\n]*\}[ \t]*$)/;
    const DEFINITION_MARKER = '(?:[-*+]|\\d{1,9}[.)]|(?:[a-z]|[ivxlcdm]+)[.)]|(?:[A-Z]|[IVXLCDM]+)\\)|(?:[A-Z]|[IVXLCDM]+)\\.(?= {2}))';
    const DEFINITION_TASK = '(?:[ \\t]+\\[[ xX\\-_>\\/!?]\\])?';
    const DEFINITION_TERM_LINE = RegExp('^\\uFEFF?[ \\t]*(?:(?:>|' + DEFINITION_MARKER + DEFINITION_TASK + ')[ \\t]+)*:: +\\S');
    const DEFINITION_DESCRIPTION_LINE = /^\uFEFF?[ \t]*(?:>[ \t]*)*: +\S/;
    const DEFINITION_HEADING_LINE = /^\uFEFF?(?:[ \t]*>)*[ \t]+(?:#{1,6}|={1,6}) +\S/;
    // A list marker line: group 1 its prefix up to the marker, groups 2-4 an ordinal.
    const DEFINITION_ITEM = '^(\\uFEFF?(?:[ \\t]*>)*[ \\t]*)(?:[-*+]|(\\d{1,9}|[a-z]|[ivxlcdm]+)[.)]|([A-Z]|[IVXLCDM]+)\\)|([A-Z]|[IVXLCDM]+)\\.(?= {2}))';
    const DEFINITION_MARKER_LINE = RegExp(DEFINITION_ITEM + '[ \\t]+\\S');
    // A marker line whose item opens with a term (group 5), a heading or a
    // comment-only line: no paragraph text.
    const DEFINITION_MARKER_BLOCK_LINE = RegExp(DEFINITION_ITEM + DEFINITION_TASK + '[ \\t]+(?:' + DEFINITION_MARKER + DEFINITION_TASK
        + '[ \\t]+)*(?:(::) +\\S|(?:#{1,6}|={1,6}) +\\S|%%(?!%)(?![ \\t]*#(?:region|endregion)\\b))');
    // The column of `line[index]`, a tab advancing to the next multiple of four.
    const definitionColumn = (line, index) => {
        let column = 0;
        for (let i = 0; i < index; i++) column = line[i] === '\t' ? column + 4 - column % 4 : column + 1;
        return column;
    };
    let definitionItemSource = null;
    const definitionItemVerdicts = new Map();
    function definitionReadAbove(source, start) {
        const lineBefore = (at) => {
            const end = source[at - 1] === '\n' && source[at - 2] === '\r' ? at - 2 : at - 1;
            const previous = Math.max(source.lastIndexOf('\n', end - 1), source.lastIndexOf('\r', end - 1)) + 1;
            return [previous, source.slice(previous, end)];
        };
        // The marker line holding the marker line read as `item` at `at` as a
        // sibling or child: the nearest unindented line above, at the same
        // quote depth. A nested ordered marker must be a first one, the only
        // kind that interrupts a paragraph.
        function parentItem(at, item) {
            // Columns count from the last quote marker.
            const column = item[1].replace(/^.*>/, '').length;
            const ordinal = item[2] ?? item[3] ?? item[4];
            for (let above = at; above > 0;) {
                const [previous, text] = lineBefore(above);
                const marker = DEFINITION_MARKER_LINE.exec(text);
                if (marker) {
                    if (marker[1].split('>').length !== item[1].split('>').length) return null;
                    const markerColumn = marker[1].replace(/^.*>/, '').length;
                    if (column >= markerColumn) {
                        return column === markerColumn || ordinal === undefined || /^(?:0*1|[aAiI])$/.test(ordinal) ? [previous, marker] : null;
                    }
                    // A deeper marker in an item further up is that item's
                    // content; one in no item is a sibling.
                    if (!parentItem(previous, marker)) return [previous, marker];
                } else if (!/^[ \t]+\S/.test(text)) return null;
                above = previous;
            }
            return null;
        }
        // Whether that marker line opens an item: its list holds it, and the
        // list's first item is no lazy text of a paragraph above (`p` over
        // `- a` over `  - :: t`). Verdicts are kept per input, so a long
        // list is read once.
        const opensItemUnder = (at, item) => {
            if (definitionItemSource !== source) {
                definitionItemSource = source;
                definitionItemVerdicts.clear();
            }
            const chain = [];
            let verdict = false;
            for (let parent = parentItem(at, item); parent; parent = parentItem(...parent)) {
                const [start] = parent;
                if (definitionItemVerdicts.has(start)) {
                    verdict = definitionItemVerdicts.get(start);
                    break;
                }
                chain.push(start);
                if (!inParagraph(source, start)) {
                    verdict = true;
                    break;
                }
            }
            for (const start of chain) definitionItemVerdicts.set(start, verdict);
            return verdict;
        };
        read: for (;;) {
            let top = start;
            while (top > 0) {
                const [previous, line] = lineBefore(top);
                if (!DEFINITION_SKIP.test(line)) break;
                top = previous;
            }
            let entry = top;
            let term = false;
            // The least indent of the lines between the run and its nearest
            // term, and whether one of them opens a list item.
            let indent = Infinity;
            let nested = false;
            // The topmost term line, and whether a description sits above it:
            // a description no term holds is paragraph text.
            let termStart = -1;
            let orphan = false;
            // The least indent of the lines between that term and the next
            // one up, which holds them only when they reach past its `::`.
            let between = Infinity;
            while (entry > 0) {
                const [previous, line] = lineBefore(entry);
                const item = DEFINITION_MARKER_BLOCK_LINE.exec(line);
                // A heading or comment-only line opening an item right above: the
                // run stands under an item.
                if (!term && item && item[5] === undefined && indent === Infinity) {
                    if (opensItemUnder(previous, item)) return 0;
                    // Otherwise the line holds the run as the lines above would.
                    start = previous;
                    continue read;
                }
                if (!term && indent === Infinity && !item && DEFINITION_HEADING_LINE.test(line)) {
                    // An indented heading, a block of the item above, reads the same.
                    start = previous;
                    continue read;
                }
                if (DEFINITION_TERM_LINE.test(line)) {
                    // A term holds only the lines indented past its `::`; a line
                    // short of it, a description too, is no part of it (#990).
                    // Under a term on a marker line, an indented marker that
                    // can interrupt it opens a nested list instead. An indented
                    // term that holds neither may sit in an enclosing one.
                    if (!term && (indent <= definitionColumn(line, line.indexOf('::')) || (nested && item?.[5]))) {
                        if (!/^[ \t]+\S/.test(line)) return top;
                        indent = Math.min(indent, definitionColumn(line, line.search(/\S/)));
                        entry = previous;
                        continue;
                    }
                    if (term && between <= definitionColumn(line, line.indexOf('::'))) return termStart;
                    term = true;
                    termStart = previous;
                    orphan = false;
                    between = Infinity;
                    // A term on a marker line opens an item: under item content
                    // the item stands, so nothing above holds the run; else the
                    // line holds the run as the lines above would (#990).
                    if (item?.[5]) {
                        if (opensItemUnder(previous, item)) return 0;
                        start = previous;
                        continue read;
                    }
                } else if (term && DEFINITION_DESCRIPTION_LINE.test(line)) orphan = true;
                else if (!/^[ \t]+\S/.test(line)) break;
                else if (term) between = Math.min(between, definitionColumn(line, line.search(/\S/)));
                else {
                    indent = Math.min(indent, definitionColumn(line, line.search(/\S/)));
                    const marker = DEFINITION_MARKER_LINE.exec(line);
                    const ordinal = marker && (marker[2] ?? marker[3] ?? marker[4]);
                    if (marker && (ordinal === undefined || /^(?:0*1|[aAiI])$/.test(ordinal))) nested = true;
                }
                entry = previous;
            }
            return orphan ? termStart : term ? entry : top;
        }
    }
    // Every line of a run of definitions shares the run's verdict, kept per
    // source so a long run is read once rather than once per line.
    let allowedSource = null;
    let allowedRuns = null;
    function definitionAllowed(source, offset, above = definitionLines) {
        if (source !== allowedSource) {
            allowedSource = source;
            allowedRuns = new Map();
        }
        if (!allowedRuns.has(above)) allowedRuns.set(above, new Map());
        const known = allowedRuns.get(above);
        const run = [];
        let start = offset;
        let allowed;
        for (;;) {
            if (known.has(start)) {
                allowed = known.get(start);
                break;
            }
            run.push(start);
            if (start === 0) break;
            const end = source[start - 1] === '\n' && source[start - 2] === '\r' ? start - 2 : start - 1;
            const previous = Math.max(source.lastIndexOf('\n', end - 1), source.lastIndexOf('\r', end - 1)) + 1;
            const line = source.slice(previous, end);
            if (!above.test(line)) {
                if (above === snippetDefinitionLines && attributeLine.test(line)) allowed = false;
                break;
            }
            start = previous;
        }
        if (allowed === undefined) allowed = !inParagraph(source, above === definitionLines ? definitionReadAbove(source, start) : start);
        for (const line of run) known.set(line, allowed);
        return allowed;
    }
    for (const name of ['reference-definition', 'abbreviation-definition', 'snippet-definition']) {
        const pattern = grammar[name].pattern;
        const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
        const scan = new RegExp(pattern.source, flags);
        const atColumnZero = new RegExp(pattern.source, flags);
        const above = name === 'snippet-definition' ? snippetDefinitionLines : definitionLines;
        // Greedy, so Prism scans the whole text and a marker before the
        // definition stays visible.
        atColumnZero.exec = function (source) {
            scan.lastIndex = this.lastIndex;
            let match;
            while ((match = scan.exec(source))) {
                if (/^\uFEFF?[^ \t]/.test(match[0]) && definitionAllowed(source, match.index, above)) {
                    this.lastIndex = scan.lastIndex;
                    return match;
                }
            }
            this.lastIndex = 0;
            return null;
        };
        grammar[name] = { ...grammar[name], pattern: atColumnZero, greedy: true };
    }
    // A heading on a list marker line (`- # T`, `1. ## T`, carve-grammars#945):
    // after 'list', the rest of the line is a fragment that starts at the hashes.
    // Markers 'list' leaves (0.2 letter markers, C2-B-040) go first, so
    // `1. a. # T` and `> a. # T` reach it too (carve-grammars#947).
    {
        const glued = grammar.list[0].inside.attributes;
        const nestedMarkers = '(?:(?:[-*]|[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)\\)|(?:[a-z]|[ivxlcdm]{2,9})\\.'
            + '|(?:[A-Z]|[IVXLCDM]{2,9})\\.(?=(?:' + glued.pattern.source + ')? {2}))(?:' + glued.pattern.source + ')? +)+(?=\\S)';
        const titleOnMarkerLine = {
            pattern: /^(?<![\s\S])(?:#{1,6}|={1,6}) [ \t]*\S[^\r\n]*$/m,
            alias: ['title', 'important'],
            inside: grammar.title.inside,
        };
        const entries = Object.entries(grammar);
        entries.splice(entries.findIndex(([key]) => key === 'list') + 1, 0,
            ['nested-list', { pattern: RegExp('^(?<![\\s\\S])' + nestedMarkers, 'm'), alias: 'punctuation', inside: { attributes: glued } }],
            ['title-on-marker-line', titleOnMarkerLine]);
        for (const key of Object.keys(grammar)) delete grammar[key];
        Object.assign(grammar, Object.fromEntries(entries));
        // The same inside a quote (`> - # T`, `> - > x`): after the quoted
        // line's 'list', the fragment starts at the content.
        for (const rule of grammar.blockquote) {
            const inside = rule.inside;
            if (!inside?.list || !inside.title) continue;
            const keys = Object.entries(inside);
            keys.splice(keys.findIndex(([key]) => key === 'list') + 1, 0,
                ['nested-list', { pattern: RegExp('^(?<![\\s\\S])[ \\t]*' + nestedMarkers, 'm'), alias: 'punctuation', inside: { attributes: glued } }],
                ['title-on-marker-line', titleOnMarkerLine],
                ['quote-on-marker-line', { pattern: /^(?<![\s\S])>(?: >)*(?= |$(?![^\r\n]))/m, alias: 'punctuation' }]);
            for (const key of Object.keys(inside)) delete inside[key];
            Object.assign(inside, Object.fromEntries(keys));
        }
    }
    Prism.languages.carve = {
        'region-marker': region,
        'letter-list-marker': { pattern: new RegExp(lineStart + letterMarker, 'm'), alias: 'bullet' },
        // Ahead of the greedy comment rule, so a heading spans a comment-only
        // line (C2-B-154); its own inside scopes the comment.
        'title': grammar.title,
        ...grammar,
    };
    // A typed opener after line 1 opens a top-level metadata block when a blank
    // line, or attribute lines that follow one or start on line 1, stand
    // directly above it (C2-B-232, C2-B-233). Bare `---` stays line-1 only
    // (C2-B-161). Ordered after the fence rules, whose greedy tokens keep an
    // opener inside a fence or a div body as their own content.
    {
        const carve = Prism.languages.carve;
        const attributes = String.raw`(?:\{[^{}\r\n]*\}[ \t]*)+(?:\r\n?|\n)`;
        const later = String.raw`(?<![^\r\n])(?=---)(?<=(?:^|\r\n?|\n)[ \t]*(?:\r\n?|\n)(?:${attributes})*|^\uFEFF?(?:${attributes})+)`;
        const lineOne = String.raw`^(?<![^\r\n])\uFEFF?`;
        const metadata = carve['front-matter'].map((rule) => {
            const source = rule.pattern.source;
            if (!source.startsWith(lineOne)) throw new Error('front-matter opener anchor moved');
            const format = source.slice(lineOne.length).replace(/^---\(\?: \?\(\?:yaml\|yml\)\)\?/, '--- ?(?:yaml|yml)');
            return Object.assign({}, rule, { pattern: RegExp(later + format, rule.pattern.flags) });
        });
        const keys = Object.keys(carve);
        const rest = keys.slice(keys.indexOf('code-block-in-container') + 1).map((key) => [key, carve[key]]);
        for (const [key] of rest) delete carve[key];
        carve['metadata-block'] = metadata;
        for (const [key, value] of rest) carve[key] = value;
    }
    /*
     * A bare run's opener is tried only when a possible closer follows it in
     * its paragraph. `closerAhead` asks the same, but from every opener: a
     * paragraph of openers with no closer, such as a run of `[a]: /u`
     * definitions, paid a scan of up to 8192 characters per `/` (#989). Here
     * one pass per input lists the candidates: the delimiter after a
     * non-space character, or before a `}`. No atom of a run crosses a blank
     * line, so a candidate past one cannot close it.
     */
    function withCloserInParagraph(pattern, delimiter) {
        var probe = RegExp(pattern.source, pattern.flags.replace('g', '') + 'y');
        var gated = RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
        var memo = { source: null, next: null };
        // next[i]: the first candidate closer at or after i in i's paragraph, or -1.
        var candidates = function (source) {
            if (memo.source === source) return memo.next;
            var next = new Int32Array(source.length + 1).fill(-1);
            var lineEnd = source.length;
            var pending = -1;
            for (var i = source.length - 1; i >= 0; i--) {
                var c = source.charAt(i);
                if (c === '\n' || c === '\r') {
                    // The `\r` of a CRLF ends the line its `\n` already read.
                    if (!(c === '\r' && source.charAt(i + 1) === '\n') && /^[ \t]*$/.test(source.slice(i + 1, lineEnd))) pending = -1;
                    lineEnd = i;
                } else if (c === delimiter && (/\S/.test(source.charAt(i - 1)) || source.charAt(i + 1) === '}')) {
                    pending = i;
                }
                next[i] = pending;
            }
            memo = { source: source, next: next };
            return next;
        };
        gated.exec = function (source) {
            var next = candidates(source);
            var from = this.lastIndex;
            for (var at = source.indexOf(delimiter, from); at !== -1; at = source.indexOf(delimiter, at + 1)) {
                // A braced form (`{=x=}`) has no flank rule; try it as it stands.
                if (source.charAt(at - 1) !== '{' && (at + 1 > source.length || next[at + 1] === -1)) continue;
                // A match starts at its first delimiter or one character before it.
                for (var start = Math.max(from, at - 1); start <= at; start++) {
                    probe.lastIndex = start;
                    var match = probe.exec(source);
                    if (match) {
                        this.lastIndex = match.index + match[0].length;
                        return match;
                    }
                }
            }
            this.lastIndex = 0;
            return null;
        };
        return gated;
    }
    // Retries a rule's match one character on while `reject` refuses it.
    const gateRule = (rule, reject) => {
        const pattern = rule.pattern;
        const plain = !Object.hasOwn(pattern, 'exec');
        const gated = RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
        gated.exec = function (source) {
            const runner = plain ? this : pattern;
            if (!plain) pattern.lastIndex = this.lastIndex;
            let match;
            while ((match = (plain ? RegExp.prototype.exec : pattern.exec).call(runner, source))) {
                const start = match.index + (rule.lookbehind && match[1] ? match[1].length : 0);
                if (!reject(source, start, match.index + match[0].length)) break;
                runner.lastIndex = match.index + 1;
            }
            if (!plain) this.lastIndex = pattern.lastIndex;
            return match;
        };
        rule.pattern = gated;
    };
    const visitRules = (grammar, names, apply) => {
        const seen = new Set();
        const visit = (set) => {
            if (!set || typeof set !== 'object' || seen.has(set)) return;
            seen.add(set);
            for (const [name, entry] of Object.entries(set)) {
                for (const rule of [].concat(entry)) {
                    if (!rule || typeof rule !== 'object') continue;
                    if (names.has(name) && rule.pattern instanceof RegExp && !seen.has(rule)) {
                        seen.add(rule);
                        apply(rule, name);
                    }
                    visit(rule.inside);
                }
            }
        };
        visit(grammar);
    };
    // C2-I-024: a line comment takes every closer on its line, so a form whose
    // closing line holds a comment ahead of the closer stays open there.
    {
        const span = '(?<!`)(`{1,16})(?!`)(?:[^\\r\\n`]|(?!(?<!`)\\1(?!`))`)*(?<!`)\\1(?!`)';
        const lone = '(?<!`)(`{1,16})(?!`)(?![^\\r\\n]*?(?<!`)\\2(?!`))';
        const commentOnLine = RegExp('^(?:[ \\t>]*%%|(?:[^\\r\\n`\\\\]|\\\\[^\\r\\n]|' + span + '|' + lone + ')*?[ \\t]%%)');
        const bracketEnd = (text, from) => {
            let depth = 0;
            for (let i = from; i < text.length; i++) {
                if (text[i] === '\\') i++;
                else if (text[i] === '[') depth++;
                else if (text[i] === ']' && --depth === 0) return i;
            }
            return text.length;
        };
        const takenOnLastLine = (text) => commentOnLine.test(text.slice(Math.max(text.lastIndexOf('\n'), text.lastIndexOf('\r')) + 1));
        // The label of a link or span is inline content; an image's alt text and a link's destination are not.
        const labelled = { url: true, span: true, extension: true, image: false, 'reference-image': false };
        const taken = (text, name) => {
            if (!(name in labelled)) return takenOnLastLine(text);
            const first = bracketEnd(text, text.indexOf('['));
            if (labelled[name] && takenOnLastLine(text.slice(0, first))) return true;
            return text[first + 1] === '[' && takenOnLastLine(text.slice(first + 1, bracketEnd(text, first + 1)));
        };
        const names = new Set([...Object.keys(labelled), 'bold', 'italic', 'bold-italic', 'forced-bold', 'forced-italic',
            'forced-underline', 'forced-strike', 'underline', 'strike', 'highlight', 'superscript', 'subscript', 'inline-footnote',
            'inserted', 'deleted']);
        // A comment on an earlier line of a form that closes later stays inside it.
        const lineComment = { pattern: /((?:\r\n?|\n)[ \t>]*|[ \t])%%[^\r\n]*/, lookbehind: true, alias: 'comment' };
        const withLineComment = (set) => {
            if ('line-comment' in set) return;
            const entries = Object.entries(set);
            const at = entries.findIndex(([key]) => key === 'code');
            entries.splice(at === -1 ? entries.length : at + 1, 0, ['line-comment', lineComment]);
            for (const key of Object.keys(set)) delete set[key];
            Object.assign(set, Object.fromEntries(entries));
        };
        // After the 0.2 pass above, which rebuilds these patterns.
        const bareDelimiters = { bold: '*', italic: '/' };
        visitRules(Prism.languages.carve, new Set(Object.keys(bareDelimiters)), (rule, name) => {
            if (!Object.hasOwn(rule.pattern, 'exec')) rule.pattern = withCloserInParagraph(rule.pattern, bareDelimiters[name]);
        });
        visitRules(Prism.languages.carve, names, (rule, name) => {
            gateRule(rule, (source, start, end) => taken(source.slice(start, end), name));
            if (rule.inside && name !== 'image' && name !== 'reference-image') withLineComment(rule.inside);
        });
    }
    // C2-B-024: a quote marker, a term, an attribute line or an include directive
    // directly under paragraph text is a lazy line of that paragraph.
    {
        const lineStart = (source, at) => {
            while (at > 0 && source[at - 1] !== '\n' && source[at - 1] !== '\r') at--;
            return at;
        };
        const previousLine = (source, at) => (at === 0 ? -1 : lineStart(source, at - (source[at - 1] === '\n' && source[at - 2] === '\r' ? 2 : 1)));
        const lineText = (source, at) => {
            const end = /\r|\n|$/g;
            end.lastIndex = at;
            return source.slice(at, end.exec(source).index);
        };
        const blank = /^\uFEFF?[ \t]*(?:>[ \t]*)*$/;
        const commentOnly = /^\uFEFF?[ \t]*%%(?!%)(?![ \t]*#(?:region|endregion)\b)/;
        const boundary = /^\uFEFF?[ \t]*(?:#{1,6}(?: |$)|={1,6} |`{3,}|:{3,}|%{3,}|%%[ \t]*#(?:region|endregion)\b|(?:\*{3,}|-{3,}|_{3,})[ \t]*$|\|.*\||\{[^{}]*\}[ \t]*$|\[\^?[^\]]+\]:(?: |$)|\*\[[A-Za-z0-9]+\]:|\^ |:: |\+[ \t]*$)/;
        // The first line of the paragraph that the line at `at` would continue, or null.
        const paragraphHead = (source, at) => {
            let head = null;
            for (let line = previousLine(source, at), n = 0; line !== -1 && n < 64; line = previousLine(source, line), n++) {
                const text = lineText(source, line);
                if (commentOnly.test(text)) continue;
                if (blank.test(text) || boundary.test(text)) {
                    // An indented line under a heading, caption or term continues that label (C2-B-234).
                    if (head !== null && /^[ \t]/.test(head) && /^\uFEFF?[ \t]*(?:#{1,6} |={1,6} |\^ |:: )/.test(text)) return null;
                    break;
                }
                // Only an indented line can continue a label, so a column-0 one settles it.
                if (!/^[ \t]/.test(text)) return text;
                head = text;
            }
            return head;
        };
        // C2-B-024 lists the lines that never interrupt a paragraph.
        const lazy = (source, at, text) => {
            if (/^\uFEFF?: /.test(text)) {
                // A description line follows its term's reading.
                for (let line = previousLine(source, at), n = 0; line !== -1 && n < 64; line = previousLine(source, line), n++) {
                    const above = lineText(source, line);
                    if (blank.test(above)) return false;
                    if (/^\uFEFF?:: /.test(above)) return lazy(source, line, above);
                }
                return false;
            }
            const head = paragraphHead(source, at);
            // A term under a description starts the next entry.
            if (head === null || (/^\uFEFF?:: /.test(text) && /^\uFEFF?: /.test(head))) return false;
            if (/^\uFEFF?[ \t]*>/.test(text)) return !/^\uFEFF?[ \t]*>/.test(head);
            return true;
        };
        const lazyPattern = (candidate) => {
            const pattern = /(?:)/g;
            pattern.exec = function (source) {
                candidate.lastIndex = this.lastIndex;
                for (let match; (match = candidate.exec(source));) {
                    if (lazy(source, match.index, match[0])) {
                        this.lastIndex = candidate.lastIndex;
                        return match;
                    }
                }
                return null;
            };
            return pattern;
        };
        const carve = Prism.languages.carve;
        const inline = {
            'line-comment': { pattern: /(^|[ \t])%%[^\r\n]*/, lookbehind: true, alias: 'comment' },
            ...Object.fromEntries(Object.entries(carve.title.inside).filter(([key]) => key !== 'punctuation' && key !== 'comment-line')),
        };
        const entries = Object.entries(carve);
        entries.splice(entries.findIndex(([key]) => key === 'blockquote'), 0, ['lazy-line', [
            // An attribute line stays plain text: no block or span takes it.
            { pattern: lazyPattern(/^\uFEFF?[ \t]*\{(?=[ \t]*[.#:A-Za-z])[^{}\r\n]*\}[ \t]*$/gm), greedy: true },
            { pattern: lazyPattern(/^\uFEFF?[ \t]*(?:>(?= |$)|:: ?(?=\S)|: (?=\S)|\{\{ )[^\r\n]*/gm), greedy: true, inside: inline },
        ]]);
        for (const key of Object.keys(carve)) delete carve[key];
        Object.assign(carve, Object.fromEntries(entries));
    }
    // A quoted line and a table row hold the whole inline set a heading does (C2-B-147, C2-B-169).
    {
        const carve = Prism.languages.carve;
        const canon = Object.keys(carve.title.inside);
        const added = ['math', 'literal', 'raw-inline', 'image', 'reference-image', 'inline-footnote', 'footnote', 'citation',
            'cross-ref', 'url', 'span-empty-attrs', 'extension', 'span', 'critic-comment', 'inserted', 'deleted', 'tag',
            'mention', 'symbol', 'typography'];
        const complete = (set) => {
            if (!set || !('bold' in set)) return;
            const keys = Object.keys(set);
            for (const name of added) {
                if (keys.includes(name)) continue;
                const next = canon.slice(canon.indexOf(name) + 1).find((key) => keys.includes(key));
                keys.splice(next === undefined ? keys.length : keys.indexOf(next), 0, name);
            }
            const entries = keys.map((key) => [key, key in set ? set[key] : carve.title.inside[key]]);
            for (const key of Object.keys(set)) delete set[key];
            Object.assign(set, Object.fromEntries(entries));
        };
        for (const rule of carve.blockquote) complete(rule.inside);
        for (const rule of [].concat(carve.table, carve['table-continuation'])) complete(rule?.inside);
    }
    // Every inline set that reads a tag or emphasis reads an unattached block as one atom first.
    {
        const unattached = Prism.languages.carve['attributes-unattached'];
        const ahead = ['bold-italic', 'bold', 'italic', 'underline', 'strike', 'highlight', 'superscript', 'subscript', 'mention', 'tag'];
        const seen = new Set();
        const visit = (set) => {
            if (!set || typeof set !== 'object' || seen.has(set)) return;
            seen.add(set);
            for (const entry of Object.values(set)) {
                for (const rule of [].concat(entry)) if (rule && typeof rule === 'object' && rule.inside) visit(rule.inside);
            }
            const keys = Object.keys(set);
            const at = keys.findIndex((key) => ahead.includes(key));
            if (at === -1 || 'attributes-unattached' in set) return;
            const rest = keys.slice(at).map((key) => [key, set[key]]);
            for (const [key] of rest) delete set[key];
            set['attributes-unattached'] = unattached;
            for (const [key, value] of rest) set[key] = value;
        };
        visit(Prism.languages.carve);
    }
}

// C2-I-026: a braced comment counts as nothing for its neighbors. A bare
// delimiter glued through one to word characters on both sides, or a sigil
// glued to a word before it, forms nothing. The comment rule splits the text
// before the non-greedy emphasis rules run, so this greedy rule takes the
// delimiter first.
if (Prism?.languages.carve) {
    const comment = '\\{%(?:[^%]|%(?!\\})){0,4096}?%\\}';
    const word = '[\\p{L}\\p{N}]';
    const glued = {
        // Each branch starts on the delimiter: a greedy match cannot start in the comment token.
        pattern: RegExp('(?<=' + word + '(?:' + comment + ')+)(?:[*/_~=](?:' + comment + ')*(?=[\\p{L}\\p{N}])|[#@])'
            + '|(?<=' + word + ')[*/_~=](?:' + comment + ')+(?=[\\p{L}\\p{N}])', 'u'),
        greedy: true,
        inside: {},
    };
    // A quoted line holds its braced comments, also one running over a line break, so the comment does not end the quote.
    const quote = Prism.languages.carve.blockquote;
    const line = quote[quote.length - 1];
    quote.splice(quote.length - 1, 0, {
        pattern: RegExp(line.pattern.source.replace('>(?: [^\\r\\n]*)?$', '>(?= [^\\r\\n]*\\{%)(?: (?:' + comment + '|[^\\r\\n])*)?$'), 'm'),
        greedy: true,
        inside: Object.assign({ 'punctuation': line.inside.punctuation, 'comment': Prism.languages.carve.comment }, line.inside),
    });
    const seen = new WeakSet();
    const visit = (grammar) => {
        if (!grammar || typeof grammar !== 'object' || seen.has(grammar)) return;
        seen.add(grammar);
        const entries = Object.entries(grammar);
        for (const [, rules] of entries) {
            for (const rule of [].concat(rules)) {
                if (rule && rule.inside) visit(rule.inside);
            }
        }
        const braced = [].concat(grammar.comment ?? []).find((rule) => rule?.pattern?.source.includes('\\{%'));
        if (!braced || 'glued-delimiter' in grammar) return;
        glued.inside.comment = braced;
        const inline = entries.findIndex(([key]) => ['bold-italic', 'bold', 'italic', 'underline', 'strike', 'highlight', 'mention', 'tag'].includes(key));
        entries.splice(inline === -1 ? entries.findIndex(([key]) => key === 'comment') : inline, 0, ['glued-delimiter', glued]);
        for (const key of Object.keys(grammar)) delete grammar[key];
        Object.assign(grammar, Object.fromEntries(entries));
    };
    visit(Prism.languages.carve);
}

// Snippets (C2-B-236, C2-I-128): a definition's value is paragraph inline
// content, and every inline set reads a use ahead of the include directive or,
// without one, right after its verbatim and comment rules.
if (Prism?.languages.carve) {
    const carve = Prism.languages.carve;
    const definition = carve['snippet-definition'].inside;
    const paragraph = [].concat(carve['lazy-line']).find((rule) => rule.inside && 'bold' in rule.inside).inside;
    definition['snippet-value'].inside = paragraph;
    const blocks = [].concat(carve.attributes);
    for (const rule of definition.attributes) rule.inside = blocks[blocks.length - 1].inside;
    const verbatim = ['comment-line', 'line-comment', 'comment', 'math', 'literal', 'raw-inline', 'code'];
    const claimers = ['image', 'reference-image', 'inline-footnote', 'footnote', 'citation', 'cross-ref', 'url', 'span-empty-attrs',
        'extension', 'span', 'critic-comment', 'inserted', 'deleted', 'attributes', 'attributes-unattached', 'glued-delimiter', 'tag',
        'bold-italic', 'forced-bold', 'forced-italic', 'forced-underline', 'forced-strike', 'bold', 'italic', 'underline', 'strike',
        'highlight', 'superscript', 'subscript', 'mention', 'symbol', 'typography'];
    const rules = [['snippet-use', carve['snippet-use']], ['snippet-use-blocks', carve['snippet-use-blocks']]];
    const seen = new Set();
    const visit = (set) => {
        if (!set || typeof set !== 'object' || seen.has(set)) return;
        seen.add(set);
        for (const entry of Object.values(set)) {
            for (const rule of [].concat(entry)) if (rule && typeof rule === 'object' && rule.inside) visit(rule.inside);
        }
        if ('snippet-use' in set || !['include-directive', 'bold', 'code', 'url'].some((key) => key in set)) return;
        const keys = Object.keys(set);
        let at = keys.indexOf('include-directive');
        if (at === -1) {
            const first = keys.findIndex((key) => claimers.includes(key));
            const last = keys.reduce((found, key, i) => (verbatim.includes(key) ? i : found), -1);
            at = Math.max(first === -1 ? keys.length : first, last + 1);
        }
        const entries = keys.map((key) => [key, set[key]]);
        entries.splice(at, 0, ...rules);
        for (const key of keys) delete set[key];
        Object.assign(set, Object.fromEntries(entries));
    };
    visit(carve);
}

if (Prism?.languages.carve) {
    Prism.languages.crv = Prism.languages.carve;
    Prism.languages.carvemd = Prism.languages.carve;
}
