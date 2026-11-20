import assert from 'node:assert/strict'
import * as carve from '@markup-carve/carve'
import { treeToProseMirror, proseMirrorToTree } from '../tiptap/tree.js'

for (const [text, expected] of [
    ['x', 'x\n'],
    ['x\n', 'x\n'],
    ['x\n\n', 'x\n\n'],
    ['', '\n'],
]) {
    const codeBlock = { type: 'codeBlock' }
    if (text !== '') codeBlock.content = [{ type: 'text', text }]
    const doc = { type: 'doc', content: [codeBlock] }
    const tree = proseMirrorToTree(doc)
    assert.strictEqual(tree.children[0].value, expected, JSON.stringify(text))
    assert.strictEqual(proseMirrorToTree(treeToProseMirror(tree)).children[0].value, expected)
}

for (const source of ['```\nx\n```\n', '```\nx\n\n```\n', '```\n```\n']) {
    const tree = carve.parse(source)
    const back = proseMirrorToTree(treeToProseMirror(tree))
    assert.ok(carve.treesEqual(back, tree), JSON.stringify(source))
}

const withoutTerminator = { type: 'document', astVersion: '2.0', children: [{ type: 'code_block', value: 'x' }] }
assert.strictEqual(proseMirrorToTree(treeToProseMirror(withoutTerminator)).children[0].value, 'x')

for (let length = 1; length <= 256; length++) {
    for (let newlines = 0; newlines <= 3; newlines++) {
        const value = String.fromCharCode(97 + length % 26).repeat(length) + '\n'.repeat(newlines)
        const tree = { type: 'document', astVersion: '2.0', children: [{ type: 'code_block', value }] }
        assert.strictEqual(proseMirrorToTree(treeToProseMirror(tree)).children[0].value, value, `${length} bytes, ${newlines} newlines`)
    }
}

console.log('tiptap code newline round trips passed: 1024 generated payloads')
