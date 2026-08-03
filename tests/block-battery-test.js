/**
 * Every grammar in this repo classifies the shared block battery the same way.
 *
 * The battery is exported so the ported grammars - vscode-carve, intellij-carve
 * - can run the identical table against their own copies. That is the point:
 * six copies of these rules exist, and until now each one only ever checked
 * itself.
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHighlighter } from 'shiki'
import { BLOCK_BATTERY, classify } from './lib/block-battery.js'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

const grammar = JSON.parse(
  readFileSync(resolve(__dirname, '../textmate/carve.tmLanguage.json'), 'utf8'),
)
const hl = await createHighlighter({
  themes: ['github-light'],
  langs: [{ ...grammar, name: 'carve' }],
})

// A trailing line keeps the shape from being the last line of the document,
// which is where a `$`-anchored rule behaves differently.
const classifyLine = (src) => {
  const { tokens } = hl.codeToTokens(`${src}\nafter\n`, {
    lang: 'carve',
    theme: 'github-light',
    includeExplanation: 'scopeName',
  })
  const scopes = tokens[0].flatMap((tk) =>
    (tk.explanation ?? []).flatMap((e) => e.scopes.map((s) => s.scopeName)),
  )
  return classify(scopes.filter((s) => s !== 'source.carve'))
}

const failures = []
for (const { src, want, why } of BLOCK_BATTERY) {
  const got = classifyLine(src)
  if (got !== want) {
    failures.push(
      `  ${JSON.stringify(src).padEnd(14)} want=${want.padEnd(8)} got=${got}` +
        (why ? `   (${why})` : ''),
    )
  }
}

if (failures.length) {
  console.log('\nTextMate disagrees with the shared block battery:')
  console.log(failures.join('\n'))
  console.log(
    `\n${failures.length} of ${BLOCK_BATTERY.length} shapes wrong. ` +
      'The battery records what carve-rs renders; change the grammar, not the battery.',
  )
  process.exit(1)
}
console.log(`  ✓ block battery: TextMate agrees on all ${BLOCK_BATTERY.length} shapes`)

// Prism and highlight.js get the same treatment, so a fix that lands in one
// grammar and not the others shows up here rather than in a user's editor.
const Prism = require('prismjs')
globalThis.Prism = Prism
await import('../prism/carve.js')
delete globalThis.Prism
const prismGrammar = Prism.languages.carve

// A Prism token whose content is only strings has no nested token to recurse
// into, so recursing alone yields NOTHING for it - and `- ` is exactly that
// shape, a `list` token wrapping one string. Dropping it made every plain
// marker invisible here and the negatives passed vacuously.
const prismLeaves = (tokens, path = '') =>
  tokens.flatMap((tok) => {
    if (typeof tok === 'string') return []
    const self = `${path}${tok.type}`
    const next = `${self}>`
    const nested = Array.isArray(tok.content)
      ? prismLeaves(tok.content, next)
      : typeof tok.content === 'object'
        ? prismLeaves([tok.content], next)
        : []
    return [self, ...nested]
  })

const hljs = require('highlight.js')
hljs.registerLanguage('carve', (await import('../highlightjs/carve.mjs')).default)

const engines = {
  prism: (src) => classify(prismLeaves(Prism.tokenize(src, prismGrammar))),
  // highlight.js names things after its own universal classes, not after
  // Carve constructs, so the classes are mapped rather than fed to `classify`.
  // Reading them as TextMate scopes silently reduced `title` - which it uses
  // for BOTH captions and definition terms - to `none`, so every negative here
  // passed vacuously.
  highlightjs: (src) => {
    const classes = new Set(
      (hljs.highlight(src, { language: 'carve' }).value.match(/hljs-[a-z-]+/g) ?? []).map((c) =>
        c.replace('hljs-', ''),
      ),
    )
    if (classes.has('section')) return 'heading'
    if (classes.has('quote')) return 'quote'
    if (classes.has('title')) return 'caption-or-deflist'
    if (classes.has('bullet')) return 'list'
    return 'none'
  },
}

// These two use short class names (`quote`, `section`, `bullet`) rather than
// TextMate scope paths, so only the shapes whose expected answer survives that
// vocabulary are compared: `none` means no block class at all, which is
// expressible everywhere.
const NEGATIVES = BLOCK_BATTERY.filter((shape) => shape.want === 'none')
let crossFailures = 0
for (const [name, classifyWith] of Object.entries(engines)) {
  for (const { src, why } of NEGATIVES) {
    const got = classifyWith(src)
    if (got !== 'none') {
      crossFailures += 1
      console.log(
        `  ${name}: ${JSON.stringify(src)} classified as ${got}` + (why ? `   (${why})` : ''),
      )
    }
  }
}
if (crossFailures) {
  console.log(`\n${crossFailures} cross-grammar disagreement(s).`)
  process.exit(1)
}
console.log(
  `  ✓ block battery: prism and highlight.js agree on all ${NEGATIVES.length} negative shapes`,
)
