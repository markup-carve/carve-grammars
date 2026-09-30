# Specification and engine audit, September 30

This refresh checks Prism, highlight.js, TextMate and the Tiptap bridge against
Carve specification `b4f6a1edbe20a090dfbdb270324e8e207017b209`: 2,164 documents
in 535 categories. The editor dependency moves from released Carve JS 0.1.7 to
0.1.9. This checks parsing and editor projection; it does not assess importer changes.

## Fixed editor behavior

An empty fenced block and a block holding one blank line are different payloads.
The writer previously inserted a blank line into an empty code or raw block and
removed trailing line endings from raw payloads. With the current engine, that changed
rendered code after an editor mount. The writer now preserves empty, blank and
nonempty bodies. Forty-two direct and mounted checks cover code, language-tagged
code and raw HTML, including multiple final line breaks.

The code-payload sweep also needed updating: code-block AST content now includes
its line terminator. Its generated region and EOF position check must account
for that terminator without treating extra text as payload. The sweep still
checks 10,899 generated documents, with its minimum population checks intact.

The complete editor corpus retains every document through source preservation.
Removing that preservation envelope exposes 476 source-spelling differences and
299 mounted rendering differences. These are exact sets in the existing ledgers,
not unsupported documents silently skipped. The two remaining authored-append
conflicts are the nesting-cap example and one trailing-whitespace example.
The engine upgrade exposes 31 additional source-spelling losses and eleven
additional mounted rendering losses in existing fixtures, while other fixes
remove enough entries to reduce the totals. These are projection gaps previously
hidden by engine readings that differed from the specification. Examples include
a below-column list continuation becoming a nested list (277), a definition-term
continuation becoming a paragraph (504-4), and a hidden-comment label losing its
empty label paragraph (518-10). Source preservation protects these documents,
but their rich projection still needs work. The ledgers retain every affected filename.

## Missing highlighting behavior

The latest bracket-run rule is still missing on all three highlighters.
`[{+a]+}` is literal text, but all three scope it as insertion. The same problem
affects forced emphasis, strong, underline, strike, highlight, superscript,
subscript, deletion and substitution. Each surface misreads ten of the thirteen
boundary fixtures. The controls retain complete markup inside the bracket run
and an editorial comment containing a bracket.

The [boundary check](../tests/highlight-boundaries-test.js) compares the presence of a markup scope on fixture letters
with the presence of markup in the specification HTML. It does not verify the
span kind or its exact extent. Its [gap record](../tests/highlight-boundary-gaps.json)
fails for a new mismatch or a resolved one. Token snapshots alone could not
catch this: they faithfully recorded the wrong highlighting.

Container labels are another useful addition. `::: note [/i/]` has inline
emphasis in its label, while these highlighters scope the label as one token.
Supporting nested label markup needs a label context that keeps comments, code
and escapes opaque. Merely adding more regular-expression alternatives would
also need the existing bounded-scan and equivalence checks.

## Next changes

Bracket-run scopes should take priority over additional token colors. A fix must
bound pairing even when brackets resolve to literal text, preserve escapes and
opaque comments, and retain complete constructs inside a label. It must also
avoid repeated whole-paragraph scans on unmatched brackets.

The editor's next useful work is reducing source-envelope dependence for
comment/definition placement and delimiter spelling. The mounted ledger gives
specific documents to promote back to a render-equivalent rich projection.
Rendered HTML does not preserve every authored source distinction, so a plain
HTML round trip cannot replace the source-preserving editor path.
