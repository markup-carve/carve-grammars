import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const palette = JSON.parse(readFileSync(resolve(root, 'themes/palette.json'), 'utf8'))
const check = process.argv.includes('--check')

const variables = (colors) => Object.entries(colors)
    .map(([name, value]) => `  --carve-syntax-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}: ${value};`)
    .join('\n')

const tableVariables = (colors) => [
    ['boundary', colors.tableBoundary],
    ['header', colors.tableHeader],
    ['operator', colors.tableOperator],
    ['span', colors.tableSpan],
    ['continuation', colors.tableContinuation],
].map(([name, value]) => `  --carve-table-${name}: ${value};`).join('\n')

const outputs = new Map([
    ['shiki/palette.js', `// Generated from themes/palette.json. Run: node scripts/build-syntax-palette.mjs\nexport const carvePalette = ${JSON.stringify(palette, null, 2)}\n`],
    ['shiki/table-tokens.css', `/* Generated from themes/palette.json. */\n:root, .light, .vscode-light, [data-theme="light"] {\n${tableVariables(palette.light)}\n}\n\n.dark, .vscode-dark, [data-theme="dark"] {\n${tableVariables(palette.dark)}\n}\n\n.token.table-boundary, .hljs-table-boundary { color: var(--carve-table-boundary); }\n.token.table-header, .hljs-table-header { color: var(--carve-table-header); font-weight: 650; }\n.token.table-operator, .token.table-alignment, .hljs-table-operator, .hljs-table-alignment { color: var(--carve-table-operator); font-weight: 650; }\n.token.table-span, .hljs-table-span { color: var(--carve-table-span); font-weight: 650; }\n.token.table-continuation-marker, .hljs-table-continuation { color: var(--carve-table-continuation); font-weight: 650; }\n`],
    ['themes/carve-code.css', `/* Generated from themes/palette.json. Load after the Prism or highlight.js theme. */\n:root, .light, .vscode-light, [data-theme="light"] {\n${variables(palette.light)}\n}\n\n.dark, .vscode-dark, [data-theme="dark"] {\n${variables(palette.dark)}\n}\n\n:where(code.language-carve, code.language-crv, .language-carve > code, .language-crv > code) > .hljs-title,\n:where(.language-carve, .language-crv) .token.definition-term { color: var(--carve-syntax-definition); }\n:where(code.language-carve, code.language-crv, .language-carve > code, .language-crv > code) > .hljs-bullet,\n:where(.language-carve, .language-crv) .token.list.punctuation { color: var(--carve-syntax-list); font-weight: 700; }\n:where(.language-carve, .language-crv) .token.definition-term .token.punctuation,\n:where(.language-carve, .language-crv) .token.definition-list > .token.punctuation { color: var(--carve-syntax-definition); }\n:where(.language-carve, .language-crv) .token.list .token.constant { color: var(--carve-syntax-task); }\n:where(.language-carve, .language-crv) .token.code-block > .token.punctuation,\n:where(.language-carve, .language-crv) .hljs-code > .hljs-keyword { color: var(--carve-syntax-muted); }\n:where(.language-carve, .language-crv) .token.code-block > .token.language,\n:where(.language-carve, .language-crv) .hljs-code > .hljs-title { color: var(--carve-syntax-language); }\n`],
])

for (const [path, content] of outputs) {
    const target = resolve(root, path)
    if (check) {
        if (readFileSync(target, 'utf8') !== content) throw new Error(`${path} differs from themes/palette.json`)
    } else {
        writeFileSync(target, content)
    }
}
