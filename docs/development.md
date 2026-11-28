# Development

The `main` branch is the Carve 0.2 release source; Carve 0.1 stays on the `0.1` branch. Run `npm ci`, `npm run syntax-palette:check`, and `npm test` to check the three public grammars and their Shiki integration. The golden cases live in `tests/carve-spec-cases.json`; their token snapshot is `tests/snapshots/carve.json`.

The TextMate JSON is the checked-in grammar. `scripts/build-syntax-palette.mjs` generates the shared CSS and palette from `themes/palette.json`.

## TextMate div depth

The TextMate grammar highlights at most 64 open div frames. Beyond that depth, another `:::` opener is scoped as literal text until a frame closes. This is a TextMate highlighting limit, not a Carve document limit. It also applies when a div is reached through a list, quote, or figure group. Clause case CC-1565 exercises the limit; its scopes past depth 64 differ from the unbounded grammar.

`vscode-textmate` walks its entire open rule stack on every line, so unbounded div nesting makes repeated unclosed openers quadratic. The generated depth rules bound that stack while sharing div-independent body patterns. Edit the `_div_source_` rules in `textmate/carve.tmLanguage.json`, run `node scripts/cap-textmate-divs.mjs`, and then run `node scripts/cap-textmate-divs.mjs --check` to verify the generated rules are current. The cap can be removed when the tokenizer no longer walks the full stack per line.
