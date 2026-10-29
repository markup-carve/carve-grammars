import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { carveDarkExtras, carveLightExtras, carvePalette } from '../shiki/themes.js'
import { assertThisFileRuns } from './lib/runs-in-ci.js'

assertThisFileRuns(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = JSON.parse(readFileSync(resolve(root, 'themes/palette.json'), 'utf8'))
assert.deepEqual(carvePalette, source)
execFileSync(process.execPath, [resolve(root, 'scripts/build-syntax-palette.mjs'), '--check'])

function luminance(hex) {
    const rgb = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255)
    const linear = rgb.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}

for (const mode of ['light', 'dark']) {
    const colors = carvePalette[mode]
    const extras = mode === 'light' ? carveLightExtras : carveDarkExtras
    const rule = (scope) => extras.find((entry) => entry.scope === scope)
    assert.equal(rule('punctuation.definition.list.definition').settings.foreground, colors.definition)
    assert.equal(rule('entity.name.tag.definition.term').settings.foreground, colors.definition)
    assert.equal(rule('fenced_code.block.language').settings.foreground, colors.language)
    assert.equal(rule('punctuation.definition.caption').settings.foreground, colors.captionMarker)
    assert.equal(rule('punctuation.definition.caption').settings.fontStyle, 'bold')
    assert.equal(rule('markup.caption').settings.foreground, colors.captionText)
    assert.equal(rule('markup.caption').settings.fontStyle, 'italic')
    for (const role of ['definition', 'list', 'task', 'language', 'muted', 'captionMarker', 'captionText']) {
        for (const surface of ['background', 'codeBackground']) {
            const [high, low] = [luminance(colors[role]), luminance(colors[surface])].sort((a, b) => b - a)
            assert.ok((high + 0.05) / (low + 0.05) >= 4.5, `${mode} ${role} on ${surface} contrast`)
        }
    }
}

const css = readFileSync(resolve(root, 'themes/carve-code.css'), 'utf8')
assert.match(css, /:where\(code\.language-carve, code\.language-crv, \.language-carve > code, \.language-crv > code\) > \.hljs-title/)
assert.match(css, /\.hljs-title\.caption_ > \.hljs-punctuation\.caption-marker_,/)
assert.match(css, /\.token.caption > \.token.punctuation \{ color: var\(--carve-syntax-caption-marker\); font-weight: 700/)
assert.match(css, /\.hljs-title\.caption_ \{ color: var\(--carve-syntax-caption-text\); font-style: italic/)
assert.match(css, /\.token.caption \{ color: var\(--carve-syntax-caption-text\); font-style: italic/)
assert.doesNotMatch(css, /prefers-color-scheme/)
assert.match(css, /\.hljs-code > \.hljs-title \{ color: var\(--carve-syntax-language\)/)
assert.match(css, /\.hljs-code > \.hljs-keyword \{ color: var\(--carve-syntax-muted\)/)
assert.doesNotMatch(css, /language-(?:js|javascript|php|rust)/)
console.log('Shared syntax palette: generated assets and theme roles match')
