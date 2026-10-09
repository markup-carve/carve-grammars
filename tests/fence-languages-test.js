import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const table = JSON.parse(readFileSync(new URL('../fence-languages/fence-languages.json', import.meta.url), 'utf8'))
const exported = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

assert.strictEqual(table.version, 1)
assert.ok(Array.isArray(table.languages) && table.languages.length > 0)

const seen = new Map()
const scope = /^(source|text)\.[A-Za-z0-9.+-]+$/
for (const [index, row] of table.languages.entries()) {
    const at = `row ${index} (${row.words?.[0]})`
    assert.deepStrictEqual(Object.keys(row).sort(), ['language', 'sublime', 'textmate', 'words'], `${at}: columns`)
    assert.match(row.language, /^[a-z][a-z0-9-]*$/, `${at}: language ${row.language}`)
    assert.ok(row.words.length > 0, `${at}: no words`)
    for (const word of row.words) {
        assert.match(word, /^[a-z0-9][a-z0-9+#.-]*$/, `${at}: word ${word}`)
        assert.ok(!seen.has(word), `${at}: ${word} is already on ${seen.get(word)}`)
        seen.set(word, at)
    }
    // Drawn, not embedded: every engine renders these fences itself.
    for (const word of ['mermaid', 'chart']) {
        assert.ok(!row.words.includes(word), `${at}: ${word} is a diagram fence`)
    }
    assert.ok(row.textmate !== null || row.sublime !== null, `${at}: embeds nowhere`)

    if (row.textmate !== null) {
        assert.ok(Array.isArray(row.textmate) && row.textmate.length > 0, `${at}: textmate scopes`)
        for (const name of row.textmate) assert.match(name, scope, `${at}: scope ${name}`)
    }

    if (row.sublime !== null) {
        if (row.sublime === 'document') {
            assert.deepStrictEqual(row.words, ['carve', 'crv'], `${at}: only Carve embeds the document`)
        } else {
            assert.match(row.sublime, /^scope:(source|text)\.[A-Za-z0-9.+-]+$/, `${at}: sublime ${row.sublime}`)
        }
    }
}

assert.strictEqual(
    exported.exports['./fence-languages.json'],
    './fence-languages/fence-languages.json',
    'the table is importable by consumers',
)
assert.ok(exported.files.includes('fence-languages/'), 'the table ships in the package')
