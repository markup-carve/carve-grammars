/**
 * A folded `%%%` fence keeps its spelling inside an inline run.
 *
 * `block` is the SPELLING of a comment, not its position: the fenced `%%%` form
 * against the `%%` line. CARVE-P2-028 folds a fence into a definition term's
 * inline run, so an inline comment can carry either spelling, and the two are
 * different documents - `%%` runs to the end of the run and swallows whatever
 * follows it, the fence ends at its closer.
 *
 * `carveCommentInline` declared no `block`, while `schema-map.json` has claimed
 * one for `comment` under both PM names all along. So the bridge had nowhere to
 * put the flag and the editor stripped it on mount, which is
 * markup-carve/carve-rs#2067: nothing in either repo could carry the spelling.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { Editor } from '@tiptap/core';
import { CarveComment, CarveCommentInline } from '../tiptap/extensions/carve-comment.js';
import { CarveKit, astToProseMirror, serializeToCarveWithReport } from '../tiptap/index.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const key of ['DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator', 'getComputedStyle', 'MutationObserver']) {
    if (globalThis[key] === undefined && win[key] !== undefined) {
        try { globalThis[key] = win[key]; } catch { /* read-only global */ }
    }
}

const here = dirname(fileURLToPath(import.meta.url));
const map = JSON.parse(readFileSync(resolve(here, '../tiptap/schema-map.json'), 'utf8'));

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

console.log('inline comment spelling:');

const attributesOf = (extension) => extension.config.addAttributes.call({
    name: extension.name,
    options: extension.options ?? {},
    parent: undefined,
});

ok('both comment nodes declare the spelling the schema map claims', () => {
    const entry = map.types.comment;
    assert.deepStrictEqual(entry.pm, ['carveComment', 'carveCommentInline'],
        'the map names the two PM nodes a comment becomes');
    assert.ok('block' in entry.attrs, 'the map claims a `block` attribute for a comment');

    const block = attributesOf(CarveComment);
    const inline = attributesOf(CarveCommentInline);
    assert.ok('block' in inline,
        'carveCommentInline must declare `block`, or the editor strips the spelling on mount');
    assert.deepStrictEqual(inline.block, block.block,
        'the two nodes must spell `block` the same way, or a bridge sees two vocabularies');
});

// The AST a folded fence produces: the comment is an inline child of the term,
// and the term's content does not reach across it (CARVE-P2-028).
const foldedTerm = {
    type: 'document',
    children: [{
        type: 'definition_list',
        items: [{
            terms: [[
                { type: 'text', value: 'term' },
                { type: 'comment', block: true, content: 'hidden' },
                { type: 'text', value: 'after' },
            ]],
            definitions: [[{ type: 'paragraph', children: [{ type: 'text', value: 'body' }] }]],
        }],
    }],
};

const lineTail = {
    type: 'document',
    children: [{
        type: 'paragraph',
        children: [
            { type: 'text', value: 'text ' },
            { type: 'comment', block: false, content: 'note' },
        ],
    }],
};

function commentsIn(doc) {
    const found = [];
    const walk = (node) => {
        if (node.type === 'carveCommentInline') found.push(node);
        for (const child of node.content || []) walk(child);
    };
    walk(doc);

    return found;
}

ok('the bridge carries a folded fence onto the inline node', () => {
    const [comment] = commentsIn(astToProseMirror(foldedTerm));
    assert.ok(comment, 'the folded comment reaches the document as an inline node');
    assert.strictEqual(comment.attrs.block, true,
        'a fenced comment folded inline keeps `block` - writing `false` outright loses the spelling');
});

ok('the bridge still reads a line tail as the line form', () => {
    const [comment] = commentsIn(astToProseMirror(lineTail));
    assert.strictEqual(comment.attrs.block, false, '`%%` is the line form');
});

ok('the spelling survives a mount in a real editor', () => {
    // A mount is where an undeclared attribute disappears: the schema, not the
    // JSON, decides which attributes a node has.
    for (const [name, ast, expected] of [['folded fence', foldedTerm, true], ['line tail', lineTail, false]]) {
        const editor = new Editor({ extensions: [CarveKit], content: astToProseMirror(ast) });
        try {
            const [comment] = commentsIn(editor.getJSON());
            assert.ok(comment, `${name}: the inline comment survives the mount`);
            assert.strictEqual(comment.attrs.block, expected,
                `${name}: the editor keeps the comment's spelling`);
        } finally {
            editor.destroy();
        }
    }
});

ok('the writer says it cannot spell a folded fence', () => {
    // The source spelling is not fixed here: the closer needs its own line at
    // the run's column, which the inline pass does not know. What this pins is
    // that the writer no longer loses the tail in silence - an application can
    // refuse the document (docs/format-bridges.md).
    const folded = serializeToCarveWithReport(astToProseMirror(foldedTerm));
    assert.ok('comment' in folded.degraded, JSON.stringify(folded.degraded));
    assert.match(folded.degraded.comment, /swallows/);

    const line = serializeToCarveWithReport(astToProseMirror(lineTail));
    assert.ok(!('comment' in line.degraded),
        'a `%%` line tail is spelled exactly, so it reports nothing');
});

console.log(`  ${passed} checks passed`);
