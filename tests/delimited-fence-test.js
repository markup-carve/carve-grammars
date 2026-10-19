/**
 * A `csv` or `tsv` fence body (the body of a `{table}` delimited table) is
 * highlighted by the dialect of PART 9 §5: the separator, a quoted field that
 * opens only at a field start and may span lines, `""` inside it, and the
 * header row. Golden dumps per path live in tests/delimited-fence.golden.json;
 * UPDATE_SNAPSHOTS=1 rewrites them, and a missing golden fails.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import carve from '../highlightjs/carve.mjs';
import { csv, tsv } from '../highlightjs/delimited.mjs';
import { carveCsvGrammar, carveGrammar, carveTsvGrammar } from '../shiki/index.js';
import { carveLightTheme } from '../shiki/themes.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';
import { createHighlighter } from './lib/shiki.js';

const require = createRequire(import.meta.url);
const GOLDEN = new URL('./delimited-fence.golden.json', import.meta.url);
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';

const SAMPLES = {
    'maintainer-sample': '{table}\n```csv\nPlan,Seats,Price per month\nStarter,1,"$0"\nTeam,10,"$49, billed yearly"\n```\n',
    'quoted-comma-newline-escape': '```csv\n"Name, full",Note\n"Ann ""A""",x\n"multi\nline",ok\n```\n',
    'malformed': '```csv\nh\na"b,"c"d\n```\n',
    'tsv-in-a-list-item': '- item\n\n  ```tsv\n  K\tV\n  "a\tb"\tc\n  ```\n',
    'multi-line-header': '```csv\n"a\nb",c\nx,y\n```\n',
    'crlf': '```csv\r\nPlan,Seats\r\n"x, y",1\r\n```\r\n',
};

const highlighter = await createHighlighter({
    themes: [carveLightTheme],
    langs: [carveGrammar, carveCsvGrammar, carveTsvGrammar],
});
// Scopes below the fence body only; the Carve scopes above it belong to other tests.
const textmate = (source, lang = 'carve') => highlighter
    .codeToTokens(source, { lang, theme: carveLightTheme.name, includeExplanation: true }).tokens
    .flatMap((row, line) => row.flatMap((token) => token.explanation.map((part) => {
        const scopes = part.scopes.map((scope) => scope.scopeName);
        const body = scopes.findIndex((scope) => /^meta\.embedded\.block\.[ct]sv$|^text\.[ct]sv\.carve$/.test(scope));
        return `${line + 1} ${JSON.stringify(part.content)} ${body < 0 ? '-' : scopes.slice(body).join(' ')}`;
    })));

const hljs = require('highlight.js').newInstance();
hljs.registerLanguage('carve', carve);
hljs.registerLanguage('csv', csv);
hljs.registerLanguage('tsv', tsv);

const Prism = require('prismjs');
globalThis.Prism = Prism;
await import('../prism/carve.js');
delete globalThis.Prism;

const live = {};
for (const [name, source] of Object.entries(SAMPLES)) {
    live[name] = {
        textmate: textmate(source),
        hljs: hljs.highlight(source, { language: 'carve' }).value.split('\n'),
        prism: Prism.highlight(source, Prism.languages.carve, 'carve').split('\n'),
    };
}
live['standalone-grammars'] = {
    csv: textmate('Plan,Seats\n"a""b",1\n', 'carve-csv'),
    tsv: textmate('Plan\tSeats\n"a\tb"\t1\n', 'carve-tsv'),
};
highlighter.dispose();

let count = 0;
if (UPDATE) {
    writeFileSync(GOLDEN, JSON.stringify(live, null, 2) + '\n');
    console.log('delimited fence goldens written');
} else {
    assert.ok(existsSync(GOLDEN), 'tests/delimited-fence.golden.json is missing; run with UPDATE_SNAPSHOTS=1');
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    assert.deepEqual(Object.keys(live), Object.keys(golden));
    for (const name of Object.keys(live)) {
        for (const path of Object.keys(live[name])) {
            assert.deepEqual(live[name][path], golden[name][path], `${name} / ${path}`);
            count++;
        }
    }
}

// The facts the goldens hold, stated so a wrong regeneration cannot pass silently.
const has = (lines, re) => assert.ok(lines.some((line) => re.test(line)), re.source);
const lacks = (lines, re) => assert.ok(!lines.some((line) => re.test(line)), re.source);
const fieldScope = /(?:string\.unquoted|string\.quoted\.double|punctuation\.separator\.delimiter|constant\.character\.escape)\.(?:csv|tsv)/;
for (const [name, paths] of Object.entries(live)) {
    for (const line of [...(paths.textmate || []), ...(paths.csv || []), ...(paths.tsv || [])]) {
        const match = line.match(/^\d+ ("(?:\\.|[^"])*") (.*)$/);
        if (match && /^(?:meta\.embedded\.block\.[ct]sv|text\.[ct]sv\.carve)/.test(match[2])
            && !/^\s*$/.test(JSON.parse(match[1]))) {
            assert.match(match[2], fieldScope, `${name}: ${line}`);
            count++;
        }
    }
    for (const path of ['prism', 'hljs']) {
        if (!paths[path]) continue;
        const stack = [];
        const html = paths[path].join('\n');
        for (const part of html.matchAll(/<span class="([^"]+)">|<\/span>|[^<]+/g)) {
            if (part[1]) stack.push(part[1]);
            else if (part[0] === '</span>') stack.pop();
            else if (stack.some((scope) => path === 'prism' ? /\b(?:csv|tsv)-body\b/.test(scope) : /\blanguage-(?:csv|tsv)\b/.test(scope))
                && /\S/.test(part[0].replace(/&(?:quot|amp|lt|gt|#\d+);/g, 'x'))) {
                assert.ok(stack.some((scope) => path === 'prism' ? /\btoken (?:field|string|separator|escape)\b/.test(scope) : /\bhljs-/.test(scope)), `${name} / ${path}: ${part[0]}`);
                count++;
            }
        }
    }
}
const tm = live['maintainer-sample'].textmate;
has(tm, /^3 "Plan" meta\.embedded\.block\.csv string\.unquoted\.csv markup\.heading\.csv$/);
has(tm, /^3 "," .*punctuation\.separator\.delimiter\.csv$/);
has(tm, /^5 "\$49, billed yearly" .*string\.quoted\.double\.csv$/);
lacks(tm, /^4 .*markup\.heading/);
const edge = live['quoted-comma-newline-escape'].textmate;
has(edge, /^3 "\\"\\"" .*constant\.character\.escape\.csv$/);
has(edge, /^5 "line" .*string\.quoted\.double\.csv$/);
has(live.malformed.textmate, /^3 "a\\"b" .*string\.unquoted\.csv$/);
has(live.malformed.textmate, /^3 "d" .*string\.unquoted\.csv$/);
has(live.malformed.prism, /<span class="token field string">a"b<\/span>.*<span class="token string">"c"<\/span><span class="token field string">d<\/span>/);
has(live.malformed.hljs, /<span class="hljs-string">a&quot;b<\/span>.*<span class="hljs-string">&quot;c&quot;<\/span><span class="hljs-string">d<\/span>/);
has(live['multi-line-header'].textmate, /^3 "c" .*markup\.heading\.csv$/);
lacks(live['multi-line-header'].textmate, /^4 .*markup\.heading/);
has(live['tsv-in-a-list-item'].textmate, /^5 "a\\tb" .*string\.quoted\.double\.tsv$/);
has(live['tsv-in-a-list-item'].textmate, /^5 "\\t" .*punctuation\.separator\.delimiter\.tsv$/);
lacks(live.crlf.textmate, /"[^"]*\\r[^"]*" .*(?:heading|separator|invalid|string)/);
has(live['quoted-comma-newline-escape'].prism, /^<span class="token string">"Ann <span class="token escape char">""<\/span>/);
has(live['tsv-in-a-list-item'].hljs, /^ {2}<span class="hljs-string">&quot;a\tb&quot;<\/span><span class="hljs-punctuation">\t<\/span><span class="hljs-string">c<\/span>$/);
count += 17;

assertThisFileRuns(import.meta.url);
console.log(`delimited fence: ${count} assertions passed`);
