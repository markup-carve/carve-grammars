/**
 * Tab-set round-trip test.
 *
 * Exercises the real editor path for `:::: tabs` / `::: tab`:
 *   Carve -> HTML (carve-js) -> Tiptap (CarveKit) -> Carve (serializeToCarve).
 *
 * The generic round-trip test (roundtrip-test.js) drives a carve-AST -> PM
 * converter that does not model divs, so tab sets need this CarveKit-based path
 * to prove the CarveTabSet/CarveTab nodes parse the raw div form and serialize
 * back with labels, the selected flag and correctly widened fences.
 */
import assert from 'node:assert';
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const k of ['DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator', 'getComputedStyle', 'MutationObserver']) {
    if (globalThis[k] === undefined && win[k] !== undefined) {
        try {
            globalThis[k] = win[k];
        } catch {
            /* read-only global - ignore */
        }
    }
}

const { Editor } = await import('@tiptap/core');
const { CarveKit, serializeToCarve } = await import('../tiptap/index.js');
const { carveToHtml, parse } = await import('@markup-carve/carve');

console.log('carve-grammars tab-set round-trip:');
let passed = 0;

function roundTrip(carve) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const editor = new Editor({ element: el, extensions: [CarveKit], content: carveToHtml(carve) });
    const out = serializeToCarve(editor.getJSON());
    editor.destroy();
    el.remove();
    return out;
}

// Structural equivalence: parse both sides and compare, so incidental
// whitespace does not matter but content/attributes/nesting do.
function assertRoundTrips(name, carve) {
    const out = roundTrip(carve);
    assert.deepStrictEqual(parse(out), parse(carve), `${name}\n--- in ---\n${carve}\n--- out ---\n${out}`);
    passed++;
    console.log(`  ✓ ${name}`);
}

assertRoundTrips('labelled tabs with a selected flag (canonical [label] openers)',
    ':::: tabs\n::: tab [First]\nAlpha\n:::\n\n{selected}\n::: tab [Second]\nBeta\n:::\n::::');

// Legacy attribute-form input normalizes to the canonical [label] opener.
{
    const legacy = ':::: tabs\n{label="First"}\n::: tab\nAlpha\n:::\n::::';
    const canonical = ':::: tabs\n::: tab [First]\nAlpha\n:::\n::::';
    assert.deepStrictEqual(parse(roundTrip(legacy)), parse(canonical), 'legacy label attribute normalizes to [label]');
    passed++;
    console.log('  ✓ legacy label attribute normalizes to [label]');
}

assertRoundTrips('tabs without labels',
    ':::: tabs\n::: tab\nOne\n:::\n\n::: tab\nTwo\n:::\n::::');

assertRoundTrips('a tab with multiple blocks',
    ':::: tabs\n::: tab [Docs]\n## Heading\n\nA paragraph.\n\n- a\n- b\n:::\n::::');

console.log(`\n${passed} passed`);
