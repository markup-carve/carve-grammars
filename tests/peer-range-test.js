/**
 * Every peer this repo also installs as a dev dependency must accept the
 * version the tests actually run against. Otherwise the suite proves a version
 * the peer range refuses, and a consumer on that version gets ERESOLVE at
 * install time (#544: themes 4 was outside `^2 || ^3`).
 *
 * The Shiki packages release in lockstep, so themes and types must also resolve
 * to the same major as `shiki`; a range check alone passed with themes on 3.
 */
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// Read by path: several of these packages do not export ./package.json.
const installed = (name) => {
    const file = join(root, 'node_modules', name, 'package.json');
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).version : null;
};

const parse = (v) => v.split('-')[0].split('.').map((n) => Number(n || 0));

// Only caret ranges joined by `||` appear in peerDependencies; refuse anything else.
function satisfies(version, range) {
    const [maj, min, pat] = parse(version);
    return range.split('||').some((part) => {
        const m = /^\^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(part.trim());
        assert.ok(m, `unsupported peer range spelling: ${JSON.stringify(part.trim())}`);
        const [lo0, lo1, lo2] = [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
        const cmp = maj - lo0 || min - lo1 || pat - lo2;
        if (cmp < 0) return false;
        if (lo0 > 0) return maj === lo0;
        if (m[2] === undefined) return maj === 0;
        return maj === 0 && min === lo1;
    });
}

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

console.log('peer ranges:');

ok('the range matcher accepts and refuses what npm does', () => {
    assert.ok(satisfies('4.4.3', '^2 || ^3 || ^4'));
    assert.ok(!satisfies('4.4.3', '^2 || ^3'));
    assert.ok(satisfies('0.1.33', '^0.1'));
    assert.ok(!satisfies('0.2.0', '^0.1'));
    assert.ok(!satisfies('1.9.0', '^2'));
});

for (const [name, range] of Object.entries(manifest.peerDependencies)) {
    if (!(name in manifest.devDependencies)) continue;
    const version = installed(name);
    ok(`${name} ${version} is inside the peer range ${range}`, () => {
        assert.ok(version, `${name} is a dev dependency but is not installed`);
        assert.ok(satisfies(version, range), `${name} ${version} is outside the peer range ${range}`);
    });
}

const shikiMajor = parse(installed('shiki'))[0];
for (const name of ['@shikijs/themes', '@shikijs/types']) {
    ok(`${name} resolves to the same major as shiki (${shikiMajor})`, () => {
        const version = installed(name);
        assert.strictEqual(parse(version)[0], shikiMajor, `${name} ${version} does not match shiki ${shikiMajor}`);
    });
}

console.log(`\n${passed} passed`);
