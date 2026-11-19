/**
 * Graphviz diagram renderer for Carve fenced-render output.
 *
 * `FencedRenderExtension::graphviz()` emits `<pre class="graphviz">DOT</pre>`.
 * Graphviz has a mature, self-contained WebAssembly build (`@viz-js/viz`), so
 * this renders entirely in the browser - no server, no external call, works
 * offline. The library is imported lazily (only when a graphviz block is on
 * the page) and the Viz instance is reused across blocks and calls.
 *
 * @example
 * import { renderGraphvizDiagrams } from '@markup-carve/carve-grammars/diagrams/graphviz'
 * await renderGraphvizDiagrams(document.querySelector('.carve-output'))
 */
import { renderBlocks } from './render-blocks.js';

/**
 * CSS classes claimed as Graphviz DOT. `graphviz` is the FencedRenderExtension
 * cssClass; `dot` covers a block configured with that class directly.
 */
export const GRAPHVIZ_CLASSES = ['graphviz', 'dot'];

let vizInstance = null;

/**
 * Render every `<pre class="graphviz">` under `container` to inline SVG.
 *
 * @param {ParentNode} container
 * @param {object} [options]
 * @param {string[]} [options.classes=GRAPHVIZ_CLASSES]
 * @param {() => Promise<{ renderString(dot: string, opts?: object): string }>} [options.load]
 *   Resolve the Viz instance; overridable for tests / a self-hosted build.
 *   Defaults to lazy-importing `@viz-js/viz`.
 * @param {(el: Element, message: string) => void} [options.onError]
 * @returns {Promise<number>} How many blocks were rendered.
 */
export async function renderGraphvizDiagrams(container, options = {}) {
    const classes = options.classes ?? GRAPHVIZ_CLASSES;
    const load = options.load ?? defaultLoad;

    return renderBlocks(container, classes, async (source) => {
        const viz = await load();
        // renderString (not renderSVGElement) so it works in any host: the
        // latter needs a browser DOMParser, the former just returns the SVG
        // string, which renderBlocks wraps. Strip the XML prolog so the markup
        // starts at <svg>.
        return viz.renderString(source, { format: 'svg' }).replace(/^\s*<\?xml[^>]*\?>\s*/, '');
    }, { flag: 'graphviz', onError: options.onError });
}

async function defaultLoad() {
    if (!vizInstance) {
        const { instance } = await import('@viz-js/viz');
        vizInstance = await instance();
    }

    return vizInstance;
}

export default renderGraphvizDiagrams;
