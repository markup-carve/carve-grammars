/**
 * The OPTIONAL corpus, through the bridge.
 *
 * `spec/tests/corpus-optional/` holds the constructs an engine only produces
 * when an extension is enabled - citations, code callouts, details, spoilers,
 * tabs, list tables, semantic spans, locale smart quotes. Every conformance
 * test in this repo drove off the main corpus only, so no test here had ever
 * seen a citation group at all: the mapping for one could be declared, wrong,
 * or missing entirely, and nothing would fail.
 *
 * Three ratchets, all of them floors or ceilings on the MEASUREMENT rather than
 * an equality, because this set grows upstream:
 *
 * - nothing may throw;
 * - at least as many documents cross with no loss at all;
 * - no more documents than today need the whole-document source envelope.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    citations, codeCallouts, details, listTable, parse, semanticSpan, spoiler, tabs,
} from '@markup-carve/carve';
import { carveToProseMirrorWithReport } from '../tiptap/index.js';
import { serializeToCarve } from '../tiptap/serializer.js';
import { normalizeAst } from './lib/ast-normalize.js';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(here, '../spec/tests/corpus-optional');
const manifest = JSON.parse(readFileSync(resolve(DIR, 'manifest.json'), 'utf8'));

/**
 * Feature name from the manifest to the engine extensions that produce it. A
 * feature with no entry needs no extension - it is a renderer option or a
 * default the engine already applies.
 */
const EXTENSIONS = {
    'citations-numbered': () => [citations()],
    'citations-author-date': () => [citations('author-date')],
    'code-callouts': () => [codeCallouts()],
    details: () => [details()],
    'list-table': () => [listTable()],
    spoiler: () => [spoiler()],
    tabs: () => [tabs()],
    'semantic-span': () => [semanticSpan()],
};

// Documents that cross with NOTHING preserved or degraded. A floor.
const MINIMUM_LOSSLESS = 12;
// Documents whose rich projection is not write-identical, so the loader keeps
// the source envelope and the first edit is what starts writing the projection.
// A ceiling: every one is a construct worth giving a real node.
const MAXIMUM_ENVELOPED = 7;

console.log('optional corpus through the bridge:');

let lossless = 0;
const enveloped = [];
const threw = [];

for (const testCase of manifest.cases) {
    const source = readFileSync(resolve(DIR, `${testCase.slug}.crv`), 'utf8');
    const factory = EXTENSIONS[testCase.feature];
    const parseOptions = factory ? { extensions: factory() } : undefined;

    let result;
    try {
        result = carveToProseMirrorWithReport(source, {
            unsupported: 'preserve',
            ...(parseOptions ? { parse: parseOptions } : {}),
        });
    } catch (error) {
        threw.push(`${testCase.slug}: ${error.message}`);
        continue;
    }

    // Load and save, with the envelope in place, must be lossless for every
    // document here - that is the promise `preserve` makes.
    const written = serializeToCarve(result.doc);
    assert.deepStrictEqual(
        normalizeAst(parse(written, parseOptions)),
        normalizeAst(parse(source, parseOptions)),
        `${testCase.slug} does not survive load/save`,
    );

    const preservedTypes = Object.keys(result.preserved);
    if (preservedTypes.includes('document')) enveloped.push(testCase.slug);
    if (preservedTypes.length === 0 && Object.keys(result.degraded).length === 0) lossless++;
}

assert.deepStrictEqual(threw, [], `optional corpus documents that threw: ${threw.join('; ')}`);

assert.ok(
    lossless >= MINIMUM_LOSSLESS,
    `documents crossing with no loss fell to ${lossless}, below ${MINIMUM_LOSSLESS}`,
);
assert.ok(
    enveloped.length <= MAXIMUM_ENVELOPED,
    `documents needing the source envelope rose to ${enveloped.length}: ${enveloped.join(', ')}`,
);

console.log(`  ✓ ${manifest.cases.length} documents, none threw`);
console.log(`  ✓ ${lossless} cross with no loss (floor ${MINIMUM_LOSSLESS})`);
console.log(`  ✓ ${enveloped.length} need the source envelope (ceiling ${MAXIMUM_ENVELOPED}): ${enveloped.join(', ')}`);
