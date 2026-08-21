/**
 * What an `exports` map does is decided by Node's resolver, against an
 * INSTALLED package. Reading this repository's own manifest with `readFileSync`
 * and asserting a key is present answers a different question - "what does the
 * file say" - and such an assertion passes just as happily with the entry
 * deleted. carve-js had exactly that test and it did (markup-carve/carve-js#1260).
 *
 * So this file asks the resolver instead. A scratch directory gets the
 * `node_modules` layout an install produces, this package is linked into it,
 * and a real `node` reads the specifier back from that directory the way a
 * consumer's CI step would.
 *
 * The map here is the largest in the org - seventeen entries, four of them
 * wildcards - which is precisely why it looked handled and was not. A wildcard
 * over `./tiptap/*` says nothing about a file at the package root, and the
 * probe below throws exactly like a package with a single entry does.
 *
 * The link points at the repository root, so `tsconfig.types.json`, `tests/`
 * and `spec/` are all present on disk under the installed name. That is what
 * makes refusing them mean something.
 */

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const consumer = mkdtempSync(join(tmpdir(), 'carve-grammars-consumer-'));
mkdirSync(join(consumer, 'node_modules', '@markup-carve'), { recursive: true });
symlinkSync(root, join(consumer, 'node_modules', '@markup-carve', 'carve-grammars'), 'dir');
process.on('exit', () => rmSync(consumer, { recursive: true, force: true }));

const run = (script) =>
  execFileSync(process.execPath, ['-e', script], {
    cwd: consumer,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const codeOf = (specifier) =>
  run(
    `import(${JSON.stringify(specifier)}).then(() => console.log('RESOLVED'),` +
      ` (e) => console.log(e.code ?? String(e)))`,
  );

let passed = 0;
function ok(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('packaging:');

ok('reads the installed version back through the package specifier', () => {
  // The question a version-pinning CI step asks. Closed, it throws
  // ERR_PACKAGE_PATH_NOT_EXPORTED, which reads as "this package is not
  // installed" rather than "this subpath is closed" - so whoever hits it
  // audits their install before suspecting a manifest, and writes a
  // filesystem path read instead, which is more fragile than the version
  // check it implements.
  const version = run(
    `console.log(require(${JSON.stringify(`${manifest.name}/package.json`)}).version)`,
  );

  assert.strictEqual(version, manifest.version);
});

ok('reads it back under import as well as require', () => {
  // Both resolvers consult the same map, but only one of them is what a given
  // shell one-liner in CI happens to use.
  const version = run(
    `import(${JSON.stringify(`${manifest.name}/package.json`)}, { with: { type: 'json' } })` +
      `.then((m) => console.log(m.default.version))`,
  );

  assert.strictEqual(version, manifest.version);
});

ok('opens that one file and not the directory holding it', () => {
  // The failure this guards: widening the map with a `./*` wildcard to fix the
  // two above. That publishes the whole checkout as importable API - `tests/`,
  // `scripts/` and the `spec/` submodule included - and nothing else here
  // would notice.
  for (const path of ['tsconfig.types.json', 'tests/parse-test.js', 'scripts/scan-superlinear.mjs', 'spec/README.md']) {
    assert.strictEqual(codeOf(`${manifest.name}/${path}`), 'ERR_PACKAGE_PATH_NOT_EXPORTED', path);
  }
});

ok('still resolves the entry points the map already named', () => {
  // Two explicit entries and one that only a wildcard covers, so a change that
  // rewrote the map rather than adding to it would show up here.
  for (const specifier of ['', '/shiki', '/tiptap/carve-kit.js']) {
    assert.strictEqual(codeOf(`${manifest.name}${specifier}`), 'RESOLVED', specifier || '.');
  }
});

ok('is named in the test script, so it is not dead on arrival', () => {
  // `test` is an explicit chain of `node tests/*.js` invocations, not a glob.
  // A file added here without a link in that chain never runs, and looks
  // exactly like a file that does - the same shape of defect as the one this
  // file exists to catch, so it is pinned rather than trusted.
  assert.ok(
    manifest.scripts.test.includes('node tests/packaging-test.js'),
    'tests/packaging-test.js is not in the test script chain',
  );
});

console.log(`\n${passed} passed`);
