// carve-grammars#881: a fence in a list item inside a quote ends where the item
// ends, in TextMate as carve-js reads it. Markers, depths and what follows the fence vary.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { carveToHtml } from '@markup-carve/carve';
import { textmateLineTokenizer } from './lib/textmate-lines.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const textmate = await textmateLineTokenizer(new URL('../textmate/carve.tmLanguage.json', import.meta.url).pathname);
const VERBATIM = /code|comment|markup\.raw\.(?!inline)/;

function textmateVerbatim(src) {
    const words = new Map();
    for (const t of textmate(src)) {
        for (const w of t.text.match(/w\d+/g) ?? []) words.set(w, VERBATIM.test(t.scope));
    }
    return words;
}

function engineVerbatim(html, w) {
    const word = new RegExp(`\\b${w}\\b`);
    return !word.test(html) || [...html.matchAll(/<pre[\s\S]*?<\/pre>/g)].some((m) => word.test(m[0]));
}

const check = spawnSync(process.execPath, [new URL('../scripts/generate-quoted-item-rules.mjs', import.meta.url).pathname, '--check'], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr);
console.log('  ✓ the generated TextMate rules are current');

// [marker, content width after the marker's quote space]
const MARKERS = [['-', 2], ['*', 2], ['- [ ]', 2], ['1.', 3], ['1)', 3], ['10.', 4], ['a)', 3], ['iv.', 4], ['123456.', 8]];
const after = (q, p, f) => ({
    'at the item column': `${p}w1\n`,
    'left of the item column': `${q} w1\n`,
    'a lazy line': 'w1\n',
    'past a blank quote line': `${q}\n${q} w1\n`,
    'a deeper quote': `${q} > w1\n`,
    'closed': `${p}${f}\n${q} w1\n`,
    'closed left of the item': `${q} ${f}\n${q} w1\n`,
    'a sibling item': `${q} MARK w1\n`,
    'a lazy marker line': '- w1\n',
    'a nested item': `${p}- w1\n`,
});

let cases = 0;
for (const q of ['>', '> >']) {
    for (const [marker, width] of MARKERS) {
        const p = `${q} ${' '.repeat(width)}`;
        for (const f of ['```', '~~~', '%%%']) {
            for (const indent of ['', '  ', '    ']) {
                for (const gap of [`\n${q}\n`, '\n']) {
                    for (const [label, tail] of Object.entries(after(q, p, f))) {
                        const src = `${q} ${marker} x${gap}${p}${indent}${f}\n${p}w0\n${tail.replace('MARK', marker)}`;
                        const got = textmateVerbatim(src);
                        const html = carveToHtml(src);
                        for (const w of ['w0', 'w1']) {
                            const verbatim = engineVerbatim(html, w);
                            assert.equal(got.get(w), verbatim, `${label}: ${w} must ${verbatim ? '' : 'not '}be verbatim in ${JSON.stringify(src)}`);
                        }
                        cases++;
                    }
                }
            }
        }
    }
}
console.log(`  ✓ ${cases} shapes agree with carve-js`);

const repro = '> - x\n>\n>   ```\n>   w0\n> w1\n';
const tokens = textmate(repro);
assert.ok(tokens.some((t) => t.text.includes('w0') && /markup\.raw\.code/.test(t.scope)));
assert.ok(tokens.some((t) => t.text.includes('w1') && /markup\.quote/.test(t.scope) && !VERBATIM.test(t.scope)));
console.log(`  ✓ #881: ${JSON.stringify(repro)}`);

console.log('\n3 passed');
