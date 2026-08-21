/**
 * ONE fence-word inventory, consumed by every highlighting surface this
 * package ships.
 *
 * The three surfaces used to answer three different sets. Shiki carried the
 * extension alias from the start, Prism registered `carve` and the embedded
 * form `carvemd`, and the highlight.js definition listed `carve` alone - so a
 * ```` ```crv ```` fence highlighted on a VitePress site and stayed plain text
 * on a Prism or a highlight.js one, out of a single package. Nothing reported
 * the asymmetry, because each surface's tests asserted only what that surface
 * already implemented.
 *
 * `REQUIRED_ALIASES` is the set every surface must answer. Surface-specific
 * extras are allowed on top; they are listed in `SURFACE_EXTRAS` with the API
 * constraint that makes each one reachable, because those constraints are what
 * decide whether an extra is an alias or a dead entry:
 *
 *   - **Shiki** looks a language up by exact string, both for `name` and for
 *     each entry of `aliases`. `Carve` therefore has to be listed to resolve,
 *     and `CRV` does not resolve at all. It is the only surface where a casing
 *     variant is a real alias.
 *   - **highlight.js** lowercases both sides: `registerAliases` lowercases
 *     every alias it stores and `getLanguage` lowercases its argument. So
 *     `Carve` already resolves without being listed, and adding a casing
 *     variant to the `aliases` array would be a dead entry rather than parity.
 *     `registerLanguage` reads the definition's own `aliases`, so listing a
 *     name there is the whole registration.
 *   - **Prism** resolves the `language-xxx` class through
 *     `Prism.util.getLanguage`, which lowercases it. An uppercase key on
 *     `Prism.languages` is assignable but unreachable from markup, so Prism
 *     aliases are lowercase keys pointing at the same grammar object.
 *
 * Adding a fence word here forces the decision for all three at once, which is
 * the point - the same covered-or-say-why discipline `tests/lib/constructs.js`
 * applies to constructs. `tests/alias-parity-test.js` is what enforces it.
 *
 * The side packages and upstream submissions being prepared (a standalone
 * highlight.js package, a Prism core definition, a Pygments lexer) each carry
 * an alias list of their own; this set is what they derive from, rather than
 * each repeating whichever subset its source surface happened to have.
 */

/**
 * Fence words every surface must answer.
 *
 * `carve` is the language name. `crv` is the canonical file extension in this
 * org, so it is the fence word an author reaches for at least as readily.
 */
export const REQUIRED_ALIASES = ['carve', 'crv'];

/**
 * Extras a single surface answers on top of the required set, each with the
 * reason it exists there and nowhere else.
 */
export const SURFACE_EXTRAS = {
    shiki: {
        Carve: 'Shiki matches a language name by exact string, so the capitalized spelling is a distinct, reachable alias.',
    },
    prism: {
        carvemd: 'The embedded form: Carve inside a ```carve fence, registered as its own key pointing at the same grammar.',
    },
    highlightjs: {},
};
