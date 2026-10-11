import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getExtensionField, getSchema } from '@tiptap/core';
import { Window } from 'happy-dom';
import { DOMParser, DOMSerializer } from '@tiptap/pm/model';
import { CarveKit } from '../tiptap/carve-kit.js';
import { assertSchemaAttributes } from './lib/schema-attributes.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const map = read('../tiptap/schema-map.json');
const owners = read('./schema-attribute-owners.json');
const schema = getSchema([CarveKit]);
assertSchemaAttributes(map, owners, schema);

// Recreate #571 at the extension declaration, before Tiptap builds the schema.
const extensions = getExtensionField(CarveKit, 'addExtensions', {
    name: CarveKit.name,
    options: CarveKit.options,
    storage: CarveKit.storage,
})();
const withoutInlineBlock = extensions.map(extension => extension.name === 'carveCommentInline'
    ? extension.extend({
        addAttributes() {
            const { block, ...attrs } = this.parent();
            return attrs;
        },
    })
    : extension);
assert.throws(
    () => assertSchemaAttributes(map, owners, getSchema(withoutInlineBlock)),
    /comment -> carveCommentInline\.block/,
);

const withoutSeparatorWidths = extensions.map(extension => extension.name === 'table'
    ? extension.extend({
        addAttributes() {
            const { carveSeparatorWidths, ...attrs } = this.parent();
            return attrs;
        },
    })
    : extension);
const oldTableSchema = getSchema(withoutSeparatorWidths);
assert.throws(
    () => assertSchemaAttributes(map, owners, oldTableSchema),
    /table -> table\.carveSeparatorWidths/,
);
const tableJson = {
    type: 'doc',
    content: [{
        type: 'table',
        attrs: { carveSeparatorWidths: [3, 17], undeclaredWidth: [99] },
        content: [{
            type: 'tableRow',
            content: [3, 17].map(() => ({ type: 'tableHeader', content: [{ type: 'paragraph' }] })),
        }],
    }],
};
const mounted = schema.nodeFromJSON(tableJson);
mounted.check();
const mountedJson = mounted.toJSON();
assert.deepEqual(mountedJson.content[0].attrs.carveSeparatorWidths, [3, 17]);
assert.equal(Object.hasOwn(mountedJson.content[0].attrs, 'undeclaredWidth'), false);
assert.equal(Object.hasOwn(oldTableSchema.nodeFromJSON(tableJson).toJSON().content[0].attrs, 'carveSeparatorWidths'), false);
const nativeTableJson = structuredClone(tableJson);
delete nativeTableJson.content[0].attrs.carveSeparatorWidths;
assert.equal(schema.nodeFromJSON(nativeTableJson).toJSON().content[0].attrs.carveSeparatorWidths, null);

const win = new Window();
const html = win.document.createElement('div');
html.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(mounted.content, { document: win.document }));
assert.doesNotMatch(html.innerHTML, /carveseparatorwidths/i);
for (const value of ['5', 'abc']) {
    html.innerHTML = `<table carveSeparatorWidths="${value}"><tbody><tr><th><p>x</p></th></tr></tbody></table>`;
    assert.equal(DOMParser.fromSchema(schema).parse(html).toJSON().content[0].attrs.carveSeparatorWidths, null);
}
win.happyDOM.abort();

function rejects(change, pattern) {
    const changedMap = structuredClone(map);
    const changedOwners = structuredClone(owners);
    change(changedMap, changedOwners);
    assert.throws(() => assertSchemaAttributes(changedMap, changedOwners, schema), pattern);
}
rejects(m => { m.types.paragraph.attrs.missingAttribute = 'control'; }, /paragraph -> paragraph\.missingAttribute/);
rejects(m => { m.types.link.attrs.missingAttribute = 'control'; }, /link -> link\.missingAttribute/);
for (const [section, name] of [['preservationNodes', 'carveUnsupported'], ['markCarrierNodes', 'carveEmptyMark']]) {
    rejects(m => { m[section][name].attrs.missingAttribute = 'control'; }, new RegExp(`${name}\\.missingAttribute`));
}
rejects((m, o) => { delete o.comment; }, /exactly the multi-name types/);
rejects((m, o) => { o.obsolete = {}; }, /exactly the multi-name types/);
rejects((m, o) => { delete o.comment.carveCommentInline; }, /every ProseMirror name/);
rejects((m, o) => { o.comment.typo = []; }, /every ProseMirror name/);
rejects(m => { m.types.comment.attrs.newClaim = 'control'; }, /attributed union/);
rejects((m, o) => { o.comment.carveCommentInline.push('content'); }, /duplicate attribute/);
rejects(m => { delete m.types.comment.attrs.content; }, /attributed union/);
rejects((m, o) => { o.list.bulletList.push('start'); }, /list -> bulletList\.start/);

console.log('schema attributes: declarations, ownership coverage, and negative controls passed');
