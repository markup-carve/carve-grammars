import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const phpRoot = process.argv[2];
if (!phpRoot) {
    console.error('Usage: node scripts/cross-runtime-check.mjs <carve-php-checkout>');
    process.exit(2);
}

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const key of ['DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator', 'getComputedStyle', 'MutationObserver']) {
    if (globalThis[key] === undefined && win[key] !== undefined) {
        try { globalThis[key] = win[key]; } catch { /* read-only global */ }
    }
}

const { Editor } = await import('@tiptap/core');
const { CarveKit, carveToProseMirror, serializeToCarveWithReport } = await import('../tiptap/index.js');
const fixtures = JSON.parse(readFileSync(resolve(root, 'tiptap/wire-fixtures.json'), 'utf8'));
const caseNames = [
    'paragraph-with-attributes', 'heading-with-attributes', 'tight-list',
    'reference-link', 'table-with-spans', 'footnote', 'frontmatter',
    'attribute-run-in-authored-order', 'inline-code-with-attributes',
];
const cases = fixtures.cases.filter(({ name }) => caseNames.includes(name));
assert.deepEqual(cases.map(({ name }) => name).sort(), [...caseNames].sort(), 'Cross-runtime fixture list drifted');

function php(direction, input) {
    const result = spawnSync('php', [resolve(root, 'scripts/cross-runtime-bridge.php'), phpRoot, direction], {
        input,
        encoding: 'utf8',
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
}

function mounted(json) {
    const editor = new Editor({ extensions: [CarveKit], content: json });
    try { return JSON.parse(JSON.stringify(editor.getJSON())); }
    finally { editor.destroy(); }
}

for (const fixture of cases) {
    const nodeJson = mounted(carveToProseMirror(fixture.carve, { unsupported: 'preserve' }));
    const phpRead = JSON.parse(php('to-carve', JSON.stringify(nodeJson)));
    assert.equal(Object.keys(phpRead.dropped).length, 0, `${fixture.name}: PHP dropped attributes`);
    assert.equal(Object.keys(phpRead.degraded).length, 0, `${fixture.name}: PHP degraded attributes`);
    assert.equal(
        serializeToCarveWithReport(carveToProseMirror(phpRead.source, { unsupported: 'preserve' })).source.trim(),
        serializeToCarveWithReport(carveToProseMirror(fixture.carve, { unsupported: 'preserve' })).source.trim(),
        `${fixture.name}: Node JSON through PHP changed Carve content`,
    );

    const phpOutput = JSON.parse(php('to-json', fixture.carve));
    assert.equal(Object.keys(phpOutput.dropped).length, 0, `${fixture.name}: PHP dropped types`);
    assert.equal(Object.keys(phpOutput.degraded).length, 0, `${fixture.name}: PHP degraded types`);
    const phpJson = mounted(phpOutput.json);
    const nodeRead = serializeToCarveWithReport(phpJson);
    assert.deepEqual(nodeRead.dropped, {}, `${fixture.name}: Node dropped content`);
    assert.deepEqual(nodeRead.degraded, {}, `${fixture.name}: Node degraded content`);
    assert.equal(
        serializeToCarveWithReport(carveToProseMirror(nodeRead.source, { unsupported: 'preserve' })).source.trim(),
        serializeToCarveWithReport(carveToProseMirror(fixture.carve, { unsupported: 'preserve' })).source.trim(),
        `${fixture.name}: PHP JSON through Node changed Carve content`,
    );
}
console.log(`${cases.length} cross-runtime Tiptap JSON cases passed`);
