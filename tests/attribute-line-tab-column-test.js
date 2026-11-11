/**
 * An attribute line's continuation passes the opening `{` by tab-expanded
 * column (tab stops of 4), whatever mix of tabs and spaces either line holds
 * (carve-grammars#846). Every opener and continuation indent of up to three
 * tabs and spaces is checked against the engine.
 */
import { carveToHtml } from '@markup-carve/carve';
import { prismTokens, hljsTokens } from './lib/engines.js';

const GRAMMARS = [
    { name: 'prism', scoped: (s) => prismTokens(s).filter((t) => String(t.scope ?? t.type ?? '').includes('attributes')) },
    { name: 'highlight.js', scoped: (s) => hljsTokens(s).filter((t) => t.ancestors.join(' ').includes('attr')) },
];

const indents = [''];
for (let n = 1; n <= 3; n++) {
    for (let bits = 0; bits < 2 ** n; bits++) {
        indents.push(Array.from({ length: n }, (_, i) => ((bits >> i) & 1 ? '\t' : ' ')).join(''));
    }
}

const ROWS = [
    // The two shapes of the ticket.
    ['\t{.a\n \t .b}\np\n', '.b'],
    ['\t  {.a\n     .b}\np\n', '.b'],
    ['{.a\n\t.b\n \t.c}\np\n', '.c'],
    ['\t{.a\n\t .b\n\t.c}\np\n', '.c'],
];
// Past the columns highlight.js counts in its regex.
for (const opener of ['\t\t\t   ', '\t\t\t\t', '    \t\t\t ', '\t\t\t\t\t \t']) {
    for (const continuation of ['\t\t\t\t', '\t\t\t\t ', '\t\t\t\t\t', '                 ', '\t\t\t\t\t\t']) {
        ROWS.push([`${opener}{.a\n${continuation}.b}\np\n`, '.b']);
    }
}
for (const opener of indents) {
    for (const continuation of indents.slice(1)) {
        ROWS.push([`${opener}{.a\n${continuation}.b}\np\n`, '.b']);
        ROWS.push([`${opener}{.a\n${continuation}}\np\n`, '}']);
        ROWS.push([`${opener}{\n${continuation}.a}\np\n`, '.a']);
        ROWS.push([`${opener}{.a\r\n${continuation}.b}\r\np\r\n`, '.b']);
    }
}

let failures = 0;
for (const [source, payload] of ROWS) {
    const attribute = carveToHtml(source).includes('class=');
    for (const g of GRAMMARS) {
        const scoped = g.scoped(source).map((t) => t.text).join('').includes(payload);
        if (scoped !== attribute && failures++ < 20) {
            console.log(`  ✗ ${g.name}: ${JSON.stringify(source)} ${attribute ? 'must' : 'must not'} scope ${payload} as attributes`);
        }
    }
}

if (failures) {
    console.log(`attribute line tab column: ${failures} failure(s)`);
    process.exit(1);
}
console.log(`attribute line tab column: ${ROWS.length} rows x ${GRAMMARS.length} grammars ok`);
