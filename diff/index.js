/**
 * Present a Carve `{.diff}` language fence with any highlighter (or none).
 *
 * Carve core emits `{.diff}` on a language-tagged fence as
 * `<pre class="diff"><code class="language-x">…</code></pre>`, or with a caption
 * as `<figure class="diff"><pre><code class="language-x">`, because the caption's
 * figure owns the attribute line. The leading `+`, `-`, and context-space
 * characters stay plain text - applying the presentation is the host's job;
 * `findDiffFences()` finds both shapes. The Shiki hosts use `../shiki/diff.js`; this
 * module covers hosts on highlight.js, Prism, or no highlighter, where the
 * per-line token model Shiki provides is not available.
 *
 * The caller supplies a per-line highlighter. The marker is stripped before it
 * runs (so `- old()` tokenizes as `old()`), then restored as a `diff-marker`
 * span, and added/removed lines get `diff add` / `diff remove` classes - the
 * same shape the Shiki transformer produces. Pair with
 * `@markup-carve/carve-grammars/diff/carve-diff.css`.
 *
 * No Node imports: safe to bundle into a browser client or a webview.
 */

const MARKER = /^[+\- ]/;

/** Matches the `<code>` of a diff fence, uncaptioned or captioned. */
export const DIFF_FENCE_SELECTOR = 'pre.diff > code, figure.diff > pre > code';

const hasDiffClass = (attrs) => Array.isArray(attrs?.classes) && attrs.classes.includes('diff');

/**
 * Whether a rendered `<pre>` belongs to a diff fence: `pre.diff`, or a `<pre>`
 * whose parent is a captioned `figure.diff`.
 *
 * @param {Element | null | undefined} pre
 * @returns {boolean}
 */
export function isDiffFence(pre) {
  if (!pre || pre.tagName !== 'PRE') return false;
  if (pre.classList.contains('diff')) return true;
  const parent = pre.parentElement;
  return !!parent && parent.tagName === 'FIGURE' && parent.classList.contains('diff');
}

/**
 * The `<code>` elements of every diff fence under `root`, in document order.
 *
 * @param {ParentNode} root A document, element, or fragment.
 * @returns {Element[]}
 */
export function findDiffFences(root) {
  return Array.from(root.querySelectorAll(DIFF_FENCE_SELECTOR));
}

/**
 * Whether a Carve AST node is a diff fence: a `code_block` with the `diff`
 * class, or a captioned one whose `figure` parent carries it.
 *
 * @param {{ type?: string, attrs?: { classes?: string[] } } | null | undefined} node
 * @param {{ type?: string, target?: unknown, attrs?: { classes?: string[] } } | null} [parent]
 * @returns {boolean}
 */
export function isDiffCodeBlock(node, parent = null) {
  if (!node || node.type !== 'code_block') return false;
  if (hasDiffClass(node.attrs)) return true;
  return !!parent && parent.type === 'figure' && parent.target === node && hasDiffClass(parent.attrs);
}

const escapeHtml = (value) =>
  value.replace(/[&<>]/g, (character) => (character === '&' ? '&amp;' : character === '<' ? '&lt;' : '&gt;'));

/**
 * Render diff code to an HTML string of per-line spans.
 *
 * @param {string} code The code text, with each line's leading marker intact.
 * @param {(body: string) => string} [highlightLine] Turns a marker-stripped line
 *   into HTML. Defaults to HTML-escaping (no language highlighting).
 * @returns {string} The `<span class="line …">…</span>` lines, newline-joined.
 */
export function renderLanguageDiff(code, highlightLine = escapeHtml) {
  return code
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => {
      const marker = MARKER.test(line) ? line[0] : '';
      const body = marker ? line.slice(1) : line;
      const lineClass = marker === '+' ? 'line diff add' : marker === '-' ? 'line diff remove' : 'line';
      const markerSpan = marker ? `<span class="diff-marker">${escapeHtml(marker)}</span>` : '';
      return `<span class="${lineClass}">${markerSpan}${highlightLine(body)}</span>`;
    })
    .join('\n');
}

/**
 * Apply the diff presentation to the `<code>` of a diff fence in the
 * DOM: replace the code's content with per-line diff spans and mark the `<pre>`.
 *
 * @param {Element} codeElement The `<code>` of a diff fence (see `findDiffFences`).
 * @param {(body: string) => string} [highlightLine] See {@link renderLanguageDiff}.
 */
export function applyLanguageDiff(codeElement, highlightLine) {
  const pre = codeElement.parentElement;
  codeElement.innerHTML = renderLanguageDiff(codeElement.textContent || '', highlightLine);
  if (pre) pre.classList.add('has-diff');
}
