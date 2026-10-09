# Fence languages

`fence-languages.json` says which language grammar a fenced code block embeds,
keyed by the word after the fence opener. It is the one list for every Carve
editor grammar that embeds by a fixed table: vscode-carve and intellij-carve
read the `textmate` column, sublime-carve the `sublime` column. Each of them
vendors a copy of this file and fails CI when the copy drifts.

Editors that embed by the info string itself (tree-sitter in Zed, Helix and
Neovim; Emacs' `<word>-mode` lookup) do not need it.

## Columns

- `words`: info-string words, lowercase, matched case-insensitively. They are
  literal text, so a consumer escapes them before building a pattern. Several
  contain characters that are not word characters (`c++`, `c#`, `f#`,
  `objective-c`), so a consumer must not close the word with `\b`.
- `language`: a neutral name for the language, in the common lowercase id form
  (`shellscript`, `javascriptreact`). Two rows may share one.
- `textmate`: `null`, or the TextMate scopes the fence body includes.
- `sublime`: `null`, or the `embed` target in a sublime-syntax grammar:
  `scope:<name>`, or `document` for a Carve fence.

The table says which grammar a word means in each grammar format, and nothing
about any one editor. Whether an editor ships that grammar, or names it
differently, is the editor repository's business, kept beside its generator.
A scope the editor lacks is skipped, and the fence body stays plain.

## Adding a row

Every TextMate row costs about 4 KiB of generated grammar (one rule for each of
three fence positions), so a row should name a grammar that exists:

- `textmate` scopes come from a real `contributes.grammars` entry: a VS Code
  built-in extension or a published extension's own `package.json`, never
  from memory.
- `sublime` only for a scope a default Sublime Text package defines.
