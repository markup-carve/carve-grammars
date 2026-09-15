/**
 * Present a Carve `{.diff}` language fence with any highlighter (or none).
 *
 * Carve core emits `{.diff}` on a language-tagged fence as
 * `<pre class="diff"><code class="language-x">…</code></pre>` with the leading
 * `+`, `-`, and context-space characters left as plain text - applying the
 * presentation is the host's job. The Shiki hosts use `../shiki/diff.js`; this
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
 * Apply the diff presentation to a rendered `<pre class="diff"><code>` in the
 * DOM: replace the code's content with per-line diff spans and mark the `<pre>`.
 *
 * @param {Element} codeElement The `<code>` inside a `<pre class="diff">`.
 * @param {(body: string) => string} [highlightLine] See {@link renderLanguageDiff}.
 */
export function applyLanguageDiff(codeElement, highlightLine) {
  const pre = codeElement.parentElement;
  codeElement.innerHTML = renderLanguageDiff(codeElement.textContent || '', highlightLine);
  if (pre) pre.classList.add('has-diff');
}
