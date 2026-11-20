# Development

The `next2` branch is the Carve 0.2 release source. Run `npm ci`, `npm run syntax-palette:check`, and `npm test` to check the three public grammars and their Shiki integration. The golden cases live in `tests/carve-spec-cases.json`; their token snapshot is `tests/snapshots/carve.json`.

The TextMate JSON is the checked-in grammar. `scripts/build-syntax-palette.mjs` generates the shared CSS and palette from `themes/palette.json`.
