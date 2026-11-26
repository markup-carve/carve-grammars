/**
 * The word character class of C2-I-127 (Unicode letters and numbers, general
 * category L or N, of the pinned Unicode version), written for a JavaScript
 * regex without the `u` flag, which highlight.js compiles its grammar with.
 * Code points above U+FFFF are matched as surrogate pairs.
 *
 * `node scripts/word-character-class.mjs --write` rewrites the constant in
 * highlightjs/carve.js from spec/spec/0.2/data/unicode-categories.json;
 * tests/word-character-test.js fails when the two drift apart.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
export const GRAMMAR = `${root}highlightjs/carve.js`;
const CATEGORIES = `${root}spec/spec/0.2/data/unicode-categories.json`;
export const CONSTANT = /(\n {4}const WORD_CHARACTER = ')[^']*(';)/;

export function wordCodePoints() {
    const set = new Set();
    for (const category of JSON.parse(readFileSync(CATEGORIES, 'utf8')).categories) {
        if (category.name !== 'L' && category.name !== 'N') continue;
        for (const range of category.ranges) {
            const [from, to = from] = range.split('-').map((hex) => parseInt(hex, 16));
            for (let cp = from; cp <= to; cp++) set.add(cp);
        }
    }
    return set;
}

const runs = (values) => {
    const out = [];
    for (const value of [...values].sort((a, b) => a - b)) {
        if (out.length && out.at(-1)[1] === value - 1) out.at(-1)[1] = value;
        else out.push([value, value]);
    }
    return out;
};
const unit = (cp) => /[0-9A-Za-z]/.test(String.fromCharCode(cp)) ? String.fromCharCode(cp) : `\\u${cp.toString(16).toUpperCase().padStart(4, '0')}`;
const charClass = (list) => `[${list.map(([a, b]) => (a === b ? unit(a) : `${unit(a)}${b === a + 1 ? '' : '-'}${unit(b)}`)).join('')}]`;

/** The regex source, one group: a BMP class, then one branch per set of high surrogates sharing their low ones. */
export function wordCharacterSource() {
    const points = wordCodePoints();
    const lowsByHigh = new Map();
    for (const cp of points) {
        if (cp < 0x10000) continue;
        const high = 0xd800 + ((cp - 0x10000) >> 10);
        if (!lowsByHigh.has(high)) lowsByHigh.set(high, new Set());
        lowsByHigh.get(high).add(0xdc00 + ((cp - 0x10000) & 0x3ff));
    }
    const highsByLows = new Map();
    for (const high of [...lowsByHigh.keys()].sort((a, b) => a - b)) {
        const key = charClass(runs(lowsByHigh.get(high)));
        if (!highsByLows.has(key)) highsByLows.set(key, []);
        highsByLows.get(key).push(high);
    }
    const branches = [charClass(runs([...points].filter((cp) => cp < 0x10000)))];
    for (const [lows, highs] of highsByLows) branches.push(charClass(runs(highs)) + lows);
    return `(?:${branches.join('|')})`;
}

if (process.argv.includes('--write')) {
    const source = readFileSync(GRAMMAR, 'utf8');
    if (!CONSTANT.test(source)) throw new Error('WORD_CHARACTER constant not found');
    const escaped = wordCharacterSource().replaceAll('\\', '\\\\');
    writeFileSync(GRAMMAR, source.replace(CONSTANT, (_, head, tail) => head + escaped + tail));
}
