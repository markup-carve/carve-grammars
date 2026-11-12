/**
 * A block glued to `}` attaches only when that `}` closes forced emphasis or an
 * attached attribute block; a literal `}` and a refused wrapped run are text
 * (carve-grammars#847).
 */
import { carveToHtml } from '@markup-carve/carve';
import { prismTokens, hljsTokens } from './lib/engines.js';

const GRAMMARS = [
    { name: 'prism', leaves: prismTokens, attr: 'attributes' },
    { name: 'highlight.js', leaves: (s) => hljsTokens(s).map((t) => ({ scope: t.ancestors.join(' '), text: t.text })), attr: 'attr' },
];

const attrText = (g, source) => g.leaves(source)
    .filter((t) => String(t.scope ?? '').includes(g.attr))
    .map((t) => t.text)
    .join('');

// `payload` is the glued block; `attribute` says whether the engine attaches it.
const ROWS = [
    { source: '{.a\n}{.b}\np\n', payload: '.b', attribute: false },
    { source: '{.a\n}{.b}{.c}\np\n', payload: '.c', attribute: false },
    { source: '\t{.a\n\t}{.b}\np\n', payload: '.b', attribute: false },
    { source: 'a}{.b}\n', payload: '.b', attribute: false },
    { source: '}{.b}\n', payload: '.b', attribute: false },
    { source: 'x }{.b} y\n', payload: '.b', attribute: false },
    { source: 'a {.a}{.b}\n', payload: '.b', attribute: false },
    { source: 'p {.a\n}{.b}\n', payload: '.b', attribute: false },
    { source: '{.a\n }{.b}\np\n', payload: '.b', attribute: true },
    { source: '{.a}{.b}\np\n', payload: '.b', attribute: true },
    { source: '*a*{.c}{.b}\n', payload: '.b', attribute: true },
    { source: '[x]{#a}{.b}{.c}\n', payload: '.c', attribute: true },
    { source: '{_a_}{.b}\n', payload: '.b', attribute: true },
    { source: '{=a=}{.c}{.b}\n', payload: '.b', attribute: true },
    { source: '{^a^}{.b}\n', payload: '.b', attribute: true },
    { source: '{-a-}{.b}\n', payload: '.b', attribute: true },
    { source: '{~a~}{.b}\n', payload: '.b', attribute: true },
    { source: '{~a~>b~}{.k} c\n', payload: '.k', attribute: false },
    { source: '{#note#}{.k} c\n', payload: '.k', attribute: false },
    { source: '[a]{}{.b}\n', payload: '.b', attribute: true },
    { source: '[a]{.b}{}{#i}\n', payload: '#i', attribute: true },
    { source: '*x*{}{.b}\n', payload: '.b', attribute: false },
    { source: '[^1]{}{.k} c\n\n[^1]: n\n', payload: '.k', attribute: false },
    { source: '[a](u){}{.b}\n', payload: '.b', attribute: false },
    { source: '{~a~>b~} [a]{k=a~}{.c}\n', payload: '.c', attribute: true },
    { source: '*a*{k=a~}{.c}\n', payload: '.c', attribute: true },
    { source: '[a [b]]{}{.c}\n', payload: '.c', attribute: true },
    { source: '[a]{k="{{{{"}{.c}\n', payload: '.c', attribute: true },
    { source: '[x]{k="' + '{'.repeat(40) + '"}{.c}\n', payload: '.c', attribute: true },
    { source: '[a [b [c]]]{}{.c}\n', payload: '.c', attribute: true },
    { source: '[`]`]{}{.c}\n', payload: '.c', attribute: true },
    { source: '[[w]]{}{.c}\n', payload: '.c', attribute: true },
    { source: '[a][r]{}{.c}\n\n[r]: u\n', payload: '.c', attribute: false },
    { source: 'x] y]{}{.c}\n', payload: '.c', attribute: false },
];

let failures = 0;
for (const row of ROWS) {
    const html = carveToHtml(row.source);
    if (new RegExp(`(?:class|id)="(?:[^"]* )?${row.payload.slice(1)}[ "]`).test(html) !== row.attribute) {
        failures++;
        console.log(`  ✗ engine: ${JSON.stringify(row.source)} renders ${JSON.stringify(html)}`);
        continue;
    }
    for (const g of GRAMMARS) {
        const scoped = attrText(g, row.source).includes(row.payload);
        if (scoped !== row.attribute) {
            failures++;
            console.log(`  ✗ ${g.name}: ${JSON.stringify(row.source)} ${row.attribute ? 'must' : 'must not'} scope ${row.payload} as attributes`);
        }
    }
}

if (failures) {
    console.log(`glued attribute host: ${failures} failure(s)`);
    process.exit(1);
}
console.log(`glued attribute host: ${ROWS.length} rows x ${GRAMMARS.length} grammars ok`);
