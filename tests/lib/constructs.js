/**
 * ONE construct inventory, consumed by both grammar sweeps.
 *
 * The three grammars used to be checked by two sweeps with two hand-written
 * case lists that overlapped but neither derived from the other, so a
 * construct could be exercised in one and absent from the other for as long as
 * nobody noticed. That is how the in-list-item family stayed broken: TextMate
 * carried all seven cases and colored them, the engine sweep carried none, so
 * Prism and highlight.js could anchor every block rule at column zero and
 * still report `66/66 constructs scoped correctly`.
 *
 * Every entry here is asserted in all three grammars:
 *
 *   - `tests/engine-sweep-test.js` - the payload carries SOME scope in Prism
 *     and in highlight.js, and is not claimed by the attribute rule unless the
 *     construct IS an attribute block.
 *   - `tests/textmate-sweep-test.js` - the payload's scope matches the
 *     `textmate` selector this entry names.
 *
 * Adding a construct therefore forces the decision for all three at once,
 * which is the point: an absence has to be written down as a `skip` with a
 * reason, the same covered-or-skip discipline `tests/lib/coverage.js` applies
 * per corpus category.
 *
 * Entry shape:
 *
 *   name      - what the construct is called in a failure message.
 *   sample    - the source to tokenize. ONE sample serves all three grammars.
 *   payload   - the text that must carry a scope. Keep it narrow: the engine
 *               check accepts a token CONTAINING it, so the tightest spelling
 *               works everywhere while a wide one can miss a narrow token.
 *   enginePayload
 *             - a different payload for Prism and highlight.js, for the few
 *               constructs those tokenize at a coarser granularity than
 *               TextMate. Only where a shared payload would make one side's
 *               check unfalsifiable; state the reason at the entry.
 *   textmate  - substring of the TextMate scope the payload must carry.
 *   attr      - the construct IS an attribute block, so scoping it as
 *               attributes is correct rather than the failure mode.
 *   skip      - `{ <grammar>: 'reason' }` for a grammar that deliberately does
 *               not cover this construct. Written down, never silent.
 *
 * @module tests/lib/constructs
 */

/** @type {Array<{name: string, sample: string, payload: string, textmate: (string|null), attr?: boolean, skip?: object}>} */
export const CONSTRUCTS = [
    // The other half of #164, and the reason the fix cannot just narrow the shared
    // separator: a standalone attribute LINE DOES span lines, and must keep doing so.
    {
        name: 'an attribute line spans lines', sample: '{.a\n.b}\n\nparagraph\n',
        payload: '{.a', textmate: 'meta.attributes', attr: true,
    },
    { name: "italic", sample: "some /italic/ text", payload: "italic", textmate: "markup.italic" },
    { name: "bold", sample: "some *bold* text", payload: "bold", textmate: "markup.bold" },
    { name: "bold-italic", sample: "some /*both*/ text", payload: "both", textmate: "markup.bold.italic" },
    { name: "underline", sample: "some _under_ text", payload: "under", textmate: "markup.underline" },
    { name: "strike", sample: "some ~strike~ text", payload: "strike", textmate: "markup.strikethrough" },
    { name: "highlight bare", sample: "a =mark= b", payload: "mark", textmate: "markup.highlight" },
    { name: "inline code", sample: "a `code` b", payload: "code", textmate: "markup.raw.inline" },
    { name: "forced bold", sample: "foo{*bar*}baz", payload: "bar", textmate: "markup.bold" },
    { name: "forced italic", sample: "a{/b/}c", payload: "b", textmate: "markup.italic" },
    { name: "forced underline", sample: "my{_path_}name", payload: "path", textmate: "markup.underline" },
    { name: "forced strike", sample: "x{~gone~}y", payload: "gone", textmate: "markup.strikethrough" },
    { name: "forced italic spanning its delimiter", sample: "{/a/b/}", payload: "a/b", textmate: "markup.italic" },
    { name: "highlight brace", sample: "wo{=mark=}rd", payload: "mark", textmate: "markup.highlight" },
    { name: "superscript brace", sample: "mc{^2^} end", payload: "2", textmate: "markup.superscript" },
    { name: "subscript brace", sample: "H{,2,}O", payload: "2", textmate: "markup.subscript" },
    { name: "critic insert", sample: "a {+ins+} b", payload: "ins", textmate: "markup.inserted" },
    { name: "critic delete", sample: "a {-del-} b", payload: "del", textmate: "markup.deleted" },
    { name: "critic substitution", sample: "a {~old~>new~} b", payload: "old", textmate: "markup.changed" },
    { name: "critic comment", sample: "a {#note#} b", payload: "note", textmate: "comment" },
    { name: "span attrs", sample: "[span]{.class}", payload: ".class", textmate: "attributes", attr: true },
    { name: "block attrs line", sample: "{#id .class key=value}\n# H", payload: "#id", textmate: "attributes", attr: true },
    { name: "quoted attr value", sample: "[x]{title=\"a b\"}", payload: "title", textmate: "meta.attributes", attr: true },
    { name: "escaped quote in attr value", sample: "[x]{title=\"a\\\"b\"}", payload: "title", textmate: "meta.attributes", attr: true },
    // A colon is illegal in a KEY, a CLASS and an ID, and legal in an unquoted VALUE -
    // `unquoted_value` admits `.` and `:` so version strings and namespaced tokens need
    // no quoting. The colon literals are in LITERALS below; this is the CONTROL that
    // stops a fix for any of them from tightening the value branch too (#135, #150).
    // `[x]{k=a:b}` is the one colon shape that renders as a span in every engine.
    { name: "colon in an unquoted attr value", sample: "[x]{k=a:b}", payload: "k=a:b", textmate: "meta.attributes", attr: true },
    // The language attribute (carve#1114) is the first attribute item that may
    // OPEN with a colon, which every grammar's attr-item alternation had to
    // learn: an unrecognised item leaves the whole block literal, so a grammar
    // that misses it stops scoping the block rather than scoping it wrongly.
    { name: "language attribute", sample: "[x]{:fr}", payload: ":fr", textmate: "meta.attributes", attr: true },
    { name: "language attribute with subtags", sample: "[x]{:sr-Latn-RS}", payload: ":sr-Latn-RS", textmate: "meta.attributes", attr: true },
    // The empty form is `lang=""`, and it is the shape most likely to be read
    // as a stray colon by a rule that requires a tag.
    { name: "empty language attribute", sample: "[x]{:}", payload: "{:}", textmate: "meta.attributes", attr: true },
    { name: "language attribute beside others", sample: "[x]{#i :fr .c}", payload: ":fr", textmate: "meta.attributes", attr: true },
    { name: "language attribute on a block line", sample: "{:de}\n# H", payload: ":de", textmate: "meta.attributes", attr: true },
    // The other half of `[x]{#a:b}`, whose literal counter-example is in LITERALS
    // below. The block is not an attribute block, so the source stays prose - and the
    // `#a` left in that prose is an ordinary tag, which is what the engine renders
    // (`<span class="tag"><strong>#a</strong></span>:b`). Pairing the two pins the
    // whole outcome rather than only the half that must not happen: a rule that
    // widened the id branch would claim `#a` for the attribute block and fail here as
    // well as there.
    { name: "a hash in a colon-invalidated attribute block is a tag", sample: "[x]{#a:b}\n", payload: "#a", textmate: "tag" },
    { name: "link text", sample: "[text](https://x.de)", payload: "text", textmate: "string.other.link.title" },
    { name: "link url", sample: "[text](https://x.de)", payload: "https://x.de", textmate: "markup.underline.link" },
    { name: "escaped-quote link title", sample: "[t](/url \"ti\\\"tle\")", payload: "/url", textmate: "markup.underline.link" },
    { name: "autolink", sample: "<https://example.com>", payload: "https://example.com", textmate: "markup.underline.link" },
    { name: "image", sample: "![alt](img.jpg)", payload: "![", textmate: "punctuation.definition.image" },
    // A NESTED BRACKET RUN IN A LABEL (carve-grammars#226). The spec closes a
    // link label or an image alt text at the MATCHING `]` (grammar.ebnf
    // `link_text`, SEMANTIC CONSTRAINT), and the scan is escape-aware. Every
    // grammar here spelled the body `[^\]]*`, which closes at the FIRST `]`:
    // the rule then wanted a `(` or a `[`, found the second `]`, and gave up,
    // so the whole construct recorded as prose in Prism, in highlight.js AND in
    // TextMate. `a ![t[z]](/i.png) b` renders `<img src="/i.png" alt="t[z]">`.
    //
    // LINKS NEVER NEST (grammar.ebnf): the inner run is TEXT, never a second
    // link, so one scope over the construct is the right answer and there is no
    // inner link to assert.
    //
    // The counter-example is in LITERALS below: an UNBALANCED opener
    // (`[outer[z](/u)`) must not scope from the outer `[`, which is what the
    // `[^\]]*` body did. Positives alone cannot catch that - a body that simply
    // admits `[` passes every entry here and fails there.
    {
        name: "inline image whose alt text holds a bracket run",
        sample: "a ![t[z]](/i.png) b", payload: "t[z]", textmate: "string.other.image.alt",
    },
    {
        name: "inline link whose text holds a bracket run",
        sample: "a [t[z]](/u) b", payload: "t[z]", textmate: "string.other.link.title",
    },
    {
        name: "reference link whose text holds a bracket run",
        sample: "a [t[z]][ref] b", payload: "t[z]", textmate: "string.other.link.title",
    },
    {
        // This entry used to read `string.other.link.title`, with a comment
        // saying all three grammars scoped a reference IMAGE through their
        // reference-LINK rule and left the `!` outside the token - the defect
        // written down beside the check that could have caught it. It is fixed
        // (carve-grammars#307): the alt text is an image's, and the selector
        // says so.
        name: "reference image whose alt text holds a bracket run",
        sample: "a ![t[z]][ref] b", payload: "t[z]", textmate: "string.other.image.alt",
    },
    {
        // Three levels in. The body is unrolled, not recursive, so depth is a
        // real bound worth pinning above the one-level case.
        name: "link text nested three deep",
        sample: "a [a[b[c]]](/u) b", payload: "a[b[c]]", textmate: "string.other.link.title",
    },
    {
        // An ESCAPED opener is literal text, so the run is not unbalanced and
        // this IS a link. It worked before by accident (`[^\]]*` never looked at
        // `[`); it works now because the scan resolves escapes, which is the
        // half of the rule that keeps `[t\[z](/u)` from reading as an unbalanced
        // opener.
        // The payload is `tt` and NOT the whole `tt\[zz`, because the engine
        // check also counts a token whose text is CONTAINED BY the payload. The
        // escape rule scopes `\[` on its own, and `\[` is inside `tt\[zz`, so
        // the wide spelling reported this construct as covered with the label
        // rule matching nothing at all - a check that could not fail. Measured
        // by deleting the escape branch from the label body: with `tt` the entry
        // fails, with `tt\[zz` it passes.
        name: "link text with an escaped opening bracket",
        sample: "a [tt\\[zz](/u) b", payload: "tt", textmate: "string.other.link.title",
    },
    {
        // The other direction, and this one never worked: an escaped `]` is not
        // the close, so `[zz\]yy](/u)` is a link whose text is `zz]yy`. Narrow
        // payload for the same reason as above - `\]` is a scoped token of its
        // own and sits inside any payload that spells the escape out.
        name: "link text with an escaped closing bracket",
        sample: "a [zz\\]yy](/u) b", payload: "yy", textmate: "string.other.link.title",
    },
    {
        // A bracketed SPAN takes the same balanced label - `[t[z]]{.c}` renders
        // `<span class="c">t[z]</span>` - so it is the same defect and shares the
        // fix. TextMate has no span-text rule at all, which is a separate gap.
        name: "span whose text holds a bracket run",
        sample: "a [t[z]]{.c} b", payload: "t[z]", textmate: "string.other.link.title",
    },
    { name: "footnote ref", sample: "text[^1] end", payload: "1", textmate: "constant.other.footnote" },
    { name: "mention", sample: "hi @user here", payload: "@user", textmate: "mention" },
    { name: "tag", sample: "a #tagname here", payload: "#tagname", textmate: "tag" },
    { name: "inline math", sample: "a $`e=mc^2` b", payload: "e=mc^2", textmate: "markup.math" },
    { name: "inline literal", sample: "a !`/kaet/` b", payload: "/kaet/", textmate: "markup.raw.inline.content" },
    { name: "inline literal multi", sample: "a !``x ` y`` b", payload: "x ` y", textmate: "markup.raw.inline.content" },
    { name: "delimited inline comment", sample: "a {% hidden %} b", payload: "hidden", textmate: "comment.block.inline" },
    { name: "inline extension", sample: ":youtube[ID]{.a}", payload: "youtube", textmate: "extension" },
    { name: "inline extension with attrs", sample: "a :kbd[Ctrl]{.k} b", payload: "Ctrl", textmate: "string.unquoted.extension" },
    { name: "symbol shortcode", sample: "Great :rocket: end", payload: "rocket", textmate: "constant.language.symbol" },
    { name: "citation", sample: "see [@smith2020] here", payload: "smith2020", textmate: "variable.other.citation.key" },
    { name: "code callout", sample: "<1> explains the line", payload: "1", textmate: "constant.numeric.callout" },
    { name: "inline footnote", sample: "a ^[inline note] b", payload: "inline note", textmate: "string.other.footnote.inline" },
    { name: "smart typography", sample: "a -- b", payload: "--", textmate: "typography" },
    { name: "hard break", sample: "line\\\n next", payload: "\\", textmate: "hard-break" },
    { name: "ordered marker bare dot", sample: ". first", payload: ".", textmate: "punctuation.definition.list.numbered" },
    { name: "task state deferred", sample: "- [>] deferred", payload: ">", textmate: "constant.language.checkbox" },
    {
        // The state character is the bullet character, so the payload has to
        // differ per grammar to stay sharp: TextMate scopes the bare `-`
        // between the brackets, the engines keep the brackets in the token.
        // A shared `-` would be satisfied by the list marker in both engines -
        // a check that cannot fail.
        name: "task state dropped", sample: "- [-] dropped", payload: "-",
        enginePayload: "[-]", textmate: "constant.language.checkbox",
    },
    { name: "definition term", sample: ":: term\n:  definition", payload: "term", textmate: "entity.name.tag.definition.term" },
    { name: "table continuation row", sample: "+ cont cell |", payload: "+", textmate: "keyword.operator.table.continuation" },
    { name: "continuation marker", sample: "- step\n+\n> note", payload: "+", textmate: "list" },
    { name: "caption", sample: "> q\n^ Attribution", payload: "Attribution", textmate: "caption" },
    { name: "numbered caption", sample: "^ Figure #: A sunset", payload: "A sunset", textmate: "markup.caption" },
    { name: "heading", sample: "# Title", payload: "Title", textmate: "heading" },
    { name: "fenced code", sample: "```php\ncode\n```", payload: "php", textmate: "fenced_code.block.language" },
    { name: "blockquote", sample: "> quoted", payload: "quoted", textmate: "quote" },
    { name: "list marker", sample: "- item", payload: "-", textmate: "punctuation.definition.list" },
    { name: "nested list markers", sample: "- - A", payload: "- ", textmate: "punctuation.definition.list.unnumbered" },
    { name: "task marker", sample: "- [x] done", payload: "x", textmate: "constant.language.checkbox" },
    { name: "table header", sample: "|= Name |= Age |", payload: "|=", textmate: "keyword.operator.table.header" },
    { name: "admonition", sample: "::: note\nbody\n:::", payload: "note", textmate: "admonition" },
    { name: "line comment", sample: "%% comment line", payload: "comment line", textmate: "comment" },
    { name: "heading in a list item", sample: "- item\n\n  # Title", payload: "Title", textmate: "heading" },
    { name: "blockquote in a list item", sample: "- item\n\n  > quoted", payload: "quoted", textmate: "quote" },
    { name: "caption in a list item", sample: "- item\n\n  | a |\n  ^ Attribution", payload: "Attribution", textmate: "caption" },
    { name: "admonition in a list item", sample: "- item\n\n  ::: note\n  body\n  :::", payload: "note", textmate: "admonition" },
    { name: "table row in a list item", sample: "- item\n\n  | a | b |", payload: "|", textmate: "punctuation.separator.table" },
    { name: "abbreviation in a list item", sample: "- item\n\n  *[HTML]: HyperText", payload: "HTML", textmate: "abbreviation" },
    { name: "fenced code in a list item", sample: "- item\n\n  ```js\n  x\n  ```", payload: "js", textmate: "fenced_code" },
    { name: "heading whose content starts with NBSP", sample: "#  Title", payload: "Title", textmate: "markup.heading" },
    { name: "bullet whose content starts with NBSP", sample: "-  item", payload: "-", textmate: "list.unnumbered" },
    { name: "superscript brace flanked", sample: "a {^sup^} end", payload: "sup", textmate: "markup.superscript" },
    { name: "subscript brace flanked", sample: "water {,sub,} here", payload: "sub", textmate: "markup.subscript" },
    { name: "inline literal punct", sample: "a !`/kaet/` b", payload: "!", textmate: "punctuation.definition.literal" },
    { name: "inline literal multi punct", sample: "a !``x ` y`` b", payload: "!", textmate: "punctuation.definition.literal" },
    { name: "link punct", sample: "[text](https://x.de)", payload: "[", textmate: "punctuation.definition.link" },
    { name: "wiki link", sample: "[Page Name][]", payload: "Page Name", textmate: "string.other.link.title" },
    { name: "cross-ref", sample: "see </#section-id> here", payload: "section-id", textmate: "markup.underline.link.cross-reference" },
    /*
     * The two reference IMAGE spellings, which had no entry here at all - so
     * the only thing asserting them was the bracket-run pair below, whose
     * TextMate selector had been written to the defect (carve-grammars#307).
     * The payload is the alt text and the selector is an IMAGE scope, which is
     * what separates these from the reference LINK the three grammars used to
     * claim them as.
     */
    {
        name: "reference image", sample: "a ![alt][r] b", payload: "alt",
        textmate: "string.other.image.alt",
        skip: { highlightjs: "no reference-image rule: the reference-link mode claims the brackets and leaves the `!` as prose - markup-carve/carve-grammars#317" },
    },
    {
        name: "collapsed reference image", sample: "a ![alt][] b", payload: "alt",
        textmate: "string.other.image.alt",
        skip: { highlightjs: "no reference-image rule: the reference-link mode claims the brackets and leaves the `!` as prose - markup-carve/carve-grammars#317" },
    },
    { name: "citation integral", sample: "see [+@smith2020] here", payload: "+", textmate: "keyword.operator.citation.integral" },
    { name: "citation punct", sample: "see [@smith2020] here", payload: "[", textmate: "punctuation.definition.citation" },
    { name: "callout marker in fence", sample: "``` js\nconst a = 1 <1>\n```", payload: "1", textmate: "constant.numeric.callout" },
    { name: "empty link title", sample: "[x](u \"\")", payload: "u", textmate: "markup.underline.link" },
    { name: "ordered marker decimal", sample: "1. first", payload: "1.", textmate: "punctuation.definition.list.numbered" },
    { name: "ordered marker paren", sample: "1) first", payload: "1)", textmate: "punctuation.definition.list.numbered" },
    { name: "ordered marker alpha", sample: "a. first", payload: "a.", textmate: "punctuation.definition.list.numbered" },
    { name: "ordered marker roman", sample: "iv. fourth", payload: "iv.", textmate: "punctuation.definition.list.numbered" },
    // A roman run is CASE-CONSISTENT, and both spellings open a list. The mixed-case
    // counter-examples are in LITERALS below; the two here are what a rule that rejects
    // multi-letter runs outright would break (#118).
    { name: "ordered marker roman lowercase run", sample: "ivx. text", payload: "ivx.", textmate: "punctuation.definition.list.numbered" },
    { name: "ordered marker roman uppercase run", sample: "IVX. text", payload: "IVX.", textmate: "punctuation.definition.list.numbered" },
    // A word made only of roman letters IS a marker - `mix.` is 1009. So the case split
    // is the fix rather than a length or dictionary rule.
    { name: "ordered marker roman word", sample: "mix. text", payload: "mix.", textmate: "punctuation.definition.list.numbered" },
    { name: "ordered marker bare dot with attrs", sample: ".{#x} attributed", payload: ".", textmate: "punctuation.definition.list.numbered" },
    // The valid half of #85. The marker takes ONE glued attribute block and
    // then content; these are the shapes a lookahead that stops at the first
    // `}` gets wrong, since a quoted value may contain `}` and may escape its
    // own quote. All four render as list items (checked against the engine).
    { name: "ordered marker with glued attributes", sample: "1.{#x} item", payload: "1.", textmate: "punctuation.definition.list.numbered" },
    // The bullet's half of the same rule. Only the ordered branch had the guard, so a
    // glued BULLET went uncoloured in all three grammars (#126).
    { name: "bullet with glued attributes", sample: "-{#x} item", payload: "-", textmate: "punctuation.definition.list.unnumbered" },
    // Valid payloads that are easy to reject by accident: an EMPTY block attaches
    // nothing, and bare keys are two boolean attributes.
    { name: "bullet with an empty glued block", sample: "-{} item", payload: "-", textmate: "punctuation.definition.list.unnumbered" },
    { name: "bullet with bare-key attributes", sample: "-{not attrs} item", payload: "-", textmate: "punctuation.definition.list.unnumbered" },
    { name: "star bullet with glued attributes", sample: "*{.c} item", payload: "*", textmate: "punctuation.definition.list.unnumbered" },
    { name: "bullet with a brace in a quoted attribute value", sample: "-{title=\"a}b\"} item", payload: "-", textmate: "punctuation.definition.list.unnumbered" },
    // THE SAME RULE, WITH THE NEWEST ATTRIBUTE ITEM. The marker rules look past
    // a whole attribute block to decide there is a marker at all, and each spelled
    // the item alternation out separately from the attribute rule's. So when the
    // language attribute joined the attribute rule, `-{:fr} item` lost its marker
    // in Prism and highlight.js while `-{.c} item` above kept it, and every
    // language-attribute case in this file passed throughout: they all feed the
    // block at the start of a line or after a `]`, never glued to a marker.
    { name: "bullet with a glued language attribute", sample: "-{:fr} item", payload: "-", textmate: "punctuation.definition.list.unnumbered" },
    { name: "ordered marker with a glued language attribute", sample: "1.{:fr} item", payload: "1.", textmate: "punctuation.definition.list.numbered" },
    // The checkbox after a glued block is NOT scoped in any Carve TextMate grammar -
    // `task_item` runs before `list_item` and has no glued branch - but the bullet is.
    { name: "task bullet with glued attributes", sample: "-{.c} [x] done", payload: "-", textmate: "punctuation.definition.list.unnumbered" },
    { name: "ordered marker with a brace in a quoted attribute value", sample: "1.{title=\"a}b\"} item", payload: "1.", textmate: "punctuation.definition.list.numbered" },
    { name: "ordered marker with a brace in a single-quoted attribute value", sample: "1.{title='a}b'} item", payload: "1.", textmate: "punctuation.definition.list.numbered" },
    { name: "ordered marker with an escaped quote in an attribute value", sample: "1.{title=\"a\\\"b\"} item", payload: "1.", textmate: "punctuation.definition.list.numbered" },
    { name: "ordered marker whose content is a brace span", sample: "1.{#x} {*bold*}", payload: "1.", textmate: "punctuation.definition.list.numbered" },
    { name: "symbol punct", sample: "Great :rocket: end", payload: ":", textmate: "punctuation.definition.symbol" },
    { name: "symbol leading plus", sample: "Vote :+1: now", payload: "+1", textmate: "constant.language.symbol" },
    { name: "escape", sample: "a \\*literal\\* b", payload: "\\*", textmate: "constant.character.escape" },
    { name: "raw inline", sample: "a `<br>`{=html} b", payload: "<br>", textmate: "raw" },
    { name: "thematic break", sample: "a\n\n---\n\nb", payload: "---", textmate: "separator" },
    { name: "thematic break asterisks", sample: "a\n\n***\n\nb", payload: "***", textmate: "separator" },
    { name: "thematic break underscores", sample: "a\n\n___\n\nb", payload: "___", textmate: "separator" },
    { name: "thematic break in a list item", sample: "- item\n\n  ***", payload: "***", textmate: "separator" },
    { name: "ol marker", sample: "1. item", payload: "1.", textmate: "punctuation.definition.list" },
    { name: "task unchecked", sample: "- [ ] todo", payload: "[", textmate: "checkbox" },
    { name: "list attr", sample: "-{.c} styled", payload: ".c", textmate: "attributes", attr: true },
    { name: "fence open", sample: "```php\ncode\n```", payload: "```", textmate: "punctuation.definition.fenced" },
    { name: "fence header", sample: "```php \"Header\" [Label]\ncode\n```", payload: "Header", textmate: "string.quoted.double.fenced.title" },
    { name: "fence raw html", sample: "```=html\n<b>x</b>\n```", payload: "=html", textmate: "fenced_code.block.language" },
    { name: "admonition custom", sample: "::: myclass\nbody\n:::", payload: "myclass", textmate: "admonition" },
    { name: "layout pipe", sample: "::: |\nRoses\n:::", payload: "|", textmate: "admonition" },
    { name: "admonition title", sample: "::: note \"Custom Title\"\nbody\n:::", payload: "Custom Title", textmate: "string.quoted.double.admonition.title" },
    { name: "admonition title and label", sample: "::: tip \"Pro Tip\" [Build]\nbody\n:::", payload: "[Build]", textmate: "constant.other.label.admonition" },
    { name: "admonition label only", sample: "::: tab [Overview]\nbody\n:::", payload: "[Overview]", textmate: "constant.other.label.admonition" },
    { name: "typeless flush label", sample: ":::[First]\nbody\n:::", payload: "[First]", textmate: "constant.other.label.admonition" },
    { name: "nested longer fence", sample: ":::: tabs\nbody\n::::", payload: "tabs", textmate: "admonition" },
    // Composite figures (PART 9 §4c, markup-carve/carve#1215). A BARE `::: figure`
    // opener is ONE figure of ordered panels, so it carries its own scope rather
    // than the generic container's. The counter-examples - the same kind word with
    // a title and with a label, which stay generic containers - are in LITERALS
    // below; the two halves belong together and neither is worth much alone.
    { name: "composite figure opener", sample: "::: figure\n![one](a.png)\n^ (a) One\n:::\n^ Figure #: Group\n", payload: "figure", textmate: "entity.name.tag.figure-group" },
    // The group caption is §4's sixth host: the `^ ` line after the CLOSING
    // fence, which is the one position no other container kind gives a caption.
    { name: "composite figure group caption", sample: "::: figure\n![one](a.png)\n:::\n^ Figure #: Group\n", payload: "Group", textmate: "markup.caption" },
    { name: "table sep", sample: "| a | b |", payload: "|", textmate: "punctuation.separator.table" },
    { name: "table align", sample: "|=> Age |", payload: ">", textmate: "keyword.operator.table.alignment" },
    {
        name: "table paired vertical align",
        sample: "|=>^ Qty |",
        payload: ">^",
        textmate: "keyword.operator.table.alignment",
        skip: {
            prism: "the Prism grammar scopes whole table rows rather than alignment runs",
            highlightjs: "the highlight.js grammar scopes whole table rows rather than alignment runs",
        },
    },
    { name: "table rowspan", sample: "| ^ | spanned |", payload: "^", textmate: "keyword.operator.table.rowspan" },
    { name: "table colspan", sample: "| a | < |", payload: "<", textmate: "keyword.operator.table.colspan" },
    { name: "gfm delimiter row", sample: "| a | b |\n|---|--:|", payload: "--:", textmate: "keyword.operator.table.alignment" },
    { name: "abbreviation", sample: "*[HTML]: HyperText", payload: "HTML", textmate: "abbreviation" },
    { name: "table continuation in a list item", sample: "- item\n\n  | a |\n  + cont cell |", payload: "+", textmate: "keyword.operator.table.continuation" },
    { name: "ref def label", sample: "[r]: https://ref.example", payload: "r", textmate: "constant.other.reference.link" },
    { name: "ref def url", sample: "[r]: https://ref.example", payload: "https://ref.example", textmate: "markup.underline.link" },
    { name: "ref def title", sample: "[r]: https://ref.example \"Site\"", payload: "Site", textmate: "string.quoted.link.title" },
    {
        // highlight.js has no front-matter rule: a bare `^---$` begin would also
        // match a `---` thematic break mid-document and swallow everything up to
        // the next one, so the grammar leaves front matter alone. (A
        // document-start assertion is expressible - `(?<![\s\S])`, which
        // carve-grammars#154 uses for the byte order mark - but giving
        // highlight.js a front-matter rule is its own change, not this one.) The
        // grammar records the decision at its `contains` list; this records it
        // where the coverage question is asked.
        name: "frontmatter", sample: "---\ntitle: Doc\n---\n\nText", payload: "title",
        textmate: "frontmatter",
    },
    { name: "display math", sample: "$$`\\int_0^1 x`", payload: "\\int_0^1 x", textmate: "markup.math" },
    { name: "trailing comment", sample: "text %% trailing", payload: "trailing", textmate: "comment" },
    { name: "block comment", sample: "%%%\nhidden\n%%%", payload: "hidden", textmate: "comment" },
    { name: "block comment with a tail", sample: "%%% html\nhidden\n%%% end", payload: "hidden", textmate: "comment" },
    /*
     * A LEADING BYTE ORDER MARK, on every opener family (carve-grammars#154).
     *
     * A mark at the start of a document is not content: the spec says so ("Line
     * endings and a byte order mark"), and carve-js, carve-rs and carve-php all
     * strip it before the block scanner runs. It is neither a space nor a tab, so
     * before the fix it sat between the line start and the marker and defeated
     * EVERY line-anchored opener in all three grammars - the heading the issue
     * sampled, and also the fence, which Prism and highlight.js then handed to the
     * inline code rule, and front matter, which TextMate coloured as a smart-
     * typography em dash. Covering only the heading would have left the rest dark
     * while reading as fixed, which is why this is a family rather than a case.
     *
     * WHY THIS FILE IS THE HOME, measured rather than assumed. The corpus DOES
     * carry a real mark - `spec/tests/corpus/250-line-endings-and-a-byte-order-
     * mark-3.crv` begins `ef bb bf`, and survives because the spec repo marks
     * `tests/corpus/**` as `-text` so git normalizes nothing. That one file is
     * what surfaced this, and its snapshots moved with the fix. But it is the only
     * shape the corpus has: a mark before a HEADING. The other fourteen opener
     * families have no corpus case, this repo authors no corpus of its own (it
     * consumes the spec submodule), and a snapshot pins whatever a grammar does -
     * which is precisely how a defect this wide sat under 1336 matching snapshots.
     *
     * So the family lives here, where the sample is a JavaScript string literal
     * and the mark is written `\uFEFF`: an escape made of ASCII, which no editor,
     * `.gitattributes` rule or normalizing step can quietly remove, in a file that
     * needs no `-text` protection to stay correct. Both sweeps read this
     * inventory, so one entry forces the decision in all three grammars at once.
     *
     * The counter-example is in LITERALS below: a mark BELOW the first line opens
     * nothing. That pair is what separates the fix from `^\uFEFF?`, which would
     * admit the mark at every line start.
     */
    { name: "byte order mark before a heading", sample: "\uFEFF# Title", payload: "Title", textmate: "heading" },
    {
        // DISCRIMINATES IN TEXTMATE ONLY, and that is written down rather than
        // assumed. Reverting the fix leaves this unscoped in Prism (caught) but
        // in highlight.js the run degrades to `**`+`*` and the `**` carries
        // `strong` - so the engine sweep's COVERED invariant still holds and the
        // case passes there. The engine sweep deliberately asserts that a payload
        // is scoped at ALL, never what the scope is called (see its header), so a
        // construct that degrades into a DIFFERENT construct is invisible to it.
        // The TextMate sweep asserts the name and fails.
        name: "byte order mark before a thematic break", sample: "\uFEFF***", payload: "***",
        textmate: "separator",
    },
    { name: "byte order mark before a list marker", sample: "\uFEFF- item", payload: "-", textmate: "punctuation.definition.list" },
    { name: "byte order mark before an ordered marker", sample: "\uFEFF1. item", payload: "1.", textmate: "punctuation.definition.list" },
    { name: "byte order mark before a task marker", sample: "\uFEFF- [x] done", payload: "x", textmate: "constant.language.checkbox" },
    { name: "byte order mark before a quote marker", sample: "\uFEFF> quoted", payload: "quoted", textmate: "quote" },
    {
        // THE SAME LIMITATION, and the sharpest instance of it. Reverting the fix
        // makes both engines hand the whole fence to the INLINE code rule, so
        // `php` is scoped `code` and COVERED holds: this case passes in Prism and
        // in highlight.js against a grammar that mis-colours the line. It is not
        // expressible as a LITERALS counter-example either - Prism's correct scope
        // path is `code-block>language`, which `includes('code')` cannot be told
        // apart from the inline `code` it must reject. Only the TextMate sweep,
        // which asserts `fenced_code.block.language` by name, discriminates here;
        // measured, reverting the fix fails 15/15 in TextMate, 14/15 in Prism and
        // 12/14 in highlight.js, and this entry is the Prism miss.
        name: "byte order mark before a fence", sample: "\uFEFF```php\ncode\n```", payload: "php",
        textmate: "fenced_code.block.language",
    },
    { name: "byte order mark before a div", sample: "\uFEFF::: note\nbody\n:::", payload: "note", textmate: "admonition" },
    { name: "byte order mark before a table row", sample: "\uFEFF| a | b |", payload: "|", textmate: "punctuation.separator.table" },
    { name: "byte order mark before a caption", sample: "\uFEFF^ Attribution", payload: "Attribution", textmate: "caption" },
    { name: "byte order mark before a definition term", sample: "\uFEFF:: term\n:  definition", payload: "term", textmate: "entity.name.tag.definition.term" },
    { name: "byte order mark before an abbreviation", sample: "\uFEFF*[HTML]: HyperText", payload: "HTML", textmate: "abbreviation" },
    { name: "byte order mark before a reference definition", sample: "\uFEFF[r]: https://ref.example", payload: "r", textmate: "constant.other.reference.link" },
    { name: "byte order mark before a block comment", sample: "\uFEFF%%%\nhidden\n%%%", payload: "hidden", textmate: "comment" },
    {
        // The one opener whose skip carries over: highlight.js has no front-matter
        // rule at all (see the `frontmatter` entry above), so there is nothing for
        // the allowance to land in there.
        name: "byte order mark before front matter", sample: "\uFEFF---\ntitle: Doc\n---\n\nText",
        payload: "title", textmate: "frontmatter",
    },
    // COLUMN SENSITIVITY, the other half. A definition AT a list item's content
    // column IS a definition and must stay highlighted - carve-php#765 and
    // carve-rs#570 both landed that reading, and carve#801 since made
    // definitions collectable in EVERY block-level container, so indented
    // definitions are first-class rather than an edge case.
    //
    // This guards the tempting wrong fix for its paired negative case in the
    // textmate sweep: narrowing the definition pattern to flush-left only would
    // silence that failure and break this, trading a rare wrong answer for a
    // common one.
    {
        name: "link ref definition at a list item content column",
        sample: "- a\n  [r]: /u\n",
        payload: "r",
        textmate: "meta.link.reference.def",
        skip: {
            prism: "no container model, so an indented definition is out of reach - see the textmate sweep for the column-sensitive pair",
            highlightjs: "no container model, so an indented definition is out of reach - see the textmate sweep for the column-sensitive pair",
        },
    },

    // A TASK item's content column is 2, not 6 - the checkbox is content, not
    // part of the marker. Verified against carve-php: `- [ ] a` with a
    // two-space definition under it DOES collect (the reference resolves).
    {
        name: "link ref definition under a task list item",
        sample: "- [ ] a\n  [r]: /u\n",
        payload: "r",
        textmate: "meta.link.reference.def",
        skip: {
            prism: "no container model - see the textmate sweep for the column-sensitive pair",
            highlightjs: "no container model - see the textmate sweep for the column-sensitive pair",
        },
    },
];


/**
 * Shapes that must NOT be scoped as the construct they resemble.
 *
 * A positive case cannot catch an over-eager rule: `1.{#x} item` and `1.{#x}`
 * differ only in what follows the attribute block, and a rule that scopes both
 * passes every coverage assertion in this file. So the marker rules carry
 * their counter-examples here, and both sweeps assert them.
 *
 * `scopes` names the selector per grammar because the vocabularies differ -
 * Prism says `list`, highlight.js says `bullet`, TextMate says
 * `list.numbered`. A selector naming no scope the grammar declares is a check
 * that cannot fail; the TextMate sweep rejects those outright.
 *
 * @type {Array<{name: string, sample: string, payload: string, scopes: object}>}
 */
export const LITERALS = [
    {
        name: 'a lone vertical table marker is content, not alignment',
        sample: '|^ value |\n',
        payload: '^',
        scopes: { prism: 'operator', highlightjs: 'meta', textmate: 'keyword.operator.table.alignment' },
    },
    {
        name: 'a reverse-order table alignment pair is content, not alignment',
        sample: '|v> value |\n',
        payload: 'v>',
        scopes: { prism: 'operator', highlightjs: 'meta', textmate: 'keyword.operator.table.alignment' },
    },
    // `~>` reaches the rule by a different route than `v>`. Before #277 the
    // alternation admitted BOTH orders, and a leading `~` followed by `>` or `<`
    // had its own branch - the pair could have been fixed for `v>` and left
    // scoping `~>`. One case per route, so a partial fix cannot pass.
    {
        name: 'a vertical-first middle pair is content, not alignment',
        sample: '|~> value |\n',
        payload: '~>',
        scopes: { prism: 'operator', highlightjs: 'meta', textmate: 'keyword.operator.table.alignment' },
    },
    // THE COUNTER-EXAMPLE TO THE BRACKET-RUN CONSTRUCTS ABOVE (carve-grammars#226).
    //
    // An UNBALANCED opener is not a label. `a [outer[z](/u) b` renders
    // `a [outer<a href="/u">z</a> b` - the outer `[` is prose and the LINK
    // starts at the inner one. A `[^\]]*` body could not say that: it scanned
    // past the inner `[` as ordinary text and scoped the whole run from the
    // outer bracket.
    //
    // This is the shape the positives cannot catch. Widening the body to admit
    // `[` at all passes every nested-bracket construct above and fails here,
    // which is the only reason both halves exist.
    {
        name: 'an unbalanced bracket run does not open a label',
        sample: 'a [outer[z](/u) b\n',
        // `outer`, not `outer[z`: Prism splits the label at the inner bracket, so
        // before the fix no token contained `outer[z` and the check could not
        // fail there. `outer` sat in one token, scoped `url`.
        payload: 'outer',
        // TextMate's selector is the label capture and not a bare `link`: Shiki
        // merges the prose `a [outer` with the following `[`, whose scope IS
        // `punctuation.definition.link`, so `link` would report a failure the
        // grammar is not making.
        scopes: { prism: 'url', highlightjs: 'link', textmate: 'string.other.link.title' },
    },
    // An INLINE attribute block does not span lines. `attributes` pads and separates
    // with `opt_ws` - "spaces/tabs only, no line breaks" (markup-carve/carve#897) -
    // and only a standalone attribute LINE crosses a newline, through
    // `attr_separator`'s continuation. One `\s`-separated pattern served both roles,
    // so this coloured as a block where every engine renders prose (#164). Corpus
    // 253 is the same shape.
    {
        name: 'an inline attribute block does not span lines',
        sample: '*x*{.a\n.b}\n',
        // `.b`, not `{.a`: Prism splits the block into `{`, `.a`, newline, `.b`, `}`,
        // so no token ever contains `{.a` and the check could not fail there.
        payload: '.b',
        scopes: { prism: 'attr', highlightjs: 'attr', textmate: 'meta.attributes' },
    },
    // A bullet glued to an attribute block still needs content after the block, the
    // same as an ordered marker (#126).
    // An INVALID payload means the `{` is literal content and the line is prose - a
    // brace-delimited run is not enough. `-{+a+} text` is corpus
    // 90-list-item-attributes-6, which a guard accepting any brace run coloured as a
    // list. The colon is not an identifier character in carve-js; the marker guards
    // were written that way from the start, while the standalone attribute rules
    // admitted one until #135 - those counter-examples are at the end of this list.
    {
        name: 'bullet whose glued block is an insertion span',
        sample: '-{+a+} text\n',
        payload: '-',
        scopes: { prism: 'list', highlightjs: 'bullet', textmate: 'list.unnumbered' },
    },
    {
        name: 'bullet whose glued block has a digit-first key',
        sample: '-{2=v} text\n',
        payload: '-',
        scopes: { prism: 'list', highlightjs: 'bullet', textmate: 'list.unnumbered' },
    },
    {
        name: 'bullet whose glued block has a colon in a key',
        sample: '-{a:b} item\n',
        payload: '-',
        scopes: { prism: 'list', highlightjs: 'bullet', textmate: 'list.unnumbered' },
    },
    {
        name: 'ordered marker whose glued block is an insertion span',
        sample: '1.{+a+} text\n',
        payload: '1.',
        scopes: { prism: 'list', highlightjs: 'bullet', textmate: 'list.numbered' },
    },
    {
        name: 'ordered marker whose glued block has a digit-first key',
        sample: '1.{2=v} text\n',
        payload: '1.',
        scopes: { prism: 'list', highlightjs: 'bullet', textmate: 'list.numbered' },
    },
    {
        name: 'bullet whose attribute block has no content after it',
        sample: '-{#x}\n\nafter\n',
        payload: '-',
        scopes: { prism: 'list', highlightjs: 'bullet', textmate: 'list.unnumbered' },
    },
    {
        name: 'bullet with two glued attribute blocks',
        sample: '-{#x}{.y} item\n',
        payload: '-',
        scopes: { prism: 'list', highlightjs: 'bullet', textmate: 'list.unnumbered' },
    },
    // A MIXED-CASE roman run is not a marker. One `[ivxlcdmIVXLCDM]` class matched any
    // mixture, so `Vim. text` and `Mix. text` coloured as lists where the engine renders
    // paragraphs (#118) - and those are exactly the shape of a word starting a sentence,
    // which is the risk the rule's own comment was written to avoid.
    {
        name: 'mixed-case roman run is not a marker',
        sample: 'Vim. text\n',
        payload: 'Vim.',
        scopes: { prism: 'list', highlightjs: 'bullet', textmate: 'list.numbered' },
    },
    {
        name: 'mixed-case roman run is not a marker, other order',
        sample: 'Mix. text\n',
        payload: 'Mix.',
        scopes: { prism: 'list', highlightjs: 'bullet', textmate: 'list.numbered' },
    },
    {
        name: 'a two-letter mixed-case roman run is not a marker',
        sample: 'Ix. text\n',
        payload: 'Ix.',
        scopes: { prism: 'list', highlightjs: 'bullet', textmate: 'list.numbered' },
    },
    // An ordered marker glued to an attribute block with nothing after it is
    // prose: `1.{#x}` renders as a paragraph, `1.{#x} item` as a list item.
    // All three grammars scoped the marker in both (#85).
    {
        name: 'ordered marker whose attribute block has no content after it',
        sample: '1.{#x}\n\nafter\n',
        payload: '1.',
        scopes: { prism: 'list', highlightjs: 'bullet', textmate: 'list.numbered' },
    },
    {
        name: 'bare dot marker whose attribute block has no content after it',
        sample: '.{#x}\n\nafter\n',
        // `.` rather than `.{`: TextMate scopes the whole line as one token,
        // the engines split at the brace, so the wider spelling matched no
        // engine token at all and the check could not fail there.
        payload: '.',
        scopes: { prism: 'list', highlightjs: 'bullet', textmate: 'list.numbered' },
    },
    // Two glued blocks are prose even with content after them, because the
    // marker takes at most one attribute block.
    {
        name: 'ordered marker with two glued attribute blocks',
        sample: '1.{#x}{.y} item\n',
        payload: '1.',
        scopes: { prism: 'list', highlightjs: 'bullet', textmate: 'list.numbered' },
    },
    // A `:` description line scopes as a definition only when a real `:: `
    // term precedes it (carve-grammars#91) - every grammar here used to
    // scope the marker unconditionally, so the engines render a paragraph
    // where the grammars drew a `<dl>`. `scopes` names what the OLD,
    // ungated rule produced (checked against the shared LITERALS floor
    // below): prism's flat 'list' token, highlight.js's 'title' class, and
    // TextMate's `punctuation.definition.list.definition` scope.
    {
        name: 'a description line after plain prose has no term above it',
        sample: 'plain para\n:  d\n',
        payload: ':',
        scopes: { prism: 'list', highlightjs: 'title', textmate: 'list.definition' },
    },
    // Same rule, the corpus 176 shape: the term line IS `::`, but its
    // separator is a tab, not the literal space PART 9's marker-separator
    // clause requires (a tab never satisfies it - the ruling on
    // markup-carve/carve#698 that also settled the tab-in-term-content
    // question). `::\tterm` therefore never opens a term, so the `:  d`
    // line below it has nothing to belong to either.
    {
        name: 'a description line below a tab-disqualified term marker',
        sample: '::\tterm\n:  d\n',
        payload: ':',
        scopes: { prism: 'list', highlightjs: 'title', textmate: 'list.definition' },
    },
    // STRICT ATTRIBUTE IDENTIFIER, on the STANDALONE attribute rule rather than the
    // marker guards above. `identifier` is `(letter | '_'), {letter | digit | '_' |
    // '-'}` (PART 7), and PART 9 §14 makes one invalid name enough to leave the whole
    // block literal - so `[x]{a:b}` renders `<p>[x]{a:b}</p>`, braces and all. Prism
    // and highlight.js built their block from `[A-Za-z_][\w:-]*` and scoped these as
    // attribute blocks, which also handed the preceding `[x]` to the span rule: a line
    // of prose came out looking like a resolved construct (#135). Both the bare-key
    // and the key=value form are here, because one class serves both branches.
    {
        name: 'a colon in a bare attribute key',
        sample: '[x]{a:b}\n',
        payload: 'a:b',
        scopes: { prism: 'attributes', highlightjs: 'attr', textmate: 'meta.attributes' },
    },
    {
        name: 'a colon in an attribute key with a value',
        sample: '[x]{xmlns:x=y}\n',
        payload: 'xmlns:x',
        scopes: { prism: 'attributes', highlightjs: 'attr', textmate: 'meta.attributes' },
    },
    // The SHORTHAND branch of the same rule. `identifier` is what `.class` and `#id`
    // are spelled with too, so the colon is illegal in all four attribute forms; the
    // shorthand branch has always written it `[.#][A-Za-z_][\w-]*` and so #139 had
    // nothing to change there - which is exactly why nothing pinned it. The key branch
    // acquired ITS colon by one character class serving both branches, so the next edit
    // that shares a class again widens the shorthand too and no key-only case notices.
    // Verified against the pinned engine: `[x]{.a:b}` renders `<p>[x]{.a:b}</p>`.
    //
    // The payload is the leading `.a`/`#a` rather than the whole item, for the reason
    // the digit-first case below records: the inner id and class rules stop at the
    // colon, so a grammar that admitted the block would still hold no token spelling
    // `.a:b`, and a check nothing can fail is worse than no check. `.a` inside this
    // source can only be scoped by the attribute rule claiming the block.
    {
        name: 'a colon in an attribute class',
        sample: '[x]{.a:b}\n',
        payload: '.a',
        scopes: { prism: 'attributes', highlightjs: 'attr', textmate: 'meta.attributes' },
    },
    {
        // The engine's own answer here is `<p>[x]{<span class="tag">#a</span>:b}</p>` -
        // the block is prose and the `#a` in it is a tag. `constructs.js` carries that
        // positive half; this is the half that must not happen. Both move together.
        name: 'a colon in an attribute id',
        sample: '[x]{#a:b}\n',
        payload: '#a',
        scopes: { prism: 'attributes', highlightjs: 'attr', textmate: 'meta.attributes' },
    },
    {
        // A QUOTED value does not rescue an invalid key - the value grammar is not
        // consulted until the name is an `identifier`. Its own branch in the pattern is
        // separate from the unquoted one, so a loosening written only for quoted values
        // (the shape XML-ish namespaced attributes arrive in) would leave the two key
        // cases above green. Payload `k:` for the same token-boundary reason as above.
        name: 'a colon in an attribute key with a quoted value',
        sample: '[x]{k:v="q"}\n',
        payload: 'k:',
        scopes: { prism: 'attributes', highlightjs: 'attr', textmate: 'meta.attributes' },
    },
    // The three shapes a fix that OVER-tightens the class would break. All three are
    // already literal in every grammar, so they pin what must not move while the colon
    // is removed - a first-character rule that is right for the wrong reason (say, one
    // that also rejects `-` or a digit after the first character) fails here.
    {
        // `2` rather than `2=v`: a grammar that accepted this would split the block
        // at the `=`, and no Prism token would hold the wider spelling at all - so
        // the check could not fail there. Found by mutating the class to admit a
        // digit-first key, which this caught only once the payload was the key.
        name: 'a digit-first attribute key',
        sample: '[x]{2=v}\n',
        payload: '2',
        scopes: { prism: 'attributes', highlightjs: 'attr', textmate: 'meta.attributes' },
    },
    {
        name: 'a dash-first attribute key',
        sample: '[x]{-a}\n',
        payload: '-a',
        scopes: { prism: 'attributes', highlightjs: 'attr', textmate: 'meta.attributes' },
    },
    {
        name: 'a dash-first id',
        sample: '[x]{#-id}\n',
        payload: '#-id',
        scopes: { prism: 'attributes', highlightjs: 'attr', textmate: 'meta.attributes' },
    },
    {
        // THE COUNTER-EXAMPLE to the byte order mark family in CONSTRUCTS above,
        // and the case that decides how the allowance is spelled.
        //
        // The spec's rule is about the start of a DOCUMENT, and the engines split
        // on anything else. Measured directly: `# T\n\n\uFEFF- item\n` renders as a
        // paragraph holding literal text in carve-rs and in carve-php, and as a
        // list only in carve-js - whose own `\s` class is Unicode White_Space plus
        // U+FEFF (markup-carve/carve#806), so it is the outlier rather than the
        // rule. A mark that is not at offset 0 is an ordinary zero-width character
        // and opens nothing.
        //
        // Every one of these grammars anchors with `^` under a multiline flag, so
        // the obvious spelling `^\uFEFF?` admits the mark at EVERY line start and
        // passes all fifteen positives above while getting this wrong. What each
        // grammar needs instead is a real document-start assertion, and the three
        // do not share one: Prism and highlight.js use the JavaScript lookbehind
        // `(?<![\s\S])`, TextMate uses Oniguruma's `\A`, which vscode-textmate
        // resolves against the first line only. One rule, three spellings.
        //
        // PAYLOAD. `Sentinel` rather than the whole marker-plus-text run: Prism
        // splits a heading into `\uFEFF#` (`title>punctuation`) and ` Sentinel`
        // (`title`), so a payload spanning the split is contained by NEITHER
        // token and the check cannot fail there. Found by running the mutation
        // above - it caught highlight.js and TextMate and let Prism through.
        name: 'a byte order mark below the first line',
        sample: 'prose paragraph\n\n\uFEFF# Sentinel\n',
        payload: 'Sentinel',
        scopes: { prism: 'title', highlightjs: 'section', textmate: 'markup.heading' },
    },
    {
        // THE SAME RULE ONE LEVEL DOWN. Prism's definition-term and div-delimiter
        // sub-patterns carry the `m` flag and run against a MULTI-LINE token, so a
        // token-local allowance there let the mark re-open a block on a later line
        // that the document-anchored top-level rule had already refused: this
        // sample scoped `:: second` as a term. Both now carry the full assertion,
        // which at that level resolves against the token's own offset 0 - sound,
        // because a token can only BEGIN with the mark when the top-level opener
        // consumed one. Found in review of carve-grammars#154.
        //
        // Live in Prism, where the over-match was. highlight.js and TextMate leave
        // the line alone either way and pass it for free; a shape that is only
        // wrong in one grammar still belongs in the shared list, because the next
        // person to add a nested `m` pattern will be in whichever grammar they are
        // in.
        name: 'a byte order mark below the first line of a definition list',
        sample: ':: first\ndef one\n\uFEFF:: second\n',
        payload: 'second',
        scopes: { prism: 'definition-term', highlightjs: 'title', textmate: 'entity.name.tag.definition.term' },
    },
    // The other half of the composite-figure constructs above (PART 9 §4c). THE
    // OPENER IS BARE OR IT IS NOT THIS PRODUCTION: the kind word is the same
    // word, and only the tail of the line decides whether this is one figure of
    // panels or the generic Tier-2 container it has always been. A positive case
    // cannot catch a rule that fires on both, which is the whole failure mode
    // here - the two openers differ by nothing else.
    {
        name: 'a quoted title makes a figure opener a generic container',
        sample: '::: figure "Panel set"\nBody.\n:::\n',
        payload: 'figure',
        scopes: { prism: 'figure-group', highlightjs: 'section', textmate: 'figure-group' },
    },
    {
        name: 'a [label] makes a figure opener a generic container',
        sample: '::: figure [g]\nBody.\n:::\n',
        payload: 'figure',
        scopes: { prism: 'figure-group', highlightjs: 'section', textmate: 'figure-group' },
    },
    {
        // A TAB DOES NOT SEPARATE (grammar.ebnf PART 7; corpus 254 renders
        // `:::<TAB>note` as a paragraph). The generic container rules take
        // `[ \t]` and knowingly over-colour this, which is the pre-existing
        // trade in all three grammars - so the assertion here is only that the
        // NEW scope does not claim it, not that the line stays unscoped.
        name: 'a tab does not separate a composite figure opener',
        sample: ':::\tfigure\nBody.\n:::\n',
        payload: 'figure',
        scopes: { prism: 'figure-group', highlightjs: 'section', textmate: 'figure-group' },
    },
];

/*
 * THE INVENTORY'S OWN POPULATION, checked by every sweep that reads it.
 *
 * The docblock at the top of this file records the failure that created it: two
 * sweeps with two case lists, one of which carried none of the in-list-item
 * family, reporting `66/66 constructs scoped correctly` while three grammars
 * anchored every block rule at column zero. One inventory fixed the DIVERGENCE
 * between the lists and left the shape of that failure intact - a sweep still
 * says `N/N` and passes, whatever N is.
 *
 * So if this file shrinks, or a filter starts dropping entries, or every entry
 * acquires a skip, the sweeps print `0/0` with a tick beside it and exit 0. That
 * is carve#755's second variant, and this is the floor that stops it.
 *
 * A FLOOR rather than an exact count: adding a construct should not require
 * touching a number, and the failure being guarded against is the population
 * getting SMALLER. Raise these when the inventory grows - the diff is the record.
 */
export const MIN_CONSTRUCTS = 173
export const MIN_LITERALS = 30

/*
 * AND A FLOOR ON WHAT EACH SWEEP ACTUALLY ASSERTS, which is the number that can
 * collapse without the inventory shrinking at all.
 *
 * Found by sabotage while writing the check above: adding `skip` to 132 of the
 * 134 entries leaves the inventory intact, and the textmate sweep then prints
 *
 *   textmate sweep: 2/2 constructs tokenized as expected
 *
 * with a tick beside it and exits 0. A floor on CONSTRUCTS.length cannot see
 * that, and "assertable is not zero" cannot either - the realistic failure is a
 * population that collapses, not one that empties.
 *
 * These are today's counts. A skip is already a written decision here, so
 * lowering one of these is the same decision made once more, in a diff.
 */
export const MIN_ASSERTABLE = {
    // Two constructs are skipped for Prism and four for
    // highlight.js; each says why in its own `skip` entry, and every skip is
    // subtracted here.
    textmate: 173,
    prism: 171,
    highlightjs: 169,
};

/**
 * Fail loudly rather than sweeping an empty or shrunken inventory.
 *
 * @param {string} sweep the caller, so the message says which run is vacuous
 * @param {number} [assertable] entries the caller will actually assert, after
 *   its own skip filter - `0` there means every construct is skipped, which
 *   reads as a clean sweep otherwise
 */
export function assertInventory(sweep, assertable) {
  const problems = [];
  if (CONSTRUCTS.length < MIN_CONSTRUCTS) {
    problems.push(`CONSTRUCTS holds ${CONSTRUCTS.length}, expected at least ${MIN_CONSTRUCTS}`);
  }
  if (LITERALS.length < MIN_LITERALS) {
    problems.push(`LITERALS holds ${LITERALS.length}, expected at least ${MIN_LITERALS}`);
  }
  const key = sweep.split(' ')[0];
  const floor = MIN_ASSERTABLE[key];
  if (assertable !== undefined && floor !== undefined && assertable < floor) {
    problems.push(
      `${key} asserts ${assertable} construct(s), expected at least ${floor} - ` +
        'the rest carry a skip',
    );
  } else if (assertable === 0) {
    problems.push('every construct is skipped, so this sweep asserts nothing');
  }
  if (assertable !== undefined && floor === undefined) {
    problems.push(`no MIN_ASSERTABLE entry for "${key}", so its population is unchecked`);
  }
  if (problems.length === 0) return;
  console.log(`FAIL ${sweep}: the inventory cannot support this sweep.`);
  for (const problem of problems) console.log(`  - ${problem}`);
  console.log('  A sweep that reports N/N over a shrunken inventory is not a pass (carve#755).');
  process.exit(1);
}
