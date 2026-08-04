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
 * Empty as of the bump to carve `92bef65`: the spec now defines every type the
 * map carries. `critic_comment` was promoted out of here by that bump, as
 * `admonition`, `autolink`, `caption_number`, `citation_group`, `heading_ref`
 * and `substitution` were by the one before it - the gate working as designed.
 */
const AHEAD_OF_PIN = new Set([]);

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

console.log(`\n${passed} passed`);
