/**
 * An attribute line wraps only onto a line indented past its `{`.
 *
 *   continuation = newline, opt_ws ;  (* indent past the opening `{`; NOT a blank line *)
 *
 * Prism and highlight.js separated a block's items with `\s`, so `{.a` + newline
 * + `.b}` and a run broken by a blank line scoped as attributes where the engine
 * renders a paragraph (carve-grammars#843). TextMate decides a begin rule on its
 * first line, so it may still scope that line; the continuation it must not.
 */
import { carveToHtml } from '@markup-carve/carve';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { textmateTokenizer } from './lib/textmate-engine.js';

const textmate = await textmateTokenizer(new URL('../textmate/carve.tmLanguage.json', import.meta.url).pathname);

const GRAMMARS = [
    { name: 'textmate', leaves: textmate, attr: 'meta.attributes' },
    { name: 'prism', leaves: prismTokens, attr: 'attributes' },
    { name: 'highlight.js', leaves: (s) => hljsTokens(s).map((t) => ({ scope: t.ancestors.join(' '), text: t.text })), attr: 'attr' },
];

const attrText = (g, source) => g.leaves(source)
    .filter((t) => String(t.scope ?? t.type ?? '').includes(g.attr))
    .map((t) => t.text)
    .join('');

// `payload` sits on the continuation line; `attribute` says whether the engine reads one.
const ROWS = [
    { source: '{.a\n .b}\n\nparagraph\n', payload: '.b', attribute: true },
    // TextMate opens the multi-line rule only on an item, so a lone `{` line is not one there.
    { source: '{\n .a}\np\n', payload: '.a', attribute: true, skip: 'textmate' },
    { source: '{.a\n }\np\n', payload: '}', attribute: true },
    { source: '{.a\n.b}\n\nparagraph\n', payload: '.b', attribute: false },
    { source: '{.a \n.b}\n\nparagraph\n', payload: '.b', attribute: false },
    { source: '{.a\n}\np\n', payload: '}', attribute: false },
    { source: '{\n.a}{.b\n}\n\np\n', payload: '.a', attribute: false },
    { source: '{.a\n\n .b}\np\n', payload: '.b', attribute: false },
];

let failures = 0;
for (const row of ROWS) {
    const html = carveToHtml(row.source);
    if (html.includes('class=') !== row.attribute) {
        failures++;
        console.log(`  ✗ engine: ${JSON.stringify(row.source)} renders ${JSON.stringify(html)}`);
        continue;
    }
    for (const g of GRAMMARS.filter((g) => g.name !== row.skip)) {
        const scoped = attrText(g, row.source).includes(row.payload);
        if (scoped !== row.attribute) {
            failures++;
            console.log(`  ✗ ${g.name}: ${JSON.stringify(row.source)} ${row.attribute ? 'must' : 'must not'} scope ${row.payload} as attributes`);
        }
    }
}

if (failures) {
    console.log(`attribute line continuation: ${failures} failure(s)`);
    process.exit(1);
}
console.log(`attribute line continuation: ${ROWS.length} rows x ${GRAMMARS.length} grammars ok`);
