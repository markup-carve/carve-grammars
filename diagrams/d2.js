/**
 * D2 diagram renderer for Carve fenced-render output.
 *
 * `FencedRenderExtension::d2()` emits `<pre class="d2">SOURCE</pre>`. D2 has a
 * WebAssembly build (`@terrastruct/d2`), so this renders in the browser with no
 * server and no external call - it works offline. The WASM is large, so the
 * library is imported lazily (only when a D2 block is on the page) and the D2
 * instance is reused across blocks and calls.
 *
 * @example
 * import { renderD2Diagrams } from '@markup-carve/carve-grammars/diagrams/d2'
 * await renderD2Diagrams(document.querySelector('.carve-output'))
 */
import { renderBlocks } from './render-blocks.js';

/** CSS classes claimed as D2 (the FencedRenderExtension cssClass). */
export const D2_CLASSES = ['d2'];

let d2Instance = null;

/**
 * Render every `<pre class="d2">` under `container` to inline SVG.
 *
 * @param {ParentNode} container
 * @param {object} [options]
 * @param {string[]} [options.classes=D2_CLASSES]
 * @param {object} [options.compileOptions] - Passed to `d2.compile` (e.g. `{ sketch: true }`).
 * @param {() => Promise<{ compile: Function, render: Function }>} [options.load]
 *   Resolve the D2 instance; overridable for tests / a self-hosted build.
 *   Defaults to lazy-importing `@terrastruct/d2`.
 * @param {(el: Element, message: string) => void} [options.onError]
 * @returns {Promise<number>} How many blocks were rendered.
 */
export async function renderD2Diagrams(container, options = {}) {
    const classes = options.classes ?? D2_CLASSES;
    const load = options.load ?? defaultLoad;

    return renderBlocks(container, classes, async (source) => {
        const d2 = await load();
        const result = await d2.compile(source, options.compileOptions);

        return d2.render(result.diagram, result.renderOptions);
    }, { flag: 'd2', onError: options.onError });
}

async function defaultLoad() {
    if (!d2Instance) {
        const { D2 } = await import('@terrastruct/d2');
        d2Instance = new D2();
    }

    return d2Instance;
}

export default renderD2Diagrams;
