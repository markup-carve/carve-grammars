import assert from 'node:assert/strict';

/** Check the map's attribute claims against the assembled CarveKit schema. */
export function assertSchemaAttributes(map, owners, schema) {
    const multi = Object.keys(map.types).filter(type => Array.isArray(map.types[type].pm));
    assert.deepEqual(Object.keys(owners).sort(), multi.sort(), 'attribute ownership must cover exactly the multi-name types');

    const missing = [];
    function check(label, name, kind, attrs) {
        const type = schema[kind === 'mark' ? 'marks' : 'nodes'][name];
        assert.ok(type, `${label} -> ${name}: missing ${kind}`);
        for (const attr of attrs) {
            if (!Object.hasOwn(type.spec.attrs ?? {}, attr)) missing.push(`${label} -> ${name}.${attr}`);
        }
    }

    for (const [type, entry] of Object.entries(map.types)) {
        const claimed = Object.keys(entry.attrs ?? {});
        if (!Array.isArray(entry.pm)) {
            check(type, entry.pm, entry.kind, claimed);
            continue;
        }
        const attributed = owners[type];
        assert.deepEqual(Object.keys(attributed).sort(), [...entry.pm].sort(), `${type}: ownership must cover every ProseMirror name`);
        for (const [name, attrs] of Object.entries(attributed)) {
            assert.ok(Array.isArray(attrs) && attrs.every(attr => typeof attr === 'string'), `${type} -> ${name}: expected attribute names`);
            assert.equal(new Set(attrs).size, attrs.length, `${type} -> ${name}: duplicate attribute`);
            check(type, name, entry.kind, attrs);
        }
        assert.deepEqual([...new Set(Object.values(attributed).flat())].sort(), claimed.sort(), `${type}: attributed union must equal the map's claims`);
    }

    for (const section of ['preservationNodes', 'markCarrierNodes']) {
        for (const [name, entry] of Object.entries(map[section])) {
            if (name !== 'about') check(section, name, entry.kind, Object.keys(entry.attrs ?? {}));
        }
    }
    assert.deepEqual(missing, [], `attributes absent from CarveKit: ${missing.join(', ')}`);
}
