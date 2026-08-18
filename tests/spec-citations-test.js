import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const specPin = execFileSync('git', ['rev-parse', 'HEAD:spec'], { cwd: root, encoding: 'utf8' }).trim();
const grammar = execFileSync('git', ['-C', 'spec', 'show', `${specPin}:resources/grammar.ebnf`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
});
const banners = [...grammar.matchAll(/^\s*PART\s+(\d+[A-Z]?):/gm)];
const sections = new Map();
for (let i = 0; i < banners.length; i++) {
    const part = banners[i][1];
    const body = grammar.slice(banners[i].index, banners[i + 1]?.index ?? grammar.length);
    sections.set(part, new Set([...body.matchAll(/^\s{2,4}(\d+[a-z]?)\.\s+[A-Z]/gm)].map(match => match[1])));
}

function filesUnder(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        if (['.git', 'node_modules', 'spec'].includes(entry.name)) return [];
        const file = path.join(dir, entry.name);
        return entry.isDirectory() ? filesUnder(file) : /\.(?:js|mjs|json|md)$/.test(entry.name) ? [file] : [];
    });
}

const repoFiles = filesUnder(root);
const dangling = [];
for (const file of repoFiles) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
        if (/withdrawn|withdrawal|retired/i.test(lines.slice(Math.max(0, index - 2), index + 3).join(' '))) return;
        let activePart;
        for (const match of line.matchAll(/PART\s+(\d+[A-Z]?)|§\s*(\d+[a-z]?)|\bsection\s+(\d+[a-z]?)/gi)) {
            if (match[1]) {
                activePart = match[1].toUpperCase();
                continue;
            }
            if (!activePart) continue;
            const section = match[2] ?? match[3];
            if (!sections.get(activePart)?.has(section)) {
                dangling.push(`${path.relative(root, file)}:${index + 1}: PART ${activePart} §${section}`);
            }
        }
    });
}

assert.deepEqual(dangling, [], `dangling spec citations:\n${dangling.join('\n')}`);
console.log(`spec citations: checked ${repoFiles.length} repository files`);
