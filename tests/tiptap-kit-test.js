import assert from 'node:assert'
import fs from 'node:fs'
import { Window } from 'happy-dom'
import * as carve from '@markup-carve/carve'
import { Node as PMNode } from '@tiptap/pm/model'

const window = new Window()
for (const name of ['window', 'document', 'navigator', 'Node', 'HTMLElement', 'Element', 'DOMParser', 'MutationObserver', 'getComputedStyle']) {
    if (globalThis[name] === undefined) {
        Object.defineProperty(globalThis, name, { value: name === 'window' ? window : window[name], configurable: true, writable: true })
    }
}
const { Editor, getSchema } = await import('@tiptap/core')
const { CarveKit, carveToProseMirror, proseMirrorToTree, serializeToCarve, treeToProseMirror } = await import('@markup-carve/carve-grammars/tiptap')

const engine = carve
const schema = getSchema([CarveKit])
const editor = new Editor({ extensions: [CarveKit] })

/** The tree of `source` after parse -> ProseMirror -> schema check -> editor -> tree. */
function throughEditor(source) {
    const tree = carve.parse(source)
    const json = treeToProseMirror(tree)
    PMNode.fromJSON(schema, json).check()
    editor.commands.setCarveContent(json, { emitUpdate: false })
    return { tree, json: editor.getJSON() }
}

function assertRoundTrip(source, label = JSON.stringify(source)) {
    const { tree, json } = throughEditor(source)
    const back = proseMirrorToTree(json)
    assert.ok(carve.treesEqual(back, tree), `${label}: tree after the editor\n${JSON.stringify(carve.diffTree(tree, back)).slice(0, 600)}`)
    const written = carve.write(back)
    assert.ok(carve.treesEqual(carve.parse(written), tree), `${label}: written source reads back`)
    assert.strictEqual(serializeToCarve(json, { engine, source }), source, `${label}: unedited source is kept byte for byte`)
    return json
}

function types(json, out = new Set()) {
    if (Array.isArray(json)) json.forEach((item) => types(item, out))
    else if (json !== null && typeof json === 'object') {
        if (typeof json.type === 'string') out.add(json.type)
        for (const value of Object.values(json)) if (typeof value === 'object') types(value, out)
    }
    return out
}

// One case per node type the editor shows, with the ProseMirror type it must load as.
const CASES = [
    ['::: note "Read this"\nBody *text*.\n:::\n', ['carveAdmonition', 'carveTitle', 'bold']],
    ['{.box #main}\n:::\nInside a div.\n:::\n', ['carveDiv']],
    ['::: "A titled div"\nx\n:::\n', ['carveDiv', 'carveTitle']],
    [':::: tabs\n::: tab "One"\nFirst.\n:::\n::: tab "Two"\nSecond.\n:::\n::::\n', ['carveDiv', 'carveTitle']],
    ['![A cat](cat.png)\n^ The cat.\n', ['carveCaptioned', 'carveCaption', 'image']],
    [':: Term\n: Definition text.\n', ['carveDefinitionList', 'carveDefinitionTerm', 'carveDefinitionDescription']],
    ['::: |\nline one\n  line two\n:::\n', ['carveLineBlock', 'carveLine']],
    ['Inline $`x^2`$ and display $$`\\sum x`$$.\n', ['carveMath']],
    ['Text[^n].\n\n[^n]: The note.\n', ['carveFootnoteRef', 'carveFootnote']],
    ['%% a line comment\n\nText.\n', ['carveComment']],
    ['%%%\nblock comment\n%%%\n', ['carveComment']],
    ['{#intro .lead}\nA paragraph with attributes.\n', ['paragraph']],
    ['- [x] done\n- [ ] open\n- [?] unsure\n', ['taskList', 'taskItem']],
    ['```js title="a.js"\nconst a = 1;\n```\n', ['codeBlock']],
    ['{.diff}\n```\n- a\n+ b\n```\n', ['codeBlock']],
    ['|= a |= b |\n| 1 | 2 |\n', ['table', 'tableRow', 'tableHeader', 'tableCell']],
    ['1. one\n2. two\n', ['orderedList', 'listItem']],
    ['> quoted\n', ['blockquote']],
    ['# Heading\n\nPara with /em/, {_under_}, {~strike~}, {=mark=}, {^sup^}, {,sub,}, {+ins+} and {-del-}.\n', ['heading', 'italic', 'underline', 'strike', 'highlight', 'superscript', 'subscript', 'carveInsert', 'carveDelete']],
    ['A [link](https://example.com) and `code`.\n', ['link', 'code']],
    ['---\ntitle: x\n---\n\nBody.\n', ['carveFrontmatter']],
    ['Line one\\\nline two\n', ['hardBreak']],
]
for (const [source, expected] of CASES) {
    const json = assertRoundTrip(source)
    const seen = types(json)
    for (const type of expected) assert.ok(seen.has(type), `${JSON.stringify(source)} loads a ${type} (saw ${[...seen].join(', ')})`)
}

// Every conformance example and clause case of the 0.2 corpus.
const dir = new URL('../spec/spec/0.2/conformance/', import.meta.url)
const examples = JSON.parse(fs.readFileSync(new URL('examples.json', dir), 'utf8')).examples
const clauseCases = JSON.parse(fs.readFileSync(new URL('clause-cases.json', dir), 'utf8')).cases
const corpus = [
    ...examples.filter((example) => typeof example.input === 'string').map((example) => [example.id, example.input]),
    ...clauseCases.filter((entry) => typeof entry.input === 'string').map((entry) => [entry.id, entry.input]),
]
for (const [id, source] of corpus) assertRoundTrip(source, id)
console.log(`tiptap kit: ${corpus.length} corpus inputs round-trip through the editor`)

// Clause cases that hand a tree instead of source: every tree the engine accepts round-trips too.
let treeCases = 0
for (const entry of clauseCases) {
    if (entry.tree?.type !== 'document') continue
    try {
        carve.validateTree(entry.tree)
    } catch {
        continue
    }
    const json = treeToProseMirror(entry.tree)
    PMNode.fromJSON(schema, json).check()
    editor.commands.setCarveContent(json, { emitUpdate: false })
    const back = proseMirrorToTree(editor.getJSON())
    assert.ok(carve.treesEqual(back, entry.tree), `${entry.id}: supplied tree after the editor`)
    treeCases++
}
console.log(`tiptap kit: ${treeCases} supplied trees round-trip through the editor`)

// An engine without treesEqual still gets the source kept.
{
    const { treesEqual: _unused, ...older } = carve
    for (const [, source] of corpus.slice(0, 200)) {
        assert.strictEqual(serializeToCarve(carveToProseMirror(source, { engine }), { engine: older, source }), source)
    }
}

// Task states: an unchanged state keeps its mark, a toggled one writes the checked state.
{
    const source = '- [?] maybe\n- [ ] open\n'
    const json = carveToProseMirror(source, { engine })
    json.content[0].content[1].attrs.checked = true
    const out = serializeToCarve(json, { engine, source })
    const items = carve.parse(out).children[0].children
    assert.deepStrictEqual(items.map((item) => item.task.mark), ['?', 'x'])
}

// An edit keeps the untouched blocks as written, including spellings the writer would change.
{
    const source = '{.box}\n:::\nKept   as   is.\n:::\n\nEdit me.\n\n* other\n* bullets\n'
    editor.commands.setCarveContent(carveToProseMirror(source, { engine }), { emitUpdate: false })
    const json = editor.getJSON()
    json.content[1].content[0].text = 'Edited.'
    const out = serializeToCarve(json, { engine, source })
    assert.ok(out.startsWith('{.box}\n:::\nKept   as   is.\n:::\n'), out)
    assert.ok(out.includes('* other\n* bullets'), out)
    assert.ok(out.includes('Edited.'), out)
}

// A div title and kind edited in the editor reach the tree.
{
    const json = carveToProseMirror('::: note "Old"\nx\n:::\n', { engine })
    json.content[0].attrs.kind = 'warning'
    json.content[0].content[0].content[0].text = 'New'
    const node = proseMirrorToTree(json).children[0]
    assert.strictEqual(node.kind, 'warning')
    assert.deepStrictEqual(node.title, [{ type: 'text', value: 'New' }])
}

// Marks: nesting order and adjacent siblings survive; an edit that overlaps marks still gives a valid tree.
{
    for (const source of ['*a /b/ c*\n', '/*a*/\n', '*/a/*\n', '[a]{.x}[b]{.x}\n', '*a*/b/\n']) assertRoundTrip(source)
    const json = carveToProseMirror('*bold* plain\n', { engine })
    json.content[0].content[1].marks = [{ type: 'italic' }]
    const out = serializeToCarve(json, { engine })
    assert.ok(carve.treesEqual(carve.parse(out), proseMirrorToTree(json)), out)
}

// Table edits: a column added to a ragged table stays in every row, and new empty cells are valid.
{
    const source = '|= a |= b |\n| short |\n'
    editor.commands.setCarveContent(carveToProseMirror(source, { engine }), { emitUpdate: false })
    editor.commands.setTextSelection(4)
    assert.ok(editor.commands.addColumnAfter())
    const tree = proseMirrorToTree(editor.getJSON())
    carve.validateTree(tree)
    const rows = tree.children[0].children.flatMap((section) => section.children)
    assert.deepStrictEqual(rows.map((row) => row.children.length), [3, 2])
    const out = serializeToCarve(editor.getJSON(), { engine, source })
    assert.ok(carve.treesEqual(carve.parse(out), carve.parse(carve.write(tree))), out)
    // A column added in front keeps the short row's text in its column.
    editor.commands.setCarveContent(carveToProseMirror(source, { engine }), { emitUpdate: false })
    editor.commands.setTextSelection(4)
    assert.ok(editor.commands.addColumnBefore())
    const before = proseMirrorToTree(editor.getJSON()).children[0].children.flatMap((section) => section.children)
    assert.deepStrictEqual(before[1].children.map((cell) => cell.children[0].children.map((inline) => inline.value).join('')), ['', 'short'])
}

// A body row added under the head row goes to the body and writes.
{
    for (const source of ['|= a |= b |\n| 1 | 2 |\n', '|= a |= b |\n']) {
        editor.commands.setCarveContent(carveToProseMirror(source, { engine }), { emitUpdate: false })
        editor.commands.setTextSelection(4)
        assert.ok(editor.commands.addRowAfter())
        const sections = proseMirrorToTree(editor.getJSON()).children[0].children
        assert.deepStrictEqual(sections.map((section) => section.type), ['table_head', 'table_body'], source)
        assert.strictEqual(typeof serializeToCarve(editor.getJSON(), { engine, source }), 'string')
    }
}

// Deleting the first of two blocks with the same tree keeps the survivor's own spelling.
{
    const source = '```\nx\n```\n\n````\nx\n````\n'
    const json = carveToProseMirror(source, { engine })
    json.content.shift()
    assert.strictEqual(serializeToCarve(json, { engine, source }), '````\nx\n````\n')
}

// A loaded empty paragraph is content, not a placeholder.
{
    const tree = { type: 'document', astVersion: '2.0', children: [{ type: 'paragraph', children: [] }, { type: 'paragraph', children: [{ type: 'text', value: 'x' }] }] }
    assert.ok(carve.treesEqual(proseMirrorToTree(treeToProseMirror(tree)), tree))
}

// Toolbar list commands convert in place.
{
    editor.commands.setCarveContent(carveToProseMirror('- alpha\n- beta\n', { engine }), { emitUpdate: false })
    editor.commands.selectAll()
    assert.ok(editor.commands.toggleTaskList())
    assert.strictEqual(serializeToCarve(editor.getJSON(), { engine }), '- [ ] alpha\n- [ ] beta\n')
    editor.commands.setCarveContent(carveToProseMirror('alpha\n\nbeta\n', { engine }), { emitUpdate: false })
    editor.commands.selectAll()
    assert.ok(editor.commands.toggleOrderedList())
    assert.ok(carve.parse(serializeToCarve(editor.getJSON(), { engine })).children[0].marker.kind === 'ordered')
}

// Content typed into a fresh editor writes as Carve.
{
    editor.commands.setContent('<h2>Title</h2><p>Some <strong>bold</strong> text.</p><ul><li><p>item</p></li></ul>')
    const out = serializeToCarve(editor.getJSON(), { engine })
    const tree = carve.parse(out)
    assert.deepStrictEqual(tree.children.map((node) => node.type), ['heading', 'paragraph', 'list'])
}

// Property: generated documents round-trip.
{
    let seed = 0x2f6e2b1
    const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    const pick = (list) => list[Math.floor(random() * list.length)]
    const inline = () => pick(['plain', '*bold*', '/em/', '_u_', '`code`', '[link](u)', '[span]{.c}', '$`m`$', 'x[^f]', '{+ins+}', '{-del-}', '*a /b/ c*', ':smile:'])
    const words = (n) => Array.from({ length: n }, inline).join(' ')
    const block = (depth) => {
        const leaves = [() => words(3), () => `# ${words(2)}`, () => '```py\nprint(1)\n```', () => '%% note', () => `| ${words(1)} | b |`, () => `- [${pick(['x', ' ', '?', '-'])}] ${words(2)}`, () => `:: ${words(1)}\n: ${words(2)}`, () => `{.k}\n${words(2)}`]
        if (depth > 2 || random() < 0.5) return pick(leaves)()
        const inner = Array.from({ length: 1 + Math.floor(random() * 2) }, () => block(depth + 1)).join('\n\n')
        const fence = ':'.repeat(3 + 3 - depth)
        return pick([
            () => `${fence} ${pick(['note', 'tip', 'warning'])} "${words(1)}"\n${inner}\n${fence}`,
            () => `{.c${depth}}\n${fence}\n${inner}\n${fence}`,
            () => inner.split('\n').map((line) => (line === '' ? '>' : `> ${line}`)).join('\n'),
            () => `- ${inner.split('\n').join('\n  ')}`,
        ])()
    }
    let count = 0
    let edits = 0
    let refused = 0
    for (let index = 0; index < 300; index++) {
        const source = `${Array.from({ length: 1 + Math.floor(random() * 4) }, () => block(0)).join('\n\n')}\n[^f]: foot\n`
        const json = assertRoundTrip(source, `generated ${index}`)
        count++
        // Edit one text node; the kept-source result must read back as the writer's own output of the edit.
        const texts = []
        const collect = (node) => {
            if (node.type === 'text') texts.push(node)
            for (const child of node.content ?? []) collect(child)
        }
        collect(json)
        if (texts.length === 0) continue
        pick(texts).text = pick(['edited', 'two words', 'x'])
        let written
        try {
            written = carve.write(proseMirrorToTree(json))
        } catch (error) {
            // The edit made a tree the writer cannot spell (text glued to a symbol); the kit reports the same refusal.
            assert.ok(error instanceof carve.CarveWriteError)
            assert.throws(() => serializeToCarve(json, { engine, source }), carve.CarveWriteError)
            refused++
            continue
        }
        const out = serializeToCarve(json, { engine, source })
        assert.ok(carve.treesEqual(carve.parse(out), carve.parse(written)), `generated ${index}: edited source\n${source}\n---\n${out}`)
        edits++
    }
    console.log(`tiptap kit: ${count} generated documents round-trip, ${edits} edited ones write back, ${refused} edits the writer refuses`)
}

// A destination the URL policy denies is null in the editor attribute and kept in `carve` (carve-grammars#918).
{
    const leaves = (source, options) => treeToProseMirror(carve.parse(source, { positions: false }), options).content[0].content
    const [image, , link] = leaves('![a](data:text/html,x) [x](javascript:alert(1))\n')
    assert.deepStrictEqual(image, { type: 'image', attrs: { src: null, alt: 'a', title: null, carve: { src: 'data:text/html,x' } } })
    assert.deepStrictEqual(link.marks, [{ type: 'link', attrs: { carve: { $id: 1, $depth: 0, href: 'javascript:alert(1)' }, href: null } }])
    for (const source of [
        '![a](data:text/html,x) [x](javascript:alert(1))\n',
        '# [h](VBScript:x) ![i](file:///etc/passwd "t")\n\n|= [c](jar:x) |\n| ![d](ms-word:x) |\n',
        '*[a /[b](data:x)/ c](javascript:y)*\n',
        '![a](data:x)\n^ Caption with [l](javascript:y).\n',
    ]) {
        const json = assertRoundTrip(source)
        const sinks = []
        const walk = (node) => {
            if (node.type === 'image') sinks.push(node.attrs.src)
            for (const mark of node.marks ?? []) if (mark.type === 'link') sinks.push(mark.attrs.href)
            for (const child of node.content ?? []) walk(child)
        }
        walk(json)
        assert.ok(sinks.length > 0 && sinks.every((value) => value === null), `${JSON.stringify(source)}: denied sinks are null (${JSON.stringify(sinks)})`)
    }
    // An allowed destination stays live; a policy narrows or widens what counts as denied.
    assert.strictEqual(leaves('![a](https://e.com/a.png)\n')[0].attrs.src, 'https://e.com/a.png')
    assert.strictEqual(leaves('![a](data:x)\n', { urlPolicy: { deny: [] } })[0].attrs.src, 'data:x')
    assert.strictEqual(leaves('![a](http://e.com)\n', { urlPolicy: { allow: ['https'] } })[0].attrs.src, null)
    assert.strictEqual(carveToProseMirror('![a](data:x)\n', { engine, urlPolicy: { deny: [] } }).content[0].content[0].attrs.src, 'data:x')
}

// The kit's URL test matches the engine's.
{
    const { DEFAULT_DENIED_SCHEMES, isUrlAllowed } = await import('../tiptap/url-policy.js')
    assert.deepStrictEqual([...DEFAULT_DENIED_SCHEMES], [...carve.DEFAULT_DENIED_SCHEMES])
    const urls = ['', 'x', ':x', 'a:b', 'JavaScript:x', ' javascript:x', 'java\tscript:x', 'java script:x', 'java script:x',
        'java﻿script:x', 'java\u0000script:x', 'data:x', 'DATA:x', '1data:x', 'da-ta:x', 'ms-cxh-full:x', 'https://e.com/a:b',
        '/path:x', '#a:b', '?q=javascript:x', 'javáscript:x', 'vscode-insiders:x', 'search-ms:x', 'shell:x', 'mailto:a@b']
    for (const url of urls) {
        for (const policy of [undefined, { deny: ['https'] }, { allow: ['https', 'MAILTO'] }, { deny: [] }]) {
            assert.strictEqual(isUrlAllowed(url, policy), carve.isUrlAllowed(url, policy), `${JSON.stringify(url)} under ${JSON.stringify(policy)}`)
        }
    }
}

editor.destroy()
console.log('tiptap kit: ok')
