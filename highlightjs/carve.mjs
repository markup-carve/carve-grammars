/**
 * ESM entry for the Carve highlight.js grammar.
 *
 * The grammar itself lives in the UMD file `carve.js` (so it can also load as a
 * classic `<script>` or via CommonJS). This shim runs that module for its side
 * effect - which assigns `globalThis.carveHljs` - and re-exports the language
 * factory as the default export, so ESM consumers get the documented:
 *
 * ```js
 * import hljs from 'highlight.js';
 * import carve from 'carve-grammars/highlightjs/carve.js';
 * hljs.registerLanguage('carve', carve);
 * ```
 *
 * (The package `exports` map routes the ESM `import` of `./highlightjs/carve.js`
 * to this file.)
 *
 * @module carve-grammars/highlightjs/carve
 */
import './carve.js';

/** @type {(hljs?: object) => object} */
const carve = globalThis.carveHljs;

export default carve;
