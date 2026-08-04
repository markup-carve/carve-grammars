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
    { name: "link text", sample: "[text](https://x.de)", payload: "text", textmate: "string.other.link.title" },
    { name: "link url", sample: "[text](https://x.de)", payload: "https://x.de", textmate: "markup.underline.link" },
    { name: "escaped-quote link title", sample: "[t](/url \"ti\\\"tle\")", payload: "/url", textmate: "markup.underline.link" },
    { name: "autolink", sample: "<https://example.com>", payload: "https://example.com", textmate: "markup.underline.link" },
    { name: "image", sample: "![alt](img.jpg)", payload: "![", textmate: "punctuation.definition.image" },
    { name: "footnote ref", sample: "text[^1] end", payload: "1", textmate: "constant.other.footnote" },
    { name: "mention", sample: "hi @user here", payload: "@user", textmate: "mention" },
    { name: "tag", sample: "a #tagname here", payload: "#tagname", textmate: "tag" },
    { name: "inline math", sample: "a $`e=mc^2` b", payload: "e=mc^2", textmate: "markup.math" },
    { name: "inline literal", sample: "a !`/kaet/` b", payload: "/kaet/", textmate: "markup.raw.inline.content" },
    { name: "inline literal multi", sample: "a !``x ` y`` b", payload: "x ` y", textmate: "markup.raw.inline.content" },
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
    { name: "citation integral", sample: "see [+@smith2020] here", payload: "+", textmate: "keyword.operator.citation.integral" },
    { name: "citation punct", sample: "see [@smith2020] here", payload: "[", textmate: "punctuation.definition.citation" },
    { name: "callout marker in fence", sample: "``` js\nconst a = 1 <1>\n```", payload: "1", textmate: "constant.numeric.callout" },
    { name: "empty link title", sample: "[x](u \"\")", payload: "u", textmate: "markup.underline.link" },
    { name: "ordered marker decimal", sample: "1. first", payload: "1.", textmate: "punctuation.definition.list.numbered" },
    { name: "ordered marker paren", sample: "1) first", payload: "1)", textmate: "punctuation.definition.list.numbered" },
    { name: "ordered marker alpha", sample: "a. first", payload: "a.", textmate: "punctuation.definition.list.numbered" },
    { name: "ordered marker roman", sample: "iv. fourth", payload: "iv.", textmate: "punctuation.definition.list.numbered" },
    { name: "ordered marker bare dot with attrs", sample: ".{#x} attributed", payload: ".", textmate: "punctuation.definition.list.numbered" },
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
    { name: "table sep", sample: "| a | b |", payload: "|", textmate: "punctuation.separator.table" },
    { name: "table align", sample: "|=> Age |", payload: ">", textmate: "keyword.operator.table.alignment" },
    { name: "table rowspan", sample: "| ^ | spanned |", payload: "^", textmate: "keyword.operator.table.rowspan" },
    { name: "table colspan", sample: "| a | < |", payload: "<", textmate: "keyword.operator.table.colspan" },
    { name: "gfm delimiter row", sample: "| a | b |\n|---|--:|", payload: "--:", textmate: "keyword.operator.table.alignment" },
    { name: "abbreviation", sample: "*[HTML]: HyperText", payload: "HTML", textmate: "abbreviation" },
    { name: "table continuation in a list item", sample: "- item\n\n  | a |\n  + cont cell |", payload: "+", textmate: "keyword.operator.table.continuation" },
    { name: "ref def label", sample: "[r]: https://ref.example", payload: "r", textmate: "constant.other.reference.link" },
    { name: "ref def url", sample: "[r]: https://ref.example", payload: "https://ref.example", textmate: "markup.underline.link" },
    { name: "ref def title", sample: "[r]: https://ref.example \"Site\"", payload: "Site", textmate: "string.quoted.link.title" },
    {
        // highlight.js has no document-start anchor, so a `^---$` begin would
        // also match a bare `---` thematic break mid-document and swallow
        // everything up to the next one. The grammar records that decision at
        // its `contains` list; this records it where the coverage question is
        // asked.
        name: "frontmatter", sample: "---\ntitle: Doc\n---\n\nText", payload: "title",
        textmate: "frontmatter",
        skip: { highlightjs: "no document-start anchor, so front matter is deliberately not highlighted" },
    },
    { name: "display math", sample: "$$`\\int_0^1 x`", payload: "\\int_0^1 x", textmate: "markup.math" },
    { name: "trailing comment", sample: "text %% trailing", payload: "trailing", textmate: "comment" },
    { name: "block comment", sample: "%%%\nhidden\n%%%", payload: "hidden", textmate: "comment" },
    { name: "block comment with a tail", sample: "%%% html\nhidden\n%%% end", payload: "hidden", textmate: "comment" },
];
