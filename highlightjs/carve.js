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
 * - ESM: `import carve from '@markup-carve/carve-grammars/highlightjs/carve.js'` (resolved to
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
 * INDENTED BLOCK OPENERS, and why this file differs from the TextMate grammar
 * in the same package (carve-grammars#138, #89, #71):
 *
 * Carve opens a block at column 0, or at an enclosing container's content
 * column - nowhere in between. ` # H`, ` > q`, ` *[A]: x` and an indented fence
 * are all paragraphs at document level, while the same four openers at a list
 * item's content column are real blocks. Telling those apart needs block
 * context, and highlight.js modes here are line-based: this grammar has no
 * container model, so it cannot ask the question.
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
 * marker and defeated every `begin` below that opens a block: a BOM-led heading
 * went unscoped, and a BOM-led fence was claimed by the inline code rule.
 *
 * The allowance is `(?:(?<![\s\S])\uFEFF)?`, and the assertion is the point.
 * highlight.js compiles these with the `m` flag, so a plain `^\uFEFF?` would admit
 * the mark at EVERY line start - and a mark that is not at offset 0 is an
 * ordinary zero-width character that opens nothing. Measured:
 * `# T\n\n\uFEFF- item\n` is a paragraph holding literal text in carve-rs and in
 * carve-php. Only carve-js reads it as a list, because JavaScript's own `\s`
 * class is Unicode White_Space plus U+FEFF (markup-carve/carve#806), and that is
 * the outlier. `(?<![\s\S])` is true only where nothing precedes.
 *
 * Only OPENERS carry it. A closer (the code, div and block-comment
 * `end`s) and a definition body line cannot be line 1, so they are untouched.
 * `LINE_COMMENT` needs nothing either, but for a reason worth naming: its
 * `(?<=\s)` already admits the mark, because JavaScript's `\s` holds U+FEFF.
 * That is the same quirk as above, working in this one rule's favour.
 *
 * The codepoint is always written as the escape `\uFEFF`. No file in this repo
 * holds a literal byte order mark: it is invisible, and an editor or a
 * normalizing filter can drop the one character a rule is about.
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
    // The payload is STRICT (spec PART 9 S14): a class/id/key is the grammar's
    // `identifier` production, a letter or `_` then letters, digits, `_` and `-`.
    // So `{2=v}`, `{-a}` and `{a:b}` stay literal text rather than scoping as an
    // attribute block, and one invalid name is enough to leave the whole run
    // literal. A colon belongs to the VALUE grammar, not the key: an unquoted
    // value may contain dots and colons, so `{k=a:b}` is a real attribute block.
    const ATTR_ITEM = /(?::(?:[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8})*)?|[.#][A-Za-z_][\w-]*|[A-Za-z_][\w-]*(?:=(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|[^\s"'{}]+))?)/.source;
    // A LIST MARKER MAY BE GLUED TO AN ATTRIBUTE BLOCK (`-{#x} item`), so the
    // marker rules have to look past a whole block to decide there is a marker
    // at all. That lookahead spelled the item alternation out again, and the
    // copies went stale: when the language attribute (`{:fr}`) joined
    // `ATTR_ITEM`, `-{:fr} item` stopped colouring its `-` as a bullet while
    // `-{.c} item` still did. Built from `ATTR_ITEM` now, so one spelling of
    // what an attribute item is serves the attribute rule and both marker
    // rules, and they cannot drift apart again.
    const GLUED_ATTR_BLOCK =
        '(?=\\{\\s*(?:' + ATTR_ITEM + '(?:\\s+' + ATTR_ITEM + ')*\\s*)?\\}[ \\t]+[^ \\t\\n])';
    // BALANCED BRACKET TEXT - the body of a link label, an image alt text and a
    // bracketed span. See the long note on Prism's `bracketText`, which this
    // mirrors; the short version is that the spec closes a label at the
    // MATCHING `]` and the scan is escape-aware, while a `[^\]]*` body closes
    // at the FIRST `]`. That left `![t[z]](/i.png)` - an image - entirely
    // unscoped, and scoped the unbalanced `[t[z](/u)` from the outer `[` where
    // the engine reads `[t` as prose (carve-grammars#226).
    //
    // The nesting is unrolled to FOUR levels because a regex cannot count;
    // deeper stays unscoped, which is what every depth did before.
    //
    // Every quantifier here is BOUNDED, for the reason Prism's copy gives: an
    // unbounded body is a scan to the end of the document at every `[` the
    // tokenizer tries, and it tries each position.
    const BRACKET_CHAR = /(?:[^\[\]\\]|\\[\s\S])/.source;
    const BRACKET_SCAN = '{0,512}';
    let BRACKET_TEXT = BRACKET_CHAR + BRACKET_SCAN;
    for (let depth = 0; depth < 3; depth++) {
        BRACKET_TEXT = '(?:' + BRACKET_CHAR + '|\\[' + BRACKET_TEXT + '\\])' + BRACKET_SCAN;
    }
    // The same body, required to be non-empty, for the rules that reject `[]`.
    const BRACKET_TEXT_NONEMPTY = '(?!\\])' + BRACKET_TEXT;
    /**
     * A begin/end mode opens its span the moment `begin` matches, whether or
     * not the closer ever arrives - so an unpartnered delimiter colors every
     * remaining character of the document. `:_[x]` is an inline extension, not
     * an underline, and it used to highlight the rest of the file.
     *
     * The lookahead requires the closer to exist before the paragraph ends.
     * The scan admits a non-newline OR a newline that is not followed by a
     * blank line, so a mark may still span lines the way the engine does
     * (`/multi<newline>line/` is one <em>) but cannot reach into the next
     * block. The two branches start on disjoint characters, so the run is
     * effectively deterministic rather than a backtracking hazard.
     *
     * @param {RegExp} opener - the delimiter that starts the span.
     * @param {RegExp} closer - the delimiter that ends it.
     * @returns {object} the mode's `begin`/`end` pair, so the closer used by
     *   the guard and the closer used by the mode cannot drift apart.
     */
    const paired = (opener, closer) => {
        // The guard used to be written `(?:[^\n]|\n(?!\s*\n))*?` - unbounded,
        // lazy, and free to cross newlines. Proving there is NO closer therefore
        // cost a whole paragraph from every position, and a document made of
        // openers went quadratic in its own length: 400-750 ms on 24 KB across
        // all eight braced modes, x3.3-6.9 per doubling (carve-grammars#300),
        // in a file the package ships. THIRTEEN modes pay it, so this is one
        // site rather than thirteen fixes.
        //
        // Unrolled the way `prism/carve.js` unrolls its brace rules: a run that
        // stops at the closer's own first character, then a bounded repetition
        // of that character NOT starting a closer, plus another such run. Both
        // pieces are DERIVED from the `closer` argument - `lead` is its first
        // (possibly escaped) character, `rest` is everything after it - for the
        // same reason the guard is generated from the closer at all: the
        // tempering and the mode's `end` cannot drift apart.
        //
        // `lead` followed by a negative lookahead on `rest` reads "this
        // delimiter is not the closer". Where `rest` is itself negative
        // (`/=(?![=\w])/`) the double negation means "followed by a word
        // character", which is right - and at end of input it correctly refuses,
        // because there the closer WOULD match.
        //
        // Same language as before within the bounds. Past them the guard fails
        // and the mode does not open, which is the safe direction: an unopened
        // span colors nothing, where an unclosed one used to color the rest of
        // the document.
        const [, lead, rest] = /^(\\[\s\S]|[\s\S])([\s\S]*)$/.exec(closer.source);
        const literal = lead.length === 2 ? lead[1] : lead;
        const inClass = /[\\\]^-]/.test(literal) ? '\\' + literal : literal;
        const run = `(?:[^${inClass}\\n]|\\n(?!\\s*\\n)){0,4096}`;
        const guard = `${run}(?:${lead}(?!${rest})${run}){0,32}${closer.source}`;
        return {
            begin: new RegExp(`${opener.source}(?=${guard})`),
            end: closer,
        };
    };

    // Forced intraword family (PART 9 S22). Content may contain the delimiter
    // (`{/a/b/}` is <em>a/b</em>), so the run ends at the closing `X}`. These
    // must precede ATTRIBUTE, or `{_path_}` reads as a boolean attribute.
    const FORCED_STRONG = { className: 'strong', ...paired(/\{\*(?=\S)/, /\*\}/), relevance: 5 };
    const FORCED_EMPHASIS = { className: 'emphasis', ...paired(/\{\/(?=\S)/, /\/\}/), relevance: 5 };
    const FORCED_UNDERLINE = { className: 'emphasis', ...paired(/\{_(?=\S)/, /_\}/), relevance: 5 };
    // The `(?!...~>)` is what keeps a substitution (`{~old~>new~}`) out of the
    // strikethrough rule. It used to be spelled `(?!.*~>)`, a greedy scan of the
    // whole rest of the line that then backtracked over it looking for the
    // arrow - so on a line with no `>` at all it cost the line from every
    // position, which is the other half of why `{~` stayed superlinear after
    // the guard was bounded. Same unrolling as everywhere else here.
    const NO_ARROW_AHEAD = '(?![^~\\n]{0,4096}(?:~(?!>)[^~\\n]{0,4096}){0,32}~>)';
    const FORCED_STRIKE = {
        className: 'deletion',
        ...paired(new RegExp(`\\{~(?=\\S)${NO_ARROW_AHEAD}`), /~\}/),
        relevance: 5,
    };

    /*
     * The FIFTH braced spelling, `{=x=}` (grammar.ebnf `forced_highlight`).
     *
     * Its four siblings above each have a mode; this one did not, and the row
     * read UNMEASURED because a name cannot tell `{=x=}` from `=x=` and the
     * only name in the vocabulary was HIGHLIGHT's. Reading the opener answers
     * it: HIGHLIGHT is `(?<![=\w])=(?=\S)`, the BARE rule, with no braced
     * alternative - it claims the inner `=` of `{=x=}` as a side effect and
     * leaves the braces unscoped, which is not the construct being recognized.
     *
     * `paired()` is what keeps this off a raw-inline format marker: `{=html}`
     * has no `=}` ahead of it, so the guard fails and the mode does not open,
     * leaving RAW_FORMAT the `{=[a-zA-Z]+\}` it already matches.
     *
     * The empty pair `{==}` still opens here, as `{**}` does on FORCED_STRONG
     * and `{//}` on FORCED_EMPHASIS - carve#1447 makes it literal text, and
     * this mode matches its siblings rather than fixing that on one of five.
     */
    const FORCED_HIGHLIGHT = { className: 'addition', ...paired(/\{=(?=\S)/, /=\}/), relevance: 5 };

    const ATTRIBUTE_EMPTY = {
        className: 'attr',
        // Valid only glued to a preceding `]` (`[x]{}`); a bare `{}` is literal.
        begin: /(?<=\])\{\s*\}/,
        relevance: 5,
    };
    const ATTRIBUTE = {
        className: 'attr',
        // TWO ROLES, ONE TOKEN - see the note on Prism's `attributes`. A standalone
        // attribute LINE may span lines; an inline block glued to a construct may
        // not, so `*x*{.a` + newline + `.b}` used to colour as a block where every
        // engine renders prose (#164). The line-anchored branch is a lookbehind so
        // the match still starts at the `{`.
        begin: new RegExp(
            '(?<=(?:^|\\n)[ \\t]*)\\{\\s*' + ATTR_ITEM + '(?:\\s+' + ATTR_ITEM + ')*\\s*\\}'
            + '|\\{[ \\t]*' + ATTR_ITEM + '(?:[ \\t]+' + ATTR_ITEM + ')*[ \\t]*\\}',
        ),
        relevance: 5,
    };

    // Front matter is valid only at byte offset zero. Unlike the historical
    // `^---$` rule, the negative lookbehind below cannot match a thematic break
    // on a later line even though highlight.js compiles modes with `m`.
    const FRONT_MATTER = {
        className: 'meta',
        begin: /^(?<![\s\S])\uFEFF?---(?:[A-Za-z0-9_-]+| [A-Za-z0-9_-]+)?[ \t]*$/,
        end: /^---[ \t]*$/,
        relevance: 10,
        contains: [
            { className: 'symbol', begin: /^[A-Za-z_][\w-]*(?=[ \t]*:)/ },
            { className: 'punctuation', begin: /---/ },
        ],
    };

    // Headings: # to ######
    const HEADING = {
        className: 'section',
        // Anchored `^[ \t]*` on purpose - no container model here, see the
        // indented-block-openers note in the module docblock (carve-grammars#138).
        begin: /^(?:(?<![\s\S])\uFEFF)?[ \t]*#{1,6} (?![ \t]*$)/,
        end: /$/,
        relevance: 10,
    };

    // Emphasis (Carve): /text/ - the begin guard avoids URLs and paths
    // (a/b, ://); the end is a closing slash not followed by word char/slash.
    const EMPHASIS = {
        className: 'emphasis',
        ...paired(/(?<![\w:/])\/(?=\S)/, /\/(?![\w/])/),
        relevance: 0,
    };

    // Underline (Carve): _text_ - not in the middle of words
    const UNDERLINE = {
        className: 'emphasis',
        ...paired(/(?<!\w)_(?!\s)/, /_(?!\w)/),
        relevance: 0,
    };

    /*
     * The COMBINED two-character opener `/` + `*` (grammar.ebnf
     * `bold_italic`): the boundary guards apply to the outer slash, and the
     * inner star is part of the token rather than separately guarded.
     *
     * EMPHASIS below already matched the run - its opener is `/` followed by a
     * non-space, and a star is a non-space - so a bold-italic run was scoped
     * `emphasis` - italic and not bold - by the rule for the other construct.
     * That is the shape the ledger calls a row seen wrong rather than a row
     * not covered, and it is why this mode is listed BEFORE both EMPHASIS and
     * STRONG: the two openers begin at the SAME offset, so mode order is what
     * decides.
     *
     * ONE className, because highlight.js has a fixed palette of about twenty
     * theme words and no combined bold-italic among them. `strong` is the half
     * chosen, and it is the half that was missing: the accidental reading was
     * already italic. Prism spells the same compromise `alias: 'important'` and
     * the TextMate family spells it `markup.bold.italic.carve`, one scope each.
     */
    const BOLD_ITALIC = {
        className: 'strong',
        // The body is non-space at BOTH ends. It was guarded only at the
        // opener, so `a /*b */ c` came back one combined run where the engine
        // renders `<em>*b *</em>` - an italic run holding literal asterisks
        // (carve-grammars#375). A fixed-width lookbehind, so the bounded
        // repetition that keeps this rule linear is untouched.
        begin: /\/\*(?=\S)(?:[^*\n]|\*(?!\/)|\n(?!\s*\n)){1,4096}(?<=\S)\*\//,
        relevance: 5,
    };

    // Strong: *text* - not in the middle of words, can contain emphasis.
    // Excludes *[ which is abbreviation-definition syntax.
    const STRONG = {
        className: 'strong',
        ...paired(/(?<!\w)\*(?![\s\[])/, /\*(?!\w)/),
        relevance: 0,
        contains: [EMPHASIS, UNDERLINE],
    };

    /*
     * Highlight (Carve): =text= (single-char; intraword as {=text=})
     *
     * A BARE `=` THAT BEGINS OR ENDS A SMART-TYPOGRAPHY PATTERN IS NOT AN
     * OPENER (grammar.ebnf, Inline parsing precedence: "a delimiter that
     * begins a multi-char smart-typography pattern: `=>` is the arrow, never a
     * highlight opener - the pattern is consumed first"). Corpus 386's third
     * paragraph is the shape it cost - `key => value stays literal, and p <= q
     * is a comparison` renders with no mark, and the `=` of `=>` reached the
     * `=` of `<=` and scoped the sentence (carve-grammars#325). The guard is
     * a LOOKAHEAD ONLY: not BEFORE `>`, which is `=>` and the tail of `==>`.
     *
     * NOTHING IS ADDED TO THE LOOKBEHIND, and that was measured rather than
     * assumed. `<`, `>` and `!` were each put there and reverted: highlight.js
     * resolves its compiled alternation by POSITION, and TYPOGRAPHY carries
     * `<=`, `>=` and `!=`, so on `a !=b c= d` the comparison starts one column
     * before this rule's `=` and takes it. No context reached from this
     * grammar changed its answer, in a container or out of one, so those three
     * characters would be guard nobody can see working. The Prism grammar does
     * need them: Prism applies TOKENS IN ORDER rather than by position, and
     * 'highlight' is declared before 'typography' there.
     *
     * `=` IS IN THE OPENER'S OWN LOOKAHEAD HERE and not in the other two
     * grammars, because those spell the body as `[^=\n]+?` and get the same
     * refusal from the content class. `paired` derives its guard from the
     * CLOSER, so nothing here requires the body to be non-empty: `x == y`
     * opened and closed on the two `=` of a doubled run and scoped an empty
     * highlight over a line the engine renders literally.
     *
     * THE CLOSER IS DELIBERATELY NOT GUARDED, and the asymmetry is the
     * engine's: once a highlight is open the closer wins over the pattern, so
     * `x =y z<= w` marks `y z<` and `x =y z=> w` marks `y z`.
     *
     * ONE SHAPE IT COSTS: `<https://e.example>=hi=`, where the `>` closes an
     * autolink rather than opening a comparison. A fixed-width lookbehind
     * cannot tell the two apart, and this takes the under-colouring side of
     * that trade - the ticket's own reasoning, since a false highlight claims
     * the document holds a construct it does not.
     */
    const HIGHLIGHT = {
        className: 'addition',
        ...paired(/(?<![=\w])=(?=\S)(?![>=])/, /=(?![=\w])/),
        relevance: 3,
    };

    // Insert: {+text+}
    const INSERT = {
        className: 'addition',
        ...paired(/\{\+/, /\+\}/),
        relevance: 5,
    };

    // Delete: {-text-}
    //
    // THE BODY IS NOT EMPTY. `{--}` is a braced EN DASH, not an empty deletion -
    // the engine renders `a {--} b` as `a \u2013 b` - and this mode read it as
    // `{-` plus nothing plus `-}` (carve-grammars#378). One character is enough:
    // `{- -}`, `{---}` and `{----}` are all deletions.
    const DELETE = {
        className: 'deletion',
        ...paired(/\{-(?!-\})/, /-\}/),
        relevance: 5,
    };

    // Strikethrough (Carve): ~text~ (Djot uses ~ for subscript instead)
    const STRIKETHROUGH = {
        className: 'deletion',
        ...paired(/(?<!\w)~(?=\S)/, /~(?!\w)/),
        relevance: 2,
    };

    // Subscript (Carve): braced-only `{,text,}` - a bare `,` is literal text.
    const SUBSCRIPT = {
        className: 'built_in',
        ...paired(/\{,(?=\S)/, /,\}/),
        relevance: 3,
    };

    // Superscript (Carve): braced-only `{^text^}` - a bare `^` is literal text.
    const SUPERSCRIPT = {
        className: 'built_in',
        ...paired(/\{\^(?=\S)/, /\^\}/),
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
        /*
         * A PARAGRAPH BREAK ALSO ENDS THE SPAN.
         *
         * An unpartnered run has no closer to find, and a mode with no closer
         * ahead runs to END OF FILE - so `unclosed `code here`, a blank line,
         * and the rest of the document came back scoped as code. That is the
         * runaway carve-grammars#81 took out of every emphasis mode, still in
         * this one because a verbatim run has no `illegal` to trip on.
         *
         * The engine ends the run at the same place: an unpartnered run is a
         * code span reaching to the end of its PARAGRAPH, and the paragraph
         * stops at the blank line. So this is where the span stops rather than
         * where it is abandoned, and the text before the break keeps its
         * scope. `tests/unclosed-delimiter-test.js` drives it.
         *
         * AT A RUN OF ONE OR TWO ONLY, for the reason the Prism grammar bounds
         * its own unpartnered run the same way: a run of three or more is
         * fence-shaped, and a fence carried on a list marker (`- ```) lands in
         * THIS mode, because the block rule above is anchored at the start of
         * a line and cannot reach it. Such a block may legitimately hold a
         * blank line - corpus 75-list-nesting-and-looseness-5 is a fence whose
         * body is two paragraphs - so ending it at the break would put the
         * second half of its payload back in play.
         */
        // The `\r` is there so a CRLF document gets the same answer: a blank
        // line is `\r\n\r\n`, and without it the span ran past the break to
        // end of file on exactly the input this guard exists for.
        //
        // Named BREAK and not PARAGRAPH_BREAK: the construct ledger's probe reads
        // this file's UPPER_CASE constants as its vocabulary, and a constant
        // holding the word `paragraph` would seed `paragraph` as a rule this
        // grammar has (tests/construct-ledger-test.js).
        const BREAK = '\\n[ \\t\\r]*\\n';
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
            end: new RegExp(RUN + '|' + BREAK),
            'on:end': (m, resp) => {
                // The paragraph break is an end in its own right, not a
                // candidate closer, so it is never width-checked - but it only
                // ends a run too narrow to be a fence.
                if (!m[0].includes('`')) {
                    if (resp.data._fenceWidth >= 3) resp.ignoreMatch();

                    return;
                }
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
        begin: new RegExp('\\[' + BRACKET_TEXT + '\\]\\([^)]*\\)(\\{[^}]+\\})?'),
        relevance: 5,
    };

    // Autolinks: <https://...> or <mailto:...>
    const AUTOLINK = {
        className: 'link',
        begin: /<(?:https?:\/\/|mailto:)[^>]{1,2048}>/,
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
        begin: new RegExp('!\\[' + BRACKET_TEXT + '\\]\\([^)]*\\)(\\{[^}]+\\})?'),
        relevance: 5,
    };

    /*
     * Reference and COLLAPSED reference images: `![alt][ref]` and `![alt][]`.
     *
     * IMAGE above closes on `](`, so neither spelling matched it, and the row
     * they read against was REFERENCE_LINK - whose bracket pair DOES match
     * `[alt][ref]`, leaving the leading `!` unscoped and calling an image a
     * link. Prism carried the same defect on both image rows until
     * carve-grammars#307, under the same cause: a fold was recorded onto a rule
     * that cannot fire for the construct.
     *
     * ONE MODE FOR BOTH FORMS. The reference label is `[^\]\n]{0,512}`, and
     * the `{0,512}` accepts the EMPTY label, so the collapsed spelling is this
     * rule with nothing between its second pair of brackets - the fold
     * carve-grammars#318 recorded for vim-carve and sublime-carve, and the one
     * REFERENCE_LINK below already makes for the collapsed reference LINK. The
     * alt text may be empty as well (`![][r]` is an image, where `[][r]` is not
     * a link), so it takes BRACKET_TEXT rather than the non-empty body.
     */
    const REFERENCE_IMAGE = {
        className: 'link',
        begin: new RegExp('!\\[' + BRACKET_TEXT + '\\]\\[[^\\]\\n]{0,512}\\](\\{[^}]+\\})?'),
        relevance: 5,
    };

    // Reference links: [text][ref] with optional trailing attributes
    const REFERENCE_LINK = {
        className: 'link',
        begin: new RegExp('\\[' + BRACKET_TEXT_NONEMPTY + '\\]\\[[^\\]]*\\](\\{[^}]+\\})?'),
        relevance: 5,
    };

    // Spans with attributes: [text]{.class} or [text]{#id}
    const SPAN = {
        className: 'string',
        // Only the bracket run; the trailing `{...}` is left to ATTRIBUTE so it
        // scopes as an attribute block rather than vanishing into the span.
        begin: new RegExp('\\[' + BRACKET_TEXT_NONEMPTY + '\\](?=\\{)'),
        relevance: 5,
    };

    // Reference definitions: [ref]: url
    const REFERENCE_DEF = {
        className: 'symbol',
        begin: /^(?:(?<![\s\S])\uFEFF)?[ \t]*\[[^\]^\]]+\]:(?= )/,
        end: /$/,
        relevance: 10,
    };

    // Footnote references: [^note]
    const FOOTNOTE_REF = {
        className: 'symbol',
        begin: /\[\^[^\]]{1,512}\]/,
        relevance: 5,
    };

    // Inline footnote: ^[content] (corpus 23-inline-footnotes). The caret
    // leads, which is what separates it from the reference above.
    const INLINE_FOOTNOTE = {
        className: 'symbol',
        begin: /\^\[[^\]\n]{0,512}\]/,
        relevance: 5,
    };

    // Definition-list term: `:: term` (grammar.ebnf `definition_term`).
    // Reused as a nested mode inside DEFINITION_LIST_ENTRY below - not
    // registered as a top-level mode, so it only ever colors a term that
    // DEFINITION_LIST_ENTRY has already decided is inside a real entry.
    // `:::` opens a div and DIV_BLOCK_START runs first, so the two do not
    // compete.
    const DEFINITION_TERM_MARKER = {
        className: 'title',
        begin: /^(?:(?<![\s\S])\uFEFF)?[ \t]*:: (?![ \t]*$)/,
        end: /$/,
        relevance: 5,
    };

    // An OTHER block opener ends a definition-list entry: a heading, a
    // list/task marker, a blockquote, a fence (code/div), a horizontal rule,
    // a caption or a table row. Blank lines and lazy-continuation prose are
    // NOT block openers and fold into the entry instead - that is what keeps
    // a folded term line (`term_continuation_line`, corpus
    // 25-definition-lists-6) and a definition separated from its term by one
    // blank line (corpus 25-definition-lists-7) scoped correctly.
    const OTHER_BLOCK_OPENER_SOURCE =
        '[ \\t]*(?:#{1,6} |-{3,}[ \\t]*$|\\*{3,}[ \\t]*$|_{3,}[ \\t]*$|`{3,}|~{3,}|:{3,}|>(?: |$)'
        + '|\\^ |\\||[-*][ \\t]|[-*]\\{|\\d+[.)][ \\t]|[A-Za-z]+[.)][ \\t]|\\.[ \\t])';

    // Table/list continuation: a lone `+` (grammar.ebnf `continuation_marker`)
    // or a continuation ROW carrying cells (`continuation_row`, corpus
    // 63-table-multi-line-cell-continuation). The row form has to end in `|`,
    // so `one + two` in prose stays literal.
    const TABLE_CONTINUATION = {
        className: 'punctuation',
        begin: /^(?:(?<![\s\S])\uFEFF)?[ \t]*\+(?:[ \t]*$|[^\n]*\|[ \t]*$)/,
        relevance: 5,
    };

    // Smart typography, the same set the Prism grammar carries. Not invented
    // here: dashes, arrows, comparisons and the symbol trio.
    //
    // The doubled run is canonical in both arrow families (carve#1442), so
    // `-->` `<--` `<-->` and `==>` `<==` `<=>` are listed BEFORE the single
    // forms and before the dash rule - otherwise `-->` scopes as an en dash
    // plus a stray `>`. `=>` alone is no longer an arrow and is gone from the
    // set; `<=` stays, as the comparison it always was.
    //
    // A hyphen run that OPENS a word after whitespace is a command-line flag
    // and stays literal (carve#1443), so `--oneline` is not an en dash while
    // `1--10`, `Mon--Fri` and `a -- b` still are. That is the guard around the
    // dash alternatives: preceded by a non-space, or not followed by a word.
    const TYPOGRAPHY = {
        className: 'literal',
        begin: /\{--\}|\.\.\.|<-->|<--|-->|<=>|<==|==>|<->|<-|->|(?:(?<=\S)(?:---|--)|(?:---|--)(?!\w))|!=|<=|>=|\+-|\(c\)|\(r\)|\(tm\)/,
        relevance: 0,
    };

    // Citations (Tier-2 §22): [@key], [+@key], [@key, p.10], [@a; @b]
    // A bracket whose content holds at least one `@key` with no trailing
    // `(url)`, `[ref]`, or `{attrs}` suffix. The negative lookahead is handled
    // by position in the contains array (SPAN and REFERENCE_LINK are checked
    // first to claim those suffixed forms).
    const CITATION = {
        className: 'symbol',
        begin: /\[\+?(?:[^\]@]{0,512}@[A-Za-z0-9_][A-Za-z0-9_.:#$%&+?<>~\/-]*[^\]]{0,512})\](?!\(|\[|\{)/,
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
        begin: /^(?:(?<![\s\S])\uFEFF)?[ \t]*\[\^[^\]]+\]:(?= )/,
        end: /$/,
        relevance: 10,
    };

    // Abbreviation definitions: *[ABBR]: text
    //
    // The term is `(letter | digit)+` with `letter` enumerated ASCII, so
    // `*[e.g.]:` and `*[HTTP API]:` are NOT definitions - they stay paragraph
    // text in every engine. This matched anything without a bracket, which is
    // the reading carve-rs had for non-ASCII terms (carve-rs#660).
    const ABBREVIATION_DEF = {
        className: 'symbol',
        // Anchored `^[ \t]*` on purpose - no container model here, see the
        // indented-block-openers note in the module docblock (carve-grammars#138).
        begin: /^(?:(?<![\s\S])\uFEFF)?[ \t]*\*\[[A-Za-z0-9]+\]:(?= )/,
        end: /$/,
        relevance: 10,
    };

    // A list item's MARKER, as it may appear before a block opener on the same
    // line. Matched in a LOOKBEHIND everywhere it is used rather than consumed,
    // so `TASK_LIST`/`LIST_BULLET`/`LIST_NUMBER` still scope it - which is
    // tree-sitter-carve's split too, with the block INSIDE `list_item_content`
    // beside the `list_marker_*` rather than over it.
    //
    // Used by the marker-line comment fence AND by the quote rules below: a
    // quote may open on an item's own marker line (`- > x`), where carve-js
    // nests the quote and everything after the marker inside the item.
    // EVERY SEPARATOR IS A LITERAL SPACE, never a tab: `-<TAB>a`, `1.<TAB>a` and
    // `- [x]<TAB>a` are paragraphs in the engine, which the shared block battery
    // already pins per marker. Written `[ \t]+` this admitted `-<TAB>%%%` as a
    // marker-line fence, and with the quote rules sharing the prefix it coloured
    // `-<TAB>> q` as a quote on a line the language renders as prose
    // (carve-grammars#259).
    const LIST_MARKER_BEFORE_BLOCK =
        '^(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*'
        + '(?:(?:[-*] +)*[-*] +(?:\\[[ xX\\-_>?]\\] +)?'
        + '|(?:[0-9]+|[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)[.)] +|\\. +)';

    // A comment fence may open on a BLOCK-QUOTE marker line (`> %%%`), and then
    // its body is hidden exactly as it is anywhere else - \u00A724 S2 and \u00A728 make a
    // comment's body verbatim and invisible WHEREVER the fence sits. Corpus 70
    // pins this spelling: `> q` / `> %%%` / `> x` / `> %%%` / `> body` renders
    // the quote with `q` and `body` only.
    //
    // `BLOCK_COMMENT` cannot reach it - its begin allows only whitespace before
    // the run - so all three lines scoped as plain quote and nothing was marked
    // hidden. It lives in BLOCKQUOTE's `contains` rather than in the top-level
    // list because BLOCKQUOTE ends at `$`: a mode that begins at column 0 would
    // out-rank it and take the marker, and a mode outside it never gets to run
    // on a quote line at all. Reached from here the marker stays a quote, which
    // is tree-sitter-carve's split too - the `fenced_comment_block` sits inside
    // the quote's `content`, beside the `block_quote_marker`.
    // The marker run may itself follow a LIST ITEM'S marker (`- > %%%`), so the
    // list prefix is an alternative to the plain line start rather than a rule of
    // its own. carve-grammars#246 left that shape out because two of the three
    // grammars here could not reach it; a lookbehind reaches it here.
    const QUOTE_MARKER_BEFORE_FENCE =
        '(?:' + LIST_MARKER_BEFORE_BLOCK + '|^(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*)(?:> )+';
    // A line carrying a quote marker of its own. Every line from opener to
    // closer must be one: an UNMARKED line is where the quote can end, and the
    // engine degrades an unclosed opener to a line comment rather than hiding
    // anything (`> %%%` / `> c` / blank leaves `c` VISIBLE). The engine does
    // absorb an unmarked LAZY continuation into a fence that closes later;
    // refusing it costs a mis-scope there and buys never hiding a visible block.
    const QUOTE_MARKED_LINE = '(?:\\n[ \\t]*>[^\\n]*)';
    const BLOCK_COMMENT_ON_QUOTE_MARKER_LINE = {
        className: 'comment',
        // The closer is REQUIRED up front, as in BLOCK_COMMENT_ON_MARKER_LINE
        // below: highlight.js has no begin->end backreference, so without the
        // guard an opener with no closer runs to end of file, and on this shape
        // an unclosed opener is the common case.
        begin: RegExp(
            '(?<=' + QUOTE_MARKER_BEFORE_FENCE + ')(%{3,})(?!%)[^\\n]*$'
            + '(?=' + QUOTE_MARKED_LINE + '*?\\n[ \\t]*(?:> )+\\1(?!%)[^\\n]*$)',
        ),
        'on:begin': (m, resp) => {
            resp.data._quoteFenceWidth = m[1].length;
        },
        end: /^[ \t]*(?:> )+(%{3,})[^\n]*$/,
        'on:end': (m, resp) => {
            if (m[1].length !== resp.data._quoteFenceWidth) resp.ignoreMatch();
        },
        relevance: 10,
    };

    // The other half of the rule above: an UNTERMINATED `%{3,}` run opens
    // nothing and degrades to a LINE comment (PART 9 S28), so it must still
    // scope as one. Placed after `BLOCK_COMMENT` in `contains`, which consumes
    // every fence that does have a closer - the same pair Prism carries, where
    // the unterminated pattern sits after the block form for the same reason.
    //
    // The marker prefixes are here as well, so `- %%%` and `> %%%` with no
    // closer grey their opener out too rather than losing the run entirely.
    // Reached inside a quote through `BLOCKQUOTE.contains`, since a mode that
    // begins at column 0 never runs on a quote line.
    const UNTERMINATED_BLOCK_COMMENT = {
        className: 'comment',
        begin: RegExp(
            '(?:^(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*'
            + '|(?<=' + LIST_MARKER_BEFORE_BLOCK + ')'
            + '|(?<=' + QUOTE_MARKER_BEFORE_FENCE + '))%{3,}',
        ),
        end: /$/,
        relevance: 5,
    };
    // Blockquotes: a `>` marker followed by a SPACE, or alone on its line.
    //
    // Verified against carve-rs: `>no space`, `>>x`, `>> x` and `>\tx` are all
    // paragraphs - the separator must be a space, and nesting is written
    // `> > x` with a space per marker. A bare `^>` colored `>=3 items` as a
    // quote when the language calls it prose (markup-carve/carve#525).
    const BLOCKQUOTE = {
        className: 'quote',
        // Anchored `^[ \t]*` on purpose - no container model here, see the
        // indented-block-openers note in the module docblock (carve-grammars#138).
        // A LIST ITEM'S MARKER may stand before the `>` on the same line
        // (`- > x`, `1. > x`, `- - > x`, `- [ ] > x`). Reached through a
        // lookbehind so the marker is not consumed and the list rules still
        // scope it. Without this branch the marker scoped as a bullet and the
        // rest of the line carried no scope at all, where carve-js nests it
        // (carve-grammars#259).
        begin: RegExp(
            '(?:^(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*|(?<=' + LIST_MARKER_BEFORE_BLOCK + '))'
            + '>(?= |$)',
        ),
        end: /$/,
        // The ONE construct a quote line contains: a comment fence opened on
        // the marker line, which outlives the `$` that ends every other quote.
        // The two constructs a quote line contains: a comment fence opened on
        // the marker line, which outlives the `$` that ends every other quote,
        // and the unterminated form of the same run, which does not (it is a
        // line comment, so it ends where the quote line does).
        contains: [BLOCK_COMMENT_ON_QUOTE_MARKER_LINE, UNTERMINATED_BLOCK_COMMENT],
        relevance: 0,
    };

    // Horizontal rules: --- or *** or ___
    const HORIZONTAL_RULE = {
        className: 'meta',
        begin: /^(?:(?<![\s\S])\uFEFF)?[ \t]*(-{3,}|\*{3,}|_{3,})$/,
        relevance: 10,
    };

    // Bullet list items: - or *
    // A BULLET MAY BE GLUED TO AN ATTRIBUTE BLOCK, and then the required space
    // comes after the block - `-{#x} item` went uncoloured while LIST_NUMBER
    // already had the guard (#126). Same guard, spelled out rather than a
    // `\{[^}]*\}` run, because a quoted value may hold a `}`.
    const LIST_BULLET = {
        className: 'bullet',
        // A marker line may carry several markers (`- - A`, corpus 103).
        begin: RegExp(
            '^(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*(?:[-*] +)*[-*](?:(?= )|' + GLUED_ATTR_BLOCK + ')(?![ \\t]*$)',
        ),
        relevance: 0,
    };

    // Numbered list items: decimal (1.), alpha (a. A.), roman (i. I.)
    // A ROMAN RUN IS CASE-CONSISTENT: two classes, not one `[ivxlcdmIVXLCDM]`, which
    // matched any mixture and coloured `Vim. text` and `Mix. text` as lists where the
    // engine renders paragraphs (#118). `mix.`, `civil.` and `did.` DO open lists, so
    // the fix is the case split, not rejecting multi-letter words.
    // MARKER REQUIRES CONTENT, AND SO DOES THE ATTRIBUTE FORM: `1.{#x}`
    // with nothing after the block is a paragraph. The glued-block branch
    // spells the block out in full rather than skipping it - a quoted value
    // may contain `}` and may escape its own quote, so a `\{[^}]*\}` run
    // stops in the wrong place and `{title="a}b"} x` is a valid item (#85).
    const LIST_NUMBER = {
        className: 'bullet',
        begin: RegExp(
            '^(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*(\\d+[.)]|[a-zA-Z][.)]|[ivxlcdm]+[.)]|[IVXLCDM]+[.)]|\\.)(?:(?= )|' + GLUED_ATTR_BLOCK + ')(?![ \\t]*$)',
        ),
        relevance: 0,
    };

    // Task list items: - [ ] or - [x]
    // `task_state` is ` `, `x`, `X`, `-`, `_`, `>` or `?` (grammar.ebnf
    // `task_state`). Only `x`/`X` render checked; the rest are still task
    // markers, and corpus 06-task-lists-2 uses all four of the others.
    const TASK_LIST = {
        className: 'bullet',
        begin: /^(?:(?<![\s\S])\uFEFF)?[ \t]*[-*] \[[ xX\-_>?]\](?= )(?![ \t]*$)/,
        relevance: 5,
    };

    // Definition-list description marker: `:  def`. Reused as a nested mode
    // inside DEFINITION_LIST_ENTRY - not registered as a top-level mode.
    const DEFINITION_TERM = {
        className: 'title',
        begin: /^[ \t]*: (?![ \t]*$)/,
        end: /$/,
        relevance: 5,
    };

    // Definition-list entry: `:: term` through its `:  def` line(s)
    // (grammar.ebnf `definition_entry`).
    //
    // A `:` description line scopes only INSIDE an entry that a real `:: `
    // term opened (carve-grammars#91) - DEFINITION_TERM used to be registered
    // as its own top-level mode, matched unconditionally, so a bare `:  d`
    // with no term above it (or a term the separator rule disqualified, e.g.
    // `::\tterm` - the marker separator is a literal space per the
    // tab-and-separator ruling on markup-carve/carve#698, a tab never
    // satisfies it) was scoped as a definition even though the engines render
    // it as a paragraph. The entry opens on a real term line and runs through
    // any number of lines that are not some OTHER block opener (see
    // OTHER_BLOCK_OPENER_SOURCE above). `begin`/`end` are zero-width
    // lookaheads so DEFINITION_TERM_MARKER/DEFINITION_TERM (below, in
    // `contains`) do the actual per-line matching and coloring themselves,
    // exactly as they did as top-level modes.
    const DEFINITION_LIST_ENTRY = {
        begin: /^(?=(?:(?<![\s\S])\uFEFF)?[ \t]*:: (?![ \t]*$))/,
        end: new RegExp('^(?=' + OTHER_BLOCK_OPENER_SOURCE + ')'),
        relevance: 0,
        contains: [DEFINITION_TERM_MARKER, DEFINITION_TERM],
    };

    /*
     * FENCED CODE AND RAW BLOCKS - ONE MODE PER BLOCK, NOT ONE PER DELIMITER.
     *
     * A code block's payload is NOT Carve (spec PART 9 §2, `code_content`:
     * "any text until matching fence, preserved literally"), and until
     * carve-grammars#309 this file said so about the delimiters only: the
     * opener and the closer were two independent single-line modes with
     * NOTHING between them, so the body was handed to the full top-level mode
     * list and
     *
     *     ```
     *     x *b* y
     *     ```
     *
     * coloured `*b*` `strong` inside code. That is the markup-carve/carve#1239
     * shape one construct over - a payload that is recognized and still live -
     * and it is worse than leaving the block unhighlighted, because the output
     * then claims the document says something it does not.
     *
     * A begin/end mode with an EMPTY `contains` is what makes a payload inert
     * in this engine: highlight.js offers a mode's `contains` and nothing else
     * inside it, so an empty list is the whole suppression. The two delimiter
     * lines keep the `keyword` scope they always had through `beginScope` /
     * `endScope`, and the body carries `code`.
     *
     * THE CLOSER IS REQUIRED UP FRONT, the same guard `BLOCK_COMMENT` carries
     * below and for the same engine reason: highlight.js has no begin->end
     * backreference, so a mode that opens on an unpartnered fence runs to END
     * OF FILE and greys out the rest of the document.
     *
     * THE FORWARD SCAN IS BOUNDED, because proving there is NO closer costs a
     * scan to end of input and a document can carry many openers that have
     * none. The bound is 32 KB rather than the 8 KB `BLOCK_COMMENT` uses, and
     * the difference is the point: a code block THAT BIG is an ordinary
     * document (32 KB is some 800 lines of source), and past the bound the
     * fence opens no mode and its payload goes back to being live prose - which
     * is this issue again, at a size. Measured on a hostile 200 KB document
     * carrying 100 openers with no closer ahead of any of them: 23 ms at 8 KB,
     * 57 ms at 32 KB, 114 ms at 64 KB, 284 ms at 256 KB, linear in the bound
     * and linear in the document at each of them. 32 KB buys the blocks people
     * write for a cost that stays in the tens of milliseconds on a document
     * built to be slow.
     *
     * A HOSTILE DOCUMENT IS ALSO HARDER TO BUILD HERE than for `%%%`, which is
     * why the bounds differ at all. A comment fence closes on an EXACT width,
     * so a file of runs of INCREASING width leaves every one of them unmatched
     * and pays the scan once each - linear input, quadratic work. A code fence
     * closes on any run at least as long, so that same file matches every
     * opener at the next line; leaving N openers unmatched needs strictly
     * DECREASING widths, which costs O(N^2) characters to write down.
     *
     * WHAT THAT TRADES AWAY, written down rather than left to be rediscovered:
     * an unterminated fence at DOCUMENT level really does open a block that
     * runs to the end (grammar.ebnf, A CLOSER IS REQUIRED: "``` alone ... still
     * opens a code block that runs to the end"), and here it does not - it
     * falls to `LONE_CODE_FENCE` below, which colours the delimiter
     * line and leaves the lines under it as prose. That is the reading this
     * file had for every fence before #309, kept for the one shape it is still
     * right about: inside a container an opener with no closer opens NOTHING,
     * and a mode that ran to end of file there would swallow the container's
     * own closer and every block after it.
     *
     * THE CLOSER MATCHES ITS OPENER, and the rule is not the colon fence's.
     * A code fence closes on the SAME fence character at a length >= the
     * opener's (PART 9 §2, `code_fence_close`), where a colon fence wants an
     * exact length (§12) - so `DIV_BLOCK`'s width check next door is `!==` and
     * this one is `<`. Measured against the engine: ``` closed by ```` is one
     * code block, ```` closed by ``` is not.
     */

    // What may follow the fence on the opener line (grammar.ebnf
    // `code_fence_info`): a language token, then an optional "title", then an
    // optional [label]; or a title and label; or a label alone - in that fixed
    // order, and nothing else. The punctuation in the language token is the
    // grammar's (`c++`, `f#`, `asp.net`, `text/html`), and it may start with a
    // digit; a leading `=` is excluded there because that is the raw opener.
    //
    // STRICTER THAN THE `\s*[a-zA-Z]*` IT REPLACES, and wider where it counts.
    // The old spelling took no `c++`, no `text/html`, no digit and no `=html`,
    // so every one of those fences was NOT recognized and its body was live
    // prose - the same leak this rule is about, reached through the opener
    // rather than through the missing body. It also spelled the separator
    // `\s*`, which under the `m` flag these patterns compile with reaches
    // ACROSS the newline: on ```` ```\nfoo ```` the opener matched `` ```\nfoo ``
    // and scoped the first line of the payload as a delimiter.
    const FENCE_LANGUAGE = '[A-Za-z0-9_+#./-]+';
    const FENCE_TITLE = '"[^"\\n]*"';
    const FENCE_LABEL = '\\[[^\\]\\n]*\\]';
    const CODE_FENCE_INFO =
        '(?:' + FENCE_LANGUAGE + '(?: +' + FENCE_TITLE + ')?(?: +' + FENCE_LABEL + ')?'
        + '|' + FENCE_TITLE + '(?: +' + FENCE_LABEL + ')?'
        + '|' + FENCE_LABEL + ')';
    // A raw block is a code fence whose info string is `=` immediately followed
    // by a format name (grammar.ebnf `raw_block`): ```=html, and ``` =html with
    // the one permitted space, but never ```= html. It takes no title and no
    // label.
    const RAW_FENCE_INFO = '=[A-Za-z_][\\w-]*';
    // The ONE optional space between the fence and its info string is the
    // grammar's `[space]`, singular and never a tab: ```` ```  js ```` and
    // ```` ```<TAB>js ```` are paragraphs in the engine, where ```` ``` js ````
    // is a fence. Trailing whitespace after the info string is not part of it.
    const fenceOpener = (info) =>
        '^(?:(?<![\\s\\S])\\uFEFF)?([ \\t]*)(([`~])\\3{2,})(?: ?' + info + ')?[ \\t]*$'
        // The closer, required ahead, on a line of its own: the opener's own
        // indent (`\1`), then the same character (`\3`) at a length at least
        // the opener's (`\2`, then any number more of it).
        + '(?=[\\s\\S]{0,32768}?\\n\\1\\2\\3*[ \\t]*$)';

    /**
     * A fenced block whose payload is verbatim.
     *
     * @param {string} info - the info-string shape this fence carries.
     * @returns {object} a highlight.js mode with an inert body.
     */
    const fencedVerbatim = (info) => ({
        className: 'code',
        // Anchored `^[ \t]*` on purpose - no container model here, see the
        // indented-block-openers note in the module docblock (carve-grammars#138).
        beginScope: 'keyword',
        begin: new RegExp(fenceOpener(info)),
        'on:begin': (m, resp) => {
            resp.data._codeFence = { indent: m[1], run: m[2] };
        },
        endScope: 'keyword',
        // The closer is a HOMOGENEOUS run: ONE fence character repeated, not a
        // character class repeated. A mixed line is payload, which is what the
        // engine calls it - a backtick fence is not closed by a run of three
        // backticks and a tilde.
        end: /^([ \t]*)(`{3,}|~{3,})[ \t]*$/,
        // THE CLOSER SITS AT THE OPENER'S OWN COLUMN, and a run indented past it
        // is payload. That is what lets a fence hold a fence as sample text -
        // the shape every document describing Carve in Carve is made of:
        //
        //     ```
        //       ```
        //     *still code*
        //     ```
        //
        // is ONE code block whose content is the indented run and the line under
        // it (measured; PART 9 §2, COLUMN-EXACT DELIMITERS). Compared to the
        // opener's indent rather than anchored at column 0, because a fence
        // inside a list item is legitimately indented and this grammar has no
        // container model to tell the two apart - see the note in the module
        // docblock.
        'on:end': (m, resp) => {
            const open = resp.data._codeFence;
            const closes = open
                && m[1] === open.indent
                && m[2][0] === open.run[0]
                && m[2].length >= open.run.length;
            if (!closes) resp.ignoreMatch();
        },
        // THE PAYLOAD IS INERT, and this empty list is where that is said.
        contains: [],
        relevance: 10,
    });

    const CODE_BLOCK = fencedVerbatim(CODE_FENCE_INFO);
    const RAW_BLOCK = fencedVerbatim(RAW_FENCE_INFO);

    // A FENCE LINE THIS GRAMMAR DOES NOT PAIR: an opener with no closer ahead,
    // and the closer of a pair the rules above did not take. It stays what both
    // delimiter rules were before #309 - a single-line mode that colours the run
    // and claims nothing under it.
    //
    // ONE MODE, not the two this replaced. `CODE_FENCE_START` and
    // `CODE_FENCE_END` matched the same lines once the opener rule stopped
    // requiring the info string to be a bare word: whichever came first in
    // `contains` took every fence line and the other could not fire. A rule that
    // cannot fire is the defect this repository has shipped three times
    // (carve-grammars#295, #298, #300), so there is one rule with one name.
    const LONE_CODE_FENCE = {
        className: 'keyword',
        // Anchored `^[ \t]*` on purpose - no container model here, see the
        // indented-block-openers note in the module docblock (carve-grammars#138).
        begin: new RegExp(
            '^(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*(?:`{3,}|~{3,})'
            + '(?: ?(?:' + CODE_FENCE_INFO + '|' + RAW_FENCE_INFO + '))?[ \\t]*$',
        ),
        relevance: 10,
    };

    // Div block: ::: with optional type, "title", [label], or the | / \ / >
    // sigil tokens, through its matching closer. `::: >` is the fenced block
    // quote (markup-carve/carve#1718), the third member of that family: like
    // `::: |` it takes no identifier, so it reaches no `::: name` rule and was
    // scoped as nothing at all before it was listed here. Strict opener shapes only -
    // unquoted or curly-quoted trailing text is a paragraph, not a fence, and
    // must not highlight.
    //
    // A real begin/end mode (carve-grammars#125), not two independent
    // single-line modes: a per-line match left the body wide open to the
    // full top-level mode list, which incorrectly let ABBREVIATION_DEF fire
    // inside a div (PART 9: abbreviation definitions are recognized at
    // document level only). highlight.js has no begin->end backreference, so
    // the closer's width is checked the same way BLOCK_COMMENT already does
    // above: captured on `on:begin`, compared on `on:end`, and rejected with
    // `ignoreMatch()` on a mismatch - so the closer matches the opener's
    // colon run EXACTLY (PART 9's colon-fence depth rule: a longer or
    // shorter run does not close it, which is what lets equal-length fences
    // nest and `::::` hold `:::`). `contains` is assigned below, once the
    // full top-level mode list is known, to the same list minus
    // ABBREVIATION_DEF plus `'self'` (for nested divs) - so everything else
    // that already worked inside a div body (headings, nested lists,
    // blockquotes) keeps working; only the one construct this fix targets is
    // suppressed.
    const DIV_BLOCK = {
        beginScope: 'keyword',
        begin: /^(?:(?<![\s\S])\uFEFF)?[ \t]*(:{3,})(?: +(?:\||\\|>)| +[a-zA-Z_][\w-]*(?: +"[^"\n]*")?(?: +\[[^\]\n]*\])?| *\[[^\]\n]*\])?[ \t]*$/,
        'on:begin': (m, resp) => {
            resp.data._fenceWidth = m[1].length;
        },
        endScope: 'keyword',
        end: /^[ \t]*(:{3,})[ \t]*$/,
        'on:end': (m, resp) => {
            if (m[1].length !== resp.data._fenceWidth) resp.ignoreMatch();
        },
        relevance: 10,
    };

    // Composite figure block: a BARE `::: figure` opener through its matching
    // closer (PART 9 §4c, markup-carve/carve#1215).
    //
    // The kind word `figure` is RESERVED among the `:::` types: a bare opener -
    // the fence, its separator, the word `figure`, and NOTHING else - is ONE
    // figure of ordered panels, not an admonition. It carries `section` rather
    // than DIV_BLOCK's `keyword` so a consumer can tell the two readings apart,
    // and it is listed BEFORE DIV_BLOCK, whose begin also matches this line -
    // highlight.js takes the earliest match and breaks a tie by mode order.
    //
    // The `[ \t]*$` tail is the whole distinction. An opener carrying a quoted
    // title or a [label] (`::: figure "T"`, `::: figure [g]`) does not match
    // here at all and falls to DIV_BLOCK, which is the generic Tier-2 container
    // the clause says it stays.
    //
    // The separator is a SPACE run, never a tab (grammar.ebnf PART 7, MARKER
    // SEPARATORS; corpus 254 renders `:::<TAB>note` as a paragraph). A
    // tab-separated opener is not claimed here and falls to DIV_BLOCK, which
    // over-colours it exactly as it does today - a pre-existing trade this mode
    // neither widens nor fixes. Trailing whitespace after the kind word is
    // insignificant and may be a tab.
    //
    // Closer width is carried in `resp.data` and compared on `on:end`, the same
    // idiom DIV_BLOCK and BLOCK_COMMENT already use, so the closer matches the
    // opener's colon run EXACTLY. `contains` is assigned below, once the full
    // mode list is known.
    // A STACK, where the modes above keep a single width. highlight.js hands
    // every instance of a mode the SAME `resp.data` object, so one slot holds
    // only the innermost fence: with `::: figure` > `:::: note` > `::::: x`,
    // the width-5 opener overwrote the width-4 one, both outer closers then
    // failed their check, and the group ran to end of input unscoped. These two
    // modes nest inside each other by construction, so they push and pop
    // instead. `container` names which stack, because the two modes are
    // separate objects and each needs its own.
    const pushFence = (container) => (m, resp) => {
        (resp.data[container] ??= []).push(m[1].length);
    };
    const popFence = (container) => (m, resp) => {
        const open = resp.data[container];
        if (!open?.length || m[1].length !== open[open.length - 1]) {
            resp.ignoreMatch();
            return;
        }
        open.pop();
    };

    const FIGURE_GROUP_BLOCK = {
        beginScope: 'section',
        begin: /^(?:(?<![\s\S])\uFEFF)?[ \t]*(:{3,}) +figure[ \t]*$/,
        'on:begin': pushFence('_groupFences'),
        endScope: 'section',
        end: /^[ \t]*(:{3,})[ \t]*$/,
        'on:end': popFence('_groupFences'),
        relevance: 10,
    };

    // The generic container reached only from INSIDE a composite figure group.
    // Its `contains` differs from DIV_BLOCK's (assigned below), so a bare
    // `::: figure` at any depth inside an open group reads as the generic
    // container PART 9 §4c degrades it to (GROUPS DO NOT NEST; corpus
    // 318-composite-figures-9). The scope stays `keyword` - it IS a div, and a
    // consumer selecting that must keep seeing it.
    //
    // Its `begin` also differs, in the one way that lets a group close at all.
    // highlight.js tries a mode's CONTAINS before its own `end`, so DIV_BLOCK's
    // optional tail - which makes a bare `:::` line a typeless div opener -
    // matched the group's own closing fence and opened a phantom container
    // instead of closing the group. Measured before this line existed: a second
    // `::: figure` later in the same document scoped `keyword`, because the
    // whole rest of the file was still inside that phantom.
    //
    // Requiring the tail here is not a narrowing of what Carve accepts, it is
    // the colon-fence depth rule (PART 9 §12) written where highlight.js can
    // act on it: a `:::` line inside a `:::` container CLOSES it, and a
    // container nested inside one has to open with a LONGER run. So a bare
    // fence line inside a group is a closer, and reaching `end` is the correct
    // reading of it. A longer bare run (`::::` inside a `:::` group) fails the
    // width check in `on:end` and is left unscoped, which is the one case this
    // trades away.
    const DIV_BLOCK_IN_GROUP = {
        ...DIV_BLOCK,
        begin: /^(?:(?<![\s\S])\uFEFF)?[ \t]*(:{3,})(?: +(?:\||\\|>)| +[a-zA-Z_][\w-]*(?: +"[^"\n]*")?(?: +\[[^\]\n]*\])?| *\[[^\]\n]*\])[ \t]*$/,
        'on:begin': pushFence('_groupDivFences'),
        'on:end': popFence('_groupDivFences'),
    };

    // Carve comments: `%%` to end of line, a `%%%` fenced block, and the
    // CriticMarkup comment `{# ... #}`.
    //
    const DELIMITED_COMMENT = {
        className: 'comment',
        begin: /\{%/,
        end: /%\}/,
        relevance: 5,
    };
    // Comments are inline leaves. Keep the containing emphasis mode open and
    // scope the hidden run as a comment inside it.
    for (const mode of [
        BOLD_ITALIC, STRONG, EMPHASIS, UNDERLINE, STRIKETHROUGH,
        HIGHLIGHT, SUBSCRIPT, SUPERSCRIPT, FORCED_STRONG, FORCED_EMPHASIS,
        FORCED_UNDERLINE, FORCED_STRIKE, FORCED_HIGHLIGHT,
    ]) {
        mode.contains = [DELIMITED_COMMENT, ...(mode.contains || [])];
    }
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
        // THE CLOSER IS REQUIRED UP FRONT, as in both marker-line fences below,
        // and for the reason they already give: highlight.js has no begin->end
        // backreference, so an opener with no closer runs to END OF FILE. That
        // is the worst failure a highlighter has - everything below one stray
        // `%%%` is greyed out - and PART 9 S28 says the opposite happens: an
        // UNTERMINATED run opens nothing, degrades to a line comment, and leaves
        // the block below it visible (`%%%` / blank / `after` renders
        // `<p>after</p>`). Measured at every indent, column 0 included, and the
        // swallow reproduced at all of them (carve-grammars#260).
        //
        // The lookahead carries the width rule too: `\1(?!%)` matches the
        // opener's run EXACTLY, so `%%%` offered a `%%%%` closer is still
        // unterminated - which the engine renders with the body VISIBLE between
        // two vanished runs, not hidden.
        // THE FORWARD SCAN IS BOUNDED, and the bound is the whole reason this
        // lookahead is affordable. Proving there is NO closer costs a scan to
        // end of input, and a document can hold one unmatched run per fence
        // WIDTH, so an adversarial file pays that scan many times over: 2000
        // runs of increasing width (2 MB) took 2045 ms unbounded and 40 ms at
        // 8000 characters, and the bounded form grows linearly where the
        // unbounded one grows with the square. Prism carries the same unbounded
        // scan and measured 14.2 s on the 8 MB case, so this is the rule's cost
        // rather than this engine's (carve-grammars#260).
        //
        // A closer further than 8000 characters below its opener is therefore
        // not found, and the fence degrades to a line comment. That is the SAFE
        // direction and the one this whole rule is about: a run that opens
        // nothing leaves the text below it VISIBLE, where the failure being
        // fixed here hid it.
        begin: /^(?:(?<![\s\S])\uFEFF)?[ \t]*(%{3,})(?!%)[^\n]*$(?=[\s\S]{0,8000}?\n[ \t]*\1(?!%)[^\n]*$)/,
        'on:begin': (m, resp) => {
            resp.data._fenceWidth = m[1].length;
        },
        // The closer may be INDENTED, like the opener above: leading
        // whitespace is not part of the delimiter, only the `%` run is (PART 9
        // §24 C3 - a comment is recognized at any column, carve#624/#634).
        // Anchored at column 0 the fence never closed for an indented closer,
        // so the comment swallowed the rest of the document.
        end: /^[ \t]*(%{3,})[^\n]*$/,
        'on:end': (m, resp) => {
            if (m[1].length !== resp.data._fenceWidth) resp.ignoreMatch();
        },
        relevance: 10,
    };
    // A fence may also open on a list item's MARKER LINE (`- %%%`), and then
    // the body is hidden exactly as it is anywhere else - §24 S2 and §28 make a
    // comment's body verbatim and invisible WHEREVER the fence sits (corpus
    // 337). `BLOCK_COMMENT` above cannot reach that shape: its begin is
    // line-anchored, so on `- %%%` it never fires, the scanner then takes the
    // REAL closer on the next line for an opener, and the comment runs to end
    // of file - swallowing every block after the item.
    //
    // The marker is matched in a LOOKBEHIND rather than consumed, so
    // `TASK_LIST`/`LIST_BULLET`/`LIST_NUMBER` still scope it as a bullet (which
    // is what tree-sitter-carve does too: a `fenced_comment_block` sits INSIDE
    // `list_item_content`, beside a `list_marker_*`, not over it).
    // `LIST_MARKER_BEFORE_BLOCK` is defined above BLOCKQUOTE, which needs the
    // same prefix for `- > x`.
    // A line that is blank, or indented by at least one column. A COLUMN-0 line
    // is neither, and that is the point: it ends the container and with it the
    // fence, so it must not be skipped over while looking for the closer
    // (corpus 326-6 - `- %%%` / `c` / `%%%` leaves `c` and the trailing
    // paragraph VISIBLE, with the unclosed opener degrading to a line comment).
    // Both alternatives are DISJOINT and each decomposes ONE way, which is what
    // keeps the `*?` repetition below linear. The previous pair was neither: a
    // whitespace-only line satisfied the blank branch AND `\n[ \t]+[^\n]*`,
    // and `[^\n]` itself accepts a space, so `  x` split two ways at the same
    // end position. That gave an n-line body 2^n parses, and an UNCLOSED fence
    // makes the engine walk all of them before the lookahead fails - `- %%%`
    // plus 24 indented lines took 379 ms, plus 30 does not finish
    // (carve-grammars#294). The blank branch now consumes the whitespace run
    // itself and asserts the line ENDS there, and the indented branch requires a
    // non-blank character after the indent. Same matched LANGUAGE as before, so
    // no highlighting moves.
    const BLANK_OR_INDENTED_LINE = '(?:\\n[ \\t]*(?![^\\n])|\\n[ \\t]+[^ \\t\\n][^\\n]*)';
    const BLOCK_COMMENT_ON_MARKER_LINE = {
        className: 'comment',
        // The closer is REQUIRED up front, unlike `BLOCK_COMMENT`. highlight.js
        // has no begin->end backreference, so without this guard an opener with
        // no closer would run to end of file - and on this shape an unclosed
        // opener is the common case (a column-0 line ends the item), where the
        // right answer is a one-line comment, not a swallowed document.
        begin: RegExp(
            '(?<=' + LIST_MARKER_BEFORE_BLOCK + ')(%{3,})(?!%)[^\\n]*$'
            + '(?=' + BLANK_OR_INDENTED_LINE + '*?\\n[ \\t]+\\1(?!%)[^\\n]*$)',
        ),
        'on:begin': (m, resp) => {
            resp.data._fenceWidth = m[1].length;
        },
        // `[ \t]+`, not `[ \t]*`: the closer sits at the item's content column,
        // and a column-0 run is a different block entirely (see above).
        end: /^[ \t]+(%{3,})[^\n]*$/,
        'on:end': (m, resp) => {
            if (m[1].length !== resp.data._fenceWidth) resp.ignoreMatch();
        },
        relevance: 10,
    };
    const CRITIC_SUB = {
        className: 'meta',
        // The `~>` arrow is what distinguishes a substitution from a forced
        // strikethrough (`{~gone~}`), so it is required here.
        //
        // The arrow hunt is unrolled for the reason `paired()` above is:
        // written `[^}\n]*~>` it scanned to end of line from every position and
        // kept `{~` superlinear even after the guard was bounded (225 ms on
        // 24 KB, x3.6 per doubling, carve-grammars#300). Tempered on a `~` that
        // is not the arrow, it gives up at the next `~` instead.
        begin: /\{~(?=[^~}\n]{0,4096}(?:~(?!>)[^~}\n]{0,4096}){0,32}~>)/,
        end: /~\}/,
        relevance: 10,
    };
    const CRITIC_COMMENT = {
        className: 'comment',
        // The closing `#}` is required, or this would swallow an attribute
        // block whose id comes first (`{#id .class}`).
        //
        // A LINE BREAK IS PART OF THE BODY, and only this guard said otherwise:
        // `end` already spans lines, so a `{#` that opened ran to its `#}`
        // wherever that was. Line-bounded, the guard refused to open at all on
        // `a {# x` / `*b* y #} z` - which the engine renders as ONE comment with
        // the run LITERAL inside it - so the run coloured as bold, markup inside
        // a payload that is not Carve (carve-grammars#312).
        //
        // The newline is TEMPERED rather than admitted: a BLANK line ends the
        // paragraph and therefore the comment, measured - `a {# x` / `` /
        // `*b* y #} z` is two paragraphs with the delimiters literal in both.
        // The body still excludes `}` entirely, so the `#}` the guard finds is
        // the first one and `end` cannot overshoot it, and the scan stays
        // bounded at the 4096 carve-grammars#300 gave it.
        begin: /\{#(?=(?:[^}\n]|\n(?![ \t\r]*\n)){0,4096}#\})/,
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
    /*
     * Cross-reference with auto text: `</#id>` (grammar.ebnf
     * `auto_text_link = "</#", crossref_id, '>'`).
     *
     * This grammar had no rule for it and the run was not left alone: the id
     * begins with `#`, so TAG below claimed it and coloured a cross-reference
     * as a hashtag. Prism had the identical defect, fixed in
     * carve-grammars#307, and tree-sitter-carve#245 found the same shape a
     * layer down - a construct read as the wrong thing is worse than one read
     * as nothing.
     *
     * It sits BEFORE TAG so the intent is on the page, though position already
     * decides it: the `<` is earlier in the line than the `#`, and
     * highlight.js takes the leftmost match.
     *
     * The id charset is the spec's `crossref_id` - any character that is not
     * `>`, whitespace or a newline - because an automatic heading id PRESERVES
     * Unicode and case, so `</#Cafe-Notes>` has to scope.
     */
    const CROSS_REF = {
        className: 'link',
        begin: /<\/#[^>\s]{1,512}>/,
        relevance: 5,
    };
    const TAG = {
        className: 'symbol',
        begin: /(?<![\w#])#[A-Za-z0-9][\w-]*(?:\.[\w-]+)*/,
        relevance: 5,
    };
    // Used only inside HEADING (carve-grammars#125), not TAG itself: a
    // heading's own `contains` does not carry CROSS_REF, so without the extra
    // exclusion this would wrongly claim the `#a` inside a heading
    // cross-reference `</#a>`
    // (grammar.ebnf `auto_text_link = "</#", crossref_id, '>'`) and break
    // corpus 118 (`# A </#a>`), which pins the whole thing staying unscoped.
    const HEADING_TAG = {
        className: 'symbol',
        begin: /(?<![\w#])(?<!<\/)#[A-Za-z0-9][\w-]*(?:\.[\w-]+)*/,
        relevance: 5,
    };

    // Table separator: |---|---|
    const TABLE_SEPARATOR = {
        className: 'meta',
        begin: /^(?:(?<![\s\S])\uFEFF)?[ \t]*\|[-:| ]+\|$/,
        relevance: 5,
    };

    /*
     * A PIPE-LED LINE THAT IS NOT A TABLE ROW, which is what this mode has
     * always matched and not what it was called.
     *
     * It was named LINE_BLOCK, and the ledger cited it as the rule for
     * `line_block`. It is not: a line block opens on a COLON FENCE
     * (grammar.ebnf `line_block_open = colon_fence, space, "|"`), so `::: |` is
     * the construct and DIV_BLOCK is the mode that scopes it. A bare `| verse`
     * line at document level is neither - the engine renders it as a paragraph.
     *
     * The mode still earns its place, for the reason its old comment gave:
     * TABLE_ROW closes on a line-final `|`, so on a single-pipe line it would
     * open and run until some later line happened to end in one. This claims
     * the line first and ends it at the newline. The rename is what stops the
     * ledger reading a guard against that runaway as a construct's rule -
     * evidence names a rule the vocabulary declares, and nothing checks that
     * the named rule is about the construct.
     */
    const PIPE_LED_LINE = {
        className: 'string',
        begin: /^(?:(?<![\s\S])\uFEFF)?[ \t]*\| /,
        end: /$/,
        relevance: 3,
    };

    // Table rows: | cell | cell |
    const TABLE_ROW = {
        className: 'string',
        begin: /^(?:(?<![\s\S])\uFEFF)?[ \t]*\|/,
        end: /\|(\{[^}]*\})?$/,
        relevance: 2,
    };

    // Captions: ^ caption text
    const CAPTION = {
        className: 'title',
        begin: /^(?:(?<![\s\S])\uFEFF)?[ \t]*\^ (?![ \t]*$)/,
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

    // A tag is still a tag even inside a heading's literal trailing brace run
    // (carve-grammars#125, corpus 213): a heading takes no trailing attribute
    // block, so `{#id .cls}` is ordinary heading text (that half already
    // worked - it was never scoped as an attribute), but `#id` inside it is
    // still a tag construct. Deliberately narrow - just HEADING_TAG (see its
    // own comment above), not the full inline repertoire - matching the same
    // targeted scope as the TextMate and Prism fixes for this same bug.
    HEADING.contains = [HEADING_TAG];

    const CONTAINS = [
        // Block-level elements (order matters - more specific first)
        FRONT_MATTER,
        HEADING,
        CODE_BLOCK,        // ``` ... ``` - before the delimiter-only fallback
        RAW_BLOCK,         // ```=html ... ``` - same, with the raw info string
        LONE_CODE_FENCE,   // a fence line neither of those paired: the line only
        FIGURE_GROUP_BLOCK,  // Must be before DIV_BLOCK (both match `::: figure`)
        DIV_BLOCK,
        HORIZONTAL_RULE,
        TABLE_SEPARATOR,
        TABLE_CONTINUATION,  // `+` rows - before TABLE_ROW, which needs a leading `|`
        PIPE_LED_LINE,     // Must be before TABLE_ROW (both start with |)
        TABLE_ROW,
        BLOCKQUOTE,
        CAPTION,
        TASK_LIST,         // Must be before LIST_BULLET
        LIST_BULLET,
        LIST_NUMBER,
        DEFINITION_LIST_ENTRY,  // `:: term` / `:  definition` (carve-grammars#91)
        FOOTNOTE_DEF,      // Must be before REFERENCE_DEF
        ABBREVIATION_DEF,  // Must be before REFERENCE_DEF (*[ABBR]: vs [ref]:)
        REFERENCE_DEF,

        // Inline elements (order matters - more specific first)
        INLINE_FOOTNOTE,   // ^[content] - before FOOTNOTE_REF ([^label])
        FOOTNOTE_REF,
        IMAGE,             // Must be before LINK (starts with !)
        REFERENCE_IMAGE,   // ![alt][ref] and ![alt][] - before REFERENCE_LINK
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
        BLOCK_COMMENT_ON_MARKER_LINE,  // `- %%%` - the marker is left to the list rules
        UNTERMINATED_BLOCK_COMMENT,    // a `%%%` run with no closer - AFTER both fences
        DELIMITED_COMMENT, // {% ... %}
        LINE_COMMENT,      // %% to end of line
        CRITIC_SUB,        // {~old~>new~} - before FORCED_STRIKE
        CRITIC_COMMENT,    // {# ... #} - must be before ATTRIBUTE
        MENTION,
        CROSS_REF,         // </#id> - before TAG, which claims the `#id`
        TAG,
        HIGHLIGHT,         // =text=
        SUBSCRIPT,         // ,text,
        SUPERSCRIPT,       // ^text^
        BOLD_ITALIC,       // the combined opener - before STRONG and EMPHASIS
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
        FORCED_HIGHLIGHT,
        ATTRIBUTE_EMPTY,
        ATTRIBUTE,
        ESCAPE,
        HARD_BREAK,
        TYPOGRAPHY,        // dashes/arrows - after the structural rules
    ];

    // A div's body holds the full top-level mode list minus ABBREVIATION_DEF
    // (carve-grammars#125 - see the comment on DIV_BLOCK above), plus 'self'
    // so a nested div still scopes. highlight.js resolves the 'self' string
    // to this same mode natively, so this does not need the width-tracking
    // idiom above to also handle recursion.
    // `'self'` sits LAST, not first. highlight.js takes the first mode in
    // `contains` that matches at the earliest position, and DIV_BLOCK's own
    // begin matches `::: figure` (its tail is optional), so a leading `'self'`
    // out-ranked FIGURE_GROUP_BLOCK for every group nested inside a div - and
    // because a div's closing fence opens a phantom `'self'` too, "inside a
    // div" meant "anywhere after the first container in the document".
    // Measured: `::: note` / `:::` / blank / `::: figure` scoped the group
    // `keyword`. It is also redundant where it stands, since DIV_BLOCK is
    // itself an entry in CONTAINS; it is kept, at the end, as the explicit
    // statement that a div nests in a div.
    DIV_BLOCK.contains = [...CONTAINS.filter((mode) => mode !== ABBREVIATION_DEF), 'self'];

    // A composite figure's body is the div body MINUS FIGURE_GROUP_BLOCK (PART 9
    // §4c: GROUPS DO NOT NEST - a bare `::: figure` inside an open group is a
    // generic container at any depth, corpus 318-composite-figures-9). Dropping
    // the mode is what makes the inner opener fall to the div mode, which is
    // exactly the generic reading the clause asks for.
    //
    // The div reached from here is DIV_BLOCK_IN_GROUP rather than DIV_BLOCK, so
    // the exclusion survives a level of nesting: DIV_BLOCK still offers
    // FIGURE_GROUP_BLOCK (a bare opener inside a `::: note` IS a group - only a
    // group suppresses one), and this variant does not, so
    // `::: figure` > `::: note` > `::: figure` reads generic too. `'self'` would
    // not do here: inside DIV_BLOCK_IN_GROUP it resolves to that same div, which
    // is what is wanted, but the mode has to be a distinct object for its
    // `contains` to differ from DIV_BLOCK's at all.
    //
    // RESIDUAL, written down rather than left to be rediscovered: a bare opener
    // reached through a LIST ITEM or a BLOCKQUOTE inside a group is matched by
    // the top-level modes again, so it over-colours as a group there. That is
    // the same block-context limit every mode in this file has (see the
    // indented-block-openers note in the module docblock); tree-sitter-carve is
    // where a real container model lives.
    const IN_GROUP = CONTAINS
        .filter((mode) => mode !== ABBREVIATION_DEF && mode !== FIGURE_GROUP_BLOCK)
        .map((mode) => (mode === DIV_BLOCK ? DIV_BLOCK_IN_GROUP : mode));
    FIGURE_GROUP_BLOCK.contains = IN_GROUP;
    DIV_BLOCK_IN_GROUP.contains = [...IN_GROUP.filter((mode) => mode !== DIV_BLOCK_IN_GROUP), 'self'];

    return {
        // `crv` is the canonical file extension, and every surface this package
        // ships answers it (tests/lib/aliases.js). `registerLanguage` registers
        // the definition's own aliases, so listing it here is the whole
        // registration. No casing variant belongs in this list: highlight.js
        // lowercases both what it stores and what `getLanguage` is asked for,
        // so `Carve` already resolves and a second spelling would be dead.
        name: 'Carve',
        aliases: ['carve', 'crv'],
        case_insensitive: false,
        contains: CONTAINS,
    };
    };
}));
