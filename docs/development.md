# Development

## Tests

```bash
npm test
```

The suite holds all three grammars to one source of truth: the shared corpus
from the [`markup-carve/carve`](https://github.com/markup-carve/carve) spec,
vendored as the `spec/` git submodule (`git submodule update --init`).

- `npm run test:coverage` - the coverage matrix. Each grammar (prism,
  highlightjs, tiptap) declares a covered-category set and a skip set (with a
  reason per skip); the test fails if the two do not partition every corpus
  category, so a new spec category forces a deliberate decision.
- `npm run test:snapshot` - golden token snapshots. Each covered `.crv` is
  tokenized with Prism's and highlight.js's own tokenizers and the token stream
  (type + text) is compared against a committed golden in `tests/snapshots/`.
  Refresh intended changes with `npm run snapshots:update`.
- `npm run test:roundtrip` - the Tiptap serializer round-trip. Each covered
  `.crv` runs `parse -> ProseMirror JSON -> serializeToCarve -> parse` and the
  two parsed ASTs must be identical, catching serializer drift. Categories the
  serializer cannot represent are skipped with a reason.

`npm test` runs all of the above plus the structural grammar and serializer
unit tests. CI runs the same on Node 18, 20 and 22.

### The construct ledger: ten surfaces, one derived list

Carve's syntax lives on ten grammar surfaces - `tree-sitter-carve`, the four
here (TextMate, Prism, highlight.js, Tiptap), `vscode-carve`, `intellij-carve`,
`sublime-carve`, `vim-carve` and `emacs-carve` - and nothing used to measure
them against the same construct list. `{%` comments landed on five of them and
had no rule at all on the other five, with nothing going red
(markup-carve/carve#1239, #284).

`npm test` now runs `tests/construct-ledger-test.js`, which holds
`tests/lib/construct-ledger.json` to three rules:

- **The construct list is derived, never written.** `scripts/spec-constructs.mjs`
  reads the alternatives of the `block` and `inline_element` productions out of
  the spec's normative `spec/resources/grammar.ebnf`. A clause that adds a
  construct makes every surface unclassified until someone says what it did
  about it. A hand-maintained checklist would go stale in exactly that case,
  because whoever forgot the grammar rule also forgot the checklist row.
- **Three columns, not two.** Each construct on each surface is `IMPLEMENTED`
  (with the name that surface gives it), `UNSUPPORTED` (with a reason - an empty
  reason fails), or `GAP` (with a ticket). A construct in none of them fails the
  test. Without the third column a legitimate gap - a Prism tokenizer cannot do
  what a tree-sitter grammar does - reads as a defect, and a check with a high
  noise floor gets muted.
- **Two axes per construct.** Recognizing a construct and keeping its payload
  inert are different questions, and a surface can be right about the first and
  wrong about the second: on four editor surfaces `{% *not bold* %}` colored a
  bold run inside a comment. Every entry declares which, and the answer is
  measured on every run - by tokenizing a sample with a live marker inside the
  payload - for Prism, highlight.js and every TextMate grammar whose checkout is
  in front of the seeder, and by converting that sample through the bridge for
  Tiptap. Those rows cannot rot. The rest are recorded, which is what
  `payload: "unmeasured"` says out loud - a state no cell is in any more,
  since intellij-carve's thirteen were the last of them (#329).

  One sample per construct is a re-measurement, not a measurement.
  `tests/opaque-payload-test.js` generates every payload up to three characters
  over each construct's own delimiter alphabet - about ten thousand documents -
  and it is what finds this class: of 1325 corpus documents exactly ONE exposed
  the fenced-code leak in #309, and a comment leaking only when it spans a line
  break is invisible to a single-line sample (#320).

#### A red row is a question, not a defect

Three surfaces have now been worked row by row, and the ratio is stable enough
to plan against rather than be surprised by:

| pass | rows | the instrument | genuinely absent |
| --- | --- | --- | --- |
| `tree-sitter-carve` (#245) | 14 | 9 | 3 |
| `vim-carve` + `sublime-carve` (#318) | 20 | 11 | 6 |
| `textmate`, `prism`, `tiptap`, `vscode-carve` (#307, #308, #310) | 47 | 31 | 9 |

**Two rows in three are a name the probe cannot reach**, and the third pass also
turned up six rows that read `IMPLEMENTED` and were not. So the first job on a
per-surface ticket is deciding which rows are real, and the answer is expected
to be "most of them are not". A GAP row means *the probe did not find a rule it
recognizes*, which is a different claim from *this surface does not implement
the construct*.

A fold belongs in `SIGNATURE_OVERRIDES`, which the file calls a per-surface
NAMING table - never in a rule renamed on a surface to satisfy the probe. Where
a surface genuinely cannot express a construct, `UNSUPPORTED` **with a reason**
is the entry; a wrong rule is worse than a missing one.

#### The instrument can be wrong in the direction that looks green

Five ways the probe has mis-read a surface, each found by opening the file:

1. **It read too little.** `Object.keys(grammar.json.rules)` is 196 of
   tree-sitter's 346 names; a `.sublime-syntax` scopes a capture as well as a
   match (#315).
2. **The signature list had holes** - `code_span` is `verbatim` on one surface
   and `code_inline` on another (#315, #307).
3. **One rule implements several constructs**, and one name cannot carry four
   through a shared table (#318).
4. **The evidence named a rule about a different construct.** `carveCommentInline`
   is the braced comment and was cited for the trailing one (#318). The same
   pair beat the word-boundary rank on the TextMate family, where both
   candidates are whole-name hits and *length* picked the wrong one (#307).
5. **The re-check read the file's prose as evidence.** `every IMPLEMENTED row
   cites a name the shipped grammar really carries` asked whether the evidence
   was a SUBSTRING of the source. `prism/carve.js` carries the comment "Prism
   has no cross-reference token at all" beside the lookbehind that worked
   around the absence - so a row citing `cross-ref` re-checked **green** for as
   long as the rule was missing (#307). That is the trap the docblock at the
   top of `scripts/surface-probe.mjs` describes, and that its extractors were
   built to avoid, surviving in the check that verifies their output. It reads
   `vocabulary()` now, so the seed and the re-check agree on what a name is.

The lesson generalizes past this file: **a check that treats a file's prose as
evidence that the file implements what the prose says it does NOT implement
cannot fail.** Match against what a grammar DECLARES, never against its text.

Re-measure after changing a grammar:

```bash
node scripts/seed-construct-ledger.mjs
```

That reads the four surfaces here directly. The six in other repositories are
read from checkouts named by environment variables, and any that is not given
keeps the row already recorded, with the commit it was read at:

```bash
CARVE_SURFACE_VIM_CARVE=../vim-carve \
CARVE_SURFACE_EMACS_CARVE=../emacs-carve \
  node scripts/seed-construct-ledger.mjs
```

Statuses are measured; reasons, per-construct notes, tickets and a surface's
`note` are written by hand and carried across a re-measurement, so a re-run
never drops a stated reason. A surface-level `note` is for what the rows cannot
say - why a surface needed no work to reach zero, or what its measured payload
column does NOT cover.

One thing a re-run does NOT carry: the payload axis of a surface the seeder
cannot tokenize. It is only carried over when the recorded value is already
`inert` or `leaks`, so a construct that moves from `GAP` to `IMPLEMENTED` in the
same run arrives with `payload: "unmeasured"` and a ticket, even when the person
doing the run has just measured it. That is deliberate: a seeder cannot tokenize
a Vim syntax file or an emacs font-lock table, so the alternative is inventing an
answer. Measure the payload as part of the same pass and write `inert` (or
`leaks`, with a note) by hand on those rows.

It applies to fewer surfaces than it used to. `vscode-carve` and
`intellij-carve` are TextMate grammars, and the seeder loads any of those through
Shiki, so naming their checkout measures the recognition axis and the payload
sample in the same run:

```bash
CARVE_SURFACE_VSCODE_CARVE=../vscode-carve node scripts/seed-construct-ledger.mjs
CARVE_SURFACE_INTELLIJ_CARVE=../intellij-carve node scripts/seed-construct-ledger.mjs
```

**A `leaks` cell is still hand-written on those surfaces, and the seeder carries
it rather than overwriting it.** The seeder tokenizes ONE sample per construct
and the sweep below generates hundreds, and on all three surfaces measured for
the first time since #320 the sample said every row was inert while the sweep
disagreed - five rows on intellij-carve alone (#329). So a run whose sample says
`inert` leaves a recorded `leaks` alone. That cannot hide a fix: the sweep
asserts every recorded leak STILL leaks, so a fix fails that file, its entry
comes out, and the ledger's own orphan check then fails until the cell is
corrected too.

### The payload sweep reaches nine of the ten surfaces

`tests/opaque-payload-test.js` is the second axis measured over a GENERATED space
rather than one sample per construct, and one sample is not enough. Every surface
measured for the first time so far has had leaks the sample could not see:

| surface | leaking rows | the sample found |
| --- | --- | --- |
| tree-sitter-carve (#328) | 3 | none of them |
| emacs-carve (#328) | 2 | the `%%%` fence, not the verbatim run |
| intellij-carve (#329) | 4 | none of them |

Name a checkout and the sweep drives it:

```bash
CARVE_SURFACE_TREE_SITTER_CARVE=../tree-sitter-carve \
CARVE_SURFACE_EMACS_CARVE=../emacs-carve \
CARVE_SURFACE_VSCODE_CARVE=../vscode-carve \
CARVE_SURFACE_INTELLIJ_CARVE=../intellij-carve \
  node tests/opaque-payload-test.js
```

tree-sitter needs its native addon built (`npm install` in that checkout), and
emacs-carve needs an `emacs` on PATH - the mode is fontified in one batch Emacs
per sweep row, which is what `prime` on that tokenizer is for. A surface whose
checkout is not named, or not built, is simply not swept.

A leak on a grammar in ANOTHER repository is a defect this suite can measure and
not fix, so it is recorded in `KNOWN_LEAKS` with the ticket it lives on and
asserted to STILL leak. A fix therefore fails this file and the entry comes out
with the fix, the same arrangement the residual table at the end of it uses for
one document at a time. A surface in THIS repository is deliberately absent from
that table: a leak here is fixable here, so it stays red.
