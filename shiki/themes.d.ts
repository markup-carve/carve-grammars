import type { ShikiTransformer, ThemeRegistrationRaw } from '@shikijs/types'

/** One token-color rule, as Shiki and TextMate themes spell it. */
export interface CarveThemeRule {
    scope: string | string[]
    settings: { foreground?: string, fontStyle?: string }
}

/** Token-color rules for Carve scopes the stock GitHub light theme does not style. */
export const carveLightExtras: CarveThemeRule[]
/** Token-color rules for Carve scopes the stock GitHub dark theme does not style. */
export const carveDarkExtras: CarveThemeRule[]

/** A copy of `theme` with `extras` appended to its token colors. */
export function extendTheme<T extends ThemeRegistrationRaw>(theme: T, extras: CarveThemeRule[]): T

/** GitHub light, extended with the Carve rules. */
export const carveLightTheme: ThemeRegistrationRaw
/** GitHub dark, extended with the Carve rules. */
export const carveDarkTheme: ThemeRegistrationRaw

/**
 * Tags tokens the HTML emitter cannot style (strikethrough, sub/superscript,
 * highlight) with `data-carve-*` attributes; pair with `shiki/carve.css`.
 */
export const carveStylingTransformer: ShikiTransformer
