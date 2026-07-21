/**
 * Kroki diagram renderer tests.
 *
 * Uses happy-dom for a real DOM and a stubbed fetch, so no network is touched.
 * Verifies block selection, the Kroki request shape, the rendered <img>, error
 * handling, idempotency and the self-hosted-server / custom-types options.
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

const { renderKrokiDiagrams, KROKI_DIAGRAM_TYPES } = await import('../diagrams/kroki.js');

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

// Build a container of fenced-render <pre> blocks from a class->source map.
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

// A fetch stub that records calls and returns a canned SVG (or a failure).
function stubFetch({ status = 200, svg = '<svg><rect/></svg>' } = {}) {
    const calls = [];
    const fetch = async (url, init) => {
        calls.push({ url, init });
        return {
            ok: status >= 200 && status < 300,
            status,
            text: async () => svg,
        };
    };
    fetch.calls = calls;

    return fetch;
}

console.log('carve-grammars kroki renderer:');

// --- request shape + rendered <img> --------------------------------------
{
    const el = container([['plantuml', '@startuml\nA -> B\n@enduml']]);
    const fetch = stubFetch({ svg: '<svg id="uml"><g/></svg>' });
    const count = await renderKrokiDiagrams(el, { fetch });

    ok('renders one plantuml block', count === 1, `count=${count}`);
    ok('POSTs to the default Kroki server + type', fetch.calls[0]?.url === 'https://kroki.io/plantuml/svg', fetch.calls[0]?.url);
    ok('uses POST with the raw source as body',
        fetch.calls[0]?.init?.method === 'POST' && fetch.calls[0]?.init?.body === '@startuml\nA -> B\n@enduml');
    const img = el.querySelector('img');
    ok('replaces the <pre> with an <img>', !!img && !el.querySelector('pre.plantuml'));
    ok('img carries the Kroki SVG as a data URI', !!img && img.getAttribute('src')?.startsWith('data:image/svg+xml;base64,'));
    ok('img is tagged with the diagram type class', img?.className.includes('carve-diagram-plantuml'));
}

// --- language aliases + multiple types ------------------------------------
{
    const el = container([
        ['puml', 'A -> B'],
        ['d2', 'a -> b'],
        ['graphviz', 'digraph{a->b}'],
        ['dot', 'digraph{c->d}'],
    ]);
    const fetch = stubFetch();
    const count = await renderKrokiDiagrams(el, { fetch });
    const urls = fetch.calls.map((c) => c.url).sort();

    ok('renders all four aliased blocks', count === 4, `count=${count}`);
    ok('puml maps to the plantuml type', urls.includes('https://kroki.io/plantuml/svg'));
    ok('dot and graphviz both map to graphviz', urls.filter((u) => u.endsWith('/graphviz/svg')).length === 2, urls.join());
    ok('d2 maps to the d2 type', urls.includes('https://kroki.io/d2/svg'));
}

// --- blocks with no Kroki type are left alone -----------------------------
{
    const el = container([['mermaid', 'graph TD; A-->B'], ['plantuml', 'A -> B']]);
    const fetch = stubFetch();
    const count = await renderKrokiDiagrams(el, { fetch });

    ok('ignores non-Kroki blocks (mermaid untouched)', count === 1 && !!el.querySelector('pre.mermaid'));
    ok('only the plantuml block was fetched', fetch.calls.length === 1);
}

// --- idempotency ----------------------------------------------------------
{
    const el = container([['plantuml', 'A -> B']]);
    const fetch = stubFetch();
    await renderKrokiDiagrams(el, { fetch });
    const second = await renderKrokiDiagrams(el, { fetch });

    ok('a second pass renders nothing new', second === 0 && fetch.calls.length === 1);
}

// --- error handling -------------------------------------------------------
{
    const el = container([['plantuml', 'bad']]);
    const fetch = stubFetch({ status: 400 });
    const errors = [];
    const count = await renderKrokiDiagrams(el, { fetch, onError: (node, msg) => errors.push(msg) });
    const pre = el.querySelector('pre.plantuml');

    ok('a failed render leaves the <pre> in place', !!pre && count === 0);
    ok('the failure is recorded on the element', pre?.dataset.krokiError?.includes('400'));
    ok('onError is called with the message', errors.length === 1 && errors[0].includes('400'));
    const third = await renderKrokiDiagrams(el, { fetch });
    ok('an errored block is not retried', third === 0 && fetch.calls.length === 1);
}

// --- self-hosted server + restricted type set -----------------------------
{
    const el = container([['plantuml', 'A -> B'], ['d2', 'a -> b']]);
    const fetch = stubFetch();
    const count = await renderKrokiDiagrams(el, {
        fetch,
        server: 'https://kroki.internal/',
        types: { plantuml: 'plantuml' },
    });

    ok('honors a self-hosted server (trailing slash trimmed)', fetch.calls[0]?.url === 'https://kroki.internal/plantuml/svg', fetch.calls[0]?.url);
    ok('a restricted type map skips unlisted blocks (d2 left)', count === 1 && !!el.querySelector('pre.d2'));
}

// --- guards ---------------------------------------------------------------
{
    ok('null container renders nothing', (await renderKrokiDiagrams(null, { fetch: stubFetch() })) === 0);
    ok('default type map covers the Carve Kroki presets',
        KROKI_DIAGRAM_TYPES.plantuml === 'plantuml' && KROKI_DIAGRAM_TYPES.d2 === 'd2' && KROKI_DIAGRAM_TYPES.graphviz === 'graphviz');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
    process.exit(1);
}
