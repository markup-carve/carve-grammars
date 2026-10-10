import { InputRule, PasteRule, getMarksBetween } from '@tiptap/core';

const escapeRegExp = (text) => text.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');

// Not escaped by an odd run of backslashes, and outside an open `code` span.
const UNESCAPED = '(?<!(?:^|[^\\\\])(?:\\\\\\\\)*\\\\)';
const OUTSIDE_CODE = '(?<=^[^`]*(?:`[^`]*`[^`]*)*)';

// A bare delimiter follows the PART 9 §9 word-boundary guards:
//   bare_opener(d) = <!(alnum | '_' | d | slash_if(d)), d, !(ws | d)
//   bare_closer(d) = <&(non_ws), d, !(alnum)
// with alnum ASCII-only and slash_if(d) = '/' for `/` and `_`. An input rule
// fires when the closer is typed, before the next character exists, so only
// the paste rule can check what follows it. Typed content stops at the nearest
// delimiter, so an earlier literal `*a*` is not swallowed into a later span.
function bareRules(delimiter) {
    const d = escapeRegExp(delimiter);
    const before = `[A-Za-z0-9_${d}${delimiter === '/' || delimiter === '_' ? '/' : ''}]`;
    const opener = `${OUTSIDE_CODE}${UNESCAPED}(?<!${before})${d}(?![\\s${d}])`;
    const closer = `${UNESCAPED}${d}`;
    return {
        size: 1,
        input: new RegExp(`${opener}[^${d}]*[^\\s${d}]${closer}$`),
        paste: new RegExp(`${opener}.*?\\S${closer}(?![A-Za-z0-9])`, 'g'),
    };
}

// The braced form opens regardless of word boundary (PART 9 §22).
function bracedRules(delimiter) {
    const d = escapeRegExp(delimiter);
    const span = `${OUTSIDE_CODE}${UNESCAPED}\\{${d}.+?${UNESCAPED}${d}\\}`;
    return {
        size: 2,
        input: new RegExp(`${span}$`),
        paste: new RegExp(span, 'g'),
    };
}

const CARVE_MARK_SPELLINGS = {
    bold: bareRules('*'),
    italic: bareRules('/'),
    underline: bareRules('_'),
    strike: bareRules('~'),
    highlight: bareRules('='),
    superscript: bracedRules('^'),
    subscript: bracedRules(','),
};

// The stock markInputRule finds the content with indexOf, which lands inside
// the opener when the content starts with the delimiter (`{^^x^}`), so the
// delimiters are stripped by their known width instead. A typed closer's last
// character is not in the document yet, so an input rule passes one less.
function applyMark(state, range, open, close, type) {
    // A delimiter inside code is content, including code a paste rule marked first.
    const blocked = getMarksBetween(range.from, range.to, state.doc)
        .some((item) => item.mark.type.spec.code
            || item.mark.type.excluded.find((excluded) => excluded === type && excluded !== item.mark.type));
    if (blocked) return null;
    const { tr } = state;
    tr.delete(range.to - close, range.to);
    tr.delete(range.from, range.from + open);
    tr.addMark(range.from, range.to - open - close, type.create());
    return tr;
}

/**
 * Input and paste rules that type a mark the way Carve spells it, replacing the
 * stock Markdown rules (`**x**`, `__x__`, `~~x~~`, `==x==`).
 *
 * @param {string} name the stock Tiptap mark name
 * @returns {{ addInputRules(): any[], addPasteRules(): any[] }}
 */
export function carveMarkRules(name) {
    const rules = CARVE_MARK_SPELLINGS[name];
    return {
        addInputRules() {
            if (!rules) return [];
            const type = this.type;
            return [new InputRule({
                find: rules.input,
                handler: ({ state, range }) => {
                    if (!applyMark(state, range, rules.size, rules.size - 1, type)) return null;
                    state.tr.removeStoredMark(type);
                },
            })];
        },
        addPasteRules() {
            if (!rules) return [];
            const type = this.type;
            return [new PasteRule({
                find: rules.paste,
                // A null here would discard every other match of the paste.
                handler: ({ state, range }) => {
                    applyMark(state, range, rules.size, rules.size, type);
                },
            })];
        },
    };
}

export const CARVE_RULED_MARKS = Object.keys(CARVE_MARK_SPELLINGS);
