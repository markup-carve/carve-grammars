import assert from 'node:assert/strict';
import { ENGINES } from './lib/engines.js';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);
const textmate = await textmateLineTokenizer(new URL('../textmate/carve.tmLanguage.json', import.meta.url).pathname);
const cases = [
    ['- ', '  '], ['* ', '  '], ['1. ', '   '], ['- [ ] ', '  '], ['- - ', '    '],
    ['10. ', '    '], ['a. ', '   '], ['. ', '  '], ['- - - ', '      '],
    ['ii. ', '    '], ['XII) ', '     '], ['1234567. ', '         '],
];
for (const [marker, indent] of cases) {
    const source = `${marker}\`\`\`sh\n${indent}npm test\n${indent}\`\`\`\n\nthen\n`;
    for (const [name, tokenize] of [...ENGINES, ['textmate', textmate]]) {
        const leaves = tokenize(source);
        const body = leaves.filter((leaf) => leaf.text.includes('npm'));
        assert.ok(body.length, `${name}: missing body for ${marker}`);
        assert.ok(body.every((leaf) => name === 'prism'
            ? leaf.scope?.includes('code-block')
            : name === 'highlightjs'
                ? leaf.ancestors?.includes('language-bash')
                : leaf.scope?.includes('meta.embedded.block.shellscript')), `${name}: no embedded shell for ${marker}`);
        const fences = leaves.filter((leaf) => leaf.text.includes('```'));
        assert.equal(fences.length, 2, `${name}: opener and closer for ${marker}`);
        assert.ok(fences.every((leaf) => name === 'prism'
            ? leaf.scope?.includes('code-block')
            : name === 'highlightjs'
                ? leaf.ancestors?.includes('code')
                : leaf.scope?.includes('markup.fenced_code.block.carve')), `${name}: fence scope for ${marker}`);
        const after = leaves.filter((leaf) => leaf.text.includes('then'));
        assert.ok(after.length && after.every((leaf) => name === 'highlightjs'
            ? !leaf.ancestors?.some((scope) => /code|language-bash/.test(scope))
            : !/code-block|markup.fenced_code.block|markup.raw.code/.test(leaf.scope ?? '')), `${name}: fence leaked for ${marker}`);
    }
}
for (const [name, tokenize] of [...ENGINES, ['textmate', textmate]]) {
    const romanItems = tokenize('ii. first\niii. ```sh\n     npm test\n     ```\nthen\n');
    assert.ok(romanItems.some((leaf) => leaf.text.includes('npm') && (name === 'highlightjs'
        ? leaf.ancestors?.includes('language-bash')
        : /code-block|meta.embedded.block.shellscript/.test(leaf.scope ?? ''))), `${name}: Roman list item above fence`);
}
for (const [name, tokenize] of [...ENGINES, ['textmate', textmate]]) {
    const crlf = tokenize('- ```sh\r\n  npm test\r\n\r\n  ```\r\nthen\r\n');
    assert.ok(crlf.some((leaf) => leaf.text.includes('npm') && (name === 'highlightjs'
        ? leaf.ancestors?.includes('language-bash')
        : /code-block|meta.embedded.block.shellscript/.test(leaf.scope ?? ''))), `${name}: CRLF body`);
    assert.ok(crlf.filter((leaf) => leaf.text.includes('then')).every((leaf) => name === 'highlightjs'
        ? !leaf.ancestors?.includes('code')
        : !/code-block|markup.fenced_code.block/.test(leaf.scope ?? '')), `${name}: CRLF closer`);

}
for (const [marker, indent] of cases) {
    for (const [name, tokenize] of [...ENGINES, ['textmate', textmate]]) {
        const deeper = tokenize(`${marker}\`\`\`sh\n${indent}npm test\n${indent}  \`\`\`\n${indent}echo still\n${indent}\`\`\`\nthen\n`);
        assert.ok(deeper.some((leaf) => leaf.text.includes('echo') && (name === 'highlightjs'
            ? leaf.ancestors?.includes('language-bash')
            : /code-block|meta.embedded.block.shellscript/.test(leaf.scope ?? ''))), `${name}: deeper fence closed early for ${marker}`);
        assert.ok(deeper.filter((leaf) => leaf.text.includes('then')).every((leaf) => name === 'highlightjs'
            ? !leaf.ancestors?.includes('code')
            : !/code-block|markup.fenced_code.block/.test(leaf.scope ?? '')), `${name}: real closer did not end ${marker}`);
    }
}
for (const source of ['- - ```sh\n  under\n    ```\nthen\n', '- [ ] ```sh\n under\n  ```\nthen\n']) {
    for (const [name, tokenize] of [...ENGINES, ['textmate', textmate]]) {
        const leaves = tokenize(source).filter((leaf) => leaf.text.includes('under'));
        assert.ok(leaves.length && leaves.every((leaf) => name === 'highlightjs'
            ? !leaf.ancestors?.includes('language-bash')
            : !/code-block|meta.embedded.block.shellscript/.test(leaf.scope ?? '')), `${name}: body below content column`);
    }
}
for (const [name, tokenize] of [...ENGINES, ['textmate', textmate]]) {
    const paragraph = tokenize('para\n- ```sh\n  npm test\n  ```\n');
    assert.ok(paragraph.filter((leaf) => leaf.text.includes('npm')).every((leaf) => name === 'highlightjs'
        ? !leaf.ancestors?.includes('language-bash')
        : !/code-block|markup.fenced_code.block/.test(leaf.scope ?? '')), `${name}: marker continued a paragraph`);

    const unknown = tokenize('- ```unknown\n  payload\n  ```\nthen\n');
    assert.ok(unknown.some((leaf) => leaf.text.includes('payload') && (name === 'highlightjs'
        ? leaf.ancestors?.includes('code')
        : /code-block|markup.fenced_code.block/.test(leaf.scope ?? ''))), `${name}: unknown language still opens a block`);
}
const nestedTask = '- foo\n  - [ ] ```sh\n    npm test\n    ```\n  - [x] more\n';
for (const [name, tokenize] of [...ENGINES, ['textmate', textmate]]) {
    const leaves = tokenize(nestedTask);
    assert.ok(leaves.some((leaf) => leaf.text.includes('npm') && (name === 'highlightjs'
        ? leaf.ancestors?.includes('language-bash')
        : /code-block|meta.embedded.block.shellscript/.test(leaf.scope ?? ''))), `${name}: nested task body`);
    assert.ok(leaves.filter((leaf) => leaf.text.includes('more')).every((leaf) => name === 'highlightjs'
        ? !leaf.ancestors?.includes('code')
        : !/code-block|markup.fenced_code.block/.test(leaf.scope ?? '')), `${name}: nested task closer`);
}
console.log('marker-line code fences: block scopes, shell embedding, and closer boundary');
