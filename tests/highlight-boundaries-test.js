import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { prismTokens, hljsTokens } from './lib/engines.js';
import { textmateEngines } from './lib/surface-engines.js';

const directory = new URL('../spec/tests/corpus/', import.meta.url);
const family = 'a-braced-span-cannot-close-beyond-its-bracket-run';
const files = readdirSync(directory).filter(f => f.includes(family) && f.endsWith('.crv')).sort();
assert.equal(files.length, 13, 'Review new bracket-boundary fixtures.');
const surfaces = [['prism', prismTokens], ['highlightjs', hljsTokens], ...(await textmateEngines()).filter(([name]) => name === 'textmate')];
const measured = {};
for (const [name, tokenize] of surfaces) {
    const gaps = [];
    for (const file of files) {
        const source = readFileSync(new URL(file, directory), 'utf8');
        const html = readFileSync(new URL(file.replace(/\.crv$/, '.html'), directory), 'utf8');
        const expected = /<(?:strong|em|u|s|mark|ins|del|sup|sub)(?:>|\s)/.test(html);
        const actual = (await tokenize(source)).some(token => /[ab]/.test(token.text) &&
            /(?:bold|italic|underline|strike|highlight|inserted|deleted|superscript|subscript|strong|emphasis|addition|deletion|built_in)/.test(token.scope || ''));
        if (actual !== expected) gaps.push(file.replace(/^\d+-/, '').replace(/\.crv$/, ''));
    }
    measured[name] = gaps;
}
const path = new URL('highlight-boundary-gaps.json', import.meta.url);
if (process.env.UPDATE_BOUNDARY_GAPS === '1') writeFileSync(path, JSON.stringify(measured, null, 2) + '\n');
assert.deepEqual(measured, JSON.parse(readFileSync(path, 'utf8')), 'Bracket-boundary gaps changed; review new debt or retire fixed entries.');
console.log(`Highlight boundaries: ${files.length} fixtures on ${surfaces.length} surfaces; ${Object.values(measured).reduce((n, a) => n + a.length, 0)} recorded gaps.`);
