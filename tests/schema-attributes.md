# Schema attribute gate

`npm run test:schema-map` checks every claimed attribute against the schema
assembled by CarveKit, including inherited and global attributes. `npm test`
also runs the gate and its negative controls on both supported Tiptap majors
in CI. Extra schema attributes are allowed; the map lists bridge claims.

`schema-attribute-owners.json` attributes the union of each multi-name type's
claims to its ProseMirror names. Every variant needs an entry, including an
empty array where none of the claimed attributes applies. The union must
match the map exactly. Single-name types, preservation nodes and mark carriers
need no sidecar entry: all their claims belong to that name. The published
`tiptap/schema-map.json` shape and version stay unchanged.

Ordered-list marker attributes belong to `orderedList`; task state belongs to
`taskItem`. Both table cell variants carry all cell claims. The tab models
carry a panel label and selection state, while the generic div carries the
authored attribute run, title and label. Only the inline comment retains the legacy
`content` attribute, but both comment nodes declare `block` and `delimited`.
The media embed stores source and HTML instead of the general inline
extension's name and attribute run.

When adding a claim or variant, update its attribution from the intended
model. Do not generate ownership from the schema: that would hide a missing
declaration. The regression control removes `block` from the inline comment
extension before building the schema and requires the gate to name
`comment -> carveCommentInline.block`.
