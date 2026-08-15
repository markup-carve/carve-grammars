/*
 * Keeps tiptap/schema-map.json honest.
 *
 * The map is the published contract other engines read when building a Carve
 * <-> ProseMirror bridge, so it must not quietly diverge from the two things it
 * claims to connect:
 *
 *  1. every ProseMirror name it names must exist in the CarveKit schema, with
 *     the node/mark kind it declares, and
 *  2. every node type in the spec's vocabulary must have a mapped-or-unmapped
 *     decision, so a new type cannot fall silently out of every bridge.
 *
 * The map may run AHEAD of the pinned spec submodule: this repo's `spec/` pin
 * lags main from time to time, while engines already carry the newer types. Such
 * entries are declared in AHEAD_OF_PIN and the test fails once the pin catches
 * up, so the list cannot rot - the same promotion gate the coverage skips use.
 */

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSchema } from '@tiptap/core';
import { CarveKit } from '../tiptap/carve-kit.js';
import { INLINE_MARKS } from '../tiptap/carve-to-pm.js';

const here = dirname(fileURLToPath(import.meta.url));
const map = JSON.parse(readFileSync(resolve(here, '../tiptap/schema-map.json'), 'utf8'));

let passed = 0;
function ok(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

/**
 * Node types that exist in an engine's AST but are not part of the spec's
 * profile vocabulary: the document root, plus payload and typography nodes an
 * implementation needs to represent source faithfully.
 */
const IMPLEMENTATION_TYPES = new Set([
  // docs/profiles.md names this set explicitly: a serialized AST carries type
  // names the profile vocabulary does not list, because denying them would mean
  // nothing. `abbreviation_def` renders nothing at all, so it belongs here
  // rather than in AHEAD_OF_PIN - no spec bump will ever promote it.
  'abbreviation_def',
  'document',
  'frontmatter',
  'literal_inline',
  'raw_text',
  'smart_punctuation',
]);

/**
 * Types the map covers that the PINNED spec does not define yet. Each must
 * disappear from this list when `spec/` is bumped - the test enforces that.
 *
 * `figure_group` was promoted out of here by the bump to carve `49b8deb`, whose
 * profile vocabulary carries PART 9 §4c; `critic_comment` by the bump to carve
 * `92bef65`, as `admonition`, `autolink`, `caption_number`, `citation_group`,
 * `heading_ref` and `substitution` were by the one before it - the gate working
 * as designed.
 *
 * The list is empty, which is the state it should spend most of its life in: an
 * entry here is a check weakened to accommodate a stale pin, so it is only ever
 * a temporary accommodation between an engine landing a type and `spec/`
 * catching up.
 */
const AHEAD_OF_PIN = new Set();

/** The normative vocabulary, read from the pinned spec submodule. */
function specVocabulary() {
  const profiles = readFileSync(resolve(here, '../spec/docs/profiles.md'), 'utf8');
  const names = new Set();
  for (const label of ['Block', 'Inline']) {
    const section = new RegExp(`\\*\\*${label}:\\*\\*([\\s\\S]*?)\\n\\n`).exec(profiles);
    assert.ok(section, `no ${label} vocabulary paragraph in spec/docs/profiles.md`);
    for (const m of section[1].matchAll(/`([A-Za-z0-9_-]+)`/g)) names.add(m[1]);
  }
  return names;
}

const schema = getSchema([CarveKit]);
const schemaNames = new Set([...Object.keys(schema.nodes), ...Object.keys(schema.marks)]);

console.log('schema-map.json');

ok('every mapped ProseMirror name is registered by CarveKit', () => {
  const missing = [];
  for (const [carveType, entry] of Object.entries(map.types)) {
    for (const name of [entry.pm].flat()) {
      if (!schemaNames.has(name)) missing.push(`${carveType} -> ${name}`);
    }
  }
  assert.deepStrictEqual(missing, [], `names absent from the CarveKit schema: ${missing.join(', ')}`);
});

ok('the declared node/mark kind agrees with the CarveKit schema', () => {
  const wrong = [];
  for (const [carveType, entry] of Object.entries(map.types)) {
    for (const name of [entry.pm].flat()) {
      const isMark = name in schema.marks;
      if (isMark !== (entry.kind === 'mark')) {
        wrong.push(`${carveType} -> ${name} declared ${entry.kind}`);
      }
    }
  }
  assert.deepStrictEqual(wrong, [], `kind mismatches: ${wrong.join(', ')}`);
});

ok('every type in the pinned spec vocabulary has a decision', () => {
  const covered = new Set([...Object.keys(map.types), ...Object.keys(map.unmapped)]);
  const missing = [...specVocabulary()].filter((t) => !covered.has(t)).sort();

  assert.deepStrictEqual(
    missing,
    [],
    `types with no mapped-or-unmapped decision: ${missing.join(', ')}`,
  );
});

ok('extra map entries are implementation types or declared ahead of the pin', () => {
  const spec = specVocabulary();
  const covered = [...Object.keys(map.types), ...Object.keys(map.unmapped)];
  const undeclared = covered
    .filter((t) => !spec.has(t) && !IMPLEMENTATION_TYPES.has(t) && !AHEAD_OF_PIN.has(t))
    .sort();

  assert.deepStrictEqual(
    undeclared,
    [],
    `types the spec does not define, and not declared: ${undeclared.join(', ')}`,
  );
});

ok('AHEAD_OF_PIN holds nothing the pinned spec already defines', () => {
  // Promotion gate: once `spec/` is bumped, these entries must be removed, or
  // the list becomes a stale excuse.
  const spec = specVocabulary();
  const promoted = [...AHEAD_OF_PIN].filter((t) => spec.has(t)).sort();

  assert.deepStrictEqual(
    promoted,
    [],
    `the pinned spec now defines these; drop them from AHEAD_OF_PIN: ${promoted.join(', ')}`,
  );
});

ok('no type is both mapped and unmapped', () => {
  const both = Object.keys(map.types).filter((t) => t in map.unmapped);
  assert.deepStrictEqual(both, [], `contradictory entries: ${both.join(', ')}`);
});

ok('every unmapped entry carries a reason', () => {
  const empty = Object.entries(map.unmapped)
    .filter(([, reason]) => typeof reason !== 'string' || reason.trim() === '')
    .map(([type]) => type);
  assert.deepStrictEqual(empty, [], `unmapped without a reason: ${empty.join(', ')}`);
});

// Marks the map declares that the converter cannot yet PRODUCE, with the reason.
// Same promotion gate as the coverage skips: the test below fails once a mark
// here becomes reachable, so the list cannot rot into a list of excuses.
const UNREACHABLE_MARKS = new Map([
  ['abbreviation', 'an `abbreviation` inline needs the `abbreviation_def` BLOCK too - '
    + 'the definition is what carries the expansion, and the converter has no case for it, '
    + 'so a document using one throws before the mark is reached'],
]);

ok('every mark the map declares is reachable from the converter', () => {
  // The map is checked against the spec and against the CarveKit schema, but
  // NOTHING used to check it against the converter that has to produce those
  // marks. All four of `superscript`, `subscript`, `insert` and `delete` were
  // declared correctly here and keyed in the converter under names no engine
  // emits any more (`super`, `sub`, `critic-insert`, `critic-delete`), so the
  // marks were registered, serializable, and unreachable: `{^a^}` threw
  // `unsupported node type "superscript"`.
  const converterSource = readFileSync(resolve(here, '../tiptap/carve-to-pm.js'), 'utf8');
  const hasCase = (type) => converterSource.includes(`case '${type}':`);
  const declared = Object.entries(map.types).filter(([, entry]) => entry.kind === 'mark');

  const unreachable = declared
    .map(([carveType]) => carveType)
    .filter((carveType) => !(carveType in INLINE_MARKS) && !hasCase(carveType))
    .filter((carveType) => !UNREACHABLE_MARKS.has(carveType));
  assert.deepStrictEqual(
    unreachable, [],
    'marks declared in schema-map.json that the converter never produces: ' + unreachable.join(', '),
  );

  const stale = [...UNREACHABLE_MARKS.keys()]
    .filter((carveType) => carveType in INLINE_MARKS || hasCase(carveType));
  assert.deepStrictEqual(
    stale, [],
    'UNREACHABLE_MARKS entries the converter now handles (delete them): ' + stale.join(', '),
  );
});

ok('the converter maps every mark to the ProseMirror name the map declares', () => {
  const declared = Object.fromEntries(
    Object.entries(map.types)
      .filter(([, entry]) => entry.kind === 'mark')
      .map(([carveType, entry]) => [carveType, entry.pm]),
  );
  const wrong = Object.entries(INLINE_MARKS)
    // `italic` is the one legitimate alias: two carve type names (`emphasis` and
    // the legacy `italic`) reach the same mark, and the map names only the
    // canonical one.
    .filter(([carveType]) => carveType !== 'italic')
    .filter(([carveType, pm]) => declared[carveType] !== pm)
    .map(([carveType, pm]) => `${carveType} -> ${pm} (map says ${declared[carveType] ?? 'nothing'})`);
  assert.deepStrictEqual(wrong, [], `INLINE_MARKS disagrees with schema-map.json: ${wrong.join(', ')}`);
});

ok('every shared ProseMirror name has exactly one owner', () => {
  /*
   * Two Carve types may name the same ProseMirror node or mark - `carveDiv` is
   * both `div` and `admonition`, `link` is both `link` and `autolink`. A bridge
   * going the OTHER way has to turn that name back into one Carve type, and
   * without a declared owner it decides by whatever order it happens to walk
   * this file in. That is not stable across engines: carve-php walks insertion
   * order and gets `div`, carve-rs walks a sorted map and gets `admonition`.
   * The consequence was not academic - carve-rs routed every labelled div down
   * the admonition path, which does not carry a label, and `:::[First]` came
   * back as a bare div with the word gone (markup-carve/carve-rs#993).
   *
   * `aliasOf` states it. This asserts the file never leaves a name arbitrated
   * by luck, and that an alias points at a type that really does claim it.
   */
  const claims = new Map();
  for (const [carveType, entry] of Object.entries(map.types)) {
    for (const name of [entry.pm].flat()) {
      if (!claims.has(name)) claims.set(name, []);
      claims.get(name).push(carveType);
    }
  }

  const unarbitrated = [];
  const dangling = [];
  for (const [name, owners] of claims) {
    if (owners.length < 2) continue;
    const primary = owners.filter((t) => !map.types[t].aliasOf);
    if (primary.length !== 1) {
      unarbitrated.push(`${name} <- ${owners.join(', ')} (${primary.length} without aliasOf)`);
      continue;
    }
    for (const alias of owners.filter((t) => map.types[t].aliasOf)) {
      const target = map.types[alias].aliasOf;
      if (target !== primary[0]) {
        dangling.push(`${alias}.aliasOf is ${target}, but ${name} is owned by ${primary[0]}`);
      }
    }
  }

  assert.deepStrictEqual(unarbitrated, [], `shared names with no single owner: ${unarbitrated.join('; ')}`);
  assert.deepStrictEqual(dangling, [], `aliasOf pointing at the wrong type: ${dangling.join('; ')}`);
});

ok('an aliasOf names a type that exists and shares the name', () => {
  const broken = [];
  for (const [carveType, entry] of Object.entries(map.types)) {
    const target = entry.aliasOf;
    if (!target) continue;
    if (!(target in map.types)) {
      broken.push(`${carveType} -> ${target} (no such type)`);
      continue;
    }
    const shared = [entry.pm].flat().filter((n) => [map.types[target].pm].flat().includes(n));
    if (shared.length === 0) {
      broken.push(`${carveType} -> ${target} (they share no ProseMirror name)`);
    }
  }
  assert.deepStrictEqual(broken, [], `broken aliasOf: ${broken.join(', ')}`);
});

console.log(`\n${passed} passed`);
