import type { ShikiTransformer } from '@shikijs/types'

export interface CodeLineAttrs {
  classes?: string[]
  keyValues?: [string, string][]
}

/** Create a Shiki transformer for one code block's line options. */
export function lineOptionsTransformer(attrs?: CodeLineAttrs): ShikiTransformer
