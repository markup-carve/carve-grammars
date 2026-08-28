/**
 * wp-carve-shaped tab fuzzing.
 *
 * wp-carve seeds Tiptap from `carveToProseMirror(source, { unsupported:
 * 'preserve' })`, mounts CarveKit, and saves with `serializeToCarve()`.  Keep
 * that exact public path under a deterministic cross-product of tab counts,
 * selected positions and content shapes.  In particular, `{selected}` is an
 * empty-string AST attribute, while the panel bar must still open that tab.
 */
import assert from 'node:assert';
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const key of [
    'DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator', 'getComputedStyle',
    'MutationObserver', 'MouseEvent', 'KeyboardEvent', 'Event', 'FocusEvent',
]) {
    if (globalThis[key] === undefined && win[key] !== undefined) {
        try { globalThis[key] = win[key]; } catch { /* read-only global */ }
    }
}

const { Editor } = await import('@tiptap/core');
const { CarveKit, carveToProseMirror, serializeToCarve } = await import('../tiptap/index.js');
const { parse } = await import('@markup-carve/carve');

const bodies = [
    index => `Plain panel ${index}.`,
    index => `## Heading ${index}\n\n- item *strong*\n- \`code-${index}\``,
    index => `::: note "Nested ${index}"\nA [link](https://example.com/${index}).\n:::`,
    index => `| A | B |\n|:-|--:|\n| ${index} | {,sub,} |`,
    index => `> Quote ${index}\n>\n> > Nested ~strike~.`,
    index => `\`\`\`js\nconst value = ${index};\n\`\`\``,
];

function sourceFor(count, selected, bodyOffset) {
    const lines = ['::: tabs'];
    for (let index = 0; index < count; index += 1) {
        if (index > 0) lines.push('');
        if (index === selected) lines.push('{selected}');
        lines.push(`:::: tab [Panel ${index + 1}]`);
        lines.push(bodies[(bodyOffset + index) % bodies.length](index + 1));
        lines.push('::::');
    }
    lines.push(':::');
    return lines.join('\n');
}

function semanticAst(source) {
    return JSON.parse(JSON.stringify(parse(source), (key, value) => (
        key === 'pos' || key === 'srcByteLength' ? undefined : value
    )));
}

console.log('carve-grammars visual tab fuzz:');
let cases = 0;

for (let count = 1; count <= 6; count += 1) {
    for (let selected = -1; selected < count; selected += 1) {
        for (let bodyOffset = 0; bodyOffset < bodies.length; bodyOffset += 1) {
            const source = sourceFor(count, selected, bodyOffset);
            const element = document.createElement('div');
            document.body.appendChild(element);
            const editor = new Editor({
                element,
                extensions: [CarveKit],
                content: carveToProseMirror(source, { unsupported: 'preserve' }),
            });

            const wrapper = element.querySelector('.carve-tabset');
            assert.ok(wrapper, `tab bar missing\n${source}`);
            assert.strictEqual(
                wrapper.getAttribute('data-active'),
                String(selected < 0 ? 0 : selected),
                `wrong initially open tab\n${source}`,
            );

            const before = serializeToCarve(editor.getJSON());
            assert.deepStrictEqual(semanticAst(before), semanticAst(source), `visual load changed source\n${source}`);

            // Opening every preview panel is view state only: it must neither
            // add/remove `{selected}` nor perturb rich content on save.
            const buttons = [...element.querySelectorAll('.carve-tabset-bar .carve-tabset-tab')];
            buttons.forEach((button, index) => {
                button.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                assert.strictEqual(wrapper.getAttribute('data-active'), String(index));
                assert.strictEqual(serializeToCarve(editor.getJSON()), before);
            });

            editor.destroy();
            element.remove();
            cases += 1;
        }
    }
}

console.log(`  ✓ ${cases} wp-carve-shaped load/open/save cases`);
