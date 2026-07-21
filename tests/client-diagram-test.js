/**
 * Client-side (offline) diagram renderer tests: Graphviz (@viz-js/viz) and
 * D2 (@terrastruct/d2). Uses happy-dom and a stubbed `load` so no WASM is
 * imported and no network is touched. Verifies block selection, the produced
 * SVG figure, idempotency, error handling and the lazy single-load behaviour.
 */
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const k of ['DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator']) {
    if (globalThis[k] === undefined && win[k] !== undefined) {
        try { globalThis[k] = win[k]; } catch { /* read-only global - ignore */ }
    }
}

const { renderGraphvizDiagrams } = await import('../diagrams/graphviz.js');
const { renderD2Diagrams } = await import('../diagrams/d2.js');

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
    if (cond) {
        pass++;
        console.log(`  ✓ ${name}`);
    } else {
        fail++;
        console.log(`  ✗ ${name}`);
        if (detail !== undefined) console.log(`    ${detail}`);
    }
}

function container(blocks) {
    const el = document.createElement('div');
    for (const [cls, source] of blocks) {
        const pre = document.createElement('pre');
        pre.className = cls;
        pre.textContent = source;
        el.appendChild(pre);
    }
    document.body.appendChild(el);

    return el;
}

console.log('carve-grammars client diagram renderers:');

// --- Graphviz -------------------------------------------------------------
{
    const el = container([['graphviz', 'digraph { a -> b }'], ['mermaid', 'graph TD; A-->B']]);
    let loads = 0;
    const sources = [];
    const load = async () => {
        loads++;
        return {
            renderString(dot, opts) {
                sources.push({ dot, format: opts && opts.format });
                return `<?xml version="1.0"?>\n<svg data-dot="${dot}"><g/></svg>`;
            },
        };
    };
    const count = await renderGraphvizDiagrams(el, { load });

    ok('renders the graphviz block', count === 1, `count=${count}`);
    ok('passes the DOT source + svg format to the renderer', sources[0].dot === 'digraph { a -> b }' && sources[0].format === 'svg');
    const gimg = el.querySelector('img.carve-diagram');
    ok('replaces the <pre> with an inert <img> data URI', !el.querySelector('pre.graphviz') && !!gimg && gimg.getAttribute('src')?.startsWith('data:image/svg+xml;base64,'));
    ok('the data URI has the xml prolog stripped', gimg && !atob(gimg.getAttribute('src').split(',')[1]).includes('<?xml'));
    ok('leaves a non-graphviz block (mermaid) untouched', !!el.querySelector('pre.mermaid'));

    const second = await renderGraphvizDiagrams(el, { load });
    ok('idempotent: a second pass renders nothing', second === 0);
    ok('the Viz instance is loaded once and reused', loads === 1, `loads=${loads}`);
}

// --- Graphviz: dot alias + untrusted output is neutralized ----------------
{
    const el = container([['dot', 'digraph { a -> b }']]);
    const load = async () => ({
        // A malicious Graphviz output with an active javascript: link.
        renderString() { return '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>'; },
    });
    const count = await renderGraphvizDiagrams(el, { load });
    const img = el.querySelector('img.carve-diagram');

    ok('claims the dot alias class', count === 1 && !el.querySelector('pre.dot'));
    ok('untrusted SVG is neutralized inside an inert <img> (no live <a>/<svg> in the DOM)',
        !!img && !el.querySelector('svg') && !el.querySelector('a'));
}

// --- Graphviz error -------------------------------------------------------
{
    const el = container([['graphviz', 'oops']]);
    const errors = [];
    const load = async () => ({ renderString() { throw new Error('bad DOT'); } });
    const count = await renderGraphvizDiagrams(el, { load, onError: (node, m) => errors.push(m) });

    ok('a render failure leaves the <pre> in place', count === 0 && !!el.querySelector('pre.graphviz'));
    ok('the failure is recorded + onError called', el.querySelector('pre.graphviz')?.dataset.graphvizError === 'bad DOT' && errors[0] === 'bad DOT');
    const retry = await renderGraphvizDiagrams(el, { load });
    ok('an errored block is not retried', retry === 0);
}

// --- D2 (string SVG output) -----------------------------------------------
{
    const el = container([['d2', 'x -> y']]);
    let loads = 0;
    const load = async () => {
        loads++;
        return {
            async compile(src) { return { diagram: { src }, renderOptions: {} }; },
            async render(diagram) { return `<svg data-d2="${diagram.src}"><g/></svg>`; },
        };
    };
    const count = await renderD2Diagrams(el, { load });
    const img = el.querySelector('img.carve-diagram');

    ok('renders the d2 block', count === 1, `count=${count}`);
    ok('compiles then renders into an inert <img> data URI', !el.querySelector('pre.d2') && !!img && img.getAttribute('src')?.startsWith('data:image/svg+xml;base64,'));
    ok('the data URI decodes to the rendered SVG', img && atob(img.getAttribute('src').split(',')[1]).includes('data-d2="x -> y"'));

    const second = await renderD2Diagrams(el, { load });
    ok('d2 is idempotent + loaded once', second === 0 && loads === 1, `loads=${loads}`);
}

// --- guards ---------------------------------------------------------------
{
    ok('graphviz: null container renders nothing', (await renderGraphvizDiagrams(null, { load: async () => ({}) })) === 0);
    ok('d2: null container renders nothing', (await renderD2Diagrams(null, { load: async () => ({}) })) === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
    process.exit(1);
}
