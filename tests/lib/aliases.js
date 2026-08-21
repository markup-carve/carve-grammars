/**
 * The fence words every Carve grammar surface must answer to.
 *
 * `carve` is the language name; `crv` is the file extension, so it is the fence
 * word a docs site reaches for just as readily. The Shiki grammar carried
 * `crv` from the start while Prism and highlight.js answered only `carve`, so
 * ```crv highlighted on a VitePress site and fell through to plain text on a
 * Prism or highlight.js one. One list, asserted on every surface, is what stops
 * the three drifting apart again.
 *
 * Surface-specific extras are allowed on top of this set (Shiki also takes the
 * capitalized `Carve`, Prism registers `carvemd` for the embedded form); the
 * rule is that every name here is answered everywhere.
 */
export const REQUIRED_ALIASES = ['carve', 'crv'];
