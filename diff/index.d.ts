/** Matches the `<code>` of a diff fence: `pre.diff > code` or captioned `figure.diff > pre > code`. */
export const DIFF_FENCE_SELECTOR: string

/** Whether a rendered `<pre>` is a diff fence: `pre.diff`, or a `<pre>` inside `figure.diff`. */
export function isDiffFence(pre: Element | null | undefined): boolean

/** The `<code>` elements of every diff fence under `root`, uncaptioned and captioned, in document order. */
export function findDiffFences(root: ParentNode): Element[]

/** A Carve AST node shape, as far as the diff check reads it. */
export interface DiffAstNode {
  type?: string
  target?: unknown
  attrs?: { classes?: string[] }
}

/**
 * Whether a Carve AST node is a diff fence: a `code_block` with the `diff` class,
 * or the target of a `figure` that carries it (a captioned fence).
 */
export function isDiffCodeBlock(node: DiffAstNode | null | undefined, parent?: DiffAstNode | null): boolean

/** Turn a marker-stripped diff line into HTML (language highlighting or escaping). */
export type HighlightLine = (body: string) => string

/**
 * Render a Carve `{.diff}` language fence to an HTML string of per-line spans,
 * using any highlighter (or none). See the module JSDoc for the contract.
 */
export function renderLanguageDiff(code: string, highlightLine?: HighlightLine): string

/**
 * Apply the diff presentation to the `<code>` of a diff fence in the
 * DOM: replace the code's content with per-line diff spans and mark the `<pre>`.
 */
export function applyLanguageDiff(codeElement: Element, highlightLine?: HighlightLine): void
