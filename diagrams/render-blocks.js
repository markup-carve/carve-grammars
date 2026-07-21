/**
 * Shared helper for the client-side diagram renderers.
 *
 * Finds every `<pre class="LANG">` fenced-render block for a set of classes,
 * renders each with a caller-supplied async function, and swaps the `<pre>`
 * for the result. Processing is idempotent (a rendered or errored block is
 * marked and skipped on a later call) and a failure leaves the source block in
 * place with a `data-<flag>-error` attribute.
 *
 * @param {ParentNode} container - Root to search.
 * @param {string[]} classes - Fenced-render CSS classes to claim (e.g. ['graphviz']).
 * @param {(source: string, cls: string, doc: Document) => Promise<Node|string>} renderOne
 *   Render one block; return an SVG string (wrapped in an inert `<img>` data
 *   URI, so untrusted diagram output cannot run script or expose a
 *   `javascript:` link), or a DOM node if you take responsibility for safety.
 * @param {object} [options]
 * @param {string} options.flag - dataset key stem for the processed/error marks.
 * @param {(el: Element, message: string) => void} [options.onError]
 * @returns {Promise<number>} How many blocks were rendered.
 */
export async function renderBlocks(container, classes, renderOne, options = {}) {
    if (!container || classes.length === 0) {
        return 0;
    }
    const flag = options.flag ?? 'diagram';
    const processedKey = `${flag}Processed`;
    const errorKey = `${flag}Error`;
    const onError = options.onError;
    const selector = classes.map((cls) => `pre.${cls}`).join(', ');
    const blocks = [...container.querySelectorAll(selector)];

    const results = await Promise.all(blocks.map(async (el) => {
        if (el.dataset[processedKey]) {
            return 0;
        }
        el.dataset[processedKey] = 'true';
        const cls = classes.find((c) => el.classList.contains(c));
        const source = el.textContent.trim();
        try {
            const out = await renderOne(source, cls, el.ownerDocument);
            const node = typeof out === 'string' ? imgFromSvg(out, el.ownerDocument) : out;
            el.replaceWith(node);

            return 1;
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            el.dataset[errorKey] = message;
            if (typeof onError === 'function') {
                onError(el, message);
            }

            return 0;
        }
    }));

    return results.reduce((a, b) => a + b, 0);
}

/**
 * Wrap an SVG string in an inert `<img>` via a `data:image/svg+xml` URI - the
 * same safe transport the Kroki renderer uses. An `<img>` cannot run script or
 * follow a `javascript:` link, so untrusted diagram output (e.g. a Graphviz
 * `URL="javascript:..."`) is neutralized instead of entering the live DOM as it
 * would with `innerHTML`.
 *
 * @param {string} svg
 * @param {Document} doc
 * @returns {Element}
 */
function imgFromSvg(svg, doc) {
    const img = doc.createElement('img');
    // btoa needs Latin-1; percent-encode first so UTF-8 labels survive.
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    img.alt = 'diagram';
    img.loading = 'lazy';
    img.className = 'carve-diagram';

    return img;
}
