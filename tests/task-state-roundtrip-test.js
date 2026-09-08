/**
 * A non-space task state must survive the Tiptap bridge.
 *
 * carve-grammars#371: the bridge kept only `checked` (x/space), so a load/save
 * cycle rewrote every `- [-]` / `- [_]` / `- [>]` / `- [?]` item back to `[ ]`.
 * The engine models the state in `list_item.taskState` (empirically confirmed
 * against @markup-carve/carve 0.1.6) and emits it as `data-task-state`; the
 * bridge now carries it onto the `taskItem` node and writes it back verbatim.
 */
import assert from 'node:assert';
import { carveToProseMirror } from '../tiptap/carve-to-pm.js';
import { serializeToCarve } from '../tiptap/serializer.js';

let passed = 0;
function check(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

const roundTrip = (src) => serializeToCarve(carveToProseMirror(src, { unsupported: 'preserve' }));

console.log('carve-grammars task-state round trip:');

const issueInput = [
    '- [-] dropped',
    '- [_] paused',
    '- [>] deferred',
    '- [?] maybe',
].join('\n');

check('the four non-space states survive the round trip unchanged', () => {
    assert.strictEqual(roundTrip(issueInput), issueInput);
});

check('the PM doc carries each non-space state on its taskItem', () => {
    const doc = carveToProseMirror(issueInput, { unsupported: 'preserve' });
    const list = doc.content.find((n) => n.type === 'taskList');
    assert.ok(list, 'expected a taskList');
    assert.deepStrictEqual(
        list.content.map((item) => item.attrs?.carveTaskState),
        ['-', '_', '>', '?'],
    );
    // The extended states are not "done": checked stays false.
    assert.deepStrictEqual(
        list.content.map((item) => item.attrs?.checked),
        [false, false, false, false],
    );
});

check('plain [ ] and [x] still round-trip', () => {
    const src = '- [ ] todo\n- [x] done';
    assert.strictEqual(roundTrip(src), src);
    const doc = carveToProseMirror(src, { unsupported: 'preserve' });
    const list = doc.content.find((n) => n.type === 'taskList');
    // No taskState for the default states; checked carries them.
    assert.deepStrictEqual(list.content.map((i) => i.attrs?.carveTaskState ?? null), [null, null]);
    assert.deepStrictEqual(list.content.map((i) => i.attrs?.checked), [false, true]);
});

check('checking an extended-state item in the editor serializes as [x]', () => {
    // The stock TaskItem checkbox toggle sets `checked` and leaves the other
    // attrs (carveTaskState) in place, so `checked` must win the serialization.
    const doc = carveToProseMirror('- [-] dropped', { unsupported: 'preserve' });
    const list = doc.content.find((n) => n.type === 'taskList');
    list.content[0].attrs.checked = true; // user ticks the box
    assert.strictEqual(serializeToCarve(doc), '- [x] dropped');
});

check('a plain bullet item stays plain (no checkbox)', () => {
    const src = '- just a bullet';
    assert.strictEqual(roundTrip(src), src);
    const doc = carveToProseMirror(src, { unsupported: 'preserve' });
    assert.ok(doc.content.find((n) => n.type === 'bulletList'), 'expected a bulletList');
    assert.ok(!doc.content.find((n) => n.type === 'taskList'), 'must not become a taskList');
});

console.log(`\n${passed} task-state round-trip tests passed.`);
