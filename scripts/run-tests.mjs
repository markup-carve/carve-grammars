import { spawnSync } from 'node:child_process';
for (const file of ['tests/carve-grammar-test.js', 'tests/shiki-blank-lines-test.js']) {
    const result = spawnSync(process.execPath, [file], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
}
