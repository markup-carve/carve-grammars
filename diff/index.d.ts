/** Turn a marker-stripped diff line into HTML (language highlighting or escaping). */
export type HighlightLine = (body: string) => string

/**
 * Render a Carve `{.diff}` language fence to an HTML string of per-line spans,
 * using any highlighter (or none). See the module JSDoc for the contract.
 */
export function renderLanguageDiff(code: string, highlightLine?: HighlightLine): string

/**
 * Apply the diff presentation to a rendered `<pre class="diff"><code>` in the
 * DOM: replace the code's content with per-line diff spans and mark the `<pre>`.
 */
export function applyLanguageDiff(codeElement: Element, highlightLine?: HighlightLine): void
