import { spawnSync } from 'node:child_process';
for (const file of [
    'tests/carve-grammar-test.js',
    'tests/shiki-blank-lines-test.js',
    'tests/package-exports-test.js',
    'tests/fence-languages-test.js',
    'tests/diff-test.js',
    'tests/shiki-diff-test.js',
    'tests/client-diagram-test.js',
    'tests/kroki-test.js',
    'tests/restored-helpers-test.js',
    'tests/tiptap-kit-test.js',
]) {
    const result = spawnSync(process.execPath, [file], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
}
