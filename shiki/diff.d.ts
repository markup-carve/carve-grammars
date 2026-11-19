import type { ShikiTransformer } from '@shikijs/types'

/**
 * A Shiki transformer that presents a Carve `{.diff}` language fence: it strips
 * each line's leading `+`/`-`/space before tokenization, restores it as a
 * `diff-marker` span, and classes added/removed lines. Create a fresh one per
 * code block.
 */
export function diffCodeTransformer(): ShikiTransformer
