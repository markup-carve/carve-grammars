/**
 * HTML -> Carve round-trip tests.
 *
 * The serializer tests build ProseMirror JSON directly; this harness instead
 * mounts a real Tiptap editor (via happy-dom), seeds it with the HTML that
 * carve-js / carve-php actually render, and serializes back to Carve. That is
 * the path a WYSIWYG uses, and the only way to catch parseHTML gaps.
 */
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const k of ['DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator', 'getComputedStyle', 'MutationObserver']) {
    if (globalThis[k] === undefined && win[k] !== undefined) {
        try { globalThis[k] = win[k]; } catch { /* read-only global (e.g. navigator) - ignore */ }
    }
}

const { Editor } = await import('@tiptap/core');
const { CarveKit, serializeToCarve } = await import('../tiptap/index.js');

let pass = 0;
let fail = 0;

function check(name, html, expected) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const editor = new Editor({ element: el, extensions: [CarveKit], content: html });
    const got = serializeToCarve(editor.getJSON()).trim();
    editor.destroy();
    el.remove();
    if (got === expected) {
        pass++;
        console.log(`  ✓ ${name}`);
    } else {
        fail++;
        console.log(`  ✗ ${name}`);
        console.log(`    expected: ${JSON.stringify(expected)}`);
        console.log(`    got:      ${JSON.stringify(got)}`);
    }
}

// --- Constructs, as carve-js / carve-php actually render them ---

check('admonition (aside) round-trips',
    '<aside class="admonition note"><p>Body.</p></aside>',
    '::: note\nBody.\n:::');

check('inline image stays in its paragraph',
    '<p>text <img src="i.png" alt="a"> end.</p>',
    'text ![a](i.png) end.');

check('inline math span round-trips',
    '<p>a <span class="math inline">\\(x^2\\)</span> b</p>',
    'a $`x^2` b');

check('citation [@key] round-trips (mention)',
    '<p>See [<span class="mention"><strong>@smith2020</strong></span>].</p>',
    'See [@smith2020].');

check('tag #topic round-trips',
    '<p>a <span class="tag"><strong>#topic</strong></span> b</p>',
    'a #topic b');

check('flanked superscript is bare, not braced',
    '<p>a <sup>x</sup> b</p>',
    'a ^x^ b');

check('tight list with a sub-list stays tight',
    '<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>',
    '- a\n- b\n  - c');

check('task list (carve-php plain ul + checkboxes) round-trips',
    '<ul><li><input type="checkbox" disabled> t1</li>'
    + '<li><input type="checkbox" checked disabled> t2</li></ul>',
    '- [ ] t1\n- [x] t2');

check('footnote ref + section round-trips',
    'Text.<a id="fnref1" href="#fn1" role="doc-noteref"><sup>1</sup></a>'
    + '<section role="doc-endnotes"><hr><ol><li id="fn1"><p>Note body.'
    + '<a href="#fnref1" role="doc-backlink">↩</a></p></li></ol></section>',
    'Text.[^1]\n\n[^1]: Note body.');

check('two footnotes round-trip',
    'A<a id="fnref1" href="#fn1" role="doc-noteref"><sup>1</sup></a> '
    + 'B<a id="fnref2" href="#fn2" role="doc-noteref"><sup>2</sup></a>'
    + '<section role="doc-endnotes"><hr><ol>'
    + '<li id="fn1"><p>first<a href="#fnref1" role="doc-backlink">↩</a></p></li>'
    + '<li id="fn2"><p>second<a href="#fnref2" role="doc-backlink">↩</a></p></li>'
    + '</ol></section>',
    'A[^1] B[^2]\n\n[^1]: first\n\n[^2]: second');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
    process.exit(1);
}
