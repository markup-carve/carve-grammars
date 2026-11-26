import { spawnSync } from 'node:child_process';
for (const file of [
    'tests/carve-grammar-test.js',
    'tests/textmate-metadata-block-test.js',
    'tests/textmate-text-runs-test.js',
    'tests/textmate-differential-gaps-test.js',
    'tests/textmate-bracket-time-test.js',
    'tests/prism-hljs-text-runs-test.js',
    'tests/prism-hljs-differential-test.js',
    'tests/prism-hljs-long-line-time-test.js',
    'tests/titled-div-braced-comment-test.js',
    'tests/word-characters-and-div-openers-test.js',
    'tests/continuation-labels-test.js',
    'tests/metadata-and-tag-names-test.js',
    'tests/attribute-value-class-test.js',
    'tests/strike-arrow-test.js',
    'tests/closed-inline-time-test.js',
    'tests/prism-attribute-time-test.js',
    'tests/shiki-blank-lines-test.js',
    'tests/package-exports-test.js',
    'tests/fence-languages-test.js',
    'tests/diff-test.js',
    'tests/shiki-diff-test.js',
    'tests/client-diagram-test.js',
    'tests/kroki-test.js',
    'tests/restored-helpers-test.js',
    'tests/tiptap-kit-test.js',
    'tests/tiptap-mapping-test.js',
]) {
    const result = spawnSync(process.execPath, [file], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
}
