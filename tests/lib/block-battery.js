/**
 * The block shapes every Carve grammar must classify the same way.
 *
 * This file exists because the same rule has been fixed separately in six
 * places twice over, and the second time one of the six silently missed it: a
 * PR merged onto a deleted branch, replayed an older commit, and left
 * intellij-carve the only grammar still colouring `-`, `1.` and `::` as markers
 * while its changelog said otherwise. Nothing noticed, because each repo only
 * ever checked itself.
 *
 * The TABLE lives in block-battery.json, not here, so the ported grammars can
 * read it from whatever language they are written in - vscode-carve from
 * JavaScript, intellij-carve from Kotlin. Each vendors a copy and a drift check
 * compares it against this one; that pairing is what turns "six copies of a
 * rule" into "six copies checked against one table".
 *
 * A shape belongs in the table when it is a BLOCK-LEVEL classification at column 1 that
 * every grammar can express - marker or not, and which kind. Inline behaviour
 * and scope-name details stay in each repo's own tests, where the vocabularies
 * legitimately differ.
 *
 * `want` is what carve-rs renders, checked rather than assumed. Update it only
 * with an engine transcript in the commit message.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @typedef {{ src: string, want: 'heading'|'list'|'deflist'|'caption'|'quote'|'none', why?: string }} Shape */

/** @type {Shape[]} */
export const BLOCK_BATTERY = JSON.parse(
  readFileSync(resolve(__dirname, 'block-battery.json'), 'utf8'),
).shapes

/**
 * Reduce a set of TextMate scope names to one block classification.
 *
 * Kept here rather than in each repo so the three grammars are judged by the
 * same reduction. Order matters: a caption scope may sit inside a quote scope.
 */
export function classify(scopeNames) {
  const joined = scopeNames.join(' ')
  if (/heading/.test(joined)) return 'heading'
  if (/caption/.test(joined)) return 'caption'
  if (/quote/.test(joined)) return 'quote'
  // Prism spells it `definition-term`, TextMate `list.definition.term`.
  // Matching only the dotted form reduced Prism's token to `none`, so the
  // `:: ` negative passed while Prism still highlighted it.
  if (/definition[.-]term|list\.definition/.test(joined)) return 'deflist'
  if (/list/.test(joined)) return 'list'
  return 'none'
}
