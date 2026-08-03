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
 * A shape belongs here when it is a BLOCK-LEVEL classification at column 1 that
 * every grammar can express - marker or not, and which kind. Inline behaviour
 * and scope-name details stay in each repo's own tests, where the vocabularies
 * legitimately differ.
 *
 * `want` is what carve-rs renders, checked rather than assumed. Update it only
 * with an engine transcript in the commit message.
 */

/** @typedef {{ src: string, want: 'heading'|'list'|'deflist'|'caption'|'quote'|'none', why?: string }} Shape */

/** @type {Shape[]} */
export const BLOCK_BATTERY = [
  // MARKER REQUIRES CONTENT (markup-carve/carve#513). A marker alone, or with
  // only whitespace after it, is prose.
  { src: '#', want: 'none' },
  { src: '# ', want: 'none' },
  { src: '#  ', want: 'none', why: 'a RUN of spaces is still not content - corpus 84-single-line-headings-5' },
  { src: '-', want: 'none' },
  { src: '- ', want: 'none' },
  { src: '1.', want: 'none' },
  { src: '1. ', want: 'none' },
  { src: '.', want: 'none', why: 'the bare dot may drop its VALUE, not its content' },
  { src: '::', want: 'none' },
  { src: ':: ', want: 'none' },
  { src: '^', want: 'none' },
  { src: '^ ', want: 'none' },

  // The same markers with content.
  { src: '# H', want: 'heading' },
  { src: '- item', want: 'list' },
  { src: '1. item', want: 'list' },
  { src: '. bare', want: 'list' },
  { src: ':: term', want: 'deflist' },
  { src: '^ cap', want: 'caption' },

  // Only spaces and tabs separate a marker from its content, so a non-ASCII
  // space IS content. Written as an escape so the codepoint survives editing.
  { src: '#  Title', want: 'heading', why: 'NBSP is content, not a separator' },
  { src: '-  item', want: 'list' },

  // A blockquote marker takes a space, or stands alone (markup-carve/carve#525).
  // `>>` is not a nested marker - that is `> > x`, a space per marker.
  { src: '>', want: 'quote' },
  { src: '> real', want: 'quote' },
  { src: '>no space', want: 'none' },
  { src: '>>x', want: 'none' },
  { src: '>> x', want: 'none' },
  { src: '>\tx', want: 'none', why: 'a tab does not separate' },

  // A chain is a marker plus content, where the content happens to look like a
  // marker: `- - ` renders as <ul><li>-</li></ul>.
  { src: '- - ', want: 'list' },
  { src: '- - item', want: 'list' },
  { src: '- [ ] ', want: 'list', why: 'a plain bullet holding the literal [ ], no checkbox' },
  { src: '- [x] done', want: 'list' },
]

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
