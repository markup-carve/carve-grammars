import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const name = '@markup-carve/carve-grammars'
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

// Export paths restored after the 0.2 rename, with the module members consumers import.
const modules = {
    '/diagrams': ['renderDiagrams', 'renderGraphvizDiagrams', 'renderD2Diagrams', 'renderKrokiDiagrams'],
    '/diagrams/kroki': ['renderKrokiDiagrams'],
    '/diagrams/graphviz': ['renderGraphvizDiagrams'],
    '/diagrams/d2': ['renderD2Diagrams'],
    '/diagrams/render-blocks.js': ['renderBlocks'],
    '/diff': ['DIFF_FENCE_SELECTOR', 'isDiffFence', 'findDiffFences', 'isDiffCodeBlock', 'renderLanguageDiff', 'applyLanguageDiff'],
    '/shiki/diff': ['diffCodeTransformer'],
    '/shiki': ['diffCodeTransformer', 'carveGrammar', 'carveMarkdown'],
    '/prism/carve.js': [],
    '/highlightjs/carve.mjs': ['default'],
    '/highlightjs/delimited.mjs': ['csv', 'tsv'],
}
for (const [path, members] of Object.entries(modules)) {
    const mod = await import(name + path)
    for (const member of members) assert.ok(member in mod, `${path} exports ${member}`)
}

const files = {
    '/diff/carve-diff.css': 'diff/carve-diff.css',
    '/fence-languages.json': 'fence-languages/fence-languages.json',
    '/textmate/tsv.tmLanguage.json': 'textmate/tsv.tmLanguage.json',
    '/highlightjs/carve.js': 'highlightjs/carve.js',
}
for (const [path, file] of Object.entries(files)) {
    assert.ok(require.resolve(name + path).endsWith(file), `${path} resolves to ${file}`)
}

const table = (await import(`${name}/fence-languages.json`, { with: { type: 'json' } })).default
assert.deepStrictEqual(table.languages[0].textmate, ['source.carve'], 'the Carve row names the 0.2 grammar scope')

// 0.1 editor surfaces stay removed.
for (const path of ['/tiptap', '/tiptap/editor.css', '/tiptap/schema-map.json', '/editor']) {
    assert.throws(() => require.resolve(name + path), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }, `${path} is not exported`)
}

for (const dir of ['diagrams/', 'diff/', 'fence-languages/']) {
    assert.ok(manifest.files.includes(dir), `${dir} ships in the package`)
}
