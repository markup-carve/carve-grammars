/**
 * Kroki diagram renderer for Carve fenced-render output.
 *
 * The one diagram preset with no practical in-browser renderer is **PlantUML**
 * (its only pure-JS build is a multi-megabyte JVM-in-WASM). This helper renders
 * it - and any other Kroki-supported type you opt in - by POSTing the source to
 * a Kroki server. Graphviz and D2 do NOT need this: they have self-contained
 * WebAssembly renderers (`renderGraphvizDiagrams`, `renderD2Diagrams`) that run
 * offline, so they are not in the default type map.
 *
 * ⚠️ PRIVACY / GDPR: the default server is the PUBLIC `https://kroki.io`, so the
 * diagram source is sent to a third party outside your control. For anything
 * sensitive - or to keep rendering offline - point `server` at a self-hosted
 * Kroki (or a localhost instance) so no data leaves your domain, and disclose
 * the external call to end users where required.
 *
 * It is dependency-free: the diagram source is POSTed to Kroki as plain text
 * (no deflate/base64 step, so no pako dependency), and the returned SVG is
 * shown in an `<img>` via a data URI. An `<img>` cannot execute script, so
 * Kroki's SVG output is inert on the page regardless of its content.
 *
 * SVG only, by design: the output rides in a `data:image/svg+xml` URI, which
 * is text-based and scales cleanly. Binary Kroki formats (PNG, PDF) would need
 * a different transport and are out of scope for an inline browser renderer.
 *
 * @example
 * import { renderKrokiDiagrams } from '@markup-carve/carve-grammars/diagrams/kroki'
 * await renderKrokiDiagrams(document.querySelector('.carve-output'))
 *
 * @example <caption>Self-hosted Kroki + only PlantUML</caption>
 * await renderKrokiDiagrams(container, {
 *   server: 'https://kroki.internal',
 *   types: { plantuml: 'plantuml', puml: 'plantuml' },
 * })
 */

/**
 * Default map of fenced-block CSS class (the `FencedRenderExtension` cssClass)
 * to the Kroki diagram type. PlantUML only, because it is the one preset with
 * no practical in-browser renderer. Graphviz and D2 have offline WASM renderers
 * (`renderGraphvizDiagrams`, `renderD2Diagrams`); Mermaid, WaveDrom, Vega-Lite
 * and Chart have their own browser libraries. To Kroki-render one of those
 * anyway (e.g. against a self-hosted server), pass an extended `types` map.
 *
 * @type {Record<string, string>}
 */
export const KROKI_DIAGRAM_TYPES = {
    plantuml: 'plantuml',
    puml: 'plantuml',
};

/**
 * Render every Kroki-supported fenced-render block inside `container`.
 *
 * Each matching `<pre class="LANG">` is replaced with an `<img>` of the Kroki
 * output. Processing is idempotent (a rendered or errored block is marked and
 * skipped on a later call), so it is safe to run after every content update.
 *
 * @param {ParentNode} container - Root to search for diagram blocks.
 * @param {object} [options]
 * @param {string} [options.server='https://kroki.io'] - Kroki base URL.
 * @param {Record<string, string>} [options.types=KROKI_DIAGRAM_TYPES] - CSS
 *   class to Kroki-type map. Also selects which blocks are claimed.
 * @param {(el: Element, message: string) => void} [options.onError] - Called
 *   for a block that fails to render; by default the `<pre>` is left in place
 *   with a `data-kroki-error` attribute.
 * @param {typeof fetch} [options.fetch=globalThis.fetch] - Fetch implementation
 *   (overridable for tests / non-browser hosts).
 * @returns {Promise<number>} How many blocks were rendered in this call.
 */
export async function renderKrokiDiagrams(container, options = {}) {
    if (!container) {
        return 0;
    }
    const server = (options.server ?? 'https://kroki.io').replace(/\/+$/, '');
    const types = options.types ?? KROKI_DIAGRAM_TYPES;
    const fetchImpl = options.fetch ?? globalThis.fetch;
    const onError = options.onError;
    if (typeof fetchImpl !== 'function') {
        throw new Error('renderKrokiDiagrams: no fetch implementation available');
    }

    const classes = Object.keys(types);
    if (classes.length === 0) {
        return 0;
    }
    const selector = classes.map((cls) => `pre.${cls}`).join(', ');
    const blocks = [...container.querySelectorAll(selector)];

    const results = await Promise.all(blocks.map(async (el) => {
        if (el.dataset.krokiProcessed) {
            return 0;
        }
        el.dataset.krokiProcessed = 'true';
        // First matching class wins, mirroring the single cssClass a
        // FencedRenderExtension block carries.
        const cls = classes.find((c) => el.classList.contains(c));
        const krokiType = types[cls];
        const source = el.textContent.trim();
        try {
            const response = await fetchImpl(`${server}/${krokiType}/svg`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: source,
            });
            if (!response.ok) {
                throw new Error(`Kroki responded ${response.status}`);
            }
            const rendered = await response.text();
            const doc = el.ownerDocument;
            const img = doc.createElement('img');
            img.src = svgDataUri(rendered);
            img.alt = `${krokiType} diagram`;
            img.loading = 'lazy';
            img.className = `carve-diagram carve-diagram-${krokiType}`;
            el.replaceWith(img);

            return 1;
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            el.dataset.krokiError = message;
            if (typeof onError === 'function') {
                onError(el, message);
            }

            return 0;
        }
    }));

    return results.reduce((a, b) => a + b, 0);
}

/**
 * Encode an SVG string as a base64 `data:` URI for an `<img src>`.
 *
 * @param {string} svg
 * @returns {string}
 */
function svgDataUri(svg) {
    // btoa needs Latin-1; percent-encode first so any UTF-8 in the diagram
    // (labels, etc.) survives.
    const base64 = btoa(unescape(encodeURIComponent(svg)));

    return `data:image/svg+xml;base64,${base64}`;
}

export default renderKrokiDiagrams;
