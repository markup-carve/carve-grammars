/**
 * Carve diagram renderers.
 *
 * Turns the `FencedRenderExtension` diagram hydration elements
 * (`<pre class="LANG">source</pre>`) into rendered diagrams in the browser:
 *
 * - `renderGraphvizDiagrams` - Graphviz via `@viz-js/viz` (offline WASM)
 * - `renderD2Diagrams` - D2 via `@terrastruct/d2` (offline WASM)
 * - `renderKrokiDiagrams` - PlantUML (and any opted-in type) via a Kroki server
 *
 * Mermaid, WaveDrom, Vega-Lite and Chart already have their own browser
 * libraries; load and run those yourself.
 *
 * `renderDiagrams` is a convenience that runs all three. Each self-loads its
 * library lazily and no-ops when its blocks are absent, so calling it costs
 * nothing for the types not present on the page. The Kroki step is off unless
 * you opt in (`options.kroki`), because it may call an external server - see
 * `renderKrokiDiagrams` for the privacy/GDPR note.
 */
export { renderGraphvizDiagrams, GRAPHVIZ_CLASSES } from './graphviz.js';
export { renderD2Diagrams, D2_CLASSES } from './d2.js';
export { renderKrokiDiagrams, KROKI_DIAGRAM_TYPES } from './kroki.js';

import { renderGraphvizDiagrams } from './graphviz.js';
import { renderD2Diagrams } from './d2.js';
import { renderKrokiDiagrams } from './kroki.js';

/**
 * Render the offline diagram types (Graphviz, D2) under `container`, and -
 * only when `options.kroki` is set - PlantUML via Kroki.
 *
 * @param {ParentNode} container
 * @param {object} [options]
 * @param {object} [options.graphviz] - Options for `renderGraphvizDiagrams` (omit to enable with defaults; `false` to skip).
 * @param {object} [options.d2] - Options for `renderD2Diagrams` (omit to enable with defaults; `false` to skip).
 * @param {object} [options.kroki] - Options for `renderKrokiDiagrams`; OFF unless provided (opt-in, may call an external server).
 * @returns {Promise<number>} Total blocks rendered.
 */
export async function renderDiagrams(container, options = {}) {
    const tasks = [];
    if (options.graphviz !== false) {
        tasks.push(renderGraphvizDiagrams(container, options.graphviz || {}));
    }
    if (options.d2 !== false) {
        tasks.push(renderD2Diagrams(container, options.d2 || {}));
    }
    if (options.kroki) {
        tasks.push(renderKrokiDiagrams(container, options.kroki));
    }
    const counts = await Promise.all(tasks);

    return counts.reduce((a, b) => a + b, 0);
}

export default renderDiagrams;
