/**
 * The ProseMirror bridge and the editor DOM blank what carve-js's HTML renderer
 * blanks (PART 9 §25, markup-carve/carve#6009).
 *
 * Three checks. The mirrored scheme list and strip class equal the renderer's
 * own. Every destination the bridge writes (link, autolink, image, block image,
 * reference definition) equals the one the HTML carries, over a generated sweep
 * of schemes, case, control and space characters, entity spellings and
 * containers. An authored pair the renderer drops or blanks never reaches the
 * editor DOM as a real attribute.
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';
import { Editor } from '@tiptap/core';
import { carveToHtml } from '@markup-carve/carve';
import { CarveKit, carveToProseMirror } from '../tiptap/index.js';
import { carveToProseMirrorWithReport } from '../tiptap/carve-to-pm.js';
import { DENIED_URL_SCHEMES, SCHEME_PROBE_STRIP_RE, isDeniedDestination, refusedAttribute } from '../tiptap/url-policy.js';

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
for (const key of ['DOMParser', 'Node', 'Element', 'HTMLElement', 'navigator', 'getComputedStyle', 'MutationObserver']) {
    if (globalThis[key] === undefined && win[key] !== undefined) {
        try { globalThis[key] = win[key]; } catch { /* read-only global */ }
    }
}

// The renderer's definitions are not on the package's public entry, so they are
// read from the installed build next to it.
const engineDist = dirname(fileURLToPath(import.meta.resolve('@markup-carve/carve')));
const engine = await import(pathToFileURL(join(engineDist, 'render-html.js')).href);

assert.deepEqual([...DENIED_URL_SCHEMES], [...engine.DANGEROUS_URL_SCHEMES],
    'the denied scheme list differs from carve-js DANGEROUS_URL_SCHEMES');
assert.equal(SCHEME_PROBE_STRIP_RE.source, engine.SCHEME_PROBE_STRIP_RE.source,
    'the probe strip class differs from carve-js SCHEME_PROBE_STRIP_RE');
assert.equal(SCHEME_PROBE_STRIP_RE.flags, engine.SCHEME_PROBE_STRIP_RE.flags);

// The ticket's reproduction, with the report entry.
{
    const { doc, degraded } = carveToProseMirrorWithReport('Siehe [x](javascript:alert(1)) und ![b](data:image/png;base64,AA).\n');
    const para = doc.content[0].content;
    assert.deepEqual(para[1].marks[0].attrs, { href: '' });
    assert.deepEqual(para[3].attrs, { alt: 'b', src: '' });
    assert.ok('destination-denied' in degraded, 'a blanked destination is reported');
    const clean = carveToProseMirrorWithReport('[x](https://e.com) ![b](/a.png)\n');
    assert.ok(!('destination-denied' in clean.degraded), 'nothing is reported when nothing is blanked');
}

const decode = (value) => value
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

function htmlDestinations(html) {
    const out = [];
    for (const match of html.matchAll(/<(a|img)\b[^>]*?\s(href|src)="([^"]*)"/g)) out.push(decode(match[3]));
    return out;
}

function pmDestinations(node, labels, out = [], seen = new Set()) {
    if (Array.isArray(node)) {
        for (const child of node) pmDestinations(child, labels, out, seen);
        return out;
    }
    if (!node || typeof node !== 'object') return out;
    if (node.type === 'image' && !(node.attrs.carveRef && node.attrs.src === '' && !labels.has(node.attrs.carveRef))) {
        out.push(node.attrs.src);
    }
    for (const mark of node.marks || []) {
        // One link spans several text nodes when its text has marks inside.
        // An unresolved reference is text in HTML and an empty link here.
        const unresolved = mark.attrs?.carveRef && !mark.attrs.carveReferenceDefinition && mark.attrs.href === ''
            && !labels.has(mark.attrs.carveRef);
        if (mark.type === 'link' && !unresolved && !seen.has(mark)) {
            seen.add(mark);
            out.push(mark.attrs.href);
        }
    }
    pmDestinations(node.content || [], labels, out, seen);
    return out;
}

function refLabels(node, out = []) {
    if (Array.isArray(node)) {
        for (const child of node) refLabels(child, out);
    } else if (node && typeof node === 'object') {
        if (node.type === 'carveLinkRefDef') out.push(node.attrs.label);
        refLabels(node.content || [], out);
    }
    return out;
}

function refDefs(node, out = []) {
    if (Array.isArray(node)) {
        for (const child of node) refDefs(child, out);
    } else if (node && typeof node === 'object') {
        if (node.type === 'carveLinkRefDef') out.push(node.attrs.href);
        refDefs(node.content || [], out);
    }
    return out;
}

const schemes = [...DENIED_URL_SCHEMES, 'http', 'https', 'mailto', 'tel', 'ftp', 'sms', 'xjavascript', 'javascripts', 'data-x'];
const casings = [(s) => s, (s) => s.toUpperCase(), (s) => s.replace(/./g, (c, i) => (i % 2 ? c.toUpperCase() : c))];
const prefixes = ['', '&#9;', '&#1;', '&#160;', '&#x202F;', '&#127;', '&#x85;'];
const payloads = ['alert(1)', '//host/x', 'image/png;base64,AA', 'text/html;base64,PGI+'];

const destinations = new Set();
for (const scheme of schemes) {
    for (const [ci, casing] of casings.entries()) {
        const spelled = casing(scheme);
        destinations.add(`${spelled}:${payloads[ci % payloads.length]}`);
        destinations.add(`${prefixes[(ci + scheme.length) % prefixes.length]}${spelled}:x`);
    }
    // A control or space character inside the scheme, and an entity colon.
    destinations.add(`${scheme.slice(0, 2)}&#9;${scheme.slice(2)}:x`);
    destinations.add(`${scheme}&#58;x`);
    destinations.add(`&#x${scheme.charCodeAt(0).toString(16)};${scheme.slice(1)}:x`);
}
for (const plain of ['/rel', '#frag', '?q', '//host', 'a:b', 'java script:x', '']) destinations.add(plain);

const sinks = [
    (d) => `[t](${d})\n`,
    (d) => `[t](<${d}>)\n`,
    (d) => `x ![t](${d}) y\n`,
    (d) => `![t](${d})\n`,
    (d) => `<${d}>\n`,
    (d) => `[t][r]\n\n[r]: ${d}\n`,
    (d) => `![t][r]\n\n[r]: ${d}\n`,
    (d) => `> - [t _e_](${d})\n`,
    (d) => `| [t](${d}) | ![i](${d}) |\n`,
];

let variants = 0;
let blanked = 0;
for (const d of destinations) {
    for (const sink of sinks) {
        const source = sink(d);
        const html = carveToHtml(source);
        const doc = carveToProseMirror(source, { unsupported: 'preserve' });
        const expected = htmlDestinations(html);
        const labels = new Set(refLabels(doc.content));
        const actual = pmDestinations(doc.content, labels);
        assert.deepEqual(actual, expected, `bridge and HTML disagree for ${JSON.stringify(source)}\nHTML: ${html}`);
        // A definition the bridge carries holds the destination its links hold.
        for (const href of refDefs(doc.content)) {
            assert.ok(expected.includes(href) || expected.length === 0,
                `definition destination ${JSON.stringify(href)} for ${JSON.stringify(source)}`);
        }
        variants++;
        if (expected.includes('')) blanked++;
    }
}
assert.ok(variants >= 1000, `only ${variants} variants`);
assert.ok(blanked >= 500, `only ${blanked} of ${variants} variants blanked`);

// An unreferenced definition is not rendered, so it follows the predicate.
for (const d of ['javascript:x', 'JaVaScRiPt:x', 'data:image/png,AA', '/ok', 'https://e.com']) {
    const doc = carveToProseMirror(`[r]: ${d}\n`);
    assert.deepEqual(refDefs(doc.content), [isDeniedDestination(d) ? '' : d], d);
}

// Authored pairs: the editor DOM carries a pair only when the HTML renderer
// emits it with its value.
const editor = new Editor({ extensions: [CarveKit], content: '<p>x</p>' });
const names = ['onclick', 'OnError', 'srcdoc', 'formaction', 'ping', 'srcset', 'data-u', 'background', 'style', 'title', 'lang'];
const values = ['javascript:x', 'JAVA&#9;SCRIPT:x', 'https://e.com', 'a b', 'ok javascript:y', '/a.png 1x, data:x 2x',
    'color:red', 'background:url(x)', 'x:y'];
const hosts = [(kv) => `[t](/a){${kv}}\n`, (kv) => `![t](/a.png){${kv}}\n`, (kv) => `{${kv}}\n# H\n`];
let pairs = 0;
for (const name of names) {
    for (const value of values) {
        for (const host of hosts) {
            const source = host(`${name}="${value}"`);
            const html = carveToHtml(source);
            const ast = carveToProseMirror(source, { unsupported: 'preserve' });
            editor.commands.setContent(ast);
            const dom = editor.getHTML();
            const lower = name.toLowerCase();
            const parsed = new win.DOMParser().parseFromString(`<body>${dom}</body>`, 'text/html');
            const carried = [...parsed.body.querySelectorAll('*')]
                .some((el) => el.hasAttribute(lower) && el.getAttribute(lower) !== '' && el.getAttribute(lower) !== '/a' && el.getAttribute(lower) !== '/a.png');
            const htmlDoc = new win.DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
            const rendered = [...htmlDoc.body.querySelectorAll('*')]
                .some((el) => el.hasAttribute(lower) && el.getAttribute(lower) !== '' && el.getAttribute(lower) !== '/a' && el.getAttribute(lower) !== '/a.png');
            if (!rendered) {
                assert.ok(!carried, `editor DOM carries a pair the renderer refuses: ${JSON.stringify(source)}\n${dom}`);
            }
            pairs++;
        }
    }
}
assert.ok(pairs > 250);
assert.ok(refusedAttribute('onClick', 'x') && refusedAttribute('ping', 'a javascript:x') && !refusedAttribute('title', 'a javascript:x'));
editor.destroy();

console.log(`url-policy: ${variants} destination variants (${blanked} blanked) and ${pairs} attribute pairs agree with carve-js's HTML renderer`);
