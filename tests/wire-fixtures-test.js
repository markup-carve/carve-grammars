/**
 * The ProseMirror WIRE shape, pinned.
 *
 * `schema-map.json` names the node and mark a Carve type becomes, and now the
 * attributes each carries. Names alone were never the contract: two bridges to
 * this same editor model produced different attribute vocabularies for the same
 * document - `ref` against `carveRef`, `delim` against `tight`, table spans
 * present in one and absent from the other - and nothing compared them, so a
 * document stored by one lost its reference spelling, its list tightness and
 * its cell spans when read by the other.
 *
 * These fixtures are the comparison. Each case is a Carve source and the exact
 * document this bridge produces for it; a bridge in another runtime copies
 * `tiptap/wire-fixtures.json` and asserts the same thing.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { citations, parse } from '@markup-carve/carve';
import { carveToProseMirror } from '../tiptap/index.js';
import { serializeToCarve } from '../tiptap/serializer.js';
import { normalizeAst } from './lib/ast-normalize.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(resolve(here, '../tiptap/wire-fixtures.json'), 'utf8'));
const map = JSON.parse(readFileSync(resolve(here, '../tiptap/schema-map.json'), 'utf8'));

const EXTENSIONS = { citations };

let passed = 0;
function ok(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

function parseOptions(fixture) {
    if (!fixture.extensions?.length) return undefined;

    return { extensions: fixture.extensions.map((name) => {
        const factory = EXTENSIONS[name];
        assert.ok(factory, `wire-fixtures.json names an extension this test does not know: ${name}`);

        return factory();
    }) };
}

console.log('prosemirror wire fixtures:');

assert.ok(fixtures.cases.length >= 25, 'the fixture set has shrunk; it is the interop contract');

for (const fixture of fixtures.cases) {
    ok(fixture.name, () => {
        const parseOpts = parseOptions(fixture);
        const doc = carveToProseMirror(fixture.carve, {
            unsupported: 'throw',
            ...(parseOpts ? { parse: parseOpts } : {}),
        });
        const produced = { ...doc };
        // The source envelope is a carve-grammars optimization, not part of the
        // wire shape another runtime has to reproduce.
        delete produced.attrs;
        assert.deepStrictEqual(produced, fixture.pm);

        // And the fixture is a document this bridge can read back, not merely
        // one it can write: a fixture nothing round-trips would pin a shape
        // that loses content.
        assert.deepStrictEqual(
            normalizeAst(parse(serializeToCarve(fixture.pm), parseOpts)),
            normalizeAst(parse(fixture.carve, parseOpts)),
            `${fixture.name} does not round-trip`,
        );
    });
}

ok('every attribute the fixtures use is declared in the map', () => {
    // Reverse direction: an attribute a bridge produces but the map never
    // names is exactly the drift this pair of files exists to stop.
    const declared = new Map();
    const add = (pm, entry) => {
        const set = declared.get(pm) || new Set();
        for (const attr of Object.keys(entry.attrs || {})) set.add(attr);
        declared.set(pm, set);
    };
    for (const entry of Object.values(map.types)) {
        for (const pm of [entry.pm].flat()) add(pm, entry);
    }
    // The sections keyed by ProseMirror name rather than by Carve type: the
    // preservation atoms, and the carrier for a mark with no content. They are
    // as much part of the wire as the mapped types - a bridge that does not know
    // `carveEmptyMark` reads an empty-label link as an unknown node.
    for (const section of [map.preservationNodes, map.markCarrierNodes]) {
        for (const [pm, entry] of Object.entries(section || {})) {
            if (pm === 'about') continue;
            add(pm, entry);
        }
    }

    // Names the wire carries that are not a Carve concept: ProseMirror's own
    // shape, and this bridge's source-preservation atoms.
    const OWN = new Set(['carveSource', 'carveFingerprint', 'carveSourceLayout']);

    const undeclared = new Set();
    const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        for (const attr of Object.keys(node.attrs || {})) {
            if (node.attrs[attr] == null || OWN.has(attr)) continue;
            if (!declared.get(node.type)?.has(attr)) undeclared.add(`${node.type}.${attr}`);
        }
        for (const mark of node.marks || []) {
            for (const attr of Object.keys(mark.attrs || {})) {
                if (mark.attrs[attr] == null || OWN.has(attr)) continue;
                if (!declared.get(mark.type)?.has(attr)) undeclared.add(`mark ${mark.type}.${attr}`);
            }
        }
        for (const child of node.content || []) visit(child);
    };
    for (const fixture of fixtures.cases) visit(fixture.pm);

    assert.deepStrictEqual(
        [...undeclared].sort(), [],
        'attributes the fixtures produce that schema-map.json does not declare: ' + [...undeclared].sort().join(', '),
    );
});

ok('a Carve concept on a stock node is carve-prefixed', () => {
    // The naming rule the map states, enforced. `id`, `class` and the rest of
    // the HTML-native names are exempt: they mean the same thing in any schema.
    const HTML_NATIVE = new Set([
        'id', 'class', 'href', 'src', 'alt', 'title', 'start', 'colspan', 'rowspan',
        'level', 'checked', 'language', 'textAlign', 'type', 'colwidth', 'target', 'rel',
    ]);
    const OWN_NODES = new Set(Object.values(map.types)
        .flatMap((entry) => [entry.pm].flat())
        .filter((pm) => pm.startsWith('carve') || pm.startsWith('definition')));

    const wrong = [];
    for (const [carveType, entry] of Object.entries(map.types)) {
        for (const pm of [entry.pm].flat()) {
            if (OWN_NODES.has(pm)) continue;
            for (const attr of Object.keys(entry.attrs || {})) {
                if (HTML_NATIVE.has(attr) || attr.startsWith('carve')) continue;
                wrong.push(`${carveType} -> ${pm}.${attr}`);
            }
        }
    }
    assert.deepStrictEqual(
        wrong.sort(), [],
        'Carve attributes on a stock ProseMirror node that are not carve-prefixed: ' + wrong.join(', '),
    );
});

console.log(`\n${passed} passed`);
