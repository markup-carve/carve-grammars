import assert from 'node:assert/strict'
import fs from 'node:fs'
import { Window } from 'happy-dom'
import * as carve from '@markup-carve/carve'
import { Node as PMNode } from '@tiptap/pm/model'

const window = new Window()
for (const name of ['window', 'document', 'navigator', 'Node', 'HTMLElement', 'Element', 'DOMParser', 'MutationObserver', 'getComputedStyle', 'ClipboardEvent']) {
    if (globalThis[name] === undefined) {
        Object.defineProperty(globalThis, name, { value: name === 'window' ? window : window[name], configurable: true, writable: true })
    }
}
const { Editor, Mark, Node, getSchema } = await import('@tiptap/core')
const { CarveKit, carveToProseMirror, proseMirrorPointer, proseMirrorToTree, proseMirrorToTreeWithOrigins, serializeToCarve, treeToProseMirror } =
    await import('@markup-carve/carve-grammars/tiptap')

// A host's own extensions: an inline atom, a block atom and a mark.
const PlaceholderToken = Node.create({
    name: 'placeholderToken',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes: () => ({ name: { default: null } }),
    parseHTML: () => [{ tag: 'span[data-placeholder]' }],
    renderHTML: ({ HTMLAttributes }) => ['span', { 'data-placeholder': '', ...HTMLAttributes }],
})
const Poll = Node.create({
    name: 'poll',
    group: 'block',
    atom: true,
    addAttributes: () => ({ question: { default: null }, votes: { default: null } }),
    parseHTML: () => [{ tag: 'div[data-poll]' }],
    renderHTML: ({ HTMLAttributes }) => ['div', { 'data-poll': '', ...HTMLAttributes }],
})
const TextStyle = Mark.create({
    name: 'textStyle',
    addAttributes: () => ({ color: { default: null } }),
    parseHTML: () => [{ tag: 'span[data-text-style]' }],
    renderHTML: ({ HTMLAttributes }) => ['span', { 'data-text-style': '', ...HTMLAttributes }],
})
const extensions = [CarveKit, PlaceholderToken, Poll, TextStyle]
const schema = getSchema(extensions)
const editor = new Editor({ extensions })

const mapping = {
    nodes: {
        placeholderToken: { as: 'span', class: 'placeholder', attributes: ['name'] },
        poll: { as: 'div', class: 'poll', attributes: ['question', 'votes'] },
    },
    marks: { textStyle: { as: 'span', class: 'text-style', attributes: ['color'] } },
}

const hostDoc = {
    type: 'doc',
    content: [
        {
            type: 'paragraph',
            content: [
                { type: 'text', text: 'Dear ' },
                { type: 'placeholderToken', attrs: { name: 'first' } },
                { type: 'text', text: ', ' },
                { type: 'text', text: 'red', marks: [{ type: 'textStyle', attrs: { color: '#f00' } }] },
                { type: 'text', text: ' and ' },
                { type: 'text', text: 'bold red', marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#f00' } }] },
            ],
        },
        { type: 'poll', attrs: { question: 'Lunch?', votes: 3 } },
    ],
}
const expected = 'Dear []{.placeholder name=first}, [red]{.text-style color=#f00} and *[bold red]{.text-style color=#f00}*\n\n{question=Lunch? votes=3}\n::: poll\n\n:::\n'

// Save, then load the source with the same mapping, through the editor, and save again.
PMNode.fromJSON(schema, hostDoc).check()
assert.equal(carve.write(proseMirrorToTree(hostDoc, { mapping })), expected)
assert.deepEqual(proseMirrorToTreeWithOrigins(hostDoc, { mapping }).ignored, [])
const loaded = carveToProseMirror(expected, { engine: carve, mapping })
PMNode.fromJSON(schema, loaded).check()
editor.commands.setCarveContent(loaded, { emitUpdate: false })
const edited = JSON.parse(JSON.stringify(editor.getJSON()))
assert.equal(edited.content[0].content[1].type, 'placeholderToken')
assert.deepEqual(edited.content[0].content[1].attrs, { name: 'first' })
assert.deepEqual(edited.content[0].content[3].marks, [{ type: 'textStyle', attrs: { color: '#f00' } }])
// Attributes load back as strings: the key/value pair holds text.
assert.deepEqual(edited.content[1], { type: 'poll', attrs: { question: 'Lunch?', votes: '3' } })
assert.equal(serializeToCarve(edited, { engine: carve, mapping }), expected)
assert.equal(serializeToCarve(edited, { engine: carve, mapping, source: expected }), expected)

// A span that is not exactly the declared shape stays a kit span, so nothing it carries is lost.
for (const source of ['[x]{.text-style .big color=red}\n', '[x]{.text-style #id}\n', '[x]{.text-style size=2}\n', '[x]{.placeholder name=a}\n', '::: poll\nx\n:::\n']) {
    const json = treeToProseMirror(carve.parse(source, { positions: false }), { mapping })
    const types = JSON.stringify(json)
    assert.ok(!types.includes('"textStyle"') && !types.includes('"placeholderToken"'), source)
    assert.ok(carve.treesEqual(proseMirrorToTree(json, { mapping }), carve.parse(source)), source)
}

// A declared node with content holds its blocks.
{
    const notes = { nodes: { note: { as: 'div', class: 'note', content: true } } }
    const doc = { type: 'doc', content: [{ type: 'note', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] }] }
    const source = carve.write(proseMirrorToTree(doc, { mapping: notes }))
    assert.equal(source, '{.note}\n:::\nx\n:::\n')
    assert.deepEqual(treeToProseMirror(carve.parse(source, { positions: false }), { mapping: notes }).content[0].type, 'note')
    assert.throws(() => proseMirrorToTree(doc, { mapping: { nodes: { note: { as: 'div', class: 'note' } } } }), /"note" has content; map it with content: true/)
}

// An attribute the declared mapping does not list is reported, not saved.
assert.deepEqual(
    proseMirrorToTreeWithOrigins({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'placeholderToken', attrs: { name: 'a', size: 2 } }] }] }, { mapping }).ignored,
    [{ path: '/content/0/content/0', type: 'placeholderToken', attribute: 'size', value: 2 }],
)

// A type in neither the kit nor the mapping still throws.
assert.throws(() => proseMirrorToTree(hostDoc), /no Carve node for the ProseMirror inline "placeholderToken"/)
assert.throws(
    () => proseMirrorToTree({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'textStyle' }] }] }] }),
    /no Carve node for the ProseMirror mark "textStyle"/,
)
assert.throws(() => proseMirrorToTree(hostDoc, { mapping: { nodes: { poll: { as: 'section', class: 'x' } } } }), /mapping: the node "poll" needs/)
assert.throws(() => proseMirrorToTree(hostDoc, { mapping: { marks: { textStyle: { as: 'div', class: 'x' } } } }), /mapping: the mark "textStyle" needs/)
assert.throws(
    () => proseMirrorToTree({ type: 'doc', content: [{ type: 'placeholderToken', attrs: { name: 'a' } }] }, { mapping }),
    /"placeholderToken" is mapped to a span and cannot stand as a block/,
)

// Callbacks: a mention saved as a span with its label as text, and a mark saved as a highlight.
const callbacks = {
    nodes: {
        mention: {
            toTree: (pm) => ({ type: 'span', attrs: { classes: ['mention'], keyValues: [['data-id', pm.attrs.id]] }, children: [{ type: 'text', value: pm.attrs.label }] }),
            fromTree: (node, { position }) => position === 'inline' && node.type === 'span' && node.attrs?.classes?.[0] === 'mention'
                ? { type: 'mention', attrs: { id: node.attrs.keyValues[0][1], label: node.children[0].value } }
                : null,
        },
        callout: {
            toTree: (pm, { blocks }) => ({ type: 'div', attrs: { classes: ['callout'] }, children: blocks(pm.content) }),
            fromTree: (node, { position, blocks }) => position === 'block' && node.type === 'div' && node.attrs?.classes?.[0] === 'callout'
                ? { type: 'callout', content: blocks(node.children) }
                : null,
        },
    },
    marks: {
        marker: {
            toTree: () => ({ type: 'highlight' }),
            fromTree: (node) => node.type === 'highlight' ? { type: 'marker' } : null,
        },
    },
}
const callbackDoc = {
    type: 'doc',
    content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hi ' }, { type: 'mention', attrs: { id: '7', label: 'Ann' } }, { type: 'text', text: ' ' }, { type: 'text', text: 'hot', marks: [{ type: 'marker' }] }] },
        { type: 'callout', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note' }] }] },
    ],
}
const callbackSource = 'Hi [Ann]{.mention data-id=7} {=hot=}\n\n::: callout\nNote\n:::\n'
assert.equal(carve.write(proseMirrorToTree(callbackDoc, { mapping: callbacks })), callbackSource)
assert.ok(carve.treesEqual(proseMirrorToTree(treeToProseMirror(carve.parse(callbackSource, { positions: false }), { mapping: callbacks }), { mapping: callbacks }), carve.parse(callbackSource)))
assert.deepEqual(treeToProseMirror(carve.parse(callbackSource, { positions: false }), { mapping: callbacks }).content.slice(1), [
    { type: 'callout', content: [{ type: 'paragraph', attrs: { carve: null }, content: [{ type: 'text', text: 'Note' }] }] },
])

// Pointers: a lint finding on the saved document maps to the editor node it came from.
const outline = {
    type: 'doc',
    content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'x' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'C' }] },
    ],
}
{
    const { tree, pointers } = proseMirrorToTreeWithOrigins(outline)
    const findings = carve.lint(carve.write(tree)).filter((finding) => finding.code === 'heading-level-skip')
    assert.equal(findings.length, 1)
    assert.equal(proseMirrorPointer(pointers, findings[0].path), '/content/2')
    assert.equal(proseMirrorPointer(pointers, '/children/2/children/0'), '/content/2/content/0')
    assert.equal(proseMirrorPointer(pointers, ''), '')
}

function at(doc, pointer) {
    let node = doc
    for (const part of pointer.split('/').slice(1)) node = node?.[/^\d+$/.test(part) ? Number(part) : part]
    return node
}

function treePaths(node, path, out) {
    out.push([path, node])
    for (const [key, value] of Object.entries(node)) {
        if (Array.isArray(value)) value.forEach((item, index) => typeof item?.type === 'string' && treePaths(item, `${path}/${key}/${index}`, out))
        else if (typeof value?.type === 'string') treePaths(value, `${path}/${key}`, out)
    }
    return out
}

// The ProseMirror types a tree type comes from when its node has a pointer of its own.
const SOURCES = {
    heading: ['heading'],
    text: ['text', 'carveInline'],
    list_item: ['listItem', 'taskItem', 'carveBlock', 'carveInline'],
    table_row: ['tableRow', 'carveBlock', 'carveInline'],
    table_cell: ['tableCell', 'tableHeader', 'carveBlock', 'carveInline'],
    strong: ['bold', 'carveBlock', 'carveInline'],
    emphasis: ['italic', 'carveBlock', 'carveInline'],
    link: ['link', 'carveBlock', 'carveInline'],
}

// Every node of every corpus tree, after the editor, has a pointer that resolves in the editor's JSON.
const dir = new URL('../spec/spec/0.2/conformance/', import.meta.url)
const examples = JSON.parse(fs.readFileSync(new URL('examples.json', dir), 'utf8')).examples
const clauseCases = JSON.parse(fs.readFileSync(new URL('clause-cases.json', dir), 'utf8')).cases
const corpus = [
    ...examples.filter((example) => typeof example.input === 'string').map((example) => [example.id, example.input]),
    ...clauseCases.filter((entry) => typeof entry.input === 'string').map((entry) => [entry.id, entry.input]),
]
const kitEditor = new Editor({ extensions: [CarveKit] })
let nodes = 0
let findings = 0
for (const [id, source] of corpus) {
    kitEditor.commands.setCarveContent(treeToProseMirror(carve.parse(source, { positions: false })), { emitUpdate: false })
    const json = kitEditor.getJSON()
    const { tree, pointers } = proseMirrorToTreeWithOrigins(json)
    for (const [path, node] of treePaths(tree, '', [])) {
        const pointer = proseMirrorPointer(pointers, path)
        assert.ok(pointer !== null, `${id}: ${path} has a pointer`)
        const pm = at(json, pointer)
        assert.ok(typeof pm?.type === 'string', `${id}: ${path} points at ${pointer}, which is no node`)
        if (Object.hasOwn(pointers, path) && SOURCES[node.type] !== undefined) {
            assert.ok(SOURCES[node.type].includes(pm.type) || at(json, pointer.replace(/\/content\/\d+$|\/marks\/\d+$/, ''))?.type === 'carveBlock',
                `${id}: the ${node.type} at ${path} came from a ${pm.type}`)
        }
        nodes++
    }
    let written
    try {
        written = carve.write(tree)
    } catch {
        continue
    }
    for (const finding of carve.lint(written)) {
        if (typeof finding.path !== 'string') continue
        assert.ok(proseMirrorPointer(pointers, finding.path) !== null, `${id}: ${finding.code} at ${finding.path}`)
        findings++
    }
}
console.log(`tiptap mapping: ${corpus.length} corpus inputs, ${nodes} tree nodes and ${findings} lint findings resolve to an editor node`)
console.log('tiptap mapping: ok')
