/** Carve 0.2 highlight.js grammar. */

function adaptGrammar(grammar, hljs) {
    let paragraphCacheSource;
    const paragraphCache = new Map();
    function inParagraph(source, offset) {
        if (source !== paragraphCacheSource) {
            paragraphCacheSource = source;
            paragraphCache.clear();
        }
        let end = offset;
        const visited = [];
        let result = false;
        while (end > 0) {
            if (paragraphCache.has(end)) {
                result = paragraphCache.get(end);
                break;
            }
            visited.push(end);
            if (source[end - 1] === '\n') {
                end--;
                if (source[end - 1] === '\r') end--;
            } else if (source[end - 1] === '\r') end--;
            const start = Math.max(source.lastIndexOf('\n', end - 1), source.lastIndexOf('\r', end - 1)) + 1;
            const line = source.slice(start, end).trim();
            if (!line) break;
            if (/^%%(?!%)(?![ \t]*#(?:region|endregion)\b)/.test(line)
                || /^(?:#{1,6}|={1,6}) +\S/.test(line)) {
                end = start;
                continue;
            }
            result = !/^\*{3,}$|^`{3,}|^\|.*\||^%%[ \t]*#(?:region|endregion)\b|^%{3,}/.test(line);
            break;
        }
        for (const position of visited) paragraphCache.set(position, result);
        return result;
    }
    const visited = new WeakSet();
    const excluded = (mode) => {
        const source = mode?.begin?.source || '';
        return mode?.className === 'table-alignment'
            || (mode?.className === 'punctuation' && source.includes('(?=\\+)'))
            || mode?.bareSpanOf01 === true
            || source.includes('(?=[-:| ]+\\|');
    };
    function adapt(node) {
        if (!node || typeof node !== 'object' || visited.has(node)) return;
        visited.add(node);
        if (node instanceof RegExp) return;
        if (Array.isArray(node)) {
            for (let i = node.length - 1; i >= 0; i--) {
                if (excluded(node[i])) node.splice(i, 1);
                else adapt(node[i]);
            }
            return;
        }
        if (Array.isArray(node.begin) && node.beginScope) {
            for (let i = 0; i < node.begin.length; i++) {
                if (node.beginScope[String(i + 1)] === 'table-alignment' && i > 0 && (node.begin[i - 1]?.source || node.begin[i - 1]) === '=') {
                    node.begin[i] = /(?= |\t|\{|\||$|[<>?~])/;
                    delete node.beginScope[String(i + 1)];
                }
            }
        }
        if (node.className === 'attr' && node.begin instanceof RegExp && node.begin.source.includes('\\r?\\n')) {
            const originalBegin = node['on:begin'];
            node['on:begin'] = (match, response) => {
                if (/[\r\n]/.test(match[0])) {
                    match.rule.scope = undefined;
                    return;
                }
                originalBegin?.(match, response);
            };
        }
        if (node.className === 'comment' && node.end instanceof RegExp && node.end.source.includes('%{3,}')) {
            node.end = new RegExp(node.end.source.replace('[^\\n]*$', '[ \\t]*$'), node.end.flags);
        }
        for (const [key, value] of Object.entries(node)) {
            if (value instanceof RegExp) {
                let source = value.source;
                if (source.includes('~{3,}') || source.includes('[`~]') || source.includes('(`|~)')) {
                    source = source.replaceAll('`{3,}|~{3,}', '`{3,}')
                        .replaceAll('~{3,}', '(?!)')
                        .replaceAll('[`~]', '`')
                        .replaceAll('(`|~)', '(`)');
                    node[key] = new RegExp(source, value.flags);
                }
            } else adapt(value);
        }
    }
    adapt(grammar);
    const hashHeading = grammar.contains.find(mode => mode?.className === 'section' && mode.begin?.source.includes('#{1,6}'));
    const markerLineHeading = hashHeading['on:begin'];
    hashHeading['on:begin'] = (match, response) => {
        markerLineHeading(match, response);
        if (match.index > 0 && !/[\r\n]/.test(match.input[match.index - 1])) return;
        match.rule.scope = inParagraph(match.input, match.index) ? undefined : 'section';
    };
    const horizontalRule = grammar.contains.find(mode => mode?.begin?.source?.includes('-{3,}|\\*{3,}|_{3,}'));
    grammar.contains = grammar.contains.filter(mode => mode !== horizontalRule);
    const lineStart = '^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*';
    // A div body shares the mode: a thematic break is stars only (C2-B-159).
    if (horizontalRule) horizontalRule.begin = new RegExp(lineStart + '\\*{3,}[ \\t]*$(?![^\\r\\n])');
    // C2-B-081: a definition stands at column 0 outside every container and
    // is text below a paragraph line.
    // The line a definition run is read under (C2-B-081). Comment-only and
    // attribute lines are passed over; a term line, with the description and
    // indented lines of its entry, is no paragraph text, so the paragraph check
    // reads above the entry: `:: t` then `[a]: /u` holds a definition, as do
    // `> :: t` and `- :: t`.
    const DEFINITION_SKIP = /^\uFEFF?(?:[ \t]*%%(?!%)(?![ \t]*#(?:region|endregion)\b)|\{[^\r\n]*\}[ \t]*$)/;
    const DEFINITION_MARKER = '(?:[-*+]|\\d{1,9}[.)]|(?:[a-z]|[ivxlcdm]+)[.)]|(?:[A-Z]|[IVXLCDM]+)\\)|(?:[A-Z]|[IVXLCDM]+)\\.(?= {2}))';
    const DEFINITION_TASK = '(?:[ \\t]+\\[[ xX\\-_>\\/!?]\\])?';
    const DEFINITION_TERM_LINE = RegExp('^\\uFEFF?[ \\t]*(?:(?:>|' + DEFINITION_MARKER + DEFINITION_TASK + ')[ \\t]+)*:: +\\S');
    const DEFINITION_DESCRIPTION_LINE = /^\uFEFF?[ \t]*(?:>[ \t]*)*: +\S/;
    const DEFINITION_HEADING_START = /^\uFEFF?(?:#{1,6}|={1,6}) +\S/;
    const DEFINITION_HEADING_LINE = /^\uFEFF?(?:[ \t]*>)*[ \t]+(?:#{1,6}|={1,6}) +\S/;
    // A list marker line: group 1 its prefix up to the marker, groups 2-4 an ordinal.
    const DEFINITION_ITEM = '^(\\uFEFF?(?:[ \\t]*>)*[ \\t]*)(?:[-*+]|(\\d{1,9}|[a-z]|[ivxlcdm]+)[.)]|([A-Z]|[IVXLCDM]+)\\)|([A-Z]|[IVXLCDM]+)\\.(?= {2}))';
    const DEFINITION_MARKER_LINE = RegExp(DEFINITION_ITEM + '[ \\t]+\\S');
    // A marker line whose item opens with a term (group 5), a heading or a
    // comment-only line: no paragraph text.
    const DEFINITION_MARKER_BLOCK_LINE = RegExp(DEFINITION_ITEM + DEFINITION_TASK + '[ \\t]+(?:' + DEFINITION_MARKER + DEFINITION_TASK
        + '[ \\t]+)*(?:(::) +\\S|(?:#{1,6}|={1,6}) +\\S|%%(?!%)(?![ \\t]*#(?:region|endregion)\\b))');
    // The column of `line[index]`, a tab advancing to the next multiple of four.
    const definitionColumn = (line, index) => {
        let column = 0;
        for (let i = 0; i < index; i++) column = line[i] === '\t' ? column + 4 - column % 4 : column + 1;
        return column;
    };
    let definitionItemSource = null;
    const definitionItemVerdicts = new Map();
    function definitionReadAbove(source, start) {
        const lineBefore = (at) => {
            const end = source[at - 1] === '\n' && source[at - 2] === '\r' ? at - 2 : at - 1;
            let previous = end;
            while (previous > 0 && source[previous - 1] !== '\n' && source[previous - 1] !== '\r') previous--;
            return [previous, source.slice(previous, end)];
        };
        // The marker line holding the marker line read as `item` at `at` as a
        // sibling or child: the nearest unindented line above, at the same
        // quote depth. A nested ordered marker must be a first one, the only
        // kind that interrupts a paragraph.
        function parentItem(at, item) {
            // Columns count from the last quote marker.
            const column = item[1].replace(/^.*>/, '').length;
            const ordinal = item[2] ?? item[3] ?? item[4];
            let indent = Infinity;
            for (let above = at; above > 0;) {
                const [previous, text] = lineBefore(above);
                const marker = DEFINITION_MARKER_LINE.exec(text);
                // Lines short of the marker's content column left its item.
                if (marker && indent < definitionColumn(text, marker[0].length - 1)) return null;
                if (marker) {
                    if (marker[1].split('>').length !== item[1].split('>').length) return null;
                    const markerColumn = marker[1].replace(/^.*>/, '').length;
                    if (column >= markerColumn) {
                        return column === markerColumn || ordinal === undefined || /^(?:0*1|[aAiI])$/.test(ordinal) ? [previous, marker] : null;
                    }
                    // A deeper marker in an item further up is that item's
                    // content; one in no item is a sibling.
                    if (!parentItem(previous, marker)) return [previous, marker];
                } else if (!/^[ \t]+\S/.test(text)) return null;
                else indent = Math.min(indent, definitionColumn(text, text.search(/\S/)));
                above = previous;
            }
            return null;
        }
        // Whether that marker line opens an item: its list holds it, and the
        // list's first item is no lazy text of a paragraph above (`p` over
        // `- a` over `  - :: t`). Verdicts are kept per input, so a long
        // list is read once.
        const opensItemUnder = (at, item) => {
            if (definitionItemSource !== source) {
                definitionItemSource = source;
                definitionItemVerdicts.clear();
            }
            const chain = [];
            let verdict = false;
            for (let parent = parentItem(at, item); parent; parent = parentItem(...parent)) {
                const [start] = parent;
                if (definitionItemVerdicts.has(start)) {
                    verdict = definitionItemVerdicts.get(start);
                    break;
                }
                chain.push(start);
                if (!inParagraph(source, start)) {
                    verdict = true;
                    break;
                }
            }
            for (const start of chain) definitionItemVerdicts.set(start, verdict);
            return verdict;
        };
        read: for (;;) {
            let top = start;
            while (top > 0) {
                const [previous, line] = lineBefore(top);
                if (!DEFINITION_SKIP.test(line)) break;
                top = previous;
            }
            let entry = top;
            let term = false;
            // The least indent of the lines between the run and its nearest
            // term, and whether one of them opens a list item.
            let indent = Infinity;
            let nested = false;
            // The topmost term line, and whether a description sits above it:
            // a description no term holds is paragraph text.
            let termStart = -1;
            let orphan = false;
            // The least indent of the lines between that term and the next
            // one up, which holds them only when they reach past its `::`.
            let between = Infinity;
            let description = Infinity;
            while (entry > 0) {
                const [previous, line] = lineBefore(entry);
                const item = DEFINITION_MARKER_BLOCK_LINE.exec(line);
                // A heading or comment-only line opening an item right above: the
                // run stands under an item.
                if (!term && item && item[5] === undefined && indent === Infinity) {
                    if (opensItemUnder(previous, item)) return 0;
                    // Otherwise the line holds the run as the lines above would.
                    start = previous;
                    continue read;
                }
                if (!term && indent === Infinity && !item && DEFINITION_HEADING_LINE.test(line)) {
                    // An indented heading, a block of the item above, reads the same.
                    start = previous;
                    continue read;
                }
                if (DEFINITION_TERM_LINE.test(line)) {
                    // A term holds only the lines indented past its `::`; a line
                    // short of it, a description too, is no part of it (#990).
                    // Under a term on a marker line, an indented marker that
                    // can interrupt it opens a nested list instead. An indented
                    // term that holds neither may sit in an enclosing one.
                    if (!term && (indent <= definitionColumn(line, line.indexOf('::')) || (nested && item?.[5]))) {
                        if (!/^[ \t]+\S/.test(line)) return top;
                        indent = Math.min(indent, definitionColumn(line, line.search(/\S/)));
                        entry = previous;
                        continue;
                    }
                    const colons = definitionColumn(line, line.indexOf('::'));
                    if (term && (between <= colons || description < colons)) return termStart;
                    term = true;
                    termStart = previous;
                    orphan = false;
                    between = Infinity;
                    description = Infinity;
                    // A term on a marker line opens an item: under item content
                    // the item stands, so nothing above holds the run (#990).
                    if (item?.[5] && opensItemUnder(previous, item)) return 0;
                    // A marker line right under a description is its lazy text.
                    if (item?.[5] && previous > 0 && DEFINITION_DESCRIPTION_LINE.test(lineBefore(previous)[1])) return previous;
                } else if (term && DEFINITION_DESCRIPTION_LINE.test(line)) {
                    orphan = true;
                    description = Math.min(description, definitionColumn(line, line.search(/\S/)));
                } else if (term && (DEFINITION_HEADING_LINE.test(line) || DEFINITION_SKIP.test(line))) {
                    // A heading or comment between two terms is a block: the
                    // run reads as it would right under it.
                    start = previous;
                    continue read;
                } else if (!/^[ \t]+\S/.test(line)) {
                    // Indented lines no term holds are paragraph text, unless
                    // they continue a heading.
                    if (DEFINITION_HEADING_START.test(line)) orphan = false;
                    else if (term && between !== Infinity) return termStart;
                    break;
                } else if (term && !item && !/^[ \t]*>/.test(line)) between = Math.min(between, definitionColumn(line, line.search(/\S/)));
                else {
                    indent = Math.min(indent, definitionColumn(line, line.search(/\S/)));
                    const marker = DEFINITION_MARKER_LINE.exec(line);
                    const ordinal = marker && (marker[2] ?? marker[3] ?? marker[4]);
                    if (marker && (ordinal === undefined || /^(?:0*1|[aAiI])$/.test(ordinal))) nested = true;
                }
                entry = previous;
            }
            if (term && between !== Infinity && entry === 0) return termStart;
            return orphan ? termStart : term ? entry : top;
        }
    }
    // Every line of a definition run shares its first line's verdict, kept per
    // input: walking back over the run from each line was quadratic (#989).
    let definitionSource = null;
    const definitionVerdicts = new Map();
    function definitionAllowed(source, offset) {
        if (source !== definitionSource) {
            definitionSource = source;
            definitionVerdicts.clear();
        }
        const run = [];
        let start = offset;
        let allowed;
        for (;;) {
            if (definitionVerdicts.has(start)) {
                allowed = definitionVerdicts.get(start);
                break;
            }
            run.push(start);
            const end = source[start - 1] === '\n' && source[start - 2] === '\r' ? start - 2 : start - 1;
            const previous = Math.max(source.lastIndexOf('\n', end - 1), source.lastIndexOf('\r', end - 1)) + 1;
            if (start === 0 || !/^\uFEFF?(?:\[[^\]\r\n]+\]:|\*\[[A-Za-z0-9]+\]:)/.test(source.slice(previous, end))) {
                allowed = !inParagraph(source, definitionReadAbove(source, start));
                break;
            }
            start = previous;
        }
        for (const line of run) definitionVerdicts.set(line, allowed);
        return allowed;
    }
    // Definition modes carry `definition: true` where they are declared.
    const isDefinition = mode => mode?.definition === true;
    const seen = new WeakSet();
    function dropNestedDefinitions(mode) {
        if (!mode || typeof mode !== 'object' || seen.has(mode) || mode instanceof RegExp) return;
        seen.add(mode);
        for (const value of Object.values(mode)) {
            if (Array.isArray(value)) {
                for (let i = value.length - 1; i >= 0; i--) {
                    if (isDefinition(value[i])) value.splice(i, 1);
                    else dropNestedDefinitions(value[i]);
                }
            } else dropNestedDefinitions(value);
        }
    }
    grammar.contains = grammar.contains.filter((mode) => {
        if (!isDefinition(mode)) return true;
        if (!mode.begin.source.startsWith('^(?<![^\\r\\n])')) return false;
        const originalBegin = mode['on:begin'];
        mode['on:begin'] = (match, response) => {
            if (/^\uFEFF?[ \t]/.test(match.input.slice(match.index)) || !definitionAllowed(match.input, match.index)) {
                response.ignoreMatch();
                return;
            }
            originalBegin?.(match, response);
        };
        return true;
    });
    for (const mode of grammar.contains) {
        if (!isDefinition(mode)) dropNestedDefinitions(mode);
    }
    // C2-B-040: an uppercase marker with a dot needs two spaces, a lowercase one needs one.
    const letterMarker = '(?:(?:[a-z]|[ivxlcdm]{2,9})\\.(?= \\S)|(?:[A-Z]|[IVXLCDM]{2,9})\\.(?= {2}\\S))';
    grammar.contains.unshift(
        { className: 'comment', begin: new RegExp(lineStart + '%%[ \\t]*#(?:region[ \\t]+[A-Za-z_][A-Za-z_0-9-]*|endregion(?:[ \\t]+[A-Za-z_][A-Za-z_0-9-]*)?)[ \\t]*$') },
        { className: 'bullet', begin: new RegExp(lineStart + letterMarker) },
        { ...hashHeading, begin: new RegExp(lineStart + '={1,6} +(?=\\S)') },
        { className: 'meta', begin: new RegExp(lineStart + '\\*{3,}[ \\t]*$') },
    );
    guardLeadingLookbehinds(grammar);
    crlfLineEnds(grammar);
    (grammar.compilerExtensions ??= []).push(isolateResumeMatchers);
    return grammar;
}

/*
 * A mode's matcher joins every begin into one alternation, far past the size
 * V8 still optimizes, so each alternative is tried at every position. A begin
 * that opens on a lookbehind (often over the Unicode word class) pays for that
 * lookbehind everywhere before its first character can fail. A lookahead on
 * that character, which the begin consumes next anyway, fails first.
 */
function leadingLiteral(source) {
    let at = 0;
    while (source.startsWith('(?<!', at) || source.startsWith('(?<=', at)) {
        let depth = 0;
        let inClass = false;
        for (; at < source.length; at++) {
            const c = source[at];
            if (c === '\\') at++;
            else if (inClass) inClass = c !== ']';
            else if (c === '[') inClass = true;
            else if (c === '(') depth++;
            else if (c === ')' && --depth === 0) break;
        }
        if (depth !== 0) return null;
        at++;
    }
    if (at === 0) return null;
    const c = source[at];
    if (c === '\\') return /[^\w\s]/.test(source[at + 1] ?? '') && !/[*+?{]/.test(source[at + 2] ?? '') ? source.slice(at, at + 2) : null;
    if (c === undefined || /[\w\s^$.|?*+()[\]{}]/.test(c) || /[*+?{]/.test(source[at + 1] ?? '')) return null;
    return c;
}
function guardLeadingLookbehinds(grammar) {
    const seen = new WeakSet();
    (function walk(node) {
        if (!node || typeof node !== 'object' || seen.has(node) || node instanceof RegExp) return;
        seen.add(node);
        if (node.begin instanceof RegExp) {
            const literal = leadingLiteral(node.begin.source);
            if (literal) node.begin = new RegExp('(?=' + literal + ')' + node.begin.source, node.begin.flags);
        }
        for (const value of Object.values(node)) walk(value);
    })(grammar);
}

/*
 * A CR before an LF is part of the line ending (C2-B-010), so a CRLF document
 * reads like its LF copy (carve-grammars#995). The rules are written for LF:
 * `\n` matched the LF alone and `$` held between the CR and the LF, which left
 * the CR inside a scope or read one CRLF as two line ends. Each mode regex gets
 * a line break that takes the CR with it and a `$` that does not stop inside a
 * CRLF. Input without a CR matches exactly as before; a lone CR reads as it did.
 */
// `\r?\n` costs V8 far more to compile and run than this alternation. The LF
// alone never follows a CR: a class that takes the CR would otherwise split
// each CRLF two ways, and a bounded run that fails backtracked through every
// split (carve-grammars#1002). In a lookbehind it would leave the CR to the atom before.
const LINE_BREAK = '(?:\\r\\n|(?<!\\r)\\n)';
function crlfSource(source) {
    let out = '';
    let afterCR = false;
    for (let at = 0; at < source.length; at++) {
        const c = source[at];
        const wasAfterCR = afterCR;
        afterCR = false;
        if (c === '[') {
            const start = at;
            if (source[at + 1] === '^') at++;
            for (at++; at < source.length && source[at] !== ']'; at++) if (source[at] === '\\') at++;
            out += source.slice(start, at + 1);
        } else if (c !== '\\') {
            afterCR = wasAfterCR && c === '?';
            out += c === '$' ? '$(?!(?<=\\r)\\n)' : c;
        } else if ((source.startsWith('\\r?\\n', at) && !/[*+?{]/.test(source[at + 5] ?? '')) || (source[at + 1] === 'n' && !wasAfterCR)) {
            // A `\n` after a bare `\r` (`\r\n?`) and a quantified `\r?\n` stay as written.
            const end = source[at + 1] === 'n' ? at + 2 : at + 5;
            out += LINE_BREAK;
            at = end - 1;
        } else {
            out += source.slice(at, at + 2);
            afterCR = source[at + 1] === 'r';
            at++;
        }
    }
    return out;
}
function crlfLineEnds(grammar) {
    const seen = new WeakSet();
    (function walk(node) {
        if (!node || typeof node !== 'object' || seen.has(node) || node instanceof RegExp) return;
        seen.add(node);
        for (const [key, value] of Object.entries(node)) {
            if (!(value instanceof RegExp)) walk(value);
            else if (crlfSource(value.source) !== value.source) node[key] = new RegExp(crlfSource(value.source), value.flags);
        }
    })(grammar);
}

/*
 * highlight.js 11 resumes a refused begin (`ignoreMatch()`) with a matcher
 * built from the rules after it, and every such matcher numbers the SAME rule
 * objects (`opts.position`), so the last one built renumbers the rules for all
 * the others. The matchers live on the compiled mode, so which rules a resumed
 * scan skips depended on what earlier highlight() calls had refused
 * (carve-grammars#992). Each resume matcher gets its own copies of the rules,
 * and a resume after a full-matcher fallback counts from that matcher's rule.
 * Any other matcher shape is left alone.
 */
const NEVER = /(?!)/;
function isolateResumeMatchers(mode) {
    let matcher;
    Object.defineProperty(mode, 'matcher', {
        configurable: true,
        enumerable: true,
        get: () => matcher,
        set(value) {
            matcher = value;
            const build = value?.getMatcher;
            if (typeof build !== 'function' || !Array.isArray(value.rules) || !Array.isArray(value.multiRegexes)) return;
            value.getMatcher = function (index) {
                if (this.multiRegexes[index]) return this.multiRegexes[index];
                const rules = this.rules;
                // The line-break stop only bounds resumed scans (see CONTAINS).
                this.rules = rules.map(([re, opts]) => [index === 0 && opts.rule?.resumeStop ? NEVER : re, { ...opts }]);
                try {
                    const built = build.call(this, index);
                    // exec keeps a resumed match only at the resumed position, so a
                    // resumed scan stops there instead of reading on (carve-grammars#1002).
                    if (index !== 0 && built.matcherRe) built.matcherRe = new RegExp(built.matcherRe.source, built.matcherRe.flags + 'y');
                    return built;
                } finally {
                    this.rules = rules;
                }
            };
            // When nothing matches at the resumed position, exec falls back to
            // the full matcher one character on, then adds that match's number
            // (counted from rule 0) to the old resume index. A refusal of that
            // match then resumed past rules never tried there (carve-grammars#994).
            const exec = value.exec;
            if (typeof exec !== 'function' || typeof value.count !== 'number') return;
            value.exec = function (source) {
                const resumedAt = this.regexIndex !== 0 ? this.lastIndex : -1;
                const result = exec.call(this, source);
                if (resumedAt !== -1 && result && result.index !== resumedAt) {
                    this.regexIndex = result.position + 1 === this.count ? 0 : result.position + 1;
                }
                return result;
            };
        },
    });
}

/**
 * Carve language definition for highlight.js
 *
 * Carve is a Djot-derived markup language with distinct inline delimiters:
 * emphasis is /text/ (not _text_), underline is _text_, strikethrough is
 * ~text~ (Djot uses ~ for subscript), subscript is ,text, and highlight is
 * =text= (Djot uses {=text=}). Strong (*text*), superscript (^text^),
 * insert ({+text+}) and delete ({-text-}) match Djot.
 *
 * This file is a UMD module so it works in every documented integration:
 *
 * - ESM: `import carve from '@markup-carve/carve-grammars/highlightjs/carve.js'` (resolved to
 *   the carve.mjs shim via the package `exports` map), then
 *   `hljs.registerLanguage('carve', carve)`.
 * - Classic `<script src=".../highlightjs/carve.js">` after highlight.js: it
 *   self-registers against the global `hljs` (and exposes `globalThis.carveHljs`).
 * - CommonJS contexts that load this file as CommonJS get the factory on
 *   `module.exports`.
 *
 * A top-level `export default` is intentionally NOT used: that would be a
 * syntax error when the file is loaded as a classic browser script.
 *
 * INDENTED BLOCK OPENERS, and why this file differs from the TextMate grammar
 * in the same package (carve-grammars#138, #89, #71):
 *
 * Carve opens a block at column 0, or at an enclosing container's content
 * column - nowhere in between. ` # H`, ` > q`, ` *[A]: x` and an indented fence
 * are all paragraphs at document level, while the same four openers at a list
 * item's content column are real blocks. Telling those apart needs block
 * context, and highlight.js modes here are line-based: this grammar has no
 * container model, so it cannot ask the question.
 *
 * So every block opener here stays anchored `^[ \t]*` and knowingly
 * over-colours the indented-at-document-level case. Anchoring at column 0
 * instead would not buy accuracy - it would stop highlighting EVERY
 * legitimately indented construct inside a list item or a block quote, which
 * is the common valid shape, in exchange for correcting a rare invalid one.
 *
 * The TextMate grammar tracks a list item's content column (carve-grammars#137)
 * and therefore CAN split the two: its `heading`, `fenced_code`, `blockquote`
 * and `abbreviation` rules are anchored at column 0, with `_in_container`
 * twins reachable only from inside a container. That divergence is deliberate
 * and is written up in the README ("Where the three grammars deliberately
 * differ"). Do not "fix" the anchors here to match it.
 *
 * A LEADING BYTE ORDER MARK (carve-grammars#154):
 *
 * A byte order mark at the START OF THE DOCUMENT is not content - the spec says
 * so ("Line endings and a byte order mark"), and carve-js, carve-rs and
 * carve-php all strip it before the block scanner runs. It is neither a space
 * nor a tab, so without an allowance it sat between the line start and the
 * marker and defeated every `begin` below that opens a block: a BOM-led heading
 * went unscoped, and a BOM-led fence was claimed by the inline code rule.
 *
 * The allowance is `(?:(?<![\s\S])\uFEFF)?`, and the assertion is the point.
 * highlight.js compiles these with the `m` flag, so a plain `^\uFEFF?` would admit
 * the mark at EVERY line start - and a mark that is not at offset 0 is an
 * ordinary zero-width character that opens nothing. Measured:
 * `# T\n\n\uFEFF- item\n` is a paragraph holding literal text in carve-rs and in
 * carve-php. Only carve-js reads it as a list, because JavaScript's own `\s`
 * class is Unicode White_Space plus U+FEFF (markup-carve/carve#806), and that is
 * the outlier. `(?<![\s\S])` is true only where nothing precedes.
 *
 * Only OPENERS carry it. A closer (the code, div and block-comment
 * `end`s) and a definition body line cannot be line 1, so they are untouched.
 * `LINE_COMMENT` needs nothing either, but for a reason worth naming: its
 * `(?<=\s)` already admits the mark, because JavaScript's `\s` holds U+FEFF.
 * That is the same quirk as above, working in this one rule's favour.
 *
 * The codepoint is always written as the escape `\uFEFF`. No file in this repo
 * holds a literal byte order mark: it is invisible, and an editor or a
 * normalizing filter can drop the one character a rule is about.
 *
 * @see https://github.com/markup-carve/carve for the Carve specification
 */
(function (root, factory) {
    var carve = function (hljs) { return adaptGrammar(factory()(hljs), hljs); };
    if (typeof module === 'object' && module.exports) {
        module.exports = carve;
    }
    if (root) {
        // Exposed for the ESM shim (carve.mjs) and for classic <script> use.
        root.carveHljs = carve;
        if (root.hljs && typeof root.hljs.registerLanguage === 'function') {
            root.hljs.registerLanguage('carve', carve);
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    /**
     * @param {object} [hljs] - the highlight.js instance (unused, kept for the
     *   standard language-definition signature).
     * @returns {object} a highlight.js language definition.
     */
    return function carve(hljs) {
    // Block attributes: {.class #id key=value} or boolean {reversed}
    // Excludes special inline syntax like {= {+ {- {%
    // The payload is STRICT (spec PART 9 S14): a class/id/key is the grammar's
    // `identifier` production, a letter or `_` then letters, digits, `_` and `-`.
    // So `{2=v}`, `{-a}` and `{a:b}` stay literal text rather than scoping as an
    // attribute block, and one invalid name is enough to leave the whole run
    // literal. A colon belongs to the VALUE grammar, not the key: an unquoted
    // value may contain dots and colons, so `{k=a:b}` is a real attribute block.
    const ATTR_ITEM = /(?::(?:[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8})*)?|[.#][A-Za-z0-9_][\w-]*|[A-Za-z_][\w-]*(?:=(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|[^\s"'{}|\\]+))?)/.source;
    // The parts of C2-I-029 to C2-I-032: an unquoted value holds no pipe or backslash.
    const STRICT_ATTR_ITEM = /(?::(?:[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)?|[.#][\w-]+|[A-Za-z_][\w-]*=(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|[^\s"'\\|}]+)|[A-Za-z][\w-]*)/.source;
    // A valid block glued to no host is one literal atom (C2-I-035, C2-I-036).
    const ATTRIBUTE_UNATTACHED = {
        begin: new RegExp('(?<!(?<!\\\\)(?:\\\\\\\\){0,32}\\\\)\\{[ \\t]*' + STRICT_ATTR_ITEM + '(?:[ \\t]+' + STRICT_ATTR_ITEM + ')*[ \\t]*\\}'),
        relevance: 0,
    };
    // A LIST MARKER MAY BE GLUED TO AN ATTRIBUTE BLOCK (`-{#x} item`), so the
    // marker rules have to look past a whole block to decide there is a marker
    // at all. That lookahead spelled the item alternation out again, and the
    // copies went stale: when the language attribute (`{:fr}`) joined
    // `ATTR_ITEM`, `-{:fr} item` stopped colouring its `-` as a bullet while
    // `-{.c} item` still did. Built from `ATTR_ITEM` now, so one spelling of
    // what an attribute item is serves the attribute rule and both marker
    // rules, and they cannot drift apart again.
    const GLUED_ATTR_BLOCK =
        '(?=\\{\\s*(?:' + ATTR_ITEM + '(?:\\s+' + ATTR_ITEM + ')*\\s*)?\\}[ \\t]+[^ \\t\\n])';
    // A list marker glued to an attribute block, the block consumed.
    const GLUED_MARKER =
        '(?:[-*] +)*(?:[-*]|(?:[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2})))|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. ))'
        + '\\{\\s*(?:' + ATTR_ITEM + '(?:\\s+' + ATTR_ITEM + ')*\\s*)?\\} +';
    // The markers a block on a marker line may follow: any chain of bullet,
    // ordered and task markers, each optionally glued to an attribute block
    // (`- # T`, `1. - # T`, `-{.c} > x`, carve-grammars#947). An uppercase dot
    // marker needs two spaces (C2-B-040). Read through lookbehinds only.
    const GLUED_ATTR_RUN = '\\{\\s*(?:' + ATTR_ITEM + '(?:\\s+' + ATTR_ITEM + ')*\\s*)?\\}';
    const MARKER_LINE_PREFIX = '(?:(?:[-*]|[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)\\)|(?:[a-z]|[ivxlcdm]{2,9})\\.'
        + '|(?:[A-Z]|[IVXLCDM]{2,9})\\.(?=(?:' + GLUED_ATTR_RUN + ')? {2})|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. ))'
        + '(?:' + GLUED_ATTR_RUN + ')? +(?:\\[[ xX\\-_>\\/!?]\\] +)?)+';
    // BALANCED BRACKET TEXT - the body of a link label, an image alt text and a
    // bracketed span. See the long note on Prism's `bracketText`, which this
    // mirrors; the short version is that the spec closes a label at the
    // MATCHING `]` and the scan is escape-aware, while a `[^\]]*` body closes
    // at the FIRST `]`. That left `![t[z]](/i.png)` - an image - entirely
    // unscoped, and scoped the unbalanced `[t[z](/u)` from the outer `[` where
    // the engine reads `[t` as prose (carve-grammars#226).
    //
    // The nesting is unrolled to FOUR levels because a regex cannot count;
    // deeper stays unscoped, which is what every depth did before.
    //
    // Every quantifier here is BOUNDED, for the reason Prism's copy gives: an
    // unbounded body is a scan to the end of the document at every `[` the
    // tokenizer tries, and it tries each position.
    const BRACKET_CHAR = /(?:[^\[\]\\]|\\[\s\S])/.source;
    const BRACKET_SCAN = '{0,512}';
    let BRACKET_TEXT = BRACKET_CHAR + BRACKET_SCAN;
    for (let depth = 0; depth < 3; depth++) {
        BRACKET_TEXT = '(?:' + BRACKET_CHAR + '|\\[' + BRACKET_TEXT + '\\])' + BRACKET_SCAN;
    }
    // The same body, required to be non-empty, for the rules that reject `[]`.
    const BRACKET_TEXT_NONEMPTY = '(?!\\])' + BRACKET_TEXT;

    const BRACED_KINDS = ['\\*', '/', '_', '\\^', ',', '~', '=', '\\+', '-', '#', '%'];
    const bracedSource = (kinds) => '\\{(?:'
        + kinds.map((kind) => kind + '(?:[^' + kind + '\\n]|' + kind + '(?!\\})){1,4096}' + kind).join('|')
        + ')\\}';
    const OPAQUE_BRACED_SOURCE = bracedSource(BRACED_KINDS);
    // A braced emphasis span nests its own kind (carve#2904), and `{**}` is
    // literal text that never closes the run around it. The body never reads
    // `{` before its own delimiter as text, so the scan stays unambiguous.
    const sameKindBraced = (kind, depth) => '\\{' + kind + '(?!' + kind + '\\})(?:'
        + '\\\\[^\\n]|[^' + kind + '\\n{\\\\]|' + kind + '(?!\\})|\\n(?![ \\t\\r]*\\n)'
        + '|\\{' + kind + kind + '\\}|\\{(?!' + kind + ')'
        + (depth > 0 ? '|' + sameKindBraced(kind, depth - 1) : '')
        + '){1,4096}' + kind + '\\}';
    const sameKindAtoms = (kind) => '\\{' + kind + kind + '\\}|' + sameKindBraced(kind, 3);
    // Link destinations and autolinks are opaque too (PART 9 section 9 E2a), so
    // `/see [x](http://a.b/c/) now/` does not close at the `/` before `)`.
    // Each part accepts only what its production does: a complete label before
    // `](` (`link_text`, four levels deep), the destination and title escapes,
    // one space before a title, and the `url_char` and `email_autolink`
    // alphabets. Parentheses nest two levels inside a destination.
    const LABEL_LINE_END = String.raw`\n(?![ \t]*\n)`;
    const LABEL_COMMENT = String.raw`#(?:[^#\n]|#(?!\})|` + LABEL_LINE_END + String.raw`){1,512}#\}`;
    const LABEL_CODE = [3, 2, 1].map((n) => {
        const run = '```'.slice(0, n);
        return run + '(?:[^`\\n]|' + (n > 1 ? '`(?!' + run.slice(1) + ')|' : '') + LABEL_LINE_END + '){1,512}' + run + '(?!`)';
    }).join('|');
    const LABEL_CHAR = String.raw`\\(?:[^\n]|(?=\n))|` + LABEL_CODE + String.raw`|\{` + LABEL_COMMENT
        + String.raw`|\{(?!` + LABEL_COMMENT + ')|[^\\[\\]\\\\`{\\n]|' + LABEL_LINE_END;
    let OPAQUE_LABEL = '(?:' + LABEL_CHAR + '){0,512}';
    for (let depth = 0; depth < 3; depth++) {
        OPAQUE_LABEL = '(?:' + LABEL_CHAR + String.raw`|\[` + OPAQUE_LABEL + String.raw`\]){0,512}`;
    }
    // `email_autolink` letters are Unicode letters. Without the `u` flag any
    // non-ASCII character that is not whitespace stands in for one.
    const emailClass = (chars) => String.raw`(?:[A-Za-z` + chars + String.raw`]|[^\x00-\x7F\s])`;
    const DEST_CHAR = String.raw`\\[()\\]|\\(?![()\\])|[^ \t\r\n()\\]`;
    const DESTINATION = '(?:' + DEST_CHAR + String.raw`|\((?:` + DEST_CHAR + String.raw`|\((?:` + DEST_CHAR + String.raw`){0,256}\)){0,256}\)){0,2048}`;
    const titled = (quote) => quote + String.raw`(?:\\` + quote + String.raw`|\\(?!` + quote + ')|[^' + quote + String.raw`\\\r\n]){0,512}` + quote;
    // A destination is never empty (carve#2070): `[x]()` and `[x]( "t")` are text.
    const LINK_TAIL = String.raw`\]\((?:` + String.raw`(?![ \t\r\n)])` + DESTINATION
        + '(?: (?:' + titled('"') + '|' + titled("'") + '))?'
        + '|[ \\t]*(?=\\))| (?:' + titled('"') + '|' + titled("'") + ')[ \\t]*)\\)';
    // `url_char` outside ASCII excludes C1 controls, White_Space and format
    // characters; a format character above the BMP is caught at its surrogates.
    const URL_CHAR = String.raw`(?:[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]`
        + String.raw`|(?!\uD804[\uDCBD\uDCCD]|\uD80D[\uDC30-\uDC3F]|\uD82F[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC01\uDC20-\uDC7F])`
        + String.raw`[^\x00-\xA0\xAD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u1680\u180E\u2000-\u200F\u2028-\u202F\u205F-\u2064\u2066-\u206F\u3000\uFEFF\uFFF9-\uFFFB])`;
    const OPAQUE_INLINE_SOURCE = '(?:' + OPAQUE_BRACED_SOURCE
        + String.raw`|\[` + OPAQUE_LABEL + LINK_TAIL
        + String.raw`|<[a-zA-Z][a-zA-Z0-9+.\-]{0,2047}:` + URL_CHAR + '{1,2048}>'
        + '|<' + emailClass(String.raw`0-9\-_.+`) + String.raw`{1,512}@(?:` + emailClass(String.raw`0-9\-_`) + String.raw`{1,512}\.){1,64}` + emailClass('') + '{1,512}>'
        + ')';
    // A bare run as markup-carve/vscode-carve#258 reads it: a closed code span
    // and a braced span of another kind are atoms, a delimiter of its own kind
    // is body text where it cannot close, and the closer needs no letter or
    // digit after it. Without the `u` flag, any non-ASCII character counts as
    // a letter.
    // C2-I-127: a Unicode letter or number, written without the `u` flag; scripts/word-character-class.mjs generates it.
    const WORD_CHARACTER = '(?:[0-9A-Za-z\\u00AA\\u00B2\\u00B3\\u00B5\\u00B9\\u00BA\\u00BC-\\u00BE\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02C1\\u02C6-\\u02D1\\u02E0-\\u02E4\\u02EC\\u02EE\\u0370-\\u0374\\u0376\\u0377\\u037A-\\u037D\\u037F\\u0386\\u0388-\\u038A\\u038C\\u038E-\\u03A1\\u03A3-\\u03F5\\u03F7-\\u0481\\u048A-\\u052F\\u0531-\\u0556\\u0558\\u0559\\u0560-\\u0588\\u058B\\u058C\\u05D0-\\u05EA\\u05EF-\\u05F2\\u0620-\\u064A\\u0660-\\u0669\\u066E\\u066F\\u0671-\\u06D3\\u06D5\\u06E5\\u06E6\\u06EE-\\u06FC\\u06FF\\u0710\\u0712-\\u072F\\u074D-\\u07A5\\u07B1\\u07C0-\\u07EA\\u07F4\\u07F5\\u07FA\\u0800-\\u0815\\u081A\\u0824\\u0828\\u0840-\\u0858\\u0860-\\u086A\\u0870-\\u0887\\u0889-\\u088F\\u08A0-\\u08C9\\u0904-\\u0939\\u093D\\u0950\\u0958-\\u0961\\u0966-\\u096F\\u0971-\\u0980\\u0985-\\u098C\\u098F\\u0990\\u0993-\\u09A8\\u09AA-\\u09B0\\u09B2\\u09B6-\\u09B9\\u09BD\\u09CE\\u09DC\\u09DD\\u09DF-\\u09E1\\u09E6-\\u09F1\\u09F4-\\u09F9\\u09FC\\u0A05-\\u0A0A\\u0A0F\\u0A10\\u0A13-\\u0A28\\u0A2A-\\u0A30\\u0A32\\u0A33\\u0A35\\u0A36\\u0A38\\u0A39\\u0A59-\\u0A5C\\u0A5E\\u0A66-\\u0A6F\\u0A72-\\u0A74\\u0A85-\\u0A8D\\u0A8F-\\u0A91\\u0A93-\\u0AA8\\u0AAA-\\u0AB0\\u0AB2\\u0AB3\\u0AB5-\\u0AB9\\u0ABD\\u0AD0\\u0AE0\\u0AE1\\u0AE6-\\u0AEF\\u0AF9\\u0B05-\\u0B0C\\u0B0F\\u0B10\\u0B13-\\u0B28\\u0B2A-\\u0B30\\u0B32\\u0B33\\u0B35-\\u0B39\\u0B3D\\u0B5C\\u0B5D\\u0B5F-\\u0B61\\u0B66-\\u0B6F\\u0B71-\\u0B77\\u0B83\\u0B85-\\u0B8A\\u0B8E-\\u0B90\\u0B92-\\u0B95\\u0B99\\u0B9A\\u0B9C\\u0B9E\\u0B9F\\u0BA3\\u0BA4\\u0BA8-\\u0BAA\\u0BAE-\\u0BB9\\u0BD0\\u0BE6-\\u0BF2\\u0C05-\\u0C0C\\u0C0E-\\u0C10\\u0C12-\\u0C28\\u0C2A-\\u0C39\\u0C3D\\u0C58-\\u0C5A\\u0C5C\\u0C5D\\u0C60\\u0C61\\u0C66-\\u0C6F\\u0C78-\\u0C7E\\u0C80\\u0C85-\\u0C8C\\u0C8E-\\u0C90\\u0C92-\\u0CA8\\u0CAA-\\u0CB3\\u0CB5-\\u0CB9\\u0CBD\\u0CDC-\\u0CDE\\u0CE0\\u0CE1\\u0CE6-\\u0CEF\\u0CF1\\u0CF2\\u0D04-\\u0D0C\\u0D0E-\\u0D10\\u0D12-\\u0D3A\\u0D3D\\u0D4E\\u0D54-\\u0D56\\u0D58-\\u0D61\\u0D66-\\u0D78\\u0D7A-\\u0D7F\\u0D85-\\u0D96\\u0D9A-\\u0DB1\\u0DB3-\\u0DBB\\u0DBD\\u0DC0-\\u0DC6\\u0DE6-\\u0DEF\\u0E01-\\u0E30\\u0E32\\u0E33\\u0E40-\\u0E46\\u0E50-\\u0E59\\u0E81\\u0E82\\u0E84\\u0E86-\\u0E8A\\u0E8C-\\u0EA3\\u0EA5\\u0EA7-\\u0EB0\\u0EB2\\u0EB3\\u0EBD\\u0EC0-\\u0EC4\\u0EC6\\u0ED0-\\u0ED9\\u0EDC-\\u0EDF\\u0F00\\u0F20-\\u0F33\\u0F40-\\u0F47\\u0F49-\\u0F6C\\u0F88-\\u0F8C\\u1000-\\u102A\\u103F-\\u1049\\u1050-\\u1055\\u105A-\\u105D\\u1061\\u1065\\u1066\\u106E-\\u1070\\u1075-\\u1081\\u108E\\u1090-\\u1099\\u10A0-\\u10C5\\u10C7\\u10CD\\u10D0-\\u10FA\\u10FC-\\u1248\\u124A-\\u124D\\u1250-\\u1256\\u1258\\u125A-\\u125D\\u1260-\\u1288\\u128A-\\u128D\\u1290-\\u12B0\\u12B2-\\u12B5\\u12B8-\\u12BE\\u12C0\\u12C2-\\u12C5\\u12C8-\\u12D6\\u12D8-\\u1310\\u1312-\\u1315\\u1318-\\u135A\\u1369-\\u137C\\u1380-\\u138F\\u13A0-\\u13F5\\u13F8-\\u13FD\\u1401-\\u166C\\u166F-\\u167F\\u1681-\\u169A\\u16A0-\\u16EA\\u16EE-\\u16F8\\u1700-\\u1711\\u171F-\\u1731\\u1740-\\u1751\\u1760-\\u176C\\u176E-\\u1770\\u1780-\\u17B3\\u17D7\\u17DC\\u17E0-\\u17E9\\u17F0-\\u17F9\\u1810-\\u1819\\u1820-\\u1878\\u1880-\\u1884\\u1887-\\u18A8\\u18AA\\u18B0-\\u18F5\\u1900-\\u191E\\u1946-\\u196D\\u1970-\\u1974\\u1980-\\u19AB\\u19B0-\\u19C9\\u19D0-\\u19DA\\u1A00-\\u1A16\\u1A20-\\u1A54\\u1A80-\\u1A89\\u1A90-\\u1A99\\u1AA7\\u1B05-\\u1B33\\u1B45-\\u1B4C\\u1B50-\\u1B59\\u1B83-\\u1BA0\\u1BAE-\\u1BE5\\u1C00-\\u1C23\\u1C40-\\u1C49\\u1C4D-\\u1C7D\\u1C80-\\u1C8A\\u1C90-\\u1CBA\\u1CBD-\\u1CBF\\u1CE9-\\u1CEC\\u1CEE-\\u1CF3\\u1CF5\\u1CF6\\u1CFA\\u1D00-\\u1DBF\\u1E00-\\u1F15\\u1F18-\\u1F1D\\u1F20-\\u1F45\\u1F48-\\u1F4D\\u1F50-\\u1F57\\u1F59\\u1F5B\\u1F5D\\u1F5F-\\u1F7D\\u1F80-\\u1FB4\\u1FB6-\\u1FBC\\u1FBE\\u1FC2-\\u1FC4\\u1FC6-\\u1FCC\\u1FD0-\\u1FD3\\u1FD6-\\u1FDB\\u1FE0-\\u1FEC\\u1FF2-\\u1FF4\\u1FF6-\\u1FFC\\u2070\\u2071\\u2074-\\u2079\\u207F-\\u2089\\u208F-\\u209F\\u2102\\u2107\\u210A-\\u2113\\u2115\\u2119-\\u211D\\u2124\\u2126\\u2128\\u212A-\\u212D\\u212F-\\u2139\\u213C-\\u213F\\u2145-\\u2149\\u214E\\u2150-\\u2189\\u2460-\\u249B\\u24EA-\\u24FF\\u2776-\\u2793\\u2C00-\\u2CE4\\u2CEB-\\u2CEE\\u2CF2\\u2CF3\\u2CFD\\u2D00-\\u2D25\\u2D27\\u2D2D\\u2D30-\\u2D67\\u2D6F\\u2D80-\\u2D96\\u2DA0-\\u2DA6\\u2DA8-\\u2DAE\\u2DB0-\\u2DB6\\u2DB8-\\u2DBE\\u2DC0-\\u2DC6\\u2DC8-\\u2DCE\\u2DD0-\\u2DD6\\u2DD8-\\u2DDE\\u2E2F\\u3005-\\u3007\\u3021-\\u3029\\u3031-\\u3035\\u3038-\\u303C\\u3041-\\u3096\\u309D-\\u309F\\u30A1-\\u30FA\\u30FC-\\u30FF\\u3105-\\u312F\\u3131-\\u318E\\u3192-\\u3195\\u31A0-\\u31BF\\u31F0-\\u31FF\\u3220-\\u3229\\u3248-\\u324F\\u3251-\\u325F\\u3280-\\u3289\\u32B1-\\u32BF\\u3400-\\u4DBF\\u4E00-\\uA48C\\uA4D0-\\uA4FD\\uA500-\\uA60C\\uA610-\\uA62B\\uA640-\\uA66E\\uA67F-\\uA69D\\uA6A0-\\uA6EF\\uA717-\\uA71F\\uA722-\\uA788\\uA78B-\\uA7DD\\uA7E2\\uA7F1-\\uA801\\uA803-\\uA805\\uA807-\\uA80A\\uA80C-\\uA822\\uA830-\\uA835\\uA840-\\uA873\\uA882-\\uA8B3\\uA8D0-\\uA8D9\\uA8F2-\\uA8F7\\uA8FB\\uA8FD\\uA8FE\\uA900-\\uA925\\uA930-\\uA946\\uA960-\\uA97C\\uA984-\\uA9B2\\uA9CF-\\uA9D9\\uA9E0-\\uA9E4\\uA9E6-\\uA9FE\\uAA00-\\uAA28\\uAA40-\\uAA42\\uAA44-\\uAA4B\\uAA50-\\uAA59\\uAA60-\\uAA76\\uAA7A\\uAA7E-\\uAAAF\\uAAB1\\uAAB5\\uAAB6\\uAAB9-\\uAABD\\uAAC0\\uAAC2\\uAADB-\\uAADD\\uAAE0-\\uAAEA\\uAAF2-\\uAAF4\\uAB01-\\uAB06\\uAB09-\\uAB0E\\uAB11-\\uAB16\\uAB20-\\uAB26\\uAB28-\\uAB2E\\uAB30-\\uAB5A\\uAB5C-\\uAB69\\uAB6C\\uAB6D\\uAB70-\\uABE2\\uABF0-\\uABF9\\uAC00-\\uD7A3\\uD7B0-\\uD7C6\\uD7CB-\\uD7FB\\uF900-\\uFA6D\\uFA70-\\uFAD9\\uFB00-\\uFB06\\uFB13-\\uFB17\\uFB1D\\uFB1F-\\uFB28\\uFB2A-\\uFB36\\uFB38-\\uFB3C\\uFB3E\\uFB40\\uFB41\\uFB43\\uFB44\\uFB46-\\uFBB1\\uFBD3-\\uFD3D\\uFD50-\\uFD8F\\uFD92-\\uFDC7\\uFDF0-\\uFDFB\\uFE70-\\uFE74\\uFE76-\\uFEFC\\uFF10-\\uFF19\\uFF21-\\uFF3A\\uFF41-\\uFF5A\\uFF66-\\uFFBE\\uFFC2-\\uFFC7\\uFFCA-\\uFFCF\\uFFD2-\\uFFD7\\uFFDA-\\uFFDC]|[\\uD800][\\uDC00-\\uDC0B\\uDC0D-\\uDC26\\uDC28-\\uDC3A\\uDC3C\\uDC3D\\uDC3F-\\uDC4D\\uDC50-\\uDC5D\\uDC80-\\uDCFA\\uDD07-\\uDD33\\uDD40-\\uDD78\\uDD8A\\uDD8B\\uDE80-\\uDE9C\\uDEA0-\\uDED0\\uDEE1-\\uDEFB\\uDF00-\\uDF23\\uDF2D-\\uDF4A\\uDF50-\\uDF75\\uDF80-\\uDF9D\\uDFA0-\\uDFC3\\uDFC8-\\uDFCF\\uDFD1-\\uDFD5]|[\\uD801][\\uDC00-\\uDC9D\\uDCA0-\\uDCA9\\uDCB0-\\uDCD3\\uDCD8-\\uDCFB\\uDD00-\\uDD27\\uDD30-\\uDD63\\uDD70-\\uDD7A\\uDD7C-\\uDD8A\\uDD8C-\\uDD92\\uDD94\\uDD95\\uDD97-\\uDDA1\\uDDA3-\\uDDB1\\uDDB3-\\uDDB9\\uDDBB\\uDDBC\\uDDC0-\\uDDF3\\uDE00-\\uDF36\\uDF40-\\uDF55\\uDF60-\\uDF67\\uDF80-\\uDF85\\uDF87-\\uDFB0\\uDFB2-\\uDFBF]|[\\uD802][\\uDC00-\\uDC05\\uDC08\\uDC0A-\\uDC35\\uDC37\\uDC38\\uDC3C\\uDC3F-\\uDC55\\uDC58-\\uDC76\\uDC79-\\uDC9E\\uDCA7-\\uDCAF\\uDCE0-\\uDCF2\\uDCF4\\uDCF5\\uDCFB-\\uDD1B\\uDD20-\\uDD39\\uDD40-\\uDD59\\uDD80-\\uDDB7\\uDDBC-\\uDDCF\\uDDD2-\\uDE00\\uDE10-\\uDE13\\uDE15-\\uDE17\\uDE19-\\uDE35\\uDE40-\\uDE48\\uDE60-\\uDE7E\\uDE80-\\uDE9F\\uDEC0-\\uDEC7\\uDEC9-\\uDEE4\\uDEEB-\\uDEEF\\uDF00-\\uDF35\\uDF40-\\uDF55\\uDF58-\\uDF72\\uDF78-\\uDF91\\uDFA9-\\uDFAF]|[\\uD803][\\uDC00-\\uDC48\\uDC80-\\uDCB2\\uDCC0-\\uDCF2\\uDCFA-\\uDD23\\uDD30-\\uDD39\\uDD40-\\uDD65\\uDD6F-\\uDD85\\uDE60-\\uDE7E\\uDE80-\\uDEA9\\uDEB0\\uDEB1\\uDEC2-\\uDEC7\\uDED9-\\uDEEE\\uDF00-\\uDF27\\uDF30-\\uDF45\\uDF51-\\uDF54\\uDF70-\\uDF81\\uDFB0-\\uDFCB\\uDFE0-\\uDFF6]|[\\uD804][\\uDC03-\\uDC37\\uDC52-\\uDC6F\\uDC71\\uDC72\\uDC75\\uDC83-\\uDCAF\\uDCD0-\\uDCE8\\uDCF0-\\uDCF9\\uDD03-\\uDD26\\uDD36-\\uDD3F\\uDD44\\uDD47\\uDD50-\\uDD72\\uDD76\\uDD83-\\uDDB2\\uDDC1-\\uDDC4\\uDDD0-\\uDDDA\\uDDDC\\uDDE1-\\uDDF4\\uDE00-\\uDE11\\uDE13-\\uDE2B\\uDE3F\\uDE40\\uDE80-\\uDE86\\uDE88\\uDE8A-\\uDE8D\\uDE8F-\\uDE9D\\uDE9F-\\uDEA8\\uDEB0-\\uDEDE\\uDEF0-\\uDEF9\\uDF05-\\uDF0C\\uDF0F\\uDF10\\uDF13-\\uDF28\\uDF2A-\\uDF30\\uDF32\\uDF33\\uDF35-\\uDF39\\uDF3D\\uDF50\\uDF5D-\\uDF61\\uDF80-\\uDF89\\uDF8B\\uDF8E\\uDF90-\\uDFB5\\uDFB7\\uDFD1\\uDFD3]|[\\uD805][\\uDC00-\\uDC34\\uDC47-\\uDC4A\\uDC50-\\uDC59\\uDC5F-\\uDC61\\uDC80-\\uDCAF\\uDCC4\\uDCC5\\uDCC7\\uDCD0-\\uDCD9\\uDD80-\\uDDAE\\uDDD8-\\uDDDB\\uDE00-\\uDE2F\\uDE44\\uDE50-\\uDE59\\uDE80-\\uDEAA\\uDEB8\\uDEC0-\\uDEC9\\uDED0-\\uDEE3\\uDF00-\\uDF1A\\uDF30-\\uDF3B\\uDF40-\\uDF46]|[\\uD806][\\uDC00-\\uDC2B\\uDCA0-\\uDCF2\\uDCFF-\\uDD06\\uDD09\\uDD0C-\\uDD13\\uDD15\\uDD16\\uDD18-\\uDD2F\\uDD3F\\uDD41\\uDD50-\\uDD59\\uDDA0-\\uDDA7\\uDDAA-\\uDDD0\\uDDE1\\uDDE3\\uDE00\\uDE0B-\\uDE32\\uDE3A\\uDE50\\uDE5C-\\uDE89\\uDE9D\\uDEB0-\\uDEF8\\uDF0A\\uDFC0-\\uDFE0\\uDFF0-\\uDFF9]|[\\uD807][\\uDC00-\\uDC08\\uDC0A-\\uDC2E\\uDC40\\uDC50-\\uDC6C\\uDC72-\\uDC8F\\uDD00-\\uDD06\\uDD08\\uDD09\\uDD0B-\\uDD30\\uDD46\\uDD50-\\uDD59\\uDD60-\\uDD65\\uDD67\\uDD68\\uDD6A-\\uDD89\\uDD98\\uDDA0-\\uDDA9\\uDDB0-\\uDDDB\\uDDE0-\\uDDE9\\uDDF1\\uDEE0-\\uDEF2\\uDF02\\uDF04-\\uDF10\\uDF12-\\uDF33\\uDF50-\\uDF59\\uDFB0\\uDFC0-\\uDFD4]|[\\uD808][\\uDC00-\\uDF99]|[\\uD809][\\uDC00-\\uDC6F\\uDC75-\\uDD43\\uDD50-\\uDE86]|[\\uD80B][\\uDF90-\\uDFF0]|[\\uD80C\\uD80E\\uD80F\\uD81C-\\uD822\\uD840-\\uD868\\uD86A-\\uD86D\\uD86F-\\uD872\\uD874-\\uD879\\uD880-\\uD883\\uD885-\\uD88C\\uD8B4-\\uD8BE][\\uDC00-\\uDFFF]|[\\uD80D][\\uDC00-\\uDC2F\\uDC41-\\uDC46\\uDC60-\\uDFFF]|[\\uD810][\\uDC00-\\uDFFA]|[\\uD811][\\uDC00-\\uDE46]|[\\uD818][\\uDD00-\\uDD1D\\uDD30-\\uDD39]|[\\uD81A][\\uDC00-\\uDE38\\uDE40-\\uDE5E\\uDE60-\\uDE69\\uDE70-\\uDEBE\\uDEC0-\\uDEC9\\uDED0-\\uDEED\\uDF00-\\uDF2F\\uDF40-\\uDF43\\uDF50-\\uDF59\\uDF5B-\\uDF61\\uDF63-\\uDF77\\uDF7D-\\uDF8F]|[\\uD81B][\\uDD40-\\uDD6C\\uDD70-\\uDD79\\uDE40-\\uDE96\\uDEA0-\\uDEB8\\uDEBB-\\uDED3\\uDF00-\\uDF4A\\uDF50\\uDF93-\\uDF9F\\uDFE0\\uDFE1\\uDFE3\\uDFF2-\\uDFF6]|[\\uD823][\\uDC00-\\uDCDA\\uDCFF-\\uDD20\\uDD80-\\uDDF2\\uDE00-\\uDFFF]|[\\uD824][\\uDC00-\\uDD91\\uDDA0-\\uDDD2]|[\\uD82B][\\uDFF0-\\uDFF3\\uDFF5-\\uDFFB\\uDFFD\\uDFFE]|[\\uD82C][\\uDC00-\\uDD28\\uDD32\\uDD50-\\uDD52\\uDD55\\uDD64-\\uDD68\\uDD70-\\uDEFB]|[\\uD82F][\\uDC00-\\uDC6A\\uDC70-\\uDC7C\\uDC80-\\uDC88\\uDC90-\\uDC99]|[\\uD833][\\uDCF0-\\uDCF9]|[\\uD834][\\uDEC0-\\uDED3\\uDEE0-\\uDEF3\\uDF60-\\uDF78]|[\\uD835][\\uDC00-\\uDC54\\uDC56-\\uDC9C\\uDC9E\\uDC9F\\uDCA2\\uDCA5\\uDCA6\\uDCA9-\\uDCAC\\uDCAE-\\uDCB9\\uDCBB\\uDCBD-\\uDCC3\\uDCC5-\\uDD05\\uDD07-\\uDD0A\\uDD0D-\\uDD14\\uDD16-\\uDD1C\\uDD1E-\\uDD39\\uDD3B-\\uDD3E\\uDD40-\\uDD44\\uDD46\\uDD4A-\\uDD50\\uDD52-\\uDEA6\\uDEA8-\\uDEC0\\uDEC2-\\uDEDA\\uDEDC-\\uDEFA\\uDEFC-\\uDF14\\uDF16-\\uDF34\\uDF36-\\uDF4E\\uDF50-\\uDF6E\\uDF70-\\uDF88\\uDF8A-\\uDFA8\\uDFAA-\\uDFC2\\uDFC4-\\uDFCB\\uDFCE-\\uDFFF]|[\\uD837][\\uDF00-\\uDF81\\uDF90-\\uDF96\\uDFCD-\\uDFFF]|[\\uD838][\\uDC30-\\uDC6D\\uDD00-\\uDD2C\\uDD37-\\uDD3D\\uDD40-\\uDD49\\uDD4E\\uDE90-\\uDEAD\\uDEC0-\\uDEEB\\uDEF0-\\uDEF9]|[\\uD839][\\uDCD0-\\uDCEB\\uDCF0-\\uDCF9\\uDDD0-\\uDDED\\uDDF0-\\uDDFA\\uDEC0-\\uDEDE\\uDEE0-\\uDEE2\\uDEE4\\uDEE5\\uDEE7-\\uDEED\\uDEF0-\\uDEF4\\uDEFE\\uDEFF\\uDFE0-\\uDFE6\\uDFE8-\\uDFEB\\uDFED\\uDFEE\\uDFF0-\\uDFFE]|[\\uD83A][\\uDC00-\\uDCC4\\uDCC7-\\uDCCF\\uDD00-\\uDD43\\uDD4B\\uDD50-\\uDD59]|[\\uD83B][\\uDC71-\\uDCAB\\uDCAD-\\uDCAF\\uDCB1-\\uDCB4\\uDD01-\\uDD2D\\uDD2F-\\uDD3D\\uDE00-\\uDE03\\uDE05-\\uDE1F\\uDE21\\uDE22\\uDE24\\uDE27\\uDE29-\\uDE32\\uDE34-\\uDE37\\uDE39\\uDE3B\\uDE42\\uDE47\\uDE49\\uDE4B\\uDE4D-\\uDE4F\\uDE51\\uDE52\\uDE54\\uDE57\\uDE59\\uDE5B\\uDE5D\\uDE5F\\uDE61\\uDE62\\uDE64\\uDE67-\\uDE6A\\uDE6C-\\uDE72\\uDE74-\\uDE77\\uDE79-\\uDE7C\\uDE7E\\uDE80-\\uDE89\\uDE8B-\\uDE9B\\uDEA1-\\uDEA3\\uDEA5-\\uDEA9\\uDEAB-\\uDEBB]|[\\uD83C][\\uDD00-\\uDD0C]|[\\uD83E][\\uDFF0-\\uDFF9]|[\\uD869][\\uDC00-\\uDEDF\\uDF00-\\uDFFF]|[\\uD86E][\\uDC00-\\uDC1E\\uDC20-\\uDFFF]|[\\uD873][\\uDC00-\\uDEAD\\uDEB0-\\uDFFF]|[\\uD87A][\\uDC00-\\uDFE0\\uDFF0-\\uDFFF]|[\\uD87B][\\uDC00-\\uDE5D]|[\\uD87E][\\uDC00-\\uDE1D]|[\\uD884][\\uDC00-\\uDF4A\\uDF50-\\uDFFF]|[\\uD88D][\\uDC00-\\uDC79]|[\\uD8BF][\\uDC00-\\uDC3F])';
    const LETTER_OR_DIGIT = WORD_CHARACTER;
    // A delimiter before one of these is part of a larger character, not a delimiter.
    const GRAPHEME_EXTENDER = '[\\u0300-\\u036F\\u1AB0-\\u1AFF\\u1DC0-\\u1DFF\\u200D\\u20D0-\\u20FF\\uFE00-\\uFE0F\\uFE20-\\uFE2F]';
    // C2-I-026: the characters on the two sides of braced comments are tested as if glued.
    const BRACED_COMMENTS = '(?:\\{%(?:[^%]|%(?!\\})){0,4096}?%\\})*';
    const BARE_CODE = '```(?:[^`\\n]|`(?!``)){1,4096}```(?!`)|``(?:[^`\\n]|`(?!`)){1,4096}``(?!`)|`[^`\\n]{1,4096}`(?!`)';
    // The `=` of a comparison neither opens nor closes (PART 9 §9).
    const bareCloser = (d) => `(?<=\\S)(?<!\\s(?=\\{%)${BRACED_COMMENTS})${d === '=' ? '(?<!(?<!\\\\)(?:\\\\\\\\){0,32}[>!])(?:(?<!(?<!\\\\)(?:\\\\\\\\){0,32}<)=|=(?=[=>]))' : d}(?!${BRACED_COMMENTS}${LETTER_OR_DIGIT})`;
    // A braced span's body: a braced span of another kind, a closed code span
    // and a link destination or autolink are atoms, so the closer is the first
    // one outside all three. An insertion or deletion (`atoms` false) closes at
    // its first closer.
    const DESTINATION_SOURCE = OPAQUE_INLINE_SOURCE.replace(OPAQUE_BRACED_SOURCE + '|', '');
    const braced = (d, opener, atoms = true) => {
        const atom = '(?:' + (atoms ? sameKindAtoms(d) + '|' + bracedSource(BRACED_KINDS.filter((kind) => kind !== d)) + '|' : '')
            + `${BARE_CODE}|${DESTINATION_SOURCE})`;
        // The cheap scan, tempered on the delimiter, fails fast where no closer
        // exists at all.
        const run = `(?:[^${d}\\n]|\\n(?![ \\t]*\\n)){0,4096}`;
        const cheap = `${run}(?:${d}(?!\\})${run}){0,32}${d}\\}`;
        const body = `(?:${atom}|\\\\(?:[^\\n]|\\n(?![ \\t]*\\n))|(?!${atom})[^\\n\\\\]|\\n(?![ \\t]*\\n)){0,4096}?`;
        return {
            begin: new RegExp(`${opener.source}(?=${cheap})(?=${body}${d}\\})`),
            end: new RegExp(`${d}\\}`),
        };
    };
    // A whole bare run per delimiter, for a block glued to its closer (carve-grammars#867).
    const BARE_RUNS = [];
    const SPACE_BEFORE_COMMENTS = /\s(?:\{%(?:[^%]|%(?!\}))*%\})+$/;
    const bare = (d, opener) => {
        const opaque = OPAQUE_INLINE_SOURCE.replace(OPAQUE_BRACED_SOURCE, sameKindAtoms(d) + '|' + bracedSource(BRACED_KINDS.filter((kind) => kind !== d)));
        // Keep the whitespace and letter cases disjoint for repeated `*a`.
        // An own delimiter between two word characters ends the run (PART 9 §9 R2).
        const atom = `(?:\\\\(?:[^\\n]|\\n(?![ \\t]*\\n))|${BARE_CODE}|${opaque}|(?<=\\s${BRACED_COMMENTS})${d}(?!${BRACED_COMMENTS}${LETTER_OR_DIGIT})|(?<!${LETTER_OR_DIGIT}${BRACED_COMMENTS})${d}(?=${BRACED_COMMENTS}${LETTER_OR_DIGIT})|(?<=${LETTER_OR_DIGIT})${d}(?=${GRAPHEME_EXTENDER})`
            + `${d === '=' ? '|[>!]=|<=(?![=>])' : ''}|(?!${opaque})[^${d}\\\\\\n\`]|\\n(?![ \\t]*\\n))`;
        // A plain scan for any closer runs first: the atom scan re-reads every
        // braced span from each opener, so openers with no closer went cubic.
        // Tempered on disjoint non-closer cases, so a failure costs one pass.
        const precheck = `(?:[^${d}\\n]|${d === '=' ? '[>!]=|<=(?![=>])|' : ''}\\n(?![ \\t]*\\n)|(?<=\\s)${d}|(?<!\\s)${d}(?=${LETTER_OR_DIGIT})|(?<=%\\})${d}|${d}(?=\\{%)){0,4096}${bareCloser(d)}`;
        // A word before the opener, or a space after it, counts through braced comments.
        opener = new RegExp(`(?<!(?:${LETTER_OR_DIGIT}|${d})(?=\\{%)${BRACED_COMMENTS})${opener.source}(?!(?=\\{%)${BRACED_COMMENTS}\\s)`);
        BARE_RUNS.push([d.replace('\\', ''), new RegExp(`${opener.source}(?=${precheck})${atom}{1,4096}?${bareCloser(d)}`, 'g')]);
        return {
            // 0.2 has no bare underline, strike or highlight; the 0.2 wrapper drops these.
            ...(['_', '~', '='].includes(d) ? { bareSpanOf01: true } : {}),
            // The closer lookaheads run in 'on:begin', behind a per-document
            // closer index: in the begin they scanned up to 4096 characters
            // from every opener with no closer (carve-grammars#1002). Kept on
            // the mode so the grammar-wide regex rewrites reach them.
            begin: opener,
            bareDelimiter: d.replace('\\', ''),
            bareCloser: new RegExp(bareCloser(d), 'y'),
            bareRunAhead: new RegExp(`(?=${precheck})(?=${atom}{1,4096}?${bareCloser(d)})`, 'y'),
            'on:begin': (m, resp) => {
                if (!bareRunCloses(m.rule, m.input, m.index + m[0].length)) resp.ignoreMatch();
            },
            // A lookbehind in `end` never matches in highlight.js, so a delimiter
            // after whitespace is consumed by a content mode instead.
            end: new RegExp(`${d}(?!${BRACED_COMMENTS}${LETTER_OR_DIGIT})`),
            // A space before braced comments makes the delimiter no closer; an end cannot look behind.
            'on:end': (m, resp) => {
                if (m.input[m.index - 1] === '}' && SPACE_BEFORE_COMMENTS.test(m.input.slice(Math.max(0, m.index - 4096), m.index))) resp.ignoreMatch();
            },
        };
    };
    /**
     * A begin/end mode opens its span the moment `begin` matches, whether or
     * not the closer ever arrives - so an unpartnered delimiter colors every
     * remaining character of the document. `:_[x]` is an inline extension, not
     * an underline, and it used to highlight the rest of the file.
     *
     * The lookahead requires the closer to exist before the paragraph ends.
     * The scan admits a non-newline OR a newline that is not followed by a
     * blank line, so a mark may still span lines the way the engine does
     * (`/multi<newline>line/` is one <em>) but cannot reach into the next
     * block. The two branches start on disjoint characters, so the run is
     * effectively deterministic rather than a backtracking hazard.
     *
     * @param {RegExp} opener - the delimiter that starts the span.
     * @param {RegExp} closer - the delimiter that ends it.
     * @returns {object} the mode's `begin`/`end` pair, so the closer used by
     *   the guard and the closer used by the mode cannot drift apart.
     */
    const paired = (opener, closer) => {
        // The guard used to be written `(?:[^\n]|\n(?!\s*\n))*?` - unbounded,
        // lazy, and free to cross newlines. Proving there is NO closer therefore
        // cost a whole paragraph from every position, and a document made of
        // openers went quadratic in its own length: 400-750 ms on 24 KB across
        // all eight braced modes, x3.3-6.9 per doubling (carve-grammars#300),
        // in a file the package ships. THIRTEEN modes pay it, so this is one
        // site rather than thirteen fixes.
        //
        // Unrolled the way `prism/carve.js` unrolls its brace rules: a run that
        // stops at the closer's own first character, then a bounded repetition
        // of that character NOT starting a closer, plus another such run. Both
        // pieces are DERIVED from the `closer` argument - `lead` is its first
        // (possibly escaped) character, `rest` is everything after it - for the
        // same reason the guard is generated from the closer at all: the
        // tempering and the mode's `end` cannot drift apart.
        //
        // `lead` followed by a negative lookahead on `rest` reads "this
        // delimiter is not the closer". Where `rest` is itself negative
        // (`/=(?![=\w])/`) the double negation means "followed by a word
        // character", which is right - and at end of input it correctly refuses,
        // because there the closer WOULD match.
        //
        // Same language as before within the bounds. Past them the guard fails
        // and the mode does not open, which is the safe direction: an unopened
        // span colors nothing, where an unclosed one used to color the rest of
        // the document.
        const [, lead, rest] = /^(?<![^\r\n])(\\[\s\S]|[\s\S])([\s\S]*)$(?![^\r\n])/.exec(closer.source);
        const literal = lead.length === 2 ? lead[1] : lead;
        const inClass = /[\\\]^-]/.test(literal) ? '\\' + literal : literal;
        const plainAtom = `[^${inClass}\\n]`;
        const run = `(?:${plainAtom}|\\n(?!\\s*\\n)){0,4096}`;
        const guard = `${run}(?:${lead}(?!${rest})${run}){0,32}${closer.source}`;
        return {
            begin: new RegExp(`${opener.source}(?=${guard})`),
            end: closer,
            contains: [],
        };
    };

    // Escaped characters: \* \[ etc
    //
    // DEFINED HERE, above the modes rather than beside HARD_BREAK where it used
    // to sit, because HIGHLIGHT now `contains` it (carve-grammars#390) and a
    // `const` cannot be read before its own declaration.
    const ESCAPE = {
        className: 'symbol',
        begin: /\\(?:[!"#$%&'()*+,.\/:;<=>?@\[\\\]^_`{|}~-]| (?![ \t]*$))/,
        relevance: 0,
    };

    // Forced intraword family (PART 9 S22). Content may contain the delimiter
    // (`{/a/b/}` is <em>a/b</em>), so the run ends at the closing `X}`. These
    // must precede ATTRIBUTE, or `{_path_}` reads as a boolean attribute.
    const FORCED_STRONG = { className: 'strong', ...braced('\\*', /\{\*(?!\*\})/), relevance: 5 };
    const FORCED_EMPHASIS = { className: 'emphasis', ...braced('/', /\{\/(?!\/\})/), relevance: 5 };
    const FORCED_UNDERLINE = { className: 'emphasis', ...braced('_', /\{_(?!_\})/), relevance: 5 };
    const FORCED_STRIKE = {
        className: 'deletion',
        // Forced content may be whitespace, but the empty `{~~}` is literal.
        ...braced('~', /\{~(?!~\})/),
        relevance: 5,
    };

    /*
     * The FIFTH braced spelling, `{=x=}` (grammar.ebnf `forced_highlight`).
     *
     * Its four siblings above each have a mode; this one did not, and the row
     * read UNMEASURED because a name cannot tell `{=x=}` from `=x=` and the
     * only name in the vocabulary was HIGHLIGHT's. Reading the opener answers
     * it: HIGHLIGHT is `(?<![=\w])=(?=\S)`, the BARE rule, with no braced
     * alternative - it claims the inner `=` of `{=x=}` as a side effect and
     * leaves the braces unscoped, which is not the construct being recognized.
     *
     * `paired()` is what keeps this off a raw-inline format marker: `{=html}`
     * has no `=}` ahead of it, so the guard fails and the mode does not open,
     * leaving RAW_FORMAT the `{=[a-zA-Z]+\}` it already matches.
     *
     * Forced content may consist only of whitespace, but the empty `{==}` is
     * literal, like every other empty pair in the family.
     */
    const FORCED_HIGHLIGHT = { className: 'addition', ...braced('=', /\{=(?!=\})/), relevance: 5 };

    const ATTRIBUTE_EMPTY = {
        className: 'attr',
        // Valid only glued to a preceding `]` (`[x]{}`); a bare `{}` is literal.
        begin: /(?<=\])\{\s*\}/,
        relevance: 5,
    };
    // A delimited comment joins no attribute run (carve#2932), so a glued block
    // fails when its run starts right after a comment's `%}`; the opener is
    // required because `{k=a%}` ends an attribute block the same way. Checked
    // only after a block matched; bounded, so a run past 64 blocks scopes its tail.
    // The closer a block glues to is not an escaped character: `x\]{.c}` is text.
    const afterEscape = '(?<!(?<!\\\\)(?:\\\\\\\\){0,32}\\\\[^\\n])';
    const noCommentRun = '(?<!\\{%(?:[^%\\n]|%(?!\\})|\\n(?![ \\t\\r]*\\n)){0,4096}%\\}(?:[ \\t]{0,64}\\{[^{}\\n]{0,512}\\}){1,64})';
    const linkDestinationBeforeAttr = '(?:(?=\\{)(?<=(?<!\\\\)(?:\\\\\\\\){0,32}\\[(?:[^\\[\\]\\\\\\n]|\\\\.){0,4096}\\]\\((?:[^()\\n]|\\([^()\\n]{0,256}\\)|\\([^()\\n]{0,256}\\([^()\\n]{0,256}\\)[^()\\n]{0,256}\\)){0,2048}\\))|(?=\\{)(?<=(?:^(?<![^\\r\\n])|\\n)[^\\[\\]\\n]{0,4096}(?<!(?<!\\\\)(?:\\\\\\\\){0,32}\\\\)\\]\\((?:[^()\\n]|\\([^()\\n]{0,256}\\)|\\([^()\\n]{0,256}\\([^()\\n]{0,256}\\)[^()\\n]{0,256}\\)){0,2048}\\)))';
    const SPAN_ATTRIBUTE = {
        className: 'attr',
        begin: new RegExp('(?=\\{)(?<=(?<!\\\\)(?:\\\\\\\\){0,32}\\[(?:[^\\]\\n\\\\]|\\\\[^\\n])+\\])(?<!\\!\\[[^\\]\\n]+\\])(?<!\\]\\[[^\\]\\n]+\\])\\{(?=(?:[ \t]*' + ATTR_ITEM + '[ \t]+)*[ \t]*(?:kbd(?=[ \t}])|(?:abbr|time)=))(?=[ \t]*' + ATTR_ITEM + '(?:[ \t]+' + ATTR_ITEM + ')*[ \t]*\\})'),
        end: /\}/,
        contains: [
            { className: 'string', begin: /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/ },
            { className: 'built_in', begin: /(?<=[\s{])(?:kbd(?=[\s}])|(?:abbr|time)(?==))/ },
        ],
        relevance: 5,
    };
    // `08-attributes.ebnf` `continuation`: an attribute line wraps only onto a
    // line indented past its `{` column, tabs expanded to stops of 4 (PART 7).
    // One branch per opener column counts both lines exactly. A `{` past
    // ATTR_LINE_COLUMNS takes any continuation past that column and `on:begin`
    // checks the rest: it cannot veto (`ignoreMatch()` is banned here), and the
    // scope it drops leaves that text unhighlighted, so the regex refuses first.
    const ATTR_LINE_COLUMNS = 16;
    const tabStops = (count) => count ? '(?: {4}| {0,3}\\t){' + count + '}' : '';
    const atColumn = (column) => tabStops(column >> 2) + (column & 3 ? ' {' + (column & 3) + '}' : '');
    const pastColumn = (column) => {
        const reach = column + 1;
        return tabStops(reach >> 2) + (reach & 3 ? '(?: {' + (reach & 3) + '}| {0,' + ((reach & 3) - 1) + '}\\t)' : '') + '[ \\t]*';
    };
    const indentColumn = (text, from) => {
        let column = 0;
        for (let at = from; at < text.length; at++) {
            if (text[at] === ' ') column++;
            else if (text[at] === '\t') column += 4 - column % 4;
            else break;
        }
        return column;
    };
    const attrLineBlock = (opener, indent) => '(?=\\{)(?<=(?:^(?<![^\\r\\n])|\\n)' + opener + ')\\{(?!__\\})'
        + '[ \\t]*(?:\\r?\\n' + indent + ')?' + ATTR_ITEM
        + '(?:(?:[ \\t]*\\r?\\n' + indent + '|[ \\t]+)' + ATTR_ITEM + ')*'
        + '[ \\t]*(?:\\r?\\n' + indent + ')?\\}';
    const attrLineBlocks = Array.from({ length: ATTR_LINE_COLUMNS }, (_, column) => attrLineBlock(atColumn(column), pastColumn(column)))
        .concat(attrLineBlock('(' + tabStops(ATTR_LINE_COLUMNS >> 2) + '[ \\t]*)', pastColumn(ATTR_LINE_COLUMNS)))
        .join('|');
    const ATTRIBUTE = {
        className: 'attr',
        // TWO ROLES, ONE TOKEN - see the note on Prism's `attributes`. A standalone
        // attribute LINE may span lines; an inline block glued to a construct may
        // not, so `*x*{.a` + newline + `.b}` used to colour as a block where every
        // engine renders prose (#164). The line-anchored branch is a lookbehind so
        // the match still starts at the `{`.
        begin: new RegExp(
            '(?:' + attrLineBlocks + ')' + '(?=(?:[ \\t]*\\{(?:"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|[^{}"\'\\n])*\\})*[ \\t]*(?:\\n|$(?![^\\r\\n])))'
            + '|(?=\\{)(?:(?<=[*/_~=`>}:\\]$<|])|' + linkDestinationBeforeAttr + ')' + afterEscape + '\\{(?!__\\})[ \\t]*' + ATTR_ITEM + '(?:[ \\t]+' + ATTR_ITEM + ')*[ \\t]*\\}' + noCommentRun
            // Inside a lookbehind the engine reads right to left, so the `(?<=\.)` after
            // each marker lookahead tests the `.` before its 4096-character scan (#988).
            + '|(?=\\{)(?<=(?:^(?<![^\\r\\n])|\\n)[ \\t]*(?:[-+*]|\\d{1,9}[.)]|[A-Za-z]{1,8}(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2})(?<=\\.))|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. )(?<=\\.)))' + '\\{(?!__\\})[ \\t]*' + ATTR_ITEM + '(?:[ \\t]+' + ATTR_ITEM + ')*[ \\t]*\\}'
            + '|(?=\\{)(?<=(?:^(?<![^\\r\\n])|\\n)[ \\t]*(?:[-+*]|\\d{1,9}[.)]|[A-Za-z]{1,8}(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2})(?<=\\.))|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. )(?<=\\.))(?:\\{[^{}\\n]*\\})?(?:[ \\t]+\\[[ xX]\\])?[ \\t]+)' + '\\{(?!__\\})[ \\t]*' + ATTR_ITEM + '(?:[ \\t]+' + ATTR_ITEM + ')*[ \\t]*\\}' + '(?=[ \\t]*(?:\\n|$(?![^\\r\\n])))',
        ),
        // Group 1 is set only on a `{` past ATTR_LINE_COLUMNS. A refused block
        // keeps its match and drops the scope, as `scopeUnless` does.
        'on:begin': (m) => {
            m.rule.scope = attachedAttribute(m.input, m) ? 'attr' : undefined;
        },
        relevance: 5,
    };
    // A block glued to a `}` that closes no forced emphasis needs that `}` to
    // close an attached block: `a}{.b}`, `x {.a}{.b}` and a refused `{.a` + `}`
    // run are text (carve-grammars#847). An empty `{}` joins only a bracketed
    // span's run (`[a]{}{.b}`; `*x*{}{.b}` is text).
    const ATTRIBUTE_PROBE = new RegExp(crlfSource(ATTRIBUTE.begin.source), 'y');
    // The `{` that opens the block a `}` at `close` ends: quoted values are skipped, -1 when none.
    const blockOpener = (source, close) => {
        let open = source.lastIndexOf('{', close - 1);
        if (open === -1 || !/["']/.test(source.slice(open, close))) return open;
        open = -1;
        for (let i = Math.max(0, close - 4096); i < close; i++) {
            const c = source.charAt(i);
            if (c === '\\') { i++; continue; }
            if (c === '{') { open = i; continue; }
            if (c === '}') { open = -1; continue; }
            if (open !== -1 && (c === '"' || c === "'")) {
                let j = i + 1;
                for (; j < close && source.charAt(j) !== c && source.charAt(j) !== '\n'; j++) {
                    if (source.charAt(j) === '\\') j++;
                }
                if (source.charAt(j) === c) i = j;
            }
        }
        return open;
    };
    // The `[` that opens the bracket closed by the `]` before `at`, -1 when none.
    const bracketOpener = (source, at) => {
        let depth = 0;
        for (let i = at - 1, stop = Math.max(0, at - 4096); i >= stop && source.charAt(i) !== '\n'; i--) {
            const c = source.charAt(i);
            if (source.charAt(i - 1) === '\\' && source.charAt(i - 2) !== '\\') { i--; continue; }
            if (c === '`') {
                let run = 1;
                while (source.charAt(i - run) === '`') run++;
                const tick = source.lastIndexOf('`'.repeat(run), i - run);
                const line = source.lastIndexOf('\n', i);
                if (tick > line) { i = tick; continue; }
                i -= run - 1;
                continue;
            }
            if (c === ']') depth++;
            else if (c === '[' && --depth === 0) return i;
        }
        return -1;
    };
    // A bracketed span, not a footnote reference or a reference link (`[a][r]`).
    const closesSpan = (source, at) => {
        const open = bracketOpener(source, at);
        return open !== -1 && source.charAt(open + 1) !== '^' && !(source.charAt(open - 1) === ']' && bracketOpener(source, open) !== -1);
    };
    let hostMemo = { source: null, hosts: null };
    // 'span', 'other', or null when the `}` before `at` closes nothing attached.
    const attributeHost = (source, at) => {
        if (hostMemo.source !== source) hostMemo = { source, hosts: new Map() };
        if (!hostMemo.hosts.has(at)) hostMemo.hosts.set(at, findAttributeHost(source, at));
        return hostMemo.hosts.get(at);
    };
    // A block glued to a bare delimiter needs a run of that kind to close there:
    // `a*{.q}` and `x _a_ b_{.q}` are text (carve-grammars#867). A run crosses
    // soft breaks, so the scan covers the paragraph.
    const paragraphStart = (source, at) => {
        let start = source.lastIndexOf('\n', at - 1) + 1;
        while (start > 0 && at - start < 8192) {
            const previous = source.lastIndexOf('\n', start - 2) + 1;
            if (/^[ \t\r]*$/.test(source.slice(previous, start - 1))) break;
            start = previous;
        }
        return start;
    };
    const paragraphEnd = (source, at) => {
        const blank = /\n[ \t\r]*(?:\n|$)/g;
        blank.lastIndex = at;
        const found = blank.exec(source);
        return Math.min(found ? found.index : source.length, at + 8192);
    };
    // The run scan cannot pass a line break into a blank line, and covers at
    // most 4096 steps of up to two characters, so a closer past either needs
    // no regex (carve-grammars#1002).
    let bareClosers = { source: null, stops: null, closers: null };
    const firstFrom = (list, at) => {
        let low = 0;
        let high = list.length;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (list[mid] < at) low = mid + 1;
            else high = mid;
        }
        return low < list.length ? list[low] : Infinity;
    };
    const bareRunCloses = (rule, source, at) => {
        if (bareClosers.source !== source) bareClosers = { source, stops: null, closers: new Map() };
        if (!bareClosers.stops) {
            bareClosers.stops = [];
            for (const stop of source.matchAll(/\n(?=[ \t]*\r?\n)/g)) bareClosers.stops.push(stop.index);
        }
        const key = rule.bareCloser.source;
        let closers = bareClosers.closers.get(key);
        if (!closers) {
            closers = [];
            for (let i = source.indexOf(rule.bareDelimiter); i !== -1; i = source.indexOf(rule.bareDelimiter, i + 1)) {
                rule.bareCloser.lastIndex = i;
                if (rule.bareCloser.test(source)) closers.push(i);
            }
            bareClosers.closers.set(key, closers);
        }
        const closer = firstFrom(closers, at);
        if (closer - at > 8192 || firstFrom(bareClosers.stops, at) < closer) return false;
        rule.bareRunAhead.lastIndex = at;
        return rule.bareRunAhead.test(source);
    };
    let runEnds = { source: null, windows: null };
    const closesBareRun = (source, at) => {
        if (runEnds.source !== source) runEnds = { source, windows: new Map() };
        const from = paragraphStart(source, at);
        const to = paragraphEnd(source, at);
        const key = from + ':' + to;
        if (!runEnds.windows.has(key)) {
            const found = new Set();
            for (const [d, rule] of BARE_RUNS) {
                rule.lastIndex = from;
                for (let run; (run = rule.exec(source)) && run.index < to;) {
                    // An escaped opener opens nothing: `x \*a*{.q}` is text.
                    let slashes = 0;
                    while (source[run.index - 1 - slashes] === '\\') slashes++;
                    if (slashes % 2) rule.lastIndex = run.index + 1;
                    else found.add(d + (run.index + run[0].length));
                }
            }
            runEnds.windows.set(key, found);
        }
        return runEnds.windows.get(key).has(source[at - 1] + at);
    };
    const findAttributeHost = (source, at) => {
        // The `=` of a header cell marker (`|={.c}`) is no delimiter.
        if (/[*/_~=]/.test(source[at - 1] ?? '') && source.slice(at - 2, at) !== '|=') return closesBareRun(source, at) ? 'other' : null;
        if (source[at - 1] !== '}') return source[at - 1] === ']' && closesSpan(source, at) ? 'span' : 'other';
        const brace = blockOpener(source, at - 1);
        if (brace !== -1) {
            if (/^\{[ \t]*\}$/.test(source.slice(brace, at))) return attributeHost(source, brace) === 'span' ? 'span' : null;
            ATTRIBUTE_PROBE.lastIndex = brace;
            const host = ATTRIBUTE_PROBE.exec(source);
            if (host && brace + host[0].length === at) return attachedAttribute(source, host) ? attributeHost(source, brace) : null;
        }
        return /[*/_~=^,+-]/.test(source[at - 2] ?? '') ? 'other' : null;
    };
    const attachedAttribute = (source, m) => {
        if (m[1] === undefined) return attributeHost(source, m.index) !== null;
        const opener = indentColumn(m[1], 0);
        for (let at = m[0].indexOf('\n'); at !== -1; at = m[0].indexOf('\n', at + 1)) {
            if (indentColumn(m[0], at + 1) <= opener) return false;
        }
        return true;
    };

    // Front matter is valid only at byte offset zero. Unlike the historical
    // `^---$` rule, the negative lookbehind below cannot match a thematic break
    // on a later line even though highlight.js compiles modes with `m`.
    // An opener with no closing dash line runs to the end of the document
    // (carve#5016), so no closer lookahead.
    const FRONT_MATTER_CLOSER = /^(?<![^\r\n])---[ \t]*$(?![^\r\n])/;
    // A typed opener after line 1 also opens a top-level metadata block when a
    // blank line, or attribute lines that follow one or start on line 1, stand
    // directly above it (C2-B-232, C2-B-233); bare `---` stays line-1 only.
    const LINE_ONE = '(?<![\\s\\S])\\uFEFF?';
    const ATTRIBUTE_LINES = '(?:\\{[^{}\\r\\n]*\\}[ \\t]*)+(?:\\r\\n?|\\n)';
    const LATER = '(?=---)(?<=(?:(?<![\\s\\S])|\\r\\n?|\\n)[ \\t]*(?:\\r\\n?|\\n)(?:' + ATTRIBUTE_LINES + ')*|(?<![\\s\\S])\\uFEFF?(?:' + ATTRIBUTE_LINES + ')+)';
    const frontMatterOpener = (format, anchor = LINE_ONE) => new RegExp('^(?<![^\\r\\n])' + anchor + '---' + format + '[ \\t]*$(?![^\\r\\n])');
    const frontMatter = (format, anchor) => ({
        className: 'meta',
        begin: frontMatterOpener(format, anchor),
        end: FRONT_MATTER_CLOSER,
        relevance: 10,
    });
    const delegatedFrontMatter = (format, subLanguage, anchor) => ({
        className: 'meta',
        begin: frontMatterOpener(format, anchor),
        end: /$(?![^\r\n])/,
        relevance: 10,
        starts: {
            end: FRONT_MATTER_CLOSER,
            // The closing dash line is the envelope's, not the payload's.
            endScope: 'meta',
            subLanguage,
        },
    });
    const FRONT_MATTER = [
        delegatedFrontMatter(' ?json', 'json'),
        // highlight.js registers TOML through the canonical `ini` grammar;
        // `toml` is an alias, but subLanguage resolution requires the key.
        delegatedFrontMatter(' ?toml', 'ini'),
        delegatedFrontMatter('(?: ?(?:yaml|yml))?', 'yaml'),
        frontMatter(' ?[A-Za-z0-9]+'),
    ];
    // Top level only: a div body leaves the opener as text (C2-B-232).
    const LATER_METADATA = [
        delegatedFrontMatter(' ?json', 'json', LATER),
        delegatedFrontMatter(' ?toml', 'ini', LATER),
        delegatedFrontMatter(' ?(?:yaml|yml)', 'yaml', LATER),
        frontMatter(' ?[A-Za-z0-9]+', LATER),
    ];

    // Headings: # to ######
    const HEADING = {
        className: 'section',
        // Anchored `^[ \t]*` on purpose - no container model here, see the
        // indented-block-openers note in the module docblock (carve-grammars#138).
        // Or right after a list marker the list rules took (`- # T`, `1. = T`,
        // carve-grammars#945); an uppercase dot marker needs two spaces (C2-B-040).
        begin: RegExp('(?:^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*#{1,6}'
            + '|(?=[#=])(?<=^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*' + MARKER_LINE_PREFIX + ')(?:#{1,6}|={1,6}))'
            + ' (?![ \\t]*$(?![^\\r\\n]))'),
        // A marker that continues a paragraph opens no heading.
        'on:begin': (m, resp) => {
            const start = lineStartBefore(m.input, m.index);
            m.rule.scope = markerIsParagraphText({ input: m.input, index: start }) ? undefined : 'section';
            resp.data.label = { column: columnOf(m.input.slice(start, m.index + m[0].search(/[#=]/))), until: -1 };
        },
        // A heading is a label: it holds every line below it indented past its
        // marker, comment-only lines unseen (C2-B-154, C2-B-234). The end takes
        // the line break, so an ignored end still advances.
        end: /\r\n?|\n/,
        returnEnd: true,
        'on:end': (m, resp) => {
            // A comment-only line below is the heading's own (C2-B-138).
            const next = m.index + m[0].length;
            if (COMMENT_ONLY_LINE.test(lineAt(m.input, next)) || labelContinues(m.input, next, resp.data.label, true)) resp.ignoreMatch();
        },
        relevance: 10,
    };

    // Emphasis (Carve): /text/ - the begin guard avoids URLs and paths (a/b, ://).
    const EMPHASIS = {
        className: 'emphasis',
        ...bare('/', new RegExp(`(?<!${LETTER_OR_DIGIT}|[:/])\\/(?=\\S)(?!\\/)`)),
        relevance: 0,
    };

    // Underline (Carve): _text_ - not in the middle of words
    const UNDERLINE = {
        className: 'emphasis',
        ...bare('_', /(?<![\w/])_(?![\s_])/),
        relevance: 0,
    };

    /*
     * The COMBINED two-character opener `/` + `*` (grammar.ebnf
     * `bold_italic`): the boundary guards apply to the outer slash, and the
     * inner star is part of the token rather than separately guarded.
     *
     * EMPHASIS below already matched the run - its opener is `/` followed by a
     * non-space, and a star is a non-space - so a bold-italic run was scoped
     * `emphasis` - italic and not bold - by the rule for the other construct.
     * That is the shape the ledger calls a row seen wrong rather than a row
     * not covered, and it is why this mode is listed BEFORE both EMPHASIS and
     * STRONG: the two openers begin at the SAME offset, so mode order is what
     * decides.
     *
     * ONE className, because highlight.js has a fixed palette of about twenty
     * theme words and no combined bold-italic among them. `strong` is the half
     * chosen, and it is the half that was missing: the accidental reading was
     * already italic. Prism spells the same compromise `alias: 'important'` and
     * the TextMate family spells it `markup.bold.italic.carve`, one scope each.
     */
    const BOLD_ITALIC = {
        className: 'strong',
        // The body is non-space at BOTH ends. It was guarded only at the
        // opener, so `a /*b */ c` came back one combined run where the engine
        // renders `<em>*b *</em>` - an italic run holding literal asterisks
        // (carve-grammars#375). A fixed-width lookbehind, so the bounded
        // repetition that keeps this rule linear is untouched.
        begin: /\/\*(?=\S)(?:[^*\n]|\*(?!\/)|\n(?!\s*\n)){1,4096}(?<=\S)\*\//,
        relevance: 5,
    };

    // Strong: *text* - not in the middle of words, can contain emphasis.
    // Excludes *[ which is abbreviation-definition syntax.
    const STRONG_PAIR = bare('\\*', new RegExp(`(?<!${LETTER_OR_DIGIT}|\\*)\\*(?![\\s\\[*])`));
    const STRONG = {
        className: 'strong',
        ...STRONG_PAIR,
        relevance: 0,
        // Content modes are assigned once every mode exists.
    };

    /*
     * Highlight (Carve): =text= (single-char; intraword as {=text=})
     *
     * A BARE `=` THAT BEGINS OR ENDS A SMART-TYPOGRAPHY PATTERN IS NOT AN
     * OPENER (grammar.ebnf, Inline parsing precedence: "a delimiter that
     * begins a multi-char smart-typography pattern: `=>` is the arrow, never a
     * highlight opener - the pattern is consumed first"). Corpus 386's third
     * paragraph is the shape it cost - `key => value stays literal, and p <= q
     * is a comparison` renders with no mark, and the `=` of `=>` reached the
     * `=` of `<=` and scoped the sentence (carve-grammars#325). The guard is
     * a LOOKAHEAD ONLY: not BEFORE `>`, which is `=>` and the tail of `==>`.
     *
     * NOTHING IS ADDED TO THE LOOKBEHIND, and that was measured rather than
     * assumed. `<`, `>` and `!` were each put there and reverted: highlight.js
     * resolves its compiled alternation by POSITION, and TYPOGRAPHY carries
     * `<=`, `>=` and `!=`, so on `a !=b c= d` the comparison starts one column
     * before this rule's `=` and takes it. No context reached from this
     * grammar changed its answer, in a container or out of one, so those three
     * characters would be guard nobody can see working. The Prism grammar does
     * need them: Prism applies TOKENS IN ORDER rather than by position, and
     * 'highlight' is declared before 'typography' there.
     *
     * `=` IS IN THE OPENER'S OWN LOOKAHEAD: a doubled run opens nothing, so
     * `x == y` stays literal.
     *
     * THE `=` OF A COMPARISON NEITHER OPENS NOR CLOSES (PART 9 §9): `x =y z<= w`
     * marks nothing and `x =!== y` marks the `≠`. An arrow is no such guard:
     * `x =y z=> w` marks `y z`.
     *
     * AN ESCAPED `=` IS NOT A DELIMITER (carve-grammars#385): `x =\= y`
     * renders `x == y` with no mark. The guard consumes an escape as a pair,
     * and ESCAPE runs first among the content modes.
     *
     * ONE SHAPE IT COSTS: `<https://e.example>=hi=`, where the `>` closes an
     * autolink rather than opening a comparison. A fixed-width lookbehind
     * cannot tell the two apart, and this takes the under-colouring side of
     * that trade - the ticket's own reasoning, since a false highlight claims
     * the document holds a construct it does not.
     */
    const HIGHLIGHT_PAIR = bare('=', /(?<![=\w])=(?=\S)(?![>=])/);
    const HIGHLIGHT = {
        className: 'addition',
        ...HIGHLIGHT_PAIR,
        // Its content modes, ESCAPE first, are assigned once every mode exists:
        // ESCAPE begins at the backslash, so an escaped `=` never reaches `end`.
        relevance: 3,
    };

    // Insert: {+text+}
    const INSERT = {
        className: 'addition',
        ...braced('\\+', /\{\+(?!\+\})/, false),
        relevance: 5,
    };

    // Delete: {-text-}
    //
    // THE BODY IS NOT EMPTY. `{--}` is a braced EN DASH, not an empty deletion -
    // the engine renders `a {--} b` as `a \u2013 b` - and this mode read it as
    // `{-` plus nothing plus `-}` (carve-grammars#378). One character is enough:
    // `{- -}`, `{---}` and `{----}` are all deletions.
    const DELETE = {
        className: 'deletion',
        ...braced('-', /\{-(?!-\})/, false),
        relevance: 5,
    };

    // Strikethrough (Carve): ~text~ (Djot uses ~ for subscript instead)
    const STRIKETHROUGH = {
        className: 'deletion',
        ...bare('~', /(?<![\w~])~(?![\s~])/),
        relevance: 2,
    };

    // Subscript (Carve): braced-only `{,text,}` - a bare `,` is literal text.
    const SUBSCRIPT = {
        className: 'built_in',
        ...braced(',', /\{,(?!,\})/),
        relevance: 3,
    };

    // Superscript (Carve): braced-only `{^text^}` - a bare `^` is literal text.
    const SUPERSCRIPT = {
        className: 'built_in',
        ...braced('\\^', /\{\^(?!\^\})/),
        relevance: 3,
    };

    /**
     * A verbatim span whose fence WIDTH IS DYNAMIC: an optional sigil plus a
     * run of N backticks opens it, and a run of EXACTLY N backticks closes it.
     *
     * highlight.js has no begin->end backreference, which is why these families
     * used to declare the two common widths explicitly (double first, then
     * single). A fence of three or more backticks then opened on the first two
     * and closed at the first shorter run inside it, leaking the rest of the
     * span as prose - and widened fences are the whole point of the widening
     * rule, since content holding a backtick run needs a longer fence (#52).
     *
     * The width is instead captured at `begin`, carried in `resp.data`, and
     * enforced at `end` by rejecting a wrong-width candidate with
     * `ignoreMatch()`. That is the idiom highlight.js's own bundled markdown
     * grammar uses for fenced code.
     *
     * Both patterns match a MAXIMAL run, so a longer run never closes a shorter
     * fence by matching a prefix of itself: with a 2-wide fence, a 4-backtick
     * run inside the span is content, not a closer.
     */
    function verbatimFence({ className, sigil = '', relevance = 0 }) {
        const RUN = '(?<!`)`+(?!`)';
        // A run of one or two cannot cross a paragraph break. A run of three or
        // more is fence-shaped: a fence on a list marker (`- ```) lands in this
        // mode, and its payload may hold a blank line (corpus
        // 75-list-nesting-and-looseness-5). The `\r` keeps CRLF input the same.
        //
        // Named BREAK and not PARAGRAPH_BREAK: the construct ledger's probe reads
        // this file's UPPER_CASE constants as its vocabulary (tests/construct-ledger-test.js).
        const BREAK = '\\n[ \\t\\r]*\\n';
        return {
            className,
            begin: new RegExp(sigil + RUN),
            'on:begin': runOpener((width) => (width >= 3 ? null : PARAGRAPH_END)),
            end: new RegExp(RUN + '|' + BREAK),
            'on:end': (m, resp) => {
                // The paragraph break only ends a run too narrow to be a fence.
                if (!m[0].includes('`')) {
                    if (resp.data._fenceWidth >= 3) resp.ignoreMatch();

                    return;
                }
                if (widthOf(m[0]) !== resp.data._fenceWidth) resp.ignoreMatch();
            },
            relevance,
        };
    }

    /*
     * A run with no closing run of its width later in the same content opens
     * nothing, and a `!`, `$` or `$$` glued before it is text too (C2-I-017).
     * highlight.js has no begin-to-end backreference, so the closer is looked for
     * here. The walk visits each later run once and stops at `stop`, so it costs
     * the distance to the closer or to the end of the content.
     */
    // The width is read off match[0], NOT a capture group: highlight.js
    // concatenates every sibling mode's `begin` into one alternation, so
    // group NUMBERS shift with unrelated modes.
    const widthOf = (text) => /`*$(?![^\r\n])/.exec(text)[0].length;
    const PARAGRAPH_END = /\n[ \t\r]*\n/y;
    const LINE_END = /\n/y;
    // A table cell's content ends at its row, unless a continuation row follows.
    const TABLE_ROW_END = /\n(?![ \t]*\+(?:\\.|[^\\\n])*\|[ \t]*$(?![^\r\n]))/my;
    function runOpener(stopFor) {
        return (m, resp) => {
            const width = widthOf(m[0]);
            if (!closerAhead(m.input, m.index + m[0].length, width, stopFor(width))) {
                resp.ignoreMatch();

                return;
            }
            resp.data._fenceWidth = width;
        };
    }
    function closerAhead(input, from, width, stop) {
        const scan = /`+|\n/g;
        scan.lastIndex = from;
        let m;
        while ((m = scan.exec(input))) {
            if (m[0] === '\n') {
                if (stop) {
                    stop.lastIndex = m.index;
                    if (stop.test(input)) return false;
                }
                continue;
            }
            if (m[0].length === width) return true;
        }

        return false;
    }

    // Math: $$`...` (display) and $`...` (inline). Per grammar.ebnf PART 9 SS18
    // the `$` / `$$` prefix opens a verbatim span with NO closing sentinel, so
    // the backtick run alone ends it. Must precede the inline code modes - the
    // leading $ keeps them from matching, but order is clearer.
    const MATH_DISPLAY = verbatimFence({ className: 'string', sigil: '\\$\\$', relevance: 5 });
    const MATH_INLINE = verbatimFence({ className: 'string', sigil: '\\$', relevance: 5 });

    // Inline literal: !`...` - a `!` prefix on a verbatim backtick run,
    // rendered as prose (no <code>). Parallel to the math modes above and,
    // like them, must precede the inline-code modes so the leading `!` claims
    // the span rather than leaving a stray `!` before a code span. The `!` +
    // backtick never collides with an image (`![`), whose next char is `[`.
    const LITERAL_INLINE = verbatimFence({ className: 'string', sigil: '!', relevance: 0 });

    // Inline code: `code`, ``code``, or any wider fence.
    const INLINE_CODE = verbatimFence({ className: 'code', relevance: 0 });
    // A table cell can carry an open run onto a continuation row, but not
    // onto an unrelated line. Keep the dynamic-width closer from INLINE_CODE.
    const TABLE_INLINE_CODE = {
        ...INLINE_CODE,
        end: /(?<!`)`+(?!`)|(?=\n(?![ \t]*\+(?:\\.|[^\\\n])*\|[ \t]*$(?![^\r\n])))/,
        'on:begin': runOpener(() => TABLE_ROW_END),
        'on:end': (match, response) => {
            if (match[0] === '') return;
            INLINE_CODE['on:end'](match, response);
        },
    };

    // Inline links: [text](url) with optional trailing attributes
    // The label is an inline run: the mode opens on the `[` once the whole
    // link is ahead, and its content modes are given below.
    const LINK = {
        className: 'link',
        begin: new RegExp('\\[(?=' + BRACKET_TEXT + LINK_TAIL + ')'),
        end: new RegExp(LINK_TAIL + '(?:\\{[^}]+\\})?'),
        relevance: 5,
    };

    // Autolinks: <https://...> or <mailto:...>
    const AUTOLINK = {
        className: 'link',
        // Any scheme (C2-I-073): a letter, then letters, digits, `+`, `-` and `.`.
        begin: RegExp(String.raw`<[a-zA-Z][a-zA-Z0-9+.\-]{0,2047}:` + URL_CHAR + '{1,2048}>'),
        relevance: 5,
    };

    // Email autolinks: <user@example.com>
    const EMAIL_AUTOLINK = {
        className: 'link',
        begin: /<[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}>/,
        relevance: 5,
    };

    // Images: ![alt](url) with optional trailing attributes
    const IMAGE = {
        className: 'link',
        begin: new RegExp('!\\[' + BRACKET_TEXT + LINK_TAIL + '(\\{[^}]+\\})?'),
        relevance: 5,
    };

    /*
     * Reference and COLLAPSED reference images: `![alt][ref]` and `![alt][]`.
     *
     * IMAGE above closes on `](`, so neither spelling matched it, and the row
     * they read against was REFERENCE_LINK - whose bracket pair DOES match
     * `[alt][ref]`, leaving the leading `!` unscoped and calling an image a
     * link. Prism carried the same defect on both image rows until
     * carve-grammars#307, under the same cause: a fold was recorded onto a rule
     * that cannot fire for the construct.
     *
     * ONE MODE FOR BOTH FORMS. The reference label is `[^\]\n]{0,512}`, and
     * the `{0,512}` accepts the EMPTY label, so the collapsed spelling is this
     * rule with nothing between its second pair of brackets - the fold
     * carve-grammars#318 recorded for vim-carve and sublime-carve, and the one
     * REFERENCE_LINK below already makes for the collapsed reference LINK. The
     * alt text may be empty as well (`![][r]` is an image, where `[][r]` is not
     * a link), so it takes BRACKET_TEXT rather than the non-empty body.
     */
    const REFERENCE_IMAGE = {
        className: 'link',
        begin: new RegExp('!\\[' + BRACKET_TEXT + '\\]\\[(?![ \\t]+\\]|\\^)[^\\]\\n]{0,512}\\](\\{[^}]+\\})?'),
        relevance: 5,
    };

    // Reference links: [text][ref] with optional trailing attributes
    const REFERENCE_LINK = {
        className: 'link',
        begin: new RegExp('\\[(?=' + BRACKET_TEXT_NONEMPTY + '\\]\\[(?![ \\t\\n]+\\]|\\^)[^\\]]*\\])'),
        end: /\]\[[^\]]*\](?:\{[^}]+\})?/,
        relevance: 5,
    };

    // Spans with attributes: [text]{.class} or [text]{#id}
    const SPAN = {
        className: 'string',
        // Only the bracket run; the trailing `{...}` is left to ATTRIBUTE so it
        // scopes as an attribute block rather than vanishing into the span.
        begin: new RegExp('\\[(?=' + BRACKET_TEXT_NONEMPTY + '\\]\\{)'),
        end: /\](?=\{)/,
        relevance: 5,
    };

    // A label or definition ends at its line break unless `on:end` hands it the
    // next line; `returnEnd` leaves the break for the parent when it ends.
    const LINE_BREAK_END = /\r\n|\r(?!\n)|\n|$(?![\s\S])/;

    // Reference definitions: [ref]: url "title". The destination and the
    // `link_title` are scoped apart, as TextMate does (#523).
    const REFERENCE_DEF = {
        className: 'symbol',
        definition: true,
        // Anchored at end of line, so `[a]: /u zzz` stays prose (#533).
        begin: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*\[(?!@|\^[^\]])(?!\^\]:[ \t]*$)[^\]]+\]:(?=(?: [^\S\n]*(?:\S|\uFEFF)+(?: (?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))?(?: \{[^{}\n]*\})?)[ \t]*$(?![^\r\n]))/,
        // The indented lines below it continue it while they hold the rest of
        // its tail: a title, an attribute block, at most one of each, in that
        // order (C2-B-083). `data.tail` holds the parts still open.
        end: LINE_BREAK_END,
        returnEnd: true,
        'on:begin': (m, resp) => {
            const line = lineAt(m.input, m.index);
            const parts = /\]: [^\S\n]*(?:\S|\uFEFF)+( (?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))?( \{[^{}\n]*\})?[ \t]*$/.exec(line);
            resp.data.tail = !parts ? '' : parts[2] ? '' : parts[1] ? 'a' : 'ta';
        },
        'on:end': (m, resp) => {
            const tail = resp.data.tail;
            const next = m[0] ? lineAt(m.input, m.index + m[0].length) : '';
            const shape = /^[ \t]+(?:("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')( \{[^{}\n]*\})?|\{[^{}\n]*\})[ \t]*$/.exec(next);
            if (!shape || (shape[1] ? tail !== 'ta' : !tail)) return;
            resp.data.tail = shape[1] && !shape[2] ? 'a' : '';
            resp.ignoreMatch();
        },
        relevance: 10,
        contains: [
            {
                className: 'string',
                begin: /(?<=^(?<![^\r\n])[ \t]+)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')(?=(?: \{[^\n]*\})?[ \t]*$(?![^\r\n]))/,
            },
            // Only on a line that completes a definition; `[a]: /u zzz` is
            // prose (grammar.ebnf `reference_definition`, anchored at end of line).
            {
                className: 'link',
                begin: /(?=\S|\uFEFF)(?<=\]: [^\S\n]*)(?:\S|\uFEFF)+(?=(?: (?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))?(?: \{[^\n]*\})?[ \t]*$(?![^\r\n]))/,
            },
            {
                className: 'string',
                begin: /(?=["'])(?<=\]: [^\S\n]*(?:\S|\uFEFF)+ )(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')(?=(?: \{[^\n]*\})?[ \t]*$(?![^\r\n]))/,
            },
        ],
    };

    // Footnote references: [^note]
    const FOOTNOTE_REF = {
        className: 'symbol',
        begin: /\[\^(?![ \t\n]+\])[^\[\]]{1,512}\]/,
        relevance: 5,
    };

    // Inline footnote: ^[content] (corpus 23-inline-footnotes). The caret
    // leads, which is what separates it from the reference above.
    const INLINE_FOOTNOTE = {
        className: 'symbol',
        // Brackets in the body pair up, three deep, as Prism's `noteText` does.
        begin: RegExp('\\^\\[(?=' + (() => {
            let body = '(?:\\\\.|[^\\[\\]\\\\\\n]){0,512}';
            for (let depth = 0; depth < 3; depth++) body = '(?:\\\\.|[^\\[\\]\\\\\\n]|\\[' + body + '\\]){0,512}';
            return body;
        })() + '\\])'),
        end: /\]/,
        relevance: 5,
    };

    // Definition-list term: `:: term` (grammar.ebnf `definition_term`).
    // Reused as a nested mode inside DEFINITION_LIST_ENTRY below - not
    // registered as a top-level mode, so it only ever colors a term that
    // DEFINITION_LIST_ENTRY has already decided is inside a real entry.
    // `:::` opens a div and DIV_BLOCK_START runs first, so the two do not
    // compete.
    const DEFINITION_TERM = {
        className: 'title',
        begin: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*:: (?![ \t]*$(?![^\r\n]))/,
        // The lines definitionListLines gave the term continue it (C2-B-069).
        end: LINE_BREAK_END,
        returnEnd: true,
        'on:end': (m, resp) => {
            if (m[0] && definitionListLines(m.input).termLines.has(m.index + m[0].length)) resp.ignoreMatch();
        },
        relevance: 5,
    };

    // An OTHER block opener ends a definition-list entry: a heading, a
    // list/task marker, a blockquote, a fence (code/div), a horizontal rule,
    // a caption or a table row. Blank lines and lazy-continuation prose are
    // NOT block openers and fold into the entry instead - that is what keeps
    // a folded term line (`term_continuation_line`, corpus
    // 25-definition-lists-6) and a definition separated from its term by one
    // blank line (corpus 25-definition-lists-7) scoped correctly.
    const OTHER_BLOCK_OPENER_SOURCE =
        '[ \\t]*(?:#{1,6} |-{3,}[ \\t]*$(?![^\\r\\n])|\\*{3,}[ \\t]*$(?![^\\r\\n])|_{3,}[ \\t]*$(?![^\\r\\n])|`{3,}|~{3,}|:{3,}|>(?: |$(?![^\\r\\n]))'
        + '|\\^ |\\||[-*][ \\t]|[-*]\\{|\\d+[.)][ \\t]|[A-Za-z]+(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2}))[ \\t]|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. )[ \\t])';

    // The continuation marker at RELATIVE column 0 (markup-carve/carve#3445,
    // CARVE-P9-031). A lone `+` is the marker only where the lines around it
    // prove it: it sits at the marker column of an item, quote, description or
    // footnote opened above and still open, and the next line starts at that
    // column. Everything else is text. Lookbehinds read right to left, so a
    // group is captured on the `+` line before the lines above it are read;
    // the `(?=\+)` in front of each keeps them off every other position.
    function relativePlusSource(g) {
        var item = '(?:[-*]|(?:[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2})))|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. ))';
        var notItem = '(?!' + item + '(?:[ \\t]|\\r?$|\\{))';
        // A list item does not interrupt a paragraph, so one under prose opens nothing.
        var notUnderProse = '(?<!(?<![^\\n])[^ \\t\\r\\n>|#:`~*\\-+\\d[{%][^\\n]*\\n)';
        var listOpener = notUnderProse + item + '(?:[ \\t]|\\{)';
        var holderOpener = '(?:>|:[ \\t]|\\[\\^[^\\]\\r\\n]+\\]:[ \\t])';
        var opener = '(?:' + listOpener + '|' + holderOpener + ')';
        var comment = '[ \\t]*%%[^\\n]*';
        // `(?=[^\\r\\n])` is each inner lookbehind's sentinel: these lines are never empty.
        var underText = '(?=[^\\r\\n])(?<=(?<![^\\n])[ \\t>]*[^ \\t\\r\\n>][^\\n]*\\n)';
        var lazyText = '(?!#{1,6}(?:[ \\t]|\\r?$)|[>|:{]|%%|\\^[ \\t]|[`~]{3}|\\$\\$|\\[\\^|[-*+](?:[ \\t]|\\r?$)|(?:[-*_][ \\t]*){3,}\\r?$)[^ \\t\\r\\n][^\\n]*';
        var lineAt = '(?<![^\\n])(?:(?<![\\s\\S])\\uFEFF)?((?:> )*)( *)';
        var lone = '\\+[ \\t]*(?=\\r?\\n';
        // The lines between the opener and the `+` that keep the container
        // open, for quote prefix `q` and column `s`. The classes are disjoint,
        // so a run that reaches no opener fails once rather than once per way
        // of splitting it. A list item stays open across a blank line and a
        // comment; the other containers take neither. Bounded twice: 512 lines
        // between two `+` and 8 earlier `+` lines, so a document of `+` lines
        // costs a constant per line.
        var run = function (q, s, list) {
            var deeper = q + s + '[ \\t]+[^ \\t\\r\\n][^\\n]*';
            var sibling = q + s + opener + '[^\\n]*';
            var lazy = underText + q + '(?!' + s + opener + ')' + lazyText;
            var plus = q + s + '\\+[ \\t]*\\r?';
            // The lines of the block an earlier `+` attached, up to a blank line.
            var attached = '(?=[^\\r\\n])(?<=(?<![^\\n])' + plus + '\\n(?:[ \\t>]*[^ \\t\\r\\n>][^\\n]*\\n){0,64})'
                + '(?!' + deeper + '|' + sibling + '|' + plus + '\\n|' + comment + '|' + lazy + ')[ \\t>]*[^ \\t\\r\\n>][^\\n]*';
            var kept = '(?<![^\\n])(?:' + deeper + '|' + sibling + '|' + lazy + '|' + attached
                + (list ? '|[ \\t]*\\r?|[ \\t]*(?:>[ \\t]*)+\\r?|' + underText + q + '(?!' + s + opener + ')' + comment : '') + ')\\n';
            return '(?:(?:' + kept + '){0,512}(?<![^\\n])' + plus + '\\n){0,8}(?:' + kept + '){0,512}';
        };
        var at = function (n) { return { q: '\\' + n, s: '\\' + (n + 1) }; };
        // Under a list item, a list item below is a sibling, not the attached block.
        var a = at(g);
        var listed = '(?=\\+)(?<=(?<![^\\n])' + a.q + a.s + listOpener + '[^\\n]*\\n' + run(a.q, a.s, true) + lineAt + ')'
            + lone + a.q + a.s + '(?![ \\t])' + notItem + '[^\\r\\n])';
        var b = at(g + 2);
        var held = '(?=\\+)(?<=(?<![^\\n])' + b.q + b.s + holderOpener + '[^\\n]*\\n' + run(b.q, b.s, false) + lineAt + ')'
            + lone + b.q + b.s + '(?![ \\t])[^\\r\\n])';
        // A quote's own first line (`> +`, `  > > +`), one branch per depth k:
        // the line above is no quote line of depth exactly k, and then the `+`
        // is the marker whatever follows. Every `>` needs its space
        // (markup-carve/carve#3421): `>+`, `>>+`, `>> +` are text.
        var opened = [];
        for (var k = 1; k <= 8; k++) {
            opened.push('(?=\\+)(?<=(?:(?<![\\s\\S])\\uFEFF?|(?<![^\\n])(?!(?:[ \\t]*(?:' + item + ') +)*(?:[ \\t]*>){' + k + '}(?![ \\t]*>)[ \\t\\r\\n])[^\\n]*\\n)(?:[ \\t]*>(?= )){' + k + '} )'
                + '\\+[ \\t]*(?![^\\r\\n])');
        }
        opened = opened.join('|');
        // A quote's own first line inside a list item or description (`- a` /
        // `  > +`), at or right of the item's content column and under no quote
        // line: the follower is lazy text at the host's column 0, or a non-list
        // block at the quote's column with fewer `> ` prefixes (depth 8 at most).
        // The host may itself sit in a quote (`> - a` / `>   > +`), up to two
        // levels. One branch per prefix, indent and depth, so no group is captured.
        // An opening fence with no closer ahead is lazy text too (carve-js 0.1.13
        // folds it into the quote paragraph); a closed one is a block. The closer
        // scan is bounded to 32 KB.
        // A closer must carry the opener's own prefix `P`, no more and no less.
        // Group `f` captures the opening run. Past 32 KB with neither a closer nor
        // the end of its container the fence counts as closed.
        var unclosedFence = function (P, f) {
            return '(`{3,}(?!`)|~{3,}(?!~))(?=[\\s\\S]{0,32768}?(?:$(?![\\s\\S])|\\n(?!' + P + ')))(?![^\\n]*\\r?\\n[\\s\\S]{0,32768}?(?<![^\\n])' + P + '[ \\t]*\\' + f + '(?:(?<=`)`|(?<=~)~)*[ \\t]*\\r?(?:\\n|$(?![\\s\\S])))[^\\r\\n]*';
        };
        // `base` is the number of the first group this branch captures: the
        // prefix of a quote holding the host (often empty). The `+` line's own
        // prefixes are captured too, so a follower with fewer of them is one
        // check rather than one branch per depth.
        var hostedAt = function (base) {
            var next = base;
            var P = '\\' + next++;
            // The host sits in a quote: the captured prefix is not empty.
            var held = '(?!' + P + '(?<![^\\n]))';
            var pf = '\\' + next++;
            var f = next++;
            var hosted = [];
            var follow = [];
            // An indented quote with fewer `> ` than the `+` line attaches too.
            var q = next++;
            var quoteFollow = held + '(?= )(?<=(?<![^\\n])' + P + ' +((?:> ){2,})\\+[ \\t]*\\r?\\n' + P + ') +(?!\\' + q + ')(?:> )+(?![ \\t>])' + notItem + '[^\\r\\n]|';
            for (var n = 1; n <= 12; n++) {
                var host = '(?=[^\\n]{0,' + n + '}(?=[^ \\t\\r\\n])(?<=(?<![^\\n])' + P + '[ \\t]*(?:' + item + '|(?=:)(?<=(?<![^\\n])' + P + '[ \\t]*::?[ \\t][^\\n]*\\n' + P + '[ \\t]*):)[ \\t]+)[^ \\t\\r\\n])';
                hosted.push('(?=\\+)(?<=(?<![^\\n])' + P + host + '[^\\n]*\\n(?:' + P + '(?:[ \\t]*\\r?|[ \\t]+[^ \\t\\r\\n][^\\n]*)\\n){0,64}' + P + ' {' + n + '}(?:> )+)'
                    + '(?=\\+)(?<=(?<![^\\n])' + P + '(?![ \\t]*(?:' + item + '[ \\t]+)*>)[^\\n]*\\n' + P + ' {' + n + '}(?:> )+)');
                var k = next++;
                follow.push('(?= {' + n + '})(?<=(?<![^\\n])' + P + ' {' + n + '}((?:> )+)\\+[ \\t]*\\r?\\n' + P + ') {' + n + '}(?!\\' + k + ')(?:> )*');
            }
            // Under an outer quote, lazy text and an unclosed fence may drop
            // prefixes, and any non-list block indented past the prefix attaches.
            return '(?=\\+)(?<=[ ]> )(?=\\+)(?<=(?<![^\\n])((?:> )*) +(?:> )+)(?:' + hosted.join('|') + ')' + lone
                + '(?:(?!' + P + '> )((?:> )*)(?:' + lazyText + '|' + unclosedFence(pf, f) + ')|' + P
                + '(?:' + held + ' +(?!>(?: |\\r?$))' + notItem + '[^ \\t\\r\\n]|' + quoteFollow + '(?:' + follow.join('|') + ')(?![ \\t>])' + notItem + '[^\\r\\n])))';
        };
        // Openers on one line with a quote innermost (`- > +`): the block
        // below starts at column 0 or at that line's column.
        // Every `>` needs its space: `- >+`, `- > >+` and `- >> +` are item text.
        var d = at(g + 4);
        var stacked = '(?=\\+)(?<=' + lineAt + '(?:(?:[-*] +(?:\\[[ xX\\-_>\\/!?]\\] +)?|' + item + ' +)+)(?:> )+)'
            + lone + '(?:' + d.q + d.s + ')?(?![ \\t])' + notItem + '[^\\r\\n])';
        // The hosted branches capture groups numbered after all of the above.
        var groups = function (source) { return RegExp(source + ')|').exec('').length - 1; };
        var before = '(?:' + listed + '|' + held + '|' + opened + '|' + stacked;
        return before + '|' + hostedAt(g + groups(before)) + ')';
    }

    // Table/list continuation: a lone `+` (grammar.ebnf `continuation_marker`)
    // or a continuation ROW carrying cells (`continuation_row`, corpus
    // 63-table-multi-line-cell-continuation). The row form has to end in `|`,
    // so `one + two` in prose stays literal.
    const TABLE_CONTINUATION = {
        className: 'punctuation',
        begin: RegExp(relativePlusSource(1)),
        relevance: 5,
    };
    const TABLE_CONTINUATION_ROW = {
        begin: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*(?=\+(?:\\.|[^\\\n])*\|[ \t]*$(?![^\r\n]))/,
        end: /\|[ \t]*$(?![^\r\n])|(?=\n(?![ \t]*\+(?:\\.|[^\\\n])*\|[ \t]*$(?![^\r\n])))/,
        endScope: 'table-boundary',
        contains: [
            { className: 'table-continuation', begin: /\+(?=(?:\\.|[^\\\n])*\|[ \t]*$(?![^\r\n]))/ },
            TABLE_INLINE_CODE,
            ESCAPE,
            { className: 'table-boundary', begin: /\|(?=[^\n]*\|)/ },
        ],
        relevance: 5,
    };

    // Smart typography, the same set the Prism grammar carries. Not invented
    // here: dashes, arrows, comparisons and the symbol trio.
    //
    // The doubled run is canonical in both arrow families (carve#1442), so
    // `-->` `<--` `<-->` and `==>` `<==` `<=>` are listed BEFORE the single
    // forms and before the dash rule - otherwise `-->` scopes as an en dash
    // plus a stray `>`. `=>` alone is no longer an arrow and is gone from the
    // set; `<=` stays, as the comparison it always was.
    // A hyphen run becomes dashes wherever it stands, `--oneline` included (C2-I-111).
    const TYPOGRAPHY = {
        className: 'literal',
        begin: /\{--\}|\.\.\.|<-->|<--(?!-)|(?<!-)-->|<=>|<==|==>|---|--|!=|<=|>=|\+-|\(tm\)/,
        relevance: 0,
    };

    // Citations (Tier-2 §22): [@key], [+@key], [@key, p.10], [@a; @b]
    // A bracket whose content holds at least one `@key` with no trailing
    // `(url)`, `[ref]`, or `{attrs}` suffix. The negative lookahead is handled
    // by position in the contains array (SPAN and REFERENCE_LINK are checked
    // first to claim those suffixed forms).
    const CITATION = {
        className: 'symbol',
        begin: /\[\+?(?:[^\]@]{0,512}@[A-Za-z0-9_][A-Za-z0-9_.:#$%&+?<>~\/-]*[^\]]{0,512})\](?!\(|\[|\{)/,
        relevance: 8,
    };

    // Code callouts (Tier-2 §10): <n> markers trailing a code-fence line or
    // leading a callout-list item.
    const CODE_CALLOUT = {
        className: 'symbol',
        begin: /<\d+>/,
        relevance: 5,
    };

    // A block-attribute line as a whole body, such as the `{empty}` sentinel.
    const bodyAttribute = (marker) => ({
        className: 'attr',
        begin: new RegExp('(?=\\{)(?<=^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*' + marker + '[ \\t]+)'
            + '\\{(?!__\\})[ \\t]*' + ATTR_ITEM + '(?:[ \\t]+' + ATTR_ITEM + ')*[ \\t]*\\}(?=[ \\t]*(?:\\r?\\n|$(?![^\\r\\n])))'),
        relevance: 0,
    });

    // Footnote definitions: [^note]: content. The label is scoped; the body is
    // inline content, appended once CONTAINS exists.
    const FOOTNOTE_DEF = {
        definition: true,
        begin: /^(?<![^\r\n])(?=(?:(?<![\s\S])\uFEFF)?[ \t]*\[\^[^\]]+\]: [ \t]*\S)/,
        end: /$(?![^\r\n])/,
        contains: [
            {
                className: 'symbol',
                begin: /(?<=^(?<![^\r\n]))(?:(?<![\s\S])\uFEFF)?[ \t]*\[\^[^\]]+\]:/,
            },
            // A `+` as the whole first line is the continuation marker when a
            // non-blank flush-left line follows (markup-carve/carve#3105) that
            // opens no list item: a column-0 list stays outside (carve#3482).
            {
                className: 'punctuation',
                begin: /(?=\+)(?<=^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?\[\^[^\]\r\n]+\]: +)\+[ \t]*(?=\r?\n(?!(?:[-*]|(?:[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\)|\.(?= {2}|\{[^}\r\n]{0,4096}\} {2})))|\.(?! [ \t]*\. |\{[^}\r\n]{0,4096}\}[ \t]+\. ))(?:[ \t]|\r?$|\{))[^ \t\r\n])/,
            },
            bodyAttribute('\\[\\^[^\\]\\r\\n]+\\]:'),
        ],
        relevance: 10,
    };

    // Abbreviation definitions: *[ABBR]: text
    //
    // The term is `(letter | digit)+` with `letter` enumerated ASCII, so
    // `*[e.g.]:` and `*[HTTP API]:` are NOT definitions - they stay paragraph
    // text in every engine. This matched anything without a bracket, which is
    // the reading carve-rs had for non-ASCII terms (carve-rs#660).
    const ABBREVIATION_DEF = {
        className: 'symbol',
        definition: true,
        // Anchored `^[ \t]*` on purpose - no container model here, see the
        // indented-block-openers note in the module docblock (carve-grammars#138).
        begin: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*\*\[[A-Za-z0-9]+\]:(?= +[^\r\n]*[^ \t\r\n])/,
        // Every line below it indented past its `*` continues the expansion; a
        // block line or a comment-only line ends it (C2-B-084).
        end: LINE_BREAK_END,
        returnEnd: true,
        'on:begin': (m, resp) => {
            resp.data.column = markerColumn(m.input, m.index);
            resp.data.until = -1;
        },
        'on:end': (m, resp) => {
            if (m[0] && labelContinues(m.input, m.index + m[0].length, resp.data, false)) resp.ignoreMatch();
        },
        relevance: 10,
    };

    // A list item's MARKER, as it may appear before a block opener on the same
    // line. Matched in a LOOKBEHIND everywhere it is used rather than consumed,
    // so `TASK_LIST`/`LIST_BULLET`/`LIST_NUMBER` still scope it - which is
    // tree-sitter-carve's split too, with the block INSIDE `list_item_content`
    // beside the `list_marker_*` rather than over it.
    //
    // Used by the marker-line comment fence AND by the quote rules below: a
    // quote may open on an item's own marker line (`- > x`), where carve-js
    // nests the quote and everything after the marker inside the item.
    // EVERY SEPARATOR IS A LITERAL SPACE, never a tab: `-<TAB>a`, `1.<TAB>a` and
    // `- [x]<TAB>a` are paragraphs in the engine, which the shared block battery
    // already pins per marker. Written `[ \t]+` this admitted `-<TAB>%%%` as a
    // marker-line fence, and with the quote rules sharing the prefix it coloured
    // `-<TAB>> q` as a quote on a line the language renders as prose
    // (carve-grammars#259).
    const LIST_MARKER_BEFORE_BLOCK = '^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*' + MARKER_LINE_PREFIX;

    // The lookbehinds built from this prefix are variable length. The modes
    // below check their sentinel before reading the prefix, so irrelevant
    // positions do not make a long indentation run quadratic (#440).

    // A comment fence may open on a BLOCK-QUOTE marker line (`> %%%`), and then
    // its body is hidden exactly as it is anywhere else - \u00A724 S2 and \u00A728 make a
    // comment's body verbatim and invisible WHEREVER the fence sits. Corpus 70
    // pins this spelling: `> q` / `> %%%` / `> x` / `> %%%` / `> body` renders
    // the quote with `q` and `body` only.
    //
    // `BLOCK_COMMENT` cannot reach it - its begin allows only whitespace before
    // the run - so all three lines scoped as plain quote and nothing was marked
    // hidden. It lives in BLOCKQUOTE's `contains` rather than in the top-level
    // list because BLOCKQUOTE ends at `$`: a mode that begins at column 0 would
    // out-rank it and take the marker, and a mode outside it never gets to run
    // on a quote line at all. Reached from here the marker stays a quote, which
    // is tree-sitter-carve's split too - the `fenced_comment_block` sits inside
    // the quote's `content`, beside the `block_quote_marker`.
    // The marker run may itself follow a LIST ITEM'S marker (`- > %%%`), so the
    // list prefix is an alternative to the plain line start rather than a rule of
    // its own. carve-grammars#246 left that shape out because two of the three
    // grammars here could not reach it; a lookbehind reaches it here.
    const QUOTE_MARKER_BEFORE_FENCE =
        '(?:' + LIST_MARKER_BEFORE_BLOCK + '|^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*)(?:> )+';
    // A line carrying a quote marker of its own. Every line from opener to
    // closer must be one: an UNMARKED line is where the quote can end, and the
    // engine degrades an unclosed opener to a line comment rather than hiding
    // anything (`> %%%` / `> c` / blank leaves `c` VISIBLE). The engine does
    // absorb an unmarked LAZY continuation into a fence that closes later;
    // refusing it costs a mis-scope there and buys never hiding a visible block.
    const QUOTE_MARKED_LINE = '(?:\\n[ \\t]*>[^\\n]*)';
    const BLOCK_COMMENT_ON_QUOTE_MARKER_LINE = {
        className: 'comment',
        // The closer is REQUIRED up front, as in BLOCK_COMMENT_ON_MARKER_LINE
        // below: highlight.js has no begin->end backreference, so without the
        // guard an opener with no closer runs to end of file, and on this shape
        // an unclosed opener is the common case.
        begin: RegExp(
            '(?=%)(?<=' + QUOTE_MARKER_BEFORE_FENCE + ')(%{3,})(?!%)[^\\n]*$(?![^\\r\\n])'
            + '(?=' + QUOTE_MARKED_LINE + '*?\\n[ \\t]*(?:> )+\\1(?!%)[^\\n]*$(?![^\\r\\n]))',
        ),
        'on:begin': (m, resp) => {
            resp.data._quoteFenceWidth = m[1].length;
        },
        end: /^(?<![^\r\n])[ \t]*(?:> )+(%{3,})[^\n]*$(?![^\r\n])/,
        'on:end': (m, resp) => {
            if (m[1].length !== resp.data._quoteFenceWidth) resp.ignoreMatch();
        },
        relevance: 10,
    };

    // The other half of the rule above: an UNTERMINATED `%{3,}` run opens
    // nothing and degrades to a LINE comment (PART 9 S28), so it must still
    // scope as one. Placed after `BLOCK_COMMENT` in `contains`, which consumes
    // every fence that does have a closer - the same pair Prism carries, where
    // the unterminated pattern sits after the block form for the same reason.
    //
    // The marker prefixes are here as well, so `- %%%` and `> %%%` with no
    // closer grey their opener out too rather than losing the run entirely.
    // Reached inside a quote through `BLOCKQUOTE.contains`, since a mode that
    // begins at column 0 never runs on a quote line.
    const UNTERMINATED_BLOCK_COMMENT = {
        className: 'comment',
        begin: RegExp(
            '(?:^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*'
            + '|(?=%)(?<=' + LIST_MARKER_BEFORE_BLOCK + ')'
            + '|(?=%)(?<=' + QUOTE_MARKER_BEFORE_FENCE + '))%{3,}',
        ),
        end: /$(?![^\r\n])/,
        relevance: 5,
    };
    // Blockquotes: a `>` marker followed by a SPACE, or alone on its line.
    //
    // Verified against carve-rs: `>no space`, `>>x`, `>> x` and `>\tx` are all
    // paragraphs - the separator must be a space, and nesting is written
    // `> > x` with a space per marker. A bare `^>` colored `>=3 items` as a
    // quote when the language calls it prose (markup-carve/carve#525).
    const BLOCKQUOTE = {
        className: 'quote',
        // Anchored `^[ \t]*` on purpose - no container model here, see the
        // indented-block-openers note in the module docblock (carve-grammars#138).
        // A LIST ITEM'S MARKER may stand before the `>` on the same line
        // (`- > x`, `1. > x`, `- - > x`, `- [ ] > x`). Reached through a
        // lookbehind so the marker is not consumed and the list rules still
        // scope it. Without this branch the marker scoped as a bullet and the
        // rest of the line carried no scope at all, where carve-js nests it
        // (carve-grammars#259).
        begin: RegExp(
            '(?:^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*|(?=>)(?<=' + LIST_MARKER_BEFORE_BLOCK + '))'
            + '>(?= |$(?![^\\r\\n]))',
        ),
        // A marker that continues a paragraph opens no quote (carve-grammars#851).
        'on:begin': (m) => {
            const start = lineStartBefore(m.input, m.index);
            const text = m.input.slice(start, m.index).trim() !== '' && markerIsParagraphText({ input: m.input, index: start });
            m.rule.scope = text ? undefined : 'quote';
        },
        end: /$(?![^\r\n])/,
        // The ONE construct a quote line contains: a comment fence opened on
        // the marker line, which outlives the `$` that ends every other quote.
        // The two constructs a quote line contains: a comment fence opened on
        // the marker line, which outlives the `$` that ends every other quote,
        // and the unterminated form of the same run, which does not (it is a
        // line comment, so it ends where the quote line does).
        contains: [BLOCK_COMMENT_ON_QUOTE_MARKER_LINE, UNTERMINATED_BLOCK_COMMENT],
        relevance: 0,
    };
    // A quoted line block (`> ::: |`) holds text lines, so no quoted block
    // marker scopes in it (carve-grammars#853). It ends at its closer, at the
    // same prefix, or with the quote.
    const QUOTED_LINE_BLOCK = {
        className: 'quote',
        begin: RegExp(
            '(?:^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*|(?=>)(?<=' + LIST_MARKER_BEFORE_BLOCK + '))'
            + '>((?: >)*) (:{3,}) +\\|[^\\r\\n]*$(?![^\\r\\n])',
        ),
        // A marker line that continues a paragraph opens nothing: the mode
        // then ends with its line, unscoped.
        'on:begin': (m, resp) => {
            resp.data.prefix = m[1];
            resp.data.width = m[2].length;
            resp.data.refused = quotedMarkerIsParagraphText(m);
            m.rule.scope = resp.data.refused ? undefined : 'quote';
        },
        end: /\n|^(?<![^\r\n])[ \t]*>((?: >)*) (:{3,})[ \t]*$(?![^\r\n])/,
        'on:end': (m, resp) => {
            if (m[2] === undefined) {
                if (!resp.data.refused && /^[ \t]*>/.test(m.input.slice(m.index + m[0].length))) resp.ignoreMatch();
            } else if (m[1] !== resp.data.prefix || m[2].length !== resp.data.width) resp.ignoreMatch();
        },
        contains: [BLOCK_COMMENT_ON_QUOTE_MARKER_LINE, UNTERMINATED_BLOCK_COMMENT],
        relevance: 0,
    };
    /*
     * The block markers of a quoted line scope as they do outside a quote
     * (carve-grammars#683): a heading run, a task box, a bullet or an ordered
     * marker right after the `> ` prefix, nested prefixes included. Each rule
     * checks a one-character sentinel before its prefix lookbehind (#440). The
     * heading takes only its `#` run, so the quoted-heading comment rules
     * below still see the text. Inline formatting stays out: those modes may
     * span lines and would carry the next line's `>` into their run.
     */
    const QUOTED = '(?<=(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*>(?: >)* )';
    const NO_EMPTY = '(?![ \\t]*$(?![^\\r\\n]))';
    BLOCKQUOTE.contains.push(
        { className: 'section', begin: RegExp('(?=[#=])' + QUOTED.slice(0, -1) + '(?:' + MARKER_LINE_PREFIX + ')?)(?:#{1,6}|={1,6})(?= )' + NO_EMPTY) },
        { className: 'bullet', begin: RegExp('(?=[-*])' + QUOTED + '[-*] \\[[ xX\\-_>\\/!?]\\](?= )' + NO_EMPTY), 'on:begin': (m) => { m.rule.scope = quotedMarkerIsParagraphText(m) ? undefined : 'bullet'; } },
        { className: 'bullet', begin: RegExp('(?=[-*])' + QUOTED + '(?:[-*] +)*[-*](?:(?= )|' + GLUED_ATTR_BLOCK + ')' + NO_EMPTY), 'on:begin': (m) => { m.rule.scope = quotedMarkerIsParagraphText(m) ? undefined : 'bullet'; } },
        { className: 'bullet', begin: RegExp('(?=[\\dA-Za-z.])' + QUOTED + '(?:\\d+[.)]|(?:[a-zA-Z]|[ivxlcdm]+|[IVXLCDM]+)(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2}))|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. ))(?:(?= )|' + GLUED_ATTR_BLOCK + ')' + NO_EMPTY), 'on:begin': (m) => { m.rule.scope = quotedMarkerIsParagraphText(m) ? undefined : 'bullet'; } },
        // The `+` continuation marker: after a quoted list marker always, and
        // a lone `+` in a quote where the lines around it prove it.
        {
            className: 'punctuation',
            begin: RegExp('(?=\\+)' + QUOTED.slice(0, -1)
                + '(?:[-*] \\[[ xX\\-_>\\/!?]\\] +|(?:[-*] +)+|(?:\\d+[.)]|(?:[a-zA-Z]|[ivxlcdm]+|[IVXLCDM]+)(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2}))|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. )) +|'
                + GLUED_MARKER + '))\\+[ \\t]*$(?![^\\r\\n])'),
        },
        { className: 'punctuation', begin: RegExp(relativePlusSource(1)) },
        // A quoted definition list: the `::` of a term at any indent, and a `:`
        // that definitionListLines reads as a marker.
        {
            className: 'punctuation',
            begin: RegExp('(?=:)(?<=(?:' + LIST_MARKER_BEFORE_BLOCK + '|^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*)>(?: >)* [ \\t]*'
                + '(?:(?:[-*]|[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)[.)]) +)*)::(?= +[^ \\t\\r\\n])'),
            'on:begin': (m) => { m.rule.scope = quotedMarkerIsParagraphText(m) ? undefined : 'punctuation'; },
        },
        {
            className: 'punctuation',
            begin: /(?=:)(?<=(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*>(?: >)* [ \t]*):(?= +[^ \t\r\n])/,
            'on:begin': (m) => {
                m.rule.scope = definitionListLines(m.input).markers.has(m.index) ? 'punctuation' : undefined;
            },
        },
        // An abbreviation definition, behind the prefix and any item markers or
        // a real description marker, as the document collects it (carve-grammars#845).
        {
            className: 'symbol',
            definition: true,
            begin: RegExp('(?=\\*\\[)(?<=(?:' + LIST_MARKER_BEFORE_BLOCK + '|^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*)>(?: >(?= ))*'
                + '(?: [ \\t]*(?:(?:[-*] +)*[-*] +(?:\\[[ xX\\-_>\\/!?]\\] +)?|(?:[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\\)|\\.(?= {2}))) +|(?:[-*]|[0-9]+[.)])\\{[^{}\\r\\n]*\\} +|> )*(:(?= ) +)?)? *)'
                + '\\*\\[[A-Za-z0-9]+\\]: +(?=[^\\r\\n]*[^ \\t\\r\\n])[^\\r\\n]*'),
            end: /$(?![^\r\n])/,
            'on:begin': (m) => {
                const before = m.input.slice(0, m.index).trimEnd();
                const marker = before.endsWith(':') && before.length - 1;
                const lines = definitionListLines(m.input);
                const fenced = lines.fenced.has(before.lastIndexOf('\n') + 1);
                // A quote opened on a marker line that continues a paragraph opens nothing (carve-grammars#856).
                const start = lineStartBefore(m.input, m.index);
                const above = previousLineStart(m.input, start);
                const lazy = !/^﻿?[ \t]*>/.test(m.input.slice(start, m.index))
                    && above !== -1 && !/^﻿?[ \t]*(?:>[ \t]*)*$/.test(lineAt(m.input, above))
                    && markerIsParagraphText({ input: m.input, index: start });
                m.rule.scope = !fenced && !lazy && (marker === false || lines.markers.has(marker)) && !quotedMarkerIsParagraphText(m) ? 'symbol' : undefined;
            },
            relevance: 0,
        },
    );

    // Horizontal rules: --- or *** or ___
    const HORIZONTAL_RULE = {
        className: 'meta',
        begin: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*(-{3,}|\*{3,}|_{3,})$(?![^\r\n])/,
        relevance: 10,
    };

    /*
     * WHAT THE LINE ABOVE LEAVES OPEN. A list marker does not interrupt a
     * paragraph, and a caption attaches only to a few hosts, so both ask about
     * the lines above. These are JavaScript, not lookbehinds: the answer is
     * memoized per line, so a long paragraph is walked once rather than once
     * per candidate. A rule that says no keeps its match and drops its scope
     * for it, rather than calling `ignoreMatch()`: highlight.js resumes an
     * ignored scan at a wrong rule once a mode has resumed from more than one
     * place, and then skips text or loops.
     */
    const scopeUnless = (scope, refused) => (m) => {
        m.rule.scope = refused(m) ? undefined : scope;
    };
    const lineStartBefore = (input, index) => {
        for (let at = index - 1; at >= 0; at--) {
            if (input[at] === '\r' || input[at] === '\n') return at + 1;
        }
        return 0;
    };
    const lineEndFrom = (input, index) => {
        for (let at = index; at < input.length; at++) {
            if (input[at] === '\r' || input[at] === '\n') return at;
        }
        return input.length;
    };
    const nextLineStart = (input, end) => end + (input[end] === '\r' && input[end + 1] === '\n' ? 2 : 1);
    const lineAt = (input, start) => input.slice(start, lineEndFrom(input, start));
    const previousLineStart = (input, start) => start === 0 ? -1
        : lineStartBefore(input, start - (input[start - 1] === '\n' && input[start - 2] === '\r' ? 2 : 1));
    const columnOf = (lead) => {
        let col = 0;
        for (const ch of lead) col = ch === '\t' ? col + 4 - (col % 4) : col + 1;
        return col;
    };
    // A fence, a table row, a `***` break or a block comment ends a label even when indented (C2-B-234).
    const LABEL_END_LINE = /^[ \t]*(?:`{3,}|:{3,}|%|\|[^\r\n]*\||\*{3,}[ \t]*$)/;
    const COMMENT_ONLY_LINE = /^[ \t]*%%(?!%)(?![ \t]*#(?:region|endregion)\b)/;
    // Whether the line starting at `at` continues a label whose marker stands at
    // `column`: indented past it, after any comment-only lines when `comments`.
    // `data.until` keeps the line found, so a run of comment lines is read once.
    const labelContinues = (input, at, data, comments) => {
        if (at <= data.until) return true;
        while (at < input.length) {
            const line = lineAt(input, at);
            if (!(comments && COMMENT_ONLY_LINE.test(line))) {
                const lead = /^[ \t]*/.exec(line)[0];
                const held = lead.length < line.length && columnOf(lead) > data.column && !LABEL_END_LINE.test(line);
                if (held) data.until = at;
                return held;
            }
            at += line.length;
            at += input[at] === '\r' && input[at + 1] === '\n' ? 2 : 1;
        }
        return false;
    };
    const markerColumn = (input, index) => columnOf(/^\uFEFF?([ \t]*)/.exec(lineAt(input, lineStartBefore(input, index + 1)))[1]);
    // A line after which a new block starts: it ends any paragraph above.
    const BLOCK_BOUNDARY_LINE = /^\uFEFF?(?:[ \t]*(?:#{1,6}(?: |$)|`{3,}|~{3,}|:{3,}|%{3,}|(?:-{3,}|\*{3,}|_{3,})[ \t]*$|\|.*\|(?:\{[^{}]*\})?[ \t]*$|\{[^{}]*\}[ \t]*$|%%|\[\^?[^\]]+\]:(?: |$)|\*\[[A-Za-z0-9]+\]:|:: )|\+[ \t]*$)/;
    const LIST_ITEM_LINE = /^\uFEFF?[ \t]*(?:[-*]|\d{1,9}[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\)|\.(?= {2}|\{[^}\r\n]{0,4096}\} {2}))|\.(?! [ \t]*\. |\{[^}\r\n]{0,4096}\}[ \t]+\. ))(?: +[^ \t]|\{)/;
    const lineKind = (line) => {
        if (/^\uFEFF?[ \t]*$/.test(line)) return 'blank';
        // So is one in a quote or a description (`> # h`, `:  [^n]: x`).
        if (BLOCK_BOUNDARY_LINE.test(line.replace(/^\uFEFF?(?:(?:[ \t]*>(?: |$))+|[ \t]*: +)/, ''))) return 'boundary';
        return LIST_ITEM_LINE.test(line) ? 'item' : 'text';
    };
    const LINE_MEMO = new Map();
    const memoFor = (input) => {
        let memo = LINE_MEMO.get(input);
        if (!memo) {
            memo = new Map();
            LINE_MEMO.set(input, memo);
            if (LINE_MEMO.size > 4) LINE_MEMO.delete(LINE_MEMO.keys().next().value);
        }
        return memo;
    };
    // Whether a `:: ` term reaches the `: ` line at `start`, so it is a
    // description; with none above it is paragraph text. Memoized per
    // non-blank line, so the walk is linear in the document.
    const termAbove = (input, start) => {
        const memo = memoFor(input);
        const path = [];
        let found = false;
        let at = previousLineStart(input, start);
        // Three blank lines end the list.
        for (let blanks = 0; at !== -1; ) {
            const line = lineAt(input, at);
            const blank = lineKind(line) === 'blank';
            if (!blank && memo.has('t' + at)) {
                found = memo.get('t' + at);
                break;
            }
            if (/^\uFEFF?[ \t]*:: /.test(line)) {
                found = true;
                path.push(at);
                break;
            }
            const above = previousLineStart(input, at);
            blanks = blank ? blanks + 1 : 0;
            const lazy = /^\uFEFF?[^ \t\r\n]/.test(line) && above !== -1 && lineKind(lineAt(input, above)) !== 'blank';
            if (blanks >= 3 || !(blank || /^\uFEFF?(?:[ \t]|: )/.test(line) || lazy)) break;
            if (!blank) path.push(at);
            at = above;
        }
        for (const line of path) memo.set('t' + line, found);
        return found;
    };
    // Whether the paragraph holding line `start` sits outside any list item:
    // it opens at column 0 on a line that is no item, and no `+` above it
    // attaches it to one. Inside an item a marker interrupts a paragraph.
    const outsideAnyItem = (input, start) => {
        const memo = memoFor(input);
        const path = [];
        let at = start;
        let kind;
        for (;;) {
            if (memo.has(at)) {
                kind = memo.get(at);
                break;
            }
            path.push(at);
            const above = previousLineStart(input, at);
            const aboveKind = above === -1 ? 'blank' : lineKind(lineAt(input, above));
            if (aboveKind === 'blank' || aboveKind === 'boundary') {
                const line = lineAt(input, at);
                let attach = above;
                while (attach !== -1 && /^[ \t]*\{[^{}]*\}[ \t]*$/.test(lineAt(input, attach))) attach = previousLineStart(input, attach);
                // A description body holds its paragraph like an item does.
                kind = lineKind(line) === 'text' && !/^\uFEFF?[ \t]/.test(line)
                    && !(/^\uFEFF?: /.test(line) && termAbove(input, at))
                    && !(attach !== -1 && /^\+[ \t]*$/.test(lineAt(input, attach)));
                break;
            }
            at = above;
        }
        for (const line of path) memo.set(line, kind);
        return kind;
    };
    // A marker line continues an open paragraph that no list item holds.
    const markerIsParagraphText = (m) => {
        const above = previousLineStart(m.input, m.index);
        if (above === -1) return false;
        const kind = lineKind(lineAt(m.input, above));
        return kind !== 'blank' && kind !== 'boundary' && outsideAnyItem(m.input, above);
    };
    // A quoted marker line asks the same of the quote's content: the quoted
    // lines above, prefixes stripped, at most 32 of them (carve-grammars#851).
    const QUOTE_PREFIX = /^\uFEFF?[ \t]*>(?: ?>)* ?/;
    const quotedMarkerIsParagraphText = (m) => {
        const start = lineStartBefore(m.input, m.index);
        const strip = (line) => line.replace(QUOTE_PREFIX, '');
        const depth = (line) => (/^\uFEFF?[ \t]*>(?: ?>)*/.exec(line)?.[0].match(/>/g) ?? []).length;
        const ownLine = lineAt(m.input, start);
        const own = strip(ownLine);
        if (!LIST_ITEM_LINE.test(own)) return false;
        const lines = [own];
        for (let at = start, n = 0; n < 32; n++) {
            at = previousLineStart(m.input, at);
            if (at === -1) break;
            const line = lineAt(m.input, at);
            // A deeper marker line opens a quote of its own.
            if (depth(line) < depth(ownLine)) {
                // The quote's first line, behind an item marker (`- > :: t`).
                const opener = line.replace(/^\uFEFF?[ \t]*(?:(?:[-*]|\d{1,9}[.)]) +)+/, '');
                if (depth(opener) === depth(ownLine)) lines.unshift(strip(opener));
                break;
            }
            lines.unshift(strip(line));
        }
        const input = lines.join('\n');
        return markerIsParagraphText({ input, index: input.length - own.length });
    };

    // Bullet list items: - or *
    // A BULLET MAY BE GLUED TO AN ATTRIBUTE BLOCK, and then the required space
    // comes after the block - `-{#x} item` went uncoloured while LIST_NUMBER
    // already had the guard (#126). Same guard, spelled out rather than a
    // `\{[^}]*\}` run, because a quoted value may hold a `}`.
    // An abbreviation definition on an item's marker line, behind a glued
    // attribute block too (carve-grammars#850).
    const ABBREVIATION_ON_MARKER_LINE = {
        className: 'symbol',
        definition: true,
        begin: RegExp('(?=\\*\\[)(?<=' + LIST_MARKER_BEFORE_BLOCK + '|^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*' + GLUED_MARKER + ')'
            + '\\*\\[[A-Za-z0-9]+\\]:(?= +[^\\r\\n]*[^ \\t\\r\\n])'),
        'on:begin': (m) => {
            m.rule.scope = markerIsParagraphText({ input: m.input, index: lineStartBefore(m.input, m.index) }) ? undefined : 'symbol';
        },
        end: /$(?![^\r\n])/,
        relevance: 0,
    };

    const LIST_BULLET = {
        className: 'bullet',
        // A marker line may carry several markers (`- - A`, corpus 103).
        begin: RegExp(
            '^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*(?:[-*] +)*[-*](?:(?= )|' + GLUED_ATTR_BLOCK + ')(?![ \\t]*$(?![^\\r\\n]))',
        ),
        'on:begin': scopeUnless('bullet', markerIsParagraphText),
        relevance: 0,
    };

    // Numbered list items: decimal (1.), alpha (a. A.), roman (i. I.)
    // A ROMAN RUN IS CASE-CONSISTENT: two classes, not one `[ivxlcdmIVXLCDM]`, which
    // matched any mixture and coloured `Vim. text` and `Mix. text` as lists where the
    // engine renders paragraphs (#118). `mix.`, `civil.` and `did.` DO open lists, so
    // the fix is the case split, not rejecting multi-letter words.
    // MARKER REQUIRES CONTENT, AND SO DOES THE ATTRIBUTE FORM: `1.{#x}`
    // with nothing after the block is a paragraph. The glued-block branch
    // spells the block out in full rather than skipping it - a quoted value
    // may contain `}` and may escape its own quote, so a `\{[^}]*\}` run
    // stops in the wrong place and `{title="a}b"} x` is a valid item (#85).
    const LIST_NUMBER = {
        className: 'bullet',
        begin: RegExp(
            '^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*(\\d+[.)]|(?:[a-zA-Z]|[ivxlcdm]+|[IVXLCDM]+)(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2}))|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. ))(?:(?= )|' + GLUED_ATTR_BLOCK + ')(?![ \\t]*$(?![^\\r\\n]))',
        ),
        'on:begin': scopeUnless('bullet', markerIsParagraphText),
        relevance: 0,
    };

    // Task list items: - [ ] or - [x]
    // `task_state` is ` `, `x`, `X`, `-`, `_`, `/`, `!`, `>` or `?` (grammar.ebnf
    // `task_state`). Only `x`/`X` render checked; the rest are still task
    // markers, and corpus 06-task-lists-2 covers the named states.
    const TASK_LIST = {
        className: 'bullet',
        begin: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*[-*] \[[ xX\-_>\/!?]\](?= )(?![ \t]*$(?![^\r\n]))/,
        'on:begin': scopeUnless('bullet', markerIsParagraphText),
        relevance: 5,
    };

    // A `+` as the whole rest of a list item's marker line is the continuation
    // marker, like a lone `+` line.
    const MARKER_LINE_CONTINUATION = {
        className: 'punctuation',
        begin: RegExp('(?=\\+)(?<=' + LIST_MARKER_BEFORE_BLOCK + '|^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*'
            + GLUED_MARKER + '|^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*(?:(?:[-*] +(?:\\[[ xX\\-_>\\/!?]\\] +)?'
            + '|(?:[0-9]+[.)]|(?:[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+)(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2}))) +|\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. ) +))+)\\+[ \\t]*$(?![^\\r\\n])'),
        relevance: 0,
    };

    /*
     * DEFINITION-LIST LINES BY OWNER (PART 0 CARVE-P0-003, CARVE-P0-024 S2/S3).
     *
     * A `: ` line is a description marker when the deepest open frame it
     * reaches (item, description, footnote body or quote) holds a definition
     * list; a `:: ` term opens or continues one there, and any other block in
     * that frame ends it. One forward pass per input, memoized; a tab in the
     * indentation counts from each frame's column (PART 9 §24 C5).
     * `terms` and `markers` hold the offsets of the `::` and `:`, and `lists`
     * the [start, end) of each outermost list from its first term. `fences`
     * holds each fence the walk opened: its run's offset, the end of its last
     * line, its character, whether it closed and whether a quote marker
     * stands before it on its line.
     * Keep this block identical in prism/carve.js and highlightjs/carve.js.
     */
    var definitionListMemo = [];
    function definitionListLines(text) {
        for (var m = 0; m < definitionListMemo.length; m++) {
            if (definitionListMemo[m].text === text) return definitionListMemo[m];
        }
        var result = { text: text, terms: new Set(), markers: new Set(), termEnds: new Map(), termLines: new Set(), lists: [], fenced: new Set(), fences: [] };
        definitionListMemo.unshift(result);
        if (definitionListMemo.length > 4) definitionListMemo.pop();

        var frames = [{ kind: 'document', width: 0, list: null }];
        var para = -1;
        var fence = null;
        // The open term: its frame, the column of its `::` and the offset of the mark.
        var openTerm = null;
        // A line block's span pairing is not modeled here, so a fence after
        // one in the same frame is not reported in `fences`; nor is one in a
        // frame a `+` shifted.
        var lineBlock = null;
        var region = null;
        // A `+` that hands the next visible line to a frame, and the blank run.
        var attach = null;
        var blanks = 0;
        var lineRe = /[^\r\n]*(?:\r\n|\r|\n)?/g;
        var start = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
        lineRe.lastIndex = start;
        var listMarker = /^(?:[-*]|\.(?! [ \t]*\. |\{[^}\r\n]{0,4096}\}[ \t]+\. )|[0-9]+[.)]|[A-Za-z]+\)|[A-Za-z]+\.(?= {2}|\{[^}\r\n]{0,4096}\} {2}))( +(?=[^ \t])|$)/;
        var opener = /^(?:#{1,6}(?:[ \t]|$)|`{3,}|~{3,}|%{3,}|:{3,}|>|\[\^[^\]\r\n]+\]:|\|[^\r\n]*\|(?:\{[^{}\r\n]*\})?[ \t]*$|\^ |(?:-[ \t]*){3,}$|(?:\*[ \t]*){3,}$|(?:_[ \t]*){3,}$)/;
        // The lines that end a label even indented past its marker (C2-B-234).
        var labelEnd = /^(?:`{3,}|:{3,}|%{3,}|%%[ \t]*#(?:region|endregion)\b|\|[^\r\n]*\||\*{3,}[ \t]*$)/;
        var line, at, end;
        // Closerless front matter runs to the end of the text.
        var frontMatter = start === lineRe.lastIndex && /^---(?:[ \t][^\r\n]*)?(?:\r\n|\r|\n|$)/.test(text.slice(start));

        function closeTo(depth) {
            while (frames.length - 1 > depth) frames.pop();
            if (para > depth) para = -1;
        }
        function endList(frame) {
            frame.list = null;
        }
        function extend(to) {
            if (region) region[1] = to;
        }
        function openList(frame, offset) {
            if (frame.list) return;
            frame.list = {};
            var inside = false;
            for (var f = 0; f < frames.length; f++) if (frames[f] !== frame && frames[f].list) inside = true;
            if (!inside || !region) {
                region = [offset, offset];
                result.lists.push(region);
            }
        }
        function walk(line, plain) {
            var i = 0;
            var carry = 0;
            var reached = 0;
            var shifted = -1;
            var starts = [0];
            for (var k = 1; k < frames.length; k++) {
                var frame = frames[k];
                starts[k] = i;
                var useShift = frame.shift !== undefined && (frame.list || k + 1 < frames.length) && k !== plain && shifted === -1;
                if (frame.kind === 'quote') {
                    var q = /^[ \t]*>/.exec(line.slice(i));
                    if (!q) {
                        if (!useShift) break;
                        shifted = k;
                        reached = k;
                        continue;
                    }
                    i += q[0].length;
                    carry = 0;
                    if (line.charAt(i) === ' ') i++;
                    reached = k;
                    continue;
                }
                if (/^[ \t]*$/.test(line.slice(i))) {
                    reached = k;
                    continue;
                }
                var need = useShift ? frame.shift : frame.width;
                var col = carry;
                var j = i;
                while (col < need && j < line.length && (line.charAt(j) === ' ' || line.charAt(j) === '\t')) {
                    col = line.charAt(j) === '\t' ? col + 4 - (col % 4) : col + 1;
                    j++;
                }
                if (col < need) break;
                if (useShift) shifted = k;
                i = j;
                carry = col - need;
                reached = k;
            }
            return { i: i, carry: carry, reached: reached, shifted: shifted, starts: starts };
        }
        function anyList() {
            for (var f = 0; f < frames.length; f++) if (frames[f].list) return true;
            return false;
        }

        while (lineRe.lastIndex < text.length) {
            at = lineRe.lastIndex;
            line = lineRe.exec(text)[0];
            if (!line) break;
            end = at + line.replace(/(?:\r\n|\r|\n)$/, '').length;
            line = text.slice(at, end);
            if (frontMatter) {
                if (at !== start && /^(?:---|\.\.\.)[ \t]*$/.test(line)) frontMatter = false;
                continue;
            }

            // S2: walk the open frames from the outside in. A frame holding a
            // list that a `+` attached reads that list's lines from the
            // attached column first.
            var blank = /^[ \t]*$/.test(line);
            var walked = walk(line, -1);
            if (walked.shifted !== -1) {
                var shiftedRest = line.slice(walked.i).replace(/^[ \t]*/, '');
                if (!(walked.reached > walked.shifted || (frames[walked.shifted].list && /^::? +[^ \t]/.test(shiftedRest)))) walked = walk(line, walked.shifted);
            }
            var i = walked.i;
            var carry = walked.carry;
            var reached = walked.reached;
            var lead = /^[ \t]*/.exec(line.slice(i))[0];
            var indent = carry;
            for (var c = 0; c < lead.length; c++) indent = lead.charAt(c) === '\t' ? indent + 4 - (indent % 4) : indent + 1;
            var rest = line.slice(i + lead.length);
            var restAt = at + i + lead.length;

            if (fence) {
                // A fence ends with its frame. A comment fence closes on an
                // exact-width run anywhere, a lazy one included.
                var closes = fence.ch === '%'
                    ? /^%{3,}/.test(rest) && /^%+/.exec(rest)[0].length === fence.len
                    : reached === fence.owner && indent <= fence.indent && /^(`{3,}|~{3,})[ \t]*$/.test(rest)
                        && rest.charAt(0) === fence.ch && /^[`~]+/.exec(rest)[0].length >= fence.len;
                if (reached >= fence.owner || closes) {
                    if (!blank) fence.run.end = end;
                    if (closes) {
                        fence.run.closed = true;
                        fence = null;
                    }
                    result.fenced.add(at);
                    if (anyList()) extend(end);
                    continue;
                }
                fence = null;
            }
            // A term holds the lines indented past its `::`; a comment-only line between is not seen (C2-B-069, C2-B-234).
            if (openTerm && /^%%(?!%)(?![ \t]*#(?:region|endregion)\b)/.test(rest)) openTerm.comments.push(at);
            else if (openTerm) {
                if (!blank && rest && reached >= openTerm.depth && indent > openTerm.indent && !labelEnd.test(rest)) {
                    result.termEnds.set(openTerm.at, end);
                    openTerm.comments.push(at);
                    openTerm.comments.forEach(function (line) { result.termLines.add(line); });
                    openTerm.comments = [];
                    blanks = 0;
                    extend(end);
                    continue;
                }
                openTerm = null;
            }
            // S1: a line comment and a one-line link definition are erased.
            if (/^%%(?!%)/.test(rest) || /^\[(?!\^)[^\]\r\n]+\]:(?:[ \t]+[^ \t]+)?[ \t]*$/.test(rest)) {
                blanks = 0;
                continue;
            }
            // A `%%%` comment span ends the paragraph and leaves every frame open.
            if (/^%{3,}/.test(rest)) {
                fence = { owner: reached, indent: indent, ch: '%', len: /^%+/.exec(rest)[0].length };
                fence.run = { at: restAt, end: end, ch: '%', closed: false, quoted: line.slice(0, restAt - at).indexOf('>') !== -1, depth: reached };
                result.fences.push(fence.run);
                para = -1;
                blanks = 0;
                if (anyList()) extend(end);
                continue;
            }
            if (blank || !rest) {
                para = -1;
                attach = null;
                closeTo(reached);
                // Three blank lines end every open list.
                if (++blanks >= 3) {
                    for (var b = 0; b < frames.length; b++) endList(frames[b]);
                    region = null;
                }
                continue;
            }
            blanks = 0;
            var owner = frames[reached];
            var term = /^::( +)(?![ \t]*$)(?!:)/.test(rest);
            var marker = /^:( +)(?![ \t]*$)/.test(rest) && !/^::/.test(rest);
            // The line after an accepted `+` belongs to its host whatever its
            // column, unless it is a term, a marker or an attribute line.
            if (attach) {
                var host = attach;
                attach = null;
                if (host.frame.kind === 'quote' && frames[host.depth] === host.frame && reached >= host.depth) {
                    // A quoted line after it is the quote's first block as written, marker and all.
                    var from = walked.starts[host.depth];
                    lead = /^[ \t]*/.exec(line.slice(from))[0];
                    rest = line.slice(from + lead.length);
                    restAt = at + from + lead.length;
                    indent = 0;
                    reached = host.depth;
                    owner = host.frame;
                    endList(owner);
                    term = marker = false;
                } else if (frames[host.depth] === host.frame && reached >= host.parent && reached < host.depth
                    && (reached > host.parent || indent >= host.column)
                    && !(host.frame.kind === 'description' && /^::? /.test(rest)) && !/^\{[^\r\n]*\}[ \t]*$/.test(rest)) {
                    // An attached block keeps its later lines at the attached column.
                    if (reached === host.parent) host.frame.shift = host.frame.kind === 'quote' ? 0 : host.column;
                    reached = host.depth;
                    owner = host.frame;
                    indent = 0;
                    if (para !== -1 && para < host.depth) para = -1;
                }
            }
            // A lone `+` at the marker column of the frame just past its owner
            // hands that frame the next line; any other `+` is a letter.
            if (/^\+[ \t]*$/.test(rest) && reached + 1 < frames.length && frames[reached + 1].column === indent) {
                attach = { frame: frames[reached + 1], depth: reached + 1, parent: reached, column: indent };
                para = -1;
                continue;
            }
            // A line short of the open paragraph's frames is lazy text unless it opens a block there.
            if (reached < frames.length - 1 && para !== -1 && !term && !(marker && owner.list)
                && !opener.test(rest) && !(listMarker.test(rest) && frames[para].kind !== 'document' && frames[para].kind !== 'quote')) {
                if (anyList()) extend(end);
                continue;
            }
            closeTo(reached);
            if (!anyList()) region = null;

            // S3: read the line's form in its owner, opening containers in turn.
            for (var guard = 0; guard < 64; guard++) {
                owner = frames[frames.length - 1];
                var depth = frames.length - 1;
                var termMatch = /^::( +)(?![ \t]*$)(?!:)/.exec(rest);
                var markerMatch = !termMatch && !/^::/.test(rest) && /^:( +)(?![ \t]*$)/.exec(rest);
                var item = !termMatch && !markerMatch && listMarker.exec(rest);
                if (termMatch) {
                    openList(owner, restAt);
                    result.terms.add(restAt);
                    openTerm = { depth: depth, indent: indent, at: restAt, comments: [] };
                    para = -1;
                    break;
                }
                if (markerMatch && owner.list) {
                    result.markers.add(restAt);
                    var width = indent + 1 + markerMatch[1].length;
                    frames.push({ kind: 'description', width: width, column: indent, list: null });
                    rest = rest.slice(1 + markerMatch[1].length);
                    restAt += 1 + markerMatch[1].length;
                    indent = 0;
                    para = frames.length - 1;
                    if (/^\+[ \t]*$/.test(rest)) {
                        attach = { frame: frames[frames.length - 1], depth: frames.length - 1, parent: depth, column: frames[frames.length - 1].column };
                        para = -1;
                        break;
                    }
                    if (/^::( +)(?![ \t]*$)(?!:)/.test(rest)) continue;
                    break;
                }
                if (!termMatch && !markerMatch && /^(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(rest)) {
                    endList(owner);
                    para = -1;
                    break;
                }
                if (item && !((owner.kind === 'document' || owner.kind === 'quote') && para === depth)) {
                    endList(owner);
                    frames.push({ kind: 'item', width: indent + item[0].length, column: indent, list: null });
                    rest = rest.slice(item[0].length);
                    restAt += item[0].length;
                    indent = 0;
                    para = -1;
                    // A task box is content: the item's column stays at its marker's.
                    var box = /^\[[ xX\-_>\/!?]\]( +(?=[^ \t])|$)/.exec(rest);
                    if (box) {
                        rest = rest.slice(box[0].length);
                        restAt += box[0].length;
                        indent = box[0].length;
                    }
                    if (/^\+[ \t]*$/.test(rest)) attach = { frame: frames[frames.length - 1], depth: frames.length - 1, parent: depth, column: frames[frames.length - 1].column };
                    if (!rest || attach) break;
                    continue;
                }
                if (/^>/.test(rest)) {
                    endList(owner);
                    frames.push({ kind: 'quote', width: 0, column: indent, list: null });
                    var after = rest.charAt(1) === ' ' ? 2 : 1;
                    rest = rest.slice(after);
                    restAt += after;
                    if (/^%%(?!%)/.test(rest) || /^\[(?!\^)[^\]\r\n]+\]:(?:[ \t]+[^ \t]+)?[ \t]*$/.test(rest)) rest = '';
                    lead = /^[ \t]*/.exec(rest)[0];
                    indent = 0;
                    for (var d = 0; d < lead.length; d++) indent = lead.charAt(d) === '\t' ? indent + 4 - (indent % 4) : indent + 1;
                    rest = rest.slice(lead.length);
                    restAt += lead.length;
                    para = -1;
                    if (!rest) break;
                    continue;
                }
                var footnote = /^\[\^[^\]\r\n]+\]:/.exec(rest);
                if (footnote) {
                    endList(owner);
                    frames.push({ kind: 'footnote', width: indent + 2, column: indent, list: null });
                    var body = /^[ \t]*/.exec(rest.slice(footnote[0].length))[0].length;
                    rest = rest.slice(footnote[0].length + body);
                    restAt += footnote[0].length + body;
                    indent = 0;
                    para = -1;
                    if (!rest) break;
                    continue;
                }
                var fenceOpen = /^(`{3,}|~{3,}|%{3,})/.exec(rest);
                if (fenceOpen) {
                    // A `%%%` comment span is invisible to the list around it.
                    if (fenceOpen[1].charAt(0) !== '%') endList(owner);
                    fence = { owner: depth, indent: indent, ch: fenceOpen[1].charAt(0), len: fenceOpen[1].length };
                    fence.run = { at: restAt, end: end, ch: fence.ch, closed: false, quoted: line.slice(0, restAt - at).indexOf('>') !== -1, depth: depth };
                    var shiftedFrame = false;
                    for (var sf = 0; sf <= depth; sf++) if (frames[sf].shift !== undefined) shiftedFrame = true;
                    if (!shiftedFrame && !(lineBlock && frames[lineBlock.owner] === lineBlock.frame && lineBlock.owner <= depth)) result.fences.push(fence.run);
                    para = -1;
                    break;
                }
                if (opener.test(rest) || /^\{[^\r\n]*\}[ \t]*$/.test(rest)) {
                    if (/^:{3,} +\|[ \t]*$/.test(rest)) lineBlock = { owner: depth, frame: owner };
                    endList(owner);
                    para = -1;
                    break;
                }
                if (para !== depth) {
                    endList(owner);
                    para = depth;
                }
                break;
            }
            if (anyList()) extend(end);
            else region = null;
        }
        return result;
    }

    // Definition-list description marker: `:  def`. Reused as a nested mode
    // inside DEFINITION_LIST_ENTRY - not registered as a top-level mode. The
    // body is an inline run, left to the entry's inline modes.
    // The open description's content column, which DEFINITION_LIST_ENTRY's
    // end reads; a term resets it, so no list inherits another's.
    let descriptionColumn = Infinity;
    const DESCRIPTION_MARKER = {
        className: 'punctuation',
        begin: RegExp('^(?<![^\\r\\n])([ \\t]*)(?=:)' + ':(?= +(?![ \\t]*$(?![^\\r\\n])))'),
        'on:begin': (match) => {
            if (!definitionListLines(match.input).markers.has(match.index + match[1].length)) {
                match.rule.scope = undefined;
                return;
            }
            match.rule.scope = 'punctuation';
            const separator = / */y;
            separator.lastIndex = match.index + match[0].length;
            separator.test(match.input);
            descriptionColumn = match.input.startsWith(':: ', separator.lastIndex) ? Infinity : separator.lastIndex - match.index;
        },
        relevance: 5,
    };
    // An abbreviation definition on the description's own `: ` line. The opener
    // starts the inert expansion only behind a real marker, so a `:` that is no
    // marker leaves the rest of its line to the inline modes (highlight.js reads
    // `starts` when the opener ends). Outside an entry it serves one an item's
    // marker line opened, so it needs an indent there.
    const abbreviationOnDescription = (indent) => {
        const expansion = { className: 'symbol', end: /$(?![^\r\n])/ };
        return {
            className: 'symbol',
            definition: true,
            begin: RegExp('(?=\\*\\[)(?<=^(?<![^\\r\\n])' + indent + ': +)\\*\\[[A-Za-z0-9]+\\]:(?= +[^\\r\\n]*[^ \\t\\r\\n])'),
            starts: expansion,
            'on:begin': (match) => {
                const marker = match.input.lastIndexOf(':', match.index - 1);
                const isMarker = definitionListLines(match.input).markers.has(marker);
                match.rule.scope = isMarker ? 'symbol' : undefined;
                match.rule.starts = isMarker ? expansion : null;
            },
            relevance: 0,
        };
    };
    const DESCRIPTION_CONTINUATION = {
        className: 'punctuation',
        begin: /(?=\+)(?<=^(?<![^\r\n])[ \t]*: +)\+[ \t]*$(?![^\r\n])/,
        relevance: 0,
    };

    // Definition-list entry: `:: term` through its `:  def` line(s)
    // (grammar.ebnf `definition_entry`).
    //
    // A `:` description line scopes only INSIDE an entry that a real `:: `
    // term opened (carve-grammars#91) - the description mode used to be
    // registered as its own top-level mode, matched unconditionally, so a bare `:  d`
    // with no term above it (or a term the separator rule disqualified, e.g.
    // `::\tterm` - the marker separator is a literal space per the
    // tab-and-separator ruling on markup-carve/carve#698, a tab never
    // satisfies it) was scoped as a definition even though the engines render
    // it as a paragraph. The entry opens on a real term line and runs through
    // lines that are not some OTHER block opener (see
    // OTHER_BLOCK_OPENER_SOURCE above). `begin` is a zero-width lookahead so
    // DEFINITION_TERM/DESCRIPTION_MARKER (below, in `contains`) do the actual
    // per-line matching and coloring themselves.
    const DEFINITION_LIST_ENTRY = {
        begin: RegExp('^(?<![^\\r\\n])(?=(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*:: (?![ \\t]*$(?![^\\r\\n])))'),
        // Also ends at blank lines followed by a line no entry holds: not a
        // marker, and not indented to the open description's content column,
        // as carve-js reads it. It consumes the blank lines, since highlight.js
        // re-runs an end on the remainder, where a lookbehind sees nothing.
        end: new RegExp('^(?<![^\\r\\n])(?=' + OTHER_BLOCK_OPENER_SOURCE + ')'
            + '|\\n(?:[ \\t\\r]*\\n)+(?![ \\t]*::? +(?![ \\t]*$(?![^\\r\\n])))(?=([ \\t]*)[^\\s])'
            // An inline rule takes `---` or `{.c}` at the line start first, so the entry ends on the newline before it.
            + '|\\n(?=(?:-{3,}|\\*{3,}|_{3,}|\\{[^\\n]*\\})[ \\t]*\\r?$(?![^\\r\\n]))'
            // A definition under a term, not under a description, stands on its
            // own (C2-B-081); `on:end` reads which came last, since highlight.js
            // checks an end again on the remainder, where a lookbehind sees nothing.
            + '|\\n(?=(\\uFEFF?(?:\\[[^\\]\\r\\n]+\\]:|\\*\\[[A-Za-z0-9]+\\]:)))'),
        'on:begin': () => {
            descriptionColumn = Infinity;
        },
        'on:end': (match, response) => {
            if (match[1] !== undefined && match[1].length >= descriptionColumn) response.ignoreMatch();
            // A term resets the column to Infinity, a description sets it.
            if (match[2] !== undefined && descriptionColumn !== Infinity) response.ignoreMatch();
        },
        relevance: 0,
        // The inline modes are appended once CONTAINS exists.
        contains: [DEFINITION_TERM, DESCRIPTION_MARKER, DESCRIPTION_CONTINUATION, TABLE_CONTINUATION, bodyAttribute(':')],
    };

    /*
     * FENCED CODE AND RAW BLOCKS - ONE MODE PER BLOCK, NOT ONE PER DELIMITER.
     *
     * A code block's payload is NOT Carve (spec PART 9 §2, `code_content`:
     * "any text until matching fence, preserved literally"), and until
     * carve-grammars#309 this file said so about the delimiters only: the
     * opener and the closer were two independent single-line modes with
     * NOTHING between them, so the body was handed to the full top-level mode
     * list and
     *
     *     ```
     *     x *b* y
     *     ```
     *
     * coloured `*b*` `strong` inside code. That is the markup-carve/carve#1239
     * shape one construct over - a payload that is recognized and still live -
     * and it is worse than leaving the block unhighlighted, because the output
     * then claims the document says something it does not.
     *
     * A begin/end mode with an EMPTY `contains` is what makes a payload inert
     * in this engine: highlight.js offers a mode's `contains` and nothing else
     * inside it, so an empty list is the whole suppression. The fence runs
     * keep the `keyword` scope through `beginScope` / `endScope`, and the body
     * carries `code`: inert, or its named language's (see FENCE_LANGUAGES).
     *
     * THE CLOSER IS REQUIRED UP FRONT, the same guard `BLOCK_COMMENT` carries
     * below and for the same engine reason: highlight.js has no begin->end
     * backreference, so a mode that opens on an unpartnered fence runs to END
     * OF FILE and greys out the rest of the document.
     *
     * THE FORWARD SCAN IS BOUNDED, because proving there is NO closer costs a
     * scan to end of input and a document can carry many openers that have
     * none. The bound is 32 KB rather than the 8 KB `BLOCK_COMMENT` uses, and
     * the difference is the point: a code block THAT BIG is an ordinary
     * document (32 KB is some 800 lines of source), and past the bound the
     * fence opens no mode and its payload goes back to being live prose - which
     * is this issue again, at a size. Measured on a hostile 200 KB document
     * carrying 100 openers with no closer ahead of any of them: 23 ms at 8 KB,
     * 57 ms at 32 KB, 114 ms at 64 KB, 284 ms at 256 KB, linear in the bound
     * and linear in the document at each of them. 32 KB buys the blocks people
     * write for a cost that stays in the tens of milliseconds on a document
     * built to be slow.
     *
     * A HOSTILE DOCUMENT IS ALSO HARDER TO BUILD HERE than for `%%%`, which is
     * why the bounds differ at all. A comment fence closes on an EXACT width,
     * so a file of runs of INCREASING width leaves every one of them unmatched
     * and pays the scan once each - linear input, quadratic work. A code fence
     * closes on any run at least as long, so that same file matches every
     * opener at the next line; leaving N openers unmatched needs strictly
     * DECREASING widths, which costs O(N^2) characters to write down.
     *
     * AN UNTERMINATED FENCE runs to the end of the document, closers of the
     * containers around it included (PART 0 S1). `UNCLOSED_CODE_BLOCK` below
     * takes that shape at column 0; an indented one falls to `LONE_CODE_FENCE`,
     * which colours the delimiter line only, since this grammar cannot see the
     * list item or quote that would end it.
     *
     * THE CLOSER MATCHES ITS OPENER, and the rule is not the colon fence's.
     * A code fence closes on the SAME fence character at a length >= the
     * opener's (PART 9 §2, `code_fence_close`), where a colon fence wants an
     * exact length (§12) - so `DIV_BLOCK`'s width check next door is `!==` and
     * this one is `<`. Measured against the engine: ``` closed by ```` is one
     * code block, ```` closed by ``` is not.
     */

    // What may follow the fence on the opener line (grammar.ebnf
    // `code_fence_info`): a language token, then an optional "title", then an
    // optional [label]; or a title and label; or a label alone - in that fixed
    // order, and nothing else. The punctuation in the language token is the
    // grammar's (`c++`, `f#`, `asp.net`, `text/html`), and it may start with a
    // digit; a leading `=` is excluded there because that is the raw opener.
    //
    // STRICTER THAN THE `\s*[a-zA-Z]*` IT REPLACES, and wider where it counts.
    // The old spelling took no `c++`, no `text/html`, no digit and no `=html`,
    // so every one of those fences was NOT recognized and its body was live
    // prose - the same leak this rule is about, reached through the opener
    // rather than through the missing body. It also spelled the separator
    // `\s*`, which under the `m` flag these patterns compile with reaches
    // ACROSS the newline: on ```` ```\nfoo ```` the opener matched `` ```\nfoo ``
    // and scoped the first line of the payload as a delimiter.
    const FENCE_LANGUAGE = '[A-Za-z0-9_+#./-]+';
    const FENCE_TITLE = '"[^"\\n]*"';
    const FENCE_LABEL = '\\[[^\\]\\n]*\\]';
    const CODE_FENCE_INFO =
        '(?:' + FENCE_LANGUAGE + '(?: +' + FENCE_TITLE + ')?(?: +' + FENCE_LABEL + ')?'
        + '|' + FENCE_TITLE + '(?: +' + FENCE_LABEL + ')?'
        + '|' + FENCE_LABEL + ')';
    // A raw block is a code fence whose info string is `=` immediately followed
    // by a format name (grammar.ebnf `raw_block`): ```=html, and ``` =html with
    // the one permitted space, but never ```= html. It takes no title and no
    // label.
    const RAW_FENCE_INFO = '=[A-Za-z_][\\w-]*';
    // The ONE optional space between the fence and its info string is the
    // grammar's `[space]`, singular and never a tab: ```` ```  js ```` and
    // ```` ```<TAB>js ```` are paragraphs in the engine, where ```` ``` js ````
    // is a fence. Trailing whitespace after the info string is not part of it.
    // The opener consumes its indent and fence run only; the info string is
    // checked here and scoped by the block's own modes below.
    const fenceOpener = (info) =>
        '^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?([ \\t]*)(([`~])\\3{2,})(?=(?: ?' + info + ')?[ \\t]*$(?![^\\r\\n]))'
        // The closer, required ahead, on a line of its own: at or left of the
        // opener's indent (`\1`), then the same character (`\3`) at a length
        // at least the opener's (`\2`, then any number more of it).
        + '(?=[\\s\\S]{0,32768}?\\n(?:\\1|(?!\\1[ \\t])[ ]*)\\2\\3*[ \\t]*$(?![^\\r\\n]))';

    /*
     * THE BODY IS HIGHLIGHTED IN THE LANGUAGE ITS INFO STRING NAMES, when that
     * language is registered with highlight.js; otherwise it stays inert text.
     * Keys are highlight.js language names, words are the info-string words
     * from fence-languages/fence-languages.json that highlight.js can resolve
     * (tests/fence-embedding-hljs-test.js keeps the two in step). A raw block
     * (```=html) takes its format's language, and a bare fence under a `.diff`
     * attribute line is a diff.
     */
    const FENCE_LANGUAGES = {
        carve: ['carve', 'crv'],
        javascript: ['js', 'javascript', 'mjs', 'cjs', 'node', 'jsx'],
        typescript: ['ts', 'typescript', 'mts', 'cts', 'tsx'],
        json: ['json', 'json5', 'jsonc'],
        yaml: ['yaml', 'yml'],
        ini: ['toml', 'ini', 'cfg'],
        csv: ['csv'],
        tsv: ['tsv'],
        xml: ['html', 'htm', 'xhtml', 'xml', 'svg', 'xsd', 'xsl', 'xslt'],
        css: ['css'],
        scss: ['scss'],
        less: ['less'],
        php: ['php'],
        python: ['python', 'py', 'py3'],
        ruby: ['ruby', 'rb'],
        rust: ['rust', 'rs'],
        go: ['go', 'golang'],
        java: ['java'],
        kotlin: ['kotlin', 'kt', 'kts'],
        swift: ['swift'],
        dart: ['dart'],
        c: ['c', 'h'],
        cpp: ['cpp', 'c++', 'cxx', 'cc', 'hpp'],
        csharp: ['cs', 'csharp', 'c#'],
        fsharp: ['fsharp', 'fs', 'f#'],
        vbnet: ['vb', 'vbnet'],
        objectivec: ['objc', 'objectivec', 'objective-c'],
        bash: ['sh', 'bash', 'shell', 'zsh'],
        powershell: ['powershell', 'ps1', 'pwsh'],
        dos: ['bat', 'batch', 'cmd', 'dosbatch'],
        sql: ['sql'],
        lua: ['lua'],
        perl: ['perl', 'pl'],
        r: ['r'],
        julia: ['julia', 'jl'],
        clojure: ['clojure', 'clj', 'cljs', 'edn'],
        coffeescript: ['coffeescript', 'coffee'],
        groovy: ['groovy', 'gradle'],
        markdown: ['markdown', 'md'],
        latex: ['latex', 'tex'],
        handlebars: ['handlebars', 'hbs'],
        diff: ['diff', 'patch'],
        dockerfile: ['dockerfile', 'docker'],
        makefile: ['makefile', 'make'],
        twig: ['twig'],
        graphql: ['graphql', 'gql'],
        haskell: ['haskell', 'hs'],
        scala: ['scala'],
        erlang: ['erlang', 'erl'],
        ocaml: ['ocaml'],
        lisp: ['lisp'],
        d: ['d'],
        matlab: ['matlab'],
        delphi: ['pascal'],
        tcl: ['tcl'],
        applescript: ['applescript'],
        erb: ['erb'],
        haml: ['haml'],
    };
    const RAW_FENCE_LANGUAGES = { xml: ['html'], latex: ['latex', 'tex'] };
    // The open block, shared by the block and its body modes, per document:
    // a Carve body is highlighted as a second document inside the first.
    const CODE_FENCES = {};
    const codeFence = (m) => docState(CODE_FENCES, m);
    const closesFence = (m) => {
        const open = codeFence(m);
        // A closer at or left of a plain opener's column closes it; a marker-line
        // opener knows its item, so its closer sits at the item's content column.
        const column = m[1] === open.indent
            || (!open.exact && !m[1].includes('\t') && !(m[1].startsWith(open.indent) && m[1].length > open.indent.length));
        return column && m[2][0] === open.run[0] && m[2].length >= open.run.length;
    };
    // The opener line a body reads its language off, in a lookbehind checked
    // only at that line's end. Words match case-insensitively.
    const anyCase = (word) => [...word].map((c) => (/[a-z]/.test(c) ? `[${c}${c.toUpperCase()}]` : /[+#.\/-]/.test(c) ? '\\' + c : c)).join('');
    const OPENER_LINE = '^(?<![^\\r\\n])(?:(?<![\\s\\S])\uFEFF)?(?:[ \\t]*|'
        + LIST_MARKER_BEFORE_BLOCK.replace('^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?', '')
        + ')(?:`{3,}|~{3,}) ?';
    const languageOpener = (key) => [
        ...(FENCE_LANGUAGES[key] ? [OPENER_LINE + '(?:' + FENCE_LANGUAGES[key].map(anyCase).join('|') + ')(?![A-Za-z0-9_+#./-])[^\\n]*'] : []),
        ...(RAW_FENCE_LANGUAGES[key] ? [OPENER_LINE + '=(?:' + RAW_FENCE_LANGUAGES[key].map(anyCase).join('|') + ')(?![\\w-])[ \\t]*'] : []),
        // A bare fence under a `.diff` attribute line.
        ...(key === 'diff' ? ['^(?<![^\\r\\n])[ \\t]*\\{[^{}\\n]*\\.diff(?![\\w-])[^{}\\n]*\\}[ \\t]*\\r?\\n[ \\t]*(?:`{3,}|~{3,})[ \\t]*'] : []),
    ].join('|');
    // The body starts at the opener's line end and ends at the newline before
    // the closer; an inner run that does not close it is payload.
    const fenceBody = (subLanguage) => ({
        begin: subLanguage ? new RegExp('(?=\\n)(?<=' + languageOpener(subLanguage) + ')') : /(?=\n)/,
        end: /\n(?=([ \t]*)(`{3,}|~{3,})[ \t]*$(?![^\r\n]))/,
        'on:end': (m, resp) => {
            if (!closesFence(m)) resp.ignoreMatch();
        },
        // Without a language the payload is inert: it contains nothing.
        ...(subLanguage ? { subLanguage } : { contains: [] }),
    });
    const FENCE_BODIES = [...Object.keys(FENCE_LANGUAGES).map(fenceBody), fenceBody(undefined)];
    const FENCE_INFO_LEAD = '(?<=' + OPENER_LINE + ')';
    const FENCE_INFO = [
        { className: 'title', begin: new RegExp('(?=[A-Za-z0-9_+#./-])' + FENCE_INFO_LEAD + FENCE_LANGUAGE) },
        { className: 'keyword', begin: new RegExp('(?==)' + FENCE_INFO_LEAD + RAW_FENCE_INFO) },
        { className: 'string', begin: new RegExp(FENCE_TITLE) },
        { className: 'symbol', begin: new RegExp(FENCE_LABEL) },
    ];

    /**
     * A fenced block whose payload is verbatim.
     *
     * @param {string} info - the info-string shape this fence carries.
     * @returns {object} a highlight.js mode whose body is its language's.
     */
    const fencedVerbatim = (info) => ({
        className: 'code',
        // Anchored `^[ \t]*` on purpose - no container model here, see the
        // indented-block-openers note in the module docblock (carve-grammars#138).
        beginScope: 'keyword',
        begin: new RegExp(fenceOpener(info)),
        'on:begin': (m) => {
            Object.assign(codeFence(m), { indent: m[1], run: m[2], exact: false });
        },
        endScope: 'keyword',
        // The closer is a HOMOGENEOUS run: ONE fence character repeated, not a
        // character class repeated. A mixed line is payload, which is what the
        // engine calls it - a backtick fence is not closed by a run of three
        // backticks and a tilde.
        end: /^(?<![^\r\n])([ \t]*)(`{3,}|~{3,})[ \t]*$(?![^\r\n])/,
        // THE CLOSER SITS AT OR LEFT OF THE OPENER'S COLUMN, and a run indented
        // past it is payload. That is what lets a fence hold a fence as sample text -
        // the shape every document describing Carve in Carve is made of:
        //
        //     ```
        //       ```
        //     *still code*
        //     ```
        //
        // is ONE code block whose content is the indented run and the line under
        // it (measured; PART 9 §2, COLUMN-EXACT DELIMITERS). Compared to the
        // opener's indent rather than anchored at column 0, because a fence
        // inside a list item is legitimately indented and this grammar has no
        // container model to tell the two apart - see the note in the module
        // docblock.
        'on:end': (m, resp) => {
            if (!closesFence(m)) resp.ignoreMatch();
        },
        // The info line, then the body, which a catch-all always opens at the
        // first line end so nothing else runs inside the payload.
        contains: [...FENCE_INFO, ...FENCE_BODIES],
        relevance: 10,
    });

    const CODE_BLOCK = fencedVerbatim(CODE_FENCE_INFO);
    const RAW_BLOCK = fencedVerbatim(RAW_FENCE_INFO);
    const MARKER_CODE_FORMS = [];
    for (let depth = 1; depth <= 8; depth++) {
        MARKER_CODE_FORMS.push([Array(depth).fill('[-*] ').join(''), depth * 2]);
        MARKER_CODE_FORMS.push([Array(depth).fill('[-*] ').join('') + '\\[[ xX\\-_>\\/!?]\\] ', depth * 2]);
    }
    for (let digits = 1; digits <= 9; digits++) {
        MARKER_CODE_FORMS.push(['[0-9]{' + digits + '}[.)] ', digits + 2]);
    }
    for (let roman = 2; roman <= 6; roman++) {
        MARKER_CODE_FORMS.push(['(?:[ivxlcdm]{' + roman + '}|[IVXLCDM]{' + roman + '})\\) ', roman + 2]);
        MARKER_CODE_FORMS.push(['(?:[ivxlcdm]{' + roman + '}|[IVXLCDM]{' + roman + '})\\.  ', roman + 3]);
    }
    MARKER_CODE_FORMS.push(['[A-Za-z]\\) ', 3], ['[A-Za-z]\\.  ', 4], ['\\.(?! [ \\t]*\\. |\\{[^}\\r\\n]{0,4096}\\}[ \\t]+\\. ) ', 2]);
    const PLAIN_LINE_BEFORE_MARKER = '(?<![^\\n])(?!(?:[-*] +|[0-9]+[.)] +|(?:[ivxlcdm]+|[IVXLCDM]+)(?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2})) +|[A-Za-z](?:\\)|\\.(?= {2}|\\{[^}\\r\\n]{0,4096}\\} {2})) +|\\.(?! [ \\t]*\\. ) +|> |#{1,6} |:{2,}|\\||[-*_]{3,}|[`~]{3,}|%%|\\+))[\\S][^\\n]*\\n';
    const markerLineFence = (info, marker, width) => ({
        className: 'code',
        beginScope: 'keyword',
        begin: RegExp('(?=[`~])(?<=^(?<![^\\r\\n])(?<!' + PLAIN_LINE_BEFORE_MARKER
            + ')(?:(?<![\\s\\S])\\uFEFF)?([ \\t]*)'
            + marker + ')((`|~)\\3{2,})'
            + '(?=(?: ?' + info + ')?[ \\t]*\\r?$(?![^\\r\\n]))'
            + '(?=[^\\n]*(?:\\n[ \\t]*\\r?(?![^\\n])|\\n\\1[ ]{' + width
            + '}[ \\t]*[^ \\t\\r\\n][^\\r\\n]*\\r?)*?\\n\\1[ ]{' + width
            + '}\\2\\3*[ \\t]*\\r?$(?![^\\r\\n]))'),
        'on:begin': (m) => {
            Object.assign(codeFence(m), { indent: m[1] + ' '.repeat(width), run: m[2], exact: true });
        },
        endScope: 'keyword',
        end: /^(?<![^\r\n])([ \t]*)(`{3,}|~{3,})[ \t]*\r?$(?![^\r\n])/,
        'on:end': (m, resp) => {
            if (!closesFence(m)) resp.ignoreMatch();
        },
        contains: [...FENCE_INFO, ...FENCE_BODIES],
        relevance: 10,
    });
    const CODE_BLOCK_ON_MARKER_LINE = MARKER_CODE_FORMS.map(([marker, width]) => markerLineFence(CODE_FENCE_INFO, marker, width));
    const RAW_BLOCK_ON_MARKER_LINE = MARKER_CODE_FORMS.map(([marker, width]) => markerLineFence(RAW_FENCE_INFO, marker, width));

    // A FENCE LINE THIS GRAMMAR DOES NOT PAIR: an opener with no closer ahead,
    // and the closer of a pair the rules above did not take. It stays what both
    // delimiter rules were before #309 - a single-line mode that colours the run
    // and claims nothing under it.
    //
    // ONE MODE, not the two this replaced. `CODE_FENCE_START` and
    // `CODE_FENCE_END` matched the same lines once the opener rule stopped
    // requiring the info string to be a bare word: whichever came first in
    // `contains` took every fence line and the other could not fire. A rule that
    // cannot fire is the defect this repository has shipped three times
    // (carve-grammars#295, #298, #300), so there is one rule with one name.
    const LONE_CODE_FENCE = {
        className: 'keyword',
        // Anchored `^[ \t]*` on purpose - no container model here, see the
        // indented-block-openers note in the module docblock (carve-grammars#138).
        begin: new RegExp(
            '^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*(?:`{3,}|~{3,})'
            + '(?: ?(?:' + CODE_FENCE_INFO + '|' + RAW_FENCE_INFO + '))?[ \\t]*$(?![^\\r\\n])',
        ),
        relevance: 10,
    };

    // Div block: ::: with optional type, "title", [label], or the | / \ / >
    // sigil tokens, through its matching closer. `::: >` is the fenced block
    // quote (markup-carve/carve#1718), the third member of that family: like
    // `::: |` it takes no identifier, so it reaches no `::: name` rule and was
    // scoped as nothing at all before it was listed here. A separated kind
    // word recovers invalid metadata; sigil and typeless forms stay strict.
    //
    // A real begin/end mode (carve-grammars#125), not two independent
    // single-line modes: a per-line match left the body wide open to the
    // full top-level mode list. highlight.js has no begin->end backreference, so
    // the closer's width is checked the same way BLOCK_COMMENT already does
    // above: captured on `on:begin`, compared on `on:end`, and rejected with
    // `ignoreMatch()` on a mismatch - so the closer matches the opener's
    // colon run EXACTLY (PART 9's colon-fence depth rule: a longer or
    // shorter run does not close it, which is what lets equal-length fences
    // nest and `::::` hold `:::`). `contains` is assigned below, once the
    // full top-level mode list is known, to that list plus `'self'` (for
    // nested divs).
    /*
     * ONE STACK FOR EVERY LINE-START COLON FENCE. highlight.js tries a mode's
     * `contains` before its `end`, so a bare fence line used to open a nested
     * container instead of closing the open one, and every container ran to
     * the end of the document. Inside a container a bare line is
     * BARE_FENCE_LINE instead: it closes the container when it repeats the
     * innermost width (PART 9 §12) and otherwise stands for a nested div,
     * which the stack tracks without opening a mode for it. It never calls
     * `ignoreMatch()`, because highlight.js resumes an ignored scan at a wrong
     * rule once a mode has resumed from more than one place.
     *
     * The stack is kept per document (`docState`), because a mode's `data`
     * outlives one highlight call and a sub-language call highlights a second
     * document in the middle of the first.
     */
    const docState = (store, m) => {
        store.docs ??= new Map();
        let state = store.docs.get(m.input);
        if (!state || m.index < state.at) {
            state = { at: m.index, stack: [], closed: null };
            store.docs.set(m.input, state);
            // A few documents at once: the outer one and its sub-languages.
            if (store.docs.size > 4) store.docs.delete(store.docs.keys().next().value);
        }
        state.at = m.index;
        return state;
    };
    const COLON_FENCES = {};
    const BARE_COLON_FENCE = /^\uFEFF?[ \t]*:{3,}[ \t]*$(?![^\r\n])/;
    const colonFenceKind = (line) => {
        if (/^\uFEFF?[ \t]*:{3,} +figure[ \t]*$(?![^\r\n])/.test(line)) return 'figure';
        if (/^\uFEFF?[ \t]*:{3,} +>[ \t]*$(?![^\r\n])/.test(line)) return 'quote';
        return 'div';
    };
    const openColonFence = (m, resp, kind = colonFenceKind(m[0])) => {
        docState(COLON_FENCES, m).stack.push({ width: m[1].length, kind, mode: true });
    };
    const closeColonFence = (m, resp) => {
        const state = docState(COLON_FENCES, m);
        const top = state.stack[state.stack.length - 1];
        if (!top || top.width !== m[1].length) {
            resp.ignoreMatch();
            return;
        }
        state.stack.pop();
        state.closed = { at: m.index, kind: top.kind };
    };

    // An unclosed fence at column 0 interrupts a paragraph: code to the end of the
    // document, closers of the colon fences around it included (PART 0 S1). A fence
    // whose closer lies past the bounded lookahead above lands here too, so its own
    // closer still ends it.
    const UNCLOSED_CODE_BLOCK = {
        className: 'code',
        beginScope: 'keyword',
        begin: new RegExp(
            '^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?(`{3,}|~{3,})'
            + '(?: ?(?:' + CODE_FENCE_INFO + '|' + RAW_FENCE_INFO + '))?[ \\t]*$(?![^\\r\\n])',
        ),
        'on:begin': (m) => {
            Object.assign(codeFence(m), { indent: '', run: m[1] });
        },
        end: /^(?<![^\r\n])([ \t]*)(`{3,}|~{3,})[ \t]*$(?![^\r\n])/,
        returnEnd: true,
        'on:end': (m, resp) => {
            const open = codeFence(m);
            if (m[1] !== open.indent || m[2][0] !== open.run[0] || m[2].length < open.run.length) resp.ignoreMatch();
        },
        // Left in place by `returnEnd`, the closer is taken here, so it cannot open a fence.
        starts: {
            endScope: 'keyword',
            end: /[ \t]*(?:`{3,}|~{3,})[ \t]*$(?![^\r\n])/,
        },
        contains: [],
        relevance: 0,
    };

    const DIV_BLOCK = {
        beginScope: 'keyword',
        begin: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*(:{3,})(?: +(?:\||\\|>)[^\r\n]*| +[-0-9A-Za-z_]+[^\r\n]*| +"(?:\\.|[^"\\\n])*"[^\r\n]*| +\[[^\]\n]*\]| +\S[^\r\n]*)[ \t]*$(?![^\r\n])/,
        'on:begin': openColonFence,
        endScope: 'keyword',
        end: /^(?<![^\r\n])[ \t]*(:{3,})[ \t]*$(?![^\r\n])/,
        'on:end': closeColonFence,
        relevance: 10,
    };

    // A line block (`::: |`) holds lines of text with hard breaks, so its body
    // is inline only (PART 9 line block, carve-grammars#853). It nests nothing,
    // so the first colon line of the opener's exact length closes it.
    const LINE_BLOCK = {
        beginScope: 'keyword',
        begin: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*(:{3,}) +\|[^\r\n]*$(?![^\r\n])/,
        'on:begin': (m, resp) => { resp.data.width = m[1].length; },
        endScope: 'keyword',
        end: /^(?<![^\r\n])[ \t]*(:{3,})[ \t]*$(?![^\r\n])/,
        'on:end': (m, resp) => { if (m[1].length !== resp.data.width) resp.ignoreMatch(); },
        relevance: 10,
    };

    // Composite figure block: a BARE `::: figure` opener through its matching
    // closer (PART 9 §4c, markup-carve/carve#1215).
    //
    // The kind word `figure` is RESERVED among the `:::` types: a bare opener -
    // the fence, its separator, the word `figure`, and NOTHING else - is ONE
    // figure of ordered panels, not an admonition. It carries `section` rather
    // than DIV_BLOCK's `keyword` so a consumer can tell the two readings apart,
    // and it is listed BEFORE DIV_BLOCK, whose begin also matches this line -
    // highlight.js takes the earliest match and breaks a tie by mode order.
    //
    // The `[ \t]*$` tail is the whole distinction. An opener carrying a quoted
    // title or a [label] (`::: figure "T"`, `::: figure [g]`) does not match
    // here at all and falls to DIV_BLOCK, which is the generic Tier-2 container
    // the clause says it stays.
    //
    // The separator is a SPACE run, never a tab (grammar.ebnf PART 7, MARKER
    // SEPARATORS; corpus 254 renders `:::<TAB>note` as a paragraph). A
    // tab-separated opener is not claimed here and falls to DIV_BLOCK, which
    // over-colours it exactly as it does today - a pre-existing trade this mode
    // neither widens nor fixes. Trailing whitespace after the kind word is
    // insignificant and may be a tab.
    //
    // Closer width is carried in `resp.data` and compared on `on:end`, the same
    // idiom DIV_BLOCK and BLOCK_COMMENT already use, so the closer matches the
    // opener's colon run EXACTLY. `contains` is assigned below, once the full
    // mode list is known.
    // The stack is DIV_BLOCK's, shared, so a group and the divs inside it
    // close in order.
    const FIGURE_GROUP_BLOCK = {
        beginScope: 'section',
        begin: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*(:{3,}) +figure[ \t]*$(?![^\r\n])/,
        'on:begin': openColonFence,
        endScope: 'section',
        end: /^(?<![^\r\n])[ \t]*(:{3,})[ \t]*$(?![^\r\n])/,
        'on:end': closeColonFence,
        relevance: 10,
    };

    // The generic container reached only from INSIDE a composite figure group.
    // Its `contains` differs from DIV_BLOCK's (assigned below), so a bare
    // `::: figure` at any depth inside an open group reads as the generic
    // container PART 9 §4c degrades it to (GROUPS DO NOT NEST; corpus
    // 318-composite-figures-9). The scope stays `keyword` - it IS a div, and a
    // consumer selecting that must keep seeing it.
    //
    // A `::: figure` it opens is a plain div, so its closer takes no caption.
    const DIV_BLOCK_IN_GROUP = {
        ...DIV_BLOCK,
        'on:begin': (m, resp) => openColonFence(m, resp, 'div'),
    };

    // A bare fence line opens a typeless div at document level.
    const BARE_DIV_BLOCK = {
        ...DIV_BLOCK,
        begin: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*(:{3,})[ \t]*$(?![^\r\n])/,
    };
    // Inside a container: the closer of the innermost fence, or a nested div's
    // fence, which only the stack records. Whether it ends its container is
    // set per match, right before highlight.js reads it at the line end.
    const BARE_FENCE_LINE = {
        className: 'keyword',
        begin: BARE_DIV_BLOCK.begin,
        'on:begin': (m) => {
            const state = docState(COLON_FENCES, m);
            const top = state.stack[state.stack.length - 1];
            BARE_FENCE_LINE.endsParent = false;
            // A figure group's closer keeps the group's own scope.
            m.rule.scope = top?.width === m[1].length && top.kind === 'figure' && top.mode ? 'section' : 'keyword';
            if (!top || top.width !== m[1].length) {
                state.stack.push({ width: m[1].length, kind: 'div', mode: false });
                return;
            }
            state.stack.pop();
            state.closed = { at: m.index, kind: top.kind };
            BARE_FENCE_LINE.endsParent = top.mode;
        },
        relevance: 0,
    };

    // A `:::` container may open on a LIST ITEM'S OWN MARKER LINE (`- ::: note`,
    // `1. ::: note`), which the spec nests inside the item (corpus
    // 116-fence-opener-with-a-nested-list-body-inside-a-list-item-2). The marker
    // stays in a lookbehind, as for the quote above, so the list modes keep
    // scoping it. Without these modes the opener was prose and its indented
    // closer opened a container of its own.
    //
    // Two things differ from the line-start modes. The container ENDS WITH ITS
    // ITEM: a column-0 line closes both, so the end is that boundary and the
    // INDENTED closer is a contained mode that ends its parent. And the opener
    // FOLDS INTO THE ITEM AS TEXT when the very next line is nonblank and below
    // the item's content column (corpus 161, 364-2 and the 482 family): the
    // content column is where the fence starts, except after a task box, which
    // puts it two past the bullet.
    const columns = (text) => [...text].reduce((col, ch) => (ch === '\t' ? col + 4 - (col % 4) : col + 1), 0);
    const foldsIntoItem = (m) => {
        const input = m.input;
        const lineStart = lineStartBefore(input, m.index);
        const prefix = input.slice(lineStart, m.index).replace(/^(?<![^\r\n])\uFEFF/, '');
        const task = /[-*] +\[[ xX\-_>\/!?]\] +$(?![^\r\n])/.exec(prefix);
        const contentColumn = task ? columns(prefix.slice(0, task.index)) + 2 : columns(prefix);
        const lineEnd = lineEndFrom(input, m.index);
        if (lineEnd === input.length) return false;
        const nextStart = nextLineStart(input, lineEnd);
        const next = lineAt(input, nextStart);
        if (/^(?<![^\r\n])[ \t]*$(?![^\r\n])/.test(next)) return false;
        return columns(/^(?<![^\r\n])[ \t]*/.exec(next)[0]) < contentColumn;
    };
    // The container and its closer share one `data` object: highlight.js gives
    // each mode its own, and the closer has to see the opener's width. The
    // stack restarts with each document, since a container still open at the
    // end of one never reaches the `end` that pops it.
    const fencesOf = (data, m) => {
        if (data.input !== m.input || m.index < data.at) data.stack = [];
        data.input = m.input;
        data.at = m.index;
        return data.stack;
    };
    // Neither mode calls `ignoreMatch()` in `on:begin` (see BARE_FENCE_LINE):
    // an indented bare fence of another width is a fence line that ends
    // nothing, and a folding opener keeps its text, drops its scope and ends
    // at its own line end.
    const markerLineContainer = (scope, opener, refused = () => false) => {
        const data = {};
        const closer = {
            scope,
            data,
            begin: /^(?<![^\r\n])[ \t]+(:{3,})[ \t]*$(?![^\r\n])/,
            'on:begin': (m) => {
                const open = fencesOf(data, m);
                const top = open[open.length - 1];
                closer.endsParent = top !== undefined && !top.folds && m[1].length === top.width;
                m.rule.scope = closer.endsParent ? scope : 'keyword';
                if (closer.endsParent) open.pop();
            },
        };
        const container = {
            beginScope: scope,
            data,
            begin: RegExp('(?=:)(?<=' + LIST_MARKER_BEFORE_BLOCK + ')(:{3,})' + opener),
            'on:begin': (m) => {
                const folds = foldsIntoItem(m) || refused(m);
                m.rule.beginScope = folds ? undefined : { _wrap: scope };
                fencesOf(data, m).push({ width: m[1].length, folds });
            },
            // Every line end is a candidate: a column-0 line ends the container,
            // and a folding opener ends at its own line end. `returnEnd` leaves
            // the newline to the parent; a refused candidate is plain text.
            end: /\n/,
            returnEnd: true,
            'on:end': (m, resp) => {
                const open = fencesOf(data, m);
                const next = m.input[m.index + m[0].length];
                if (!open[open.length - 1]?.folds && (next === undefined || /[ \t\r\n]/.test(next))) {
                    resp.ignoreMatch();
                    return;
                }
                open.pop();
            },
            relevance: 10,
        };
        return [container, closer];
    };
    const [FIGURE_GROUP_ON_MARKER_LINE, FIGURE_GROUP_MARKER_LINE_CLOSER] = markerLineContainer('section', ' +figure[ \\t]*$(?![^\\r\\n])');
    const [LINE_BLOCK_ON_MARKER_LINE, LINE_BLOCK_MARKER_LINE_CLOSER] = markerLineContainer('keyword', ' +\\|[^\\r\\n]*$(?![^\\r\\n])',
        (m) => markerIsParagraphText({ input: m.input, index: lineStartBefore(m.input, m.index) }));
    // A trailing comment is left to the container's own modes, so it stays a
    // comment whether the opener holds or folds into the item as text.
    const MARKER_LINE_TAIL_COMMENT = '[ \\t]+%%|[ \\t]*\\{%';
    const DIV_ON_MARKER_LINE_OPENER =
        '(?: +(?:\\||\\\\|>)[^\\r\\n]*| +[-0-9A-Za-z_]+(?:(?!' + MARKER_LINE_TAIL_COMMENT + ')[^\\r\\n])*| +"(?:\\\\.|[^"\\\\\\n])*"(?:(?!' + MARKER_LINE_TAIL_COMMENT + ')[^\\r\\n])*| +\\[[^\\]\\n]*\\]| +(?!' + MARKER_LINE_TAIL_COMMENT + ')\\S(?:(?!' + MARKER_LINE_TAIL_COMMENT + ')[^\\r\\n])*)?'
        + '(?=(?:' + MARKER_LINE_TAIL_COMMENT + ')[^\\r\\n]*$(?![^\\r\\n])|[ \\t]*$(?![^\\r\\n]))';
    const [DIV_ON_MARKER_LINE, DIV_MARKER_LINE_CLOSER] = markerLineContainer('keyword', DIV_ON_MARKER_LINE_OPENER);
    // Inside a group, like DIV_BLOCK_IN_GROUP: its body must not offer a group.
    const [DIV_ON_MARKER_LINE_IN_GROUP, DIV_IN_GROUP_MARKER_LINE_CLOSER] =
        markerLineContainer('keyword', DIV_ON_MARKER_LINE_OPENER);

    // Carve comments: `%%` to end of line, a `%%%` fenced block, and the
    // CriticMarkup comment `{# ... #}`.
    //
    const DELIMITED_COMMENT = {
        className: 'comment',
        // Opens only where its closer arrives in the paragraph: an unclosed
        // `{%` is text, so it cannot swallow an enclosing closer
        // (carve-grammars#461). Tempered like CRITIC_COMMENT's guard.
        begin: /\{%(?=(?:[^%\n]|%(?!\})|\n(?![ \t\r]*\n)){0,4096}%\})/,
        end: /%\}/,
        relevance: 5,
    };
    // Comments are inline leaves. Keep the containing emphasis mode open and
    // scope the hidden run as a comment inside it.
    for (const mode of [
        BOLD_ITALIC, STRONG, EMPHASIS, UNDERLINE, STRIKETHROUGH,
        HIGHLIGHT, SUBSCRIPT, SUPERSCRIPT, FORCED_STRONG, FORCED_EMPHASIS,
        FORCED_UNDERLINE, FORCED_STRIKE, FORCED_HIGHLIGHT,
    ]) {
        mode.contains = [DELIMITED_COMMENT, ...(mode.contains || [])];
    }
    const LINE_COMMENT = {
        className: 'comment',
        begin: /(?:^(?<![^\r\n])|(?<=[ \t]))%%(?!%)/,
        end: /$(?![^\r\n])/,
        relevance: 5,
    };
    // A `%%%` fence line is a DELIMITER plus an INSIGNIFICANT TAIL (spec
    // PART 9 §28): only the leading run of `%` is structural, so `%%% TODO`
    // opens and `%%% end` closes. `%%%` carries NO info string - a raw
    // passthrough block is a CODE fence whose info string is `=FORMAT`
    // (```=html) - so `%%% html` is a comment, not raw output.
    //
    // The closer must match the opener's length EXACTLY (a longer run does not
    // close a shorter fence, which is what lets `%%%%` nest `%%%`). There is no
    // begin->end backreference in highlight.js, so the width is carried across
    // in `resp.data` and a wrong-width candidate is rejected with
    // `ignoreMatch()` - the same idiom the bundled markdown grammar uses.
    const BLOCK_COMMENT = {
        className: 'comment',
        // THE CLOSER IS REQUIRED UP FRONT, as in both marker-line fences below,
        // and for the reason they already give: highlight.js has no begin->end
        // backreference, so an opener with no closer runs to END OF FILE. That
        // is the worst failure a highlighter has - everything below one stray
        // `%%%` is greyed out - and PART 9 S28 says the opposite happens: an
        // UNTERMINATED run opens nothing, degrades to a line comment, and leaves
        // the block below it visible (`%%%` / blank / `after` renders
        // `<p>after</p>`). Measured at every indent, column 0 included, and the
        // swallow reproduced at all of them (carve-grammars#260).
        //
        // The lookahead carries the width rule too: `\1(?!%)` matches the
        // opener's run EXACTLY, so `%%%` offered a `%%%%` closer is still
        // unterminated - which the engine renders with the body VISIBLE between
        // two vanished runs, not hidden.
        // THE FORWARD SCAN IS BOUNDED, and the bound is the whole reason this
        // lookahead is affordable. Proving there is NO closer costs a scan to
        // end of input, and a document can hold one unmatched run per fence
        // WIDTH, so an adversarial file pays that scan many times over: 2000
        // runs of increasing width (2 MB) took 2045 ms unbounded and 40 ms at
        // 8000 characters, and the bounded form grows linearly where the
        // unbounded one grows with the square. Prism carries the same unbounded
        // scan and measured 14.2 s on the 8 MB case, so this is the rule's cost
        // rather than this engine's (carve-grammars#260).
        //
        // A closer further than 8000 characters below its opener is therefore
        // not found, and the fence degrades to a line comment. That is the SAFE
        // direction and the one this whole rule is about: a run that opens
        // nothing leaves the text below it VISIBLE, where the failure being
        // fixed here hid it.
        // C2-B-109, C2-B-110: the closer is a bare run of at least the opener's width.
        begin: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*(%{3,})(?!%)[^\n]*$(?![^\r\n])(?=[\s\S]{0,8000}?\n[ \t]*\1%*[ \t]*$(?![^\r\n]))/,
        'on:begin': (m, resp) => {
            resp.data._fenceWidth = m[1].length;
        },
        // The closer may be INDENTED, like the opener above: leading
        // whitespace is not part of the delimiter, only the `%` run is (PART 9
        // §24 C3 - a comment is recognized at any column, carve#624/#634).
        // Anchored at column 0 the fence never closed for an indented closer,
        // so the comment swallowed the rest of the document.
        end: /^(?<![^\r\n])[ \t]*(%{3,})[ \t]*$(?![^\r\n])/,
        'on:end': (m, resp) => {
            if (m[1].length < resp.data._fenceWidth) resp.ignoreMatch();
        },
        relevance: 10,
    };
    // C2-B-111: an unclosed comment block at column 0 runs to the end of the
    // document; a bare colon fence stands in for the end of an enclosing div.
    const UNCLOSED_BLOCK_COMMENT = {
        className: 'comment',
        // A run under a marker line that opened one closes that comment instead.
        begin: /^(?<![^\r\n])(?=\uFEFF?%%%)(?<!^(?<![^\r\n])[ \t]*(?:[-*+]|[0-9]+[.)]|:|\[\^[^\]\r\n]+\]:|(?:> ?)+)[ \t]+%{3,}[ \t]*(?:\r\n?|\n))(?:(?<![\s\S])\uFEFF)?(%{3,})(?!%)[^\n]*$(?![^\r\n])(?![\s\S]*?\n[ \t]*\1%*[ \t]*$(?![^\r\n]))/,
        end: /(?=\n[ \t]*:{3,}[ \t]*$(?![^\r\n]))|$(?![\s\S])/,
        relevance: 5,
    };
    // A `%%%` run behind text on its line is a line comment (C2-B-133).
    const TRAILING_PERCENT_RUN = {
        className: 'comment',
        begin: /(?=%%%)(?<=[^ \t\r\n][^\r\n]*[ \t])%{3,}/,
        end: /$(?![^\r\n])/,
        relevance: 0,
    };
    // A fence may also open on a list item's MARKER LINE (`- %%%`), and then
    // the body is hidden exactly as it is anywhere else - §24 S2 and §28 make a
    // comment's body verbatim and invisible WHEREVER the fence sits (corpus
    // 337). `BLOCK_COMMENT` above cannot reach that shape: its begin is
    // line-anchored, so on `- %%%` it never fires, the scanner then takes the
    // REAL closer on the next line for an opener, and the comment runs to end
    // of file - swallowing every block after the item.
    //
    // The marker is matched in a LOOKBEHIND rather than consumed, so
    // `TASK_LIST`/`LIST_BULLET`/`LIST_NUMBER` still scope it as a bullet (which
    // is what tree-sitter-carve does too: a `fenced_comment_block` sits INSIDE
    // `list_item_content`, beside a `list_marker_*`, not over it).
    // `LIST_MARKER_BEFORE_BLOCK` is defined above BLOCKQUOTE, which needs the
    // same prefix for `- > x`.
    // A line that is blank, or indented by at least one column. A COLUMN-0 line
    // is neither, and that is the point: it ends the container and with it the
    // fence, so it must not be skipped over while looking for the closer
    // (corpus 326-6 - `- %%%` / `c` / `%%%` leaves `c` and the trailing
    // paragraph VISIBLE, with the unclosed opener degrading to a line comment).
    // Both alternatives are DISJOINT and each decomposes ONE way, which is what
    // keeps the `*?` repetition below linear. The previous pair was neither: a
    // whitespace-only line satisfied the blank branch AND `\n[ \t]+[^\n]*`,
    // and `[^\n]` itself accepts a space, so `  x` split two ways at the same
    // end position. That gave an n-line body 2^n parses, and an UNCLOSED fence
    // makes the engine walk all of them before the lookahead fails - `- %%%`
    // plus 24 indented lines took 379 ms, plus 30 does not finish
    // (carve-grammars#294). The blank branch now consumes the whitespace run
    // itself and asserts the line ENDS there, and the indented branch requires a
    // non-blank character after the indent. Same matched LANGUAGE as before, so
    // no highlighting moves.
    const BLANK_OR_INDENTED_LINE = '(?:\\n[ \\t]*(?![^\\n])|\\n[ \\t]+[^ \\t\\n][^\\n]*)';
    const BLOCK_COMMENT_ON_MARKER_LINE = {
        className: 'comment',
        // The closer is REQUIRED up front, unlike `BLOCK_COMMENT`. highlight.js
        // has no begin->end backreference, so without this guard an opener with
        // no closer would run to end of file - and on this shape an unclosed
        // opener is the common case (a column-0 line ends the item), where the
        // right answer is a one-line comment, not a swallowed document.
        begin: RegExp(
            '(?=%)(?<=' + LIST_MARKER_BEFORE_BLOCK + ')(%{3,})(?!%)[^\\n]*$(?![^\\r\\n])'
            // C2-B-109, C2-B-110: a bare run at least the opener's width closes it.
            + '(?=' + BLANK_OR_INDENTED_LINE + '*?\\n[ \\t]+\\1%*[ \\t]*$(?![^\\r\\n]))',
        ),
        'on:begin': (m, resp) => {
            resp.data._fenceWidth = m[1].length;
        },
        // `[ \t]+`, not `[ \t]*`: the closer sits at the item's content column,
        // and a column-0 run is a different block entirely (see above).
        end: /^(?<![^\r\n])[ \t]+(%{3,})[ \t]*$(?![^\r\n])/,
        'on:end': (m, resp) => {
            if (m[1].length < resp.data._fenceWidth) resp.ignoreMatch();
        },
        relevance: 10,
    };
    // With no closer the comment runs to the end of the item (C2-B-111): up to
    // the line, blank lines skipped, that is not indented.
    const UNCLOSED_COMMENT_ON_MARKER_LINE = {
        className: 'comment',
        begin: RegExp('(?=%)(?<=' + LIST_MARKER_BEFORE_BLOCK + ')%{3,}(?!%)[^\\n]*$(?![^\\r\\n])'),
        end: /(?=\r?\n(?:[ \t]*\r?\n)*(?![ \t\r\n]))|$(?![\s\S])/,
        relevance: 5,
    };
    const CRITIC_COMMENT = {
        className: 'comment',
        // The closing `#}` is required, or this would swallow an attribute
        // block whose id comes first (`{#id .class}`).
        //
        // A LINE BREAK IS PART OF THE BODY, and only this guard said otherwise:
        // `end` already spans lines, so a `{#` that opened ran to its `#}`
        // wherever that was. Line-bounded, the guard refused to open at all on
        // `a {# x` / `*b* y #} z` - which the engine renders as ONE comment with
        // the run LITERAL inside it - so the run coloured as bold, markup inside
        // a payload that is not Carve (carve-grammars#312).
        //
        // The newline is TEMPERED rather than admitted: a BLANK line ends the
        // paragraph and therefore the comment, measured - `a {# x` / `` /
        // `*b* y #} z` is two paragraphs with the delimiters literal in both.
        // The body still excludes `}` entirely, so the `#}` the guard finds is
        // the first one and `end` cannot overshoot it, and the scan stays
        // bounded at the 4096 carve-grammars#300 gave it.
        begin: /\{#(?!#\})(?=(?:[^#\n]|#(?!\})|\n(?![ \t\r]*\n)){0,4096}#\})(?:(?<![^\s\w"'][{]#)|(?![^}\n]{0,4096}(?<!#)[}]))(?=(?:[^#\n]|#(?!\})|\n(?![ \t\r]*\n)){0,4096}#\})/,
        end: /#\}/,
        relevance: 5,
    };

    // Mentions and tags: @name / #name (a heading `#` is line-anchored and is
    // matched earlier, so an inline `#tag` is unambiguous).
    // A mention or tag name (C2-I-092): runs of letters, digits, `_` and `-`
    // joined by single dots, holding a letter, not ending in a hyphen. A run
    // directly followed by a Unicode letter, number or mark is text, which
    // needs `u`, so 'on:begin' tests it.
    const TAG_NAME = '(?=(?:[A-Za-z0-9_-]|\\.(?=[A-Za-z0-9_-]))*[A-Za-z])[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*(?<!-)';
    // The run takes every ASCII name character, so only a letter outside ASCII can follow it; a mark refuses in `refuseGluedName`.
    const NON_ASCII_WORD_CHARACTER = WORD_CHARACTER.replace('(?:[0-9A-Za-z', '(?:[');
    const glued = (sigil) => '(?<!(?:' + LETTER_OR_DIGIT + '|' + sigil + ')(?:' + BRACED_COMMENTS + '))' + sigil + TAG_NAME + '(?![A-Za-z0-9_.-]*' + NON_ASCII_WORD_CHARACTER + ')';
    const TAG_RUN_FOLLOWER = /[A-Za-z0-9_.-]*([\p{L}\p{N}\p{M}])?/uy;
    const refuseGluedName = (m, resp) => {
        TAG_RUN_FOLLOWER.lastIndex = m.index + 1;
        if (TAG_RUN_FOLLOWER.exec(m.input)[1]) resp.ignoreMatch();
    };
    const MENTION = {
        className: 'symbol',
        begin: new RegExp(glued('@')),
        'on:begin': refuseGluedName,
        relevance: 5,
    };
    /*
     * Cross-reference with auto text: `</#id>` (grammar.ebnf
     * `auto_text_link = "</#", crossref_id, '>'`).
     *
     * This grammar had no rule for it and the run was not left alone: the id
     * begins with `#`, so TAG below claimed it and coloured a cross-reference
     * as a hashtag. Prism had the identical defect, fixed in
     * carve-grammars#307, and tree-sitter-carve#245 found the same shape a
     * layer down - a construct read as the wrong thing is worse than one read
     * as nothing.
     *
     * It sits BEFORE TAG so the intent is on the page, though position already
     * decides it: the `<` is earlier in the line than the `#`, and
     * highlight.js takes the leftmost match.
     *
     * The id charset is the spec's `crossref_id` - any character that is not
     * `>`, whitespace or a newline - because an automatic heading id PRESERVES
     * Unicode and case, so `</#Cafe-Notes>` has to scope.
     */
    const CROSS_REF = {
        className: 'link',
        begin: /<\/#[^>\s]{1,512}>/,
        relevance: 5,
    };
    const TAG = {
        className: 'symbol',
        begin: new RegExp(glued('#')),
        'on:begin': refuseGluedName,
        relevance: 5,
    };
    // Used only inside HEADING (carve-grammars#125), not TAG itself: a
    // heading's own `contains` does not carry CROSS_REF, so without the extra
    // exclusion this would wrongly claim the `#a` inside a heading
    // cross-reference `</#a>`
    // (grammar.ebnf `auto_text_link = "</#", crossref_id, '>'`) and break
    // corpus 118 (`# A </#a>`), which pins the whole thing staying unscoped.
    const HEADING_TAG = {
        className: 'symbol',
        begin: new RegExp('(?<!' + LETTER_OR_DIGIT + '|#)(?<!<\\/)#' + TAG_NAME),
        'on:begin': refuseGluedName,
        relevance: 5,
    };

    // Table separator: |---|---|
    const TABLE_SEPARATOR = {
        begin: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*\|(?=[-:| ]+\|[ \t]*$(?![^\r\n]))/,
        beginScope: 'table-boundary',
        end: [/\|/, /[ \t]*$(?![^\r\n])/],
        endScope: { 1: 'table-boundary' },
        relevance: 5,
        contains: [
            { className: 'table-operator', begin: /:?-+:?/ },
            { className: 'table-boundary', begin: /\|(?=[^\n]*\|)/ },
        ],
    };

    // A pipe-led line with no closing pipe is a paragraph (`::: |` is the line
    // block), so nothing claims it: its text keeps the inline modes.

    // Table rows: | cell | cell |
    const tableRow = (header) => ({
        begin: header
            ? [
                /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*/,
                /\|/,
                /=/,
                /(?:[<~>][\^~v]?|\?[\^~v])?(?= |\{)(?=(?:\\.|[^\\\n])*\|(?:[ \t]*\{[^}\n]*\})?[ \t]*$(?![^\r\n]))/,
            ]
            : /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*\|(?=(?:\\.|[^\\\n])*\|(?:[ \t]*\{[^}\n]*\})?[ \t]*$(?![^\r\n]))/,
        beginScope: header ? { 2: 'table-boundary', 3: 'table-header', 4: 'table-alignment' } : 'table-boundary',
        end: [/\||(?=\n(?![ \t]*\+(?:\\.|[^\\\n])*\|[ \t]*$(?![^\r\n])))/, /(?:[ \t]*\{[^}\n]*\})?/, /[ \t]*$(?![^\r\n])/],
        endScope: { 1: 'table-boundary', 2: 'meta' },
        contains: [
            TABLE_INLINE_CODE,
            ESCAPE,
            /*
             * A CELL IS AN INLINE RUN, so a trailing `%%` comment is a comment
             * here and its run ENDS AT THE CELL (`CARVE-P9-041`, corpus
             * `518-a-trailing-comment-takes-a-tab-a-run-start-and-its-whole-separator-6`).
             * Without this the cell text carried no comment scope at all
             * (carve-grammars#577) - the document-level comment rule never
             * reaches inside this mode.
             */
            { className: 'comment', begin: /(?<=[ \t])%{2,}(?:\\.|[^\\|\r\n])*/ },
            {
                begin: [/\|/, /=/, /(?:[<~>][\^~v]?|\?[\^~v])(?= |\{)/],
                beginScope: { 1: 'table-boundary', 2: 'table-header', 3: 'table-alignment' },
            },
            { begin: [/\|/, /=(?= |\{)/], beginScope: { 1: 'table-boundary', 2: 'table-header' } },
            // Braced cell alignment leads the cell's attribute block (carve#5091 D3).
            {
                begin: [/(?<=(?<!\\)(?:\\\\)*\|=?)\{/, /(?:[<>~][\^~v]?|\?[\^~v])/, /(?=(?:[ \t]+(?::[\w-]*|[.#]?[\w-]+(?:=(?:"(?:\\.|[^"\\\n]){0,256}"|'(?:\\.|[^'\\\n]){0,256}'|[^\s"'{}|\\]{1,256}))?))*[ \t]*\})/],
                beginScope: { 2: 'table-alignment' },
            },
            { className: 'table-span', begin: /(?<=\|)[ \t]*[<^](?=[ \t]*\|)/ },
            { className: 'table-alignment', begin: /(?<=\|)(?:[<~>](?:[\^~v])?|\?[\^~v])(?= |\{)/ },
            { className: 'table-boundary', begin: /\|(?!(?:[ \t]*\{[^}\n]*\})?[ \t]*$(?![^\r\n]))(?=[^\n]*\|(?:[ \t]*\{[^}\n]*\})?[ \t]*$(?![^\r\n]))/ },
        ],
        relevance: 2,
    });
    const TABLE_HEADER_ROW = tableRow(true);
    const TABLE_ROW = tableRow(false);

    // Captions: ^ caption text
    //
    // Only a captionable host takes one (PART 9 §4): an image paragraph, a
    // block quote, a table, a fenced code block, a display-math block and the
    // closer of a `::: figure` or `::: >`, adjacent or one blank line above.
    // Any other `^ ` line is paragraph text.
    // A paragraph that is one image, on an item's marker line or not.
    const SOLE_IMAGE = /^\uFEFF?[ \t]*(?:(?:[-*]|\d{1,9}[.)]) +)?!\[[\s\S]*\](?:\([^()]*(?:\([^()]*\)[^()]*)*\)|\[[^\]]*\])(?:\{[^{}]*\})?[ \t]*$/;
    const TABLE_LINE = /^\uFEFF?[ \t]*(?:\||\+).*\|(?:\{[^{}]*\})?[ \t]*$/;
    const DISPLAY_MATH_LINE = /^\uFEFF?[ \t]*\$\$(`+)(?:(?!\1).)+\1[ \t]*$/;
    const BARE_CODE_FENCE_LINE = /^\uFEFF?[ \t]*(?:`{3,}|~{3,})[ \t]*$/;
    const QUOTE_LINE = /^\uFEFF?[ \t]*>(?: |$)/;
    const captionHost = (input, start) => {
        let host = previousLineStart(input, start);
        if (host === -1) return false;
        let line = lineAt(input, host);
        if (lineKind(line) === 'blank') {
            host = previousLineStart(input, host);
            if (host === -1) return false;
            line = lineAt(input, host);
        }
        if (TABLE_LINE.test(line) || BARE_CODE_FENCE_LINE.test(line)) return true;
        // A display-math block is a paragraph holding that span alone.
        if (DISPLAY_MATH_LINE.test(line)) {
            const above = previousLineStart(input, host);
            return above === -1 || lineKind(lineAt(input, above)) !== 'text';
        }
        if (/[)\]}][ \t]*$/.test(line)) {
            // The host paragraph, read up to its first line (a few at most).
            let first = host;
            for (let n = 0; n < 8 && lineKind(lineAt(input, first)) === 'text'; n++) {
                const above = previousLineStart(input, first);
                if (above === -1 || ['blank', 'boundary'].includes(lineKind(lineAt(input, above)))) break;
                first = above;
            }
            const end = lineEndFrom(input, host);
            if (SOLE_IMAGE.test(input.slice(first, end).replace(/\r(?=\n|$)/g, ''))) return true;
        }
        if (BARE_COLON_FENCE.test(line)) {
            const closed = COLON_FENCES.docs?.get(input)?.closed;
            return closed?.at === host && closed.kind !== 'div';
        }
        if (!QUOTE_LINE.test(line)) return false;
        // A quote of bare `>` lines is no caption host (CARVE-P9-080). A
        // text line above them may be a lazy line of a real quote, so it counts.
        let at = host;
        while (at !== -1 && QUOTE_LINE.test(lineAt(input, at))) {
            if (!/^\uFEFF?[ \t]*>[ \t]*$/.test(lineAt(input, at))) return true;
            at = previousLineStart(input, at);
        }
        return at !== -1 && lineKind(lineAt(input, at)) !== 'blank';
    };
    const CAPTION = {
        className: 'title.caption',
        begin: /^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*(?=\^ (?![ \t]*$(?![^\r\n])))/,
        // Without a host the line is paragraph text, inline runs and all.
        'on:begin': (m, resp) => {
            scopeUnless('title.caption', (m) => !captionHost(m.input, m.index))(m);
            resp.data.column = markerColumn(m.input, m.index);
            resp.data.until = -1;
        },
        // A caption is a label (C2-B-148, C2-B-234).
        end: LINE_BREAK_END,
        returnEnd: true,
        'on:end': (m, resp) => {
            if (m[0] && labelContinues(m.input, m.index + m[0].length, resp.data, true)) resp.ignoreMatch();
        },
        relevance: 5,
    };

    /*
     * THE QUOTE DECIDES THE BRANCH, the technique Prism's `includeQuotedPart`
     * already uses: a quote's two alternatives carry lookaheads that negate
     * each other, so exactly one is ever viable at a given quote, and the
     * ordinary class below excludes both quote characters so nothing else can
     * claim one. The alternation therefore offers the engine no second path to
     * re-enter - which is what keeps the scan linear, because as a plain
     * alternation a `"` is both an opener and an ordinary character and a line
     * with no closer makes the engine try both at every quote
     * (scripts/scan-superlinear.mjs, the `unterminated, closer baits` row).
     */
    const includeQuotedPart = (quote) => {
        const body = `(?:\\\\.|[^${quote}\\\\\\n])*`;
        return `${quote}(?=${body}${quote})${body}${quote}|${quote}(?!${body}${quote})`;
    };

    /* One unit of a part, as Prism's `includePart`: a terminated run, a lone
     * quote that opens none, or an ordinary character other than space, `}` or `@`. */
    const INCLUDE_PART_UNIT =
        `(?:${includeQuotedPart('"')}|${includeQuotedPart("'")}|[^\\s}"'@])`;

    /*
     * Reserved processor syntax: `{{ path #section @key:value }}` (PART 9
     * section 19, grammar.ebnf `include_directive`). The core leaves it
     * literal; a processor expands it only when a host supplies a resolver.
     *
     * Enclosed in one owning mode because its own selector is spelled with other
     * constructs: `#section` is TAG syntax and an option slot is MENTION
     * syntax, so without this rule `{{ ch.crv #intro }}` coloured `#intro` as
     * a hashtag - the same defect class as the cross-reference one CROSS_REF
     * exists for (carve-grammars#307).
     */
    const INCLUDE_DIRECTIVE = {
        className: 'meta',
        // THE LOOKAHEAD IS THE CLOSER. A mode that opens on `{{` alone and ends
        // at `}}` never ends when the closer is missing, and hljs then paints
        // the rest of the DOCUMENT as directive - `illegal` does not abort it.
        // Requiring the closer on the same line up front means an unterminated
        // `{{` simply never opens the mode, which is what the processor does
        // with it too: leave it as text.
        //
        // AND THE CLOSER IS THE FIRST `}}` OUTSIDE A QUOTED RUN
        // (markup-carve/carve#2013), so the lookahead has to READ what lies
        // between rather than ask whether SOME pair is on the line. Once a run
        // may hold the pair, a line whose only pair sits inside a terminated
        // one has no closer at all: `[^\n]*?\}\}` said yes there, the mode
        // opened, `end` never fired, and `|$` was all that kept the damage to a
        // single line (carve-grammars#418). TextMate and Prism read such a line
        // as no directive, their outer pattern needing a closer it cannot find,
        // and this is what lets highlight.js reach the same reading
        // (sublime-carve#47, which closed the same gap on the same technique).
        //
        // The lookahead is Prism's outer pattern, so a path is required and no
        // part holds an unquoted `}` (#434). `end` keeps `|$` as the line bound.
        begin: RegExp(
            `\\{\\{(?= +(?:"(?:\\\\.|[^"\\\\\\n])*"|[^#@} \\r\\n"][^#@} \\r\\n"]*)`
            + `(?: *#[A-Za-z0-9_][\\w-]*)?`
            // EACH OPTION OPENS ON ITS `@` (C2-B-156, C2-B-204), glued or after
            // spaces, and an unquoted value holds no `@`, so the runs split one
            // way only. A word that is no option ends the scan: on a line of
            // unclosed `{{`, each opener reads one word, not the line (#988).
            + `(?: *@${INCLUDE_PART_UNIT}+)* +\\}\\})`,
        ),
        end: /\}\}|$(?![^\r\n])/,
        relevance: 10,
        // BY PART. The mode's own boundaries are what keep TAG and MENTION out
        // of the directive, so painting the run one colour buys nothing - and a
        // reader wants the path to look like a path. `end` closes the mode, so
        // an unterminated `{{` reverts to ordinary text at the line end rather
        // than swallowing the rest of the document.
        contains: [
            {
                className: 'string',
                begin: /(?=[^#@} \r\n])(?<=\{\{ +)(?:"(?:\\.|[^"\\\n])*"|[^#@} \r\n"][^#@} \r\n]*)/,
            },
            {
                className: 'symbol',
                begin: /#[A-Za-z0-9_][\w-]*/,
            },
            {
                // NOT `attr`: that class is this grammar's attribute BLOCK
                // (`{#id .cls}`), and the engine sweep reads any `attr`-ish
                // scope on a non-attribute construct as a misreading. An option
                // name is a reserved word in a slot, which is what `keyword` is.
                className: 'keyword',
                // NO WHITESPACE REQUIRED before the `@`: the slot admits a
                // glued option. The lookahead keeps the name shape: a `:` and
                // its value, or a bare `@code` (I1c) ending at a space, the
                // next `@` or the line end. `@k:` with no value stays unscoped.
                begin: /@[A-Za-z_][\w-]*(?=:(?![\s}]|$)|[ @]|$)/,
            },
            {
                // An `attribute_value`, so it may be quoted and then carries
                // spaces. The quoted alternatives exclude the newline, as
                // `quoted_value` does [CARVE-P4-006]: one that did not paired
                // with a quote lines away, ate the `}}` on the way, and left
                // the mode painting the rest of the line (carve-grammars#409).
                // They ADMIT the `}}` pair, which is what puts the closer
                // outside the quoted run (markup-carve/carve#2013, superseding
                // the `\}(?!\})` bound of carve-grammars#413): `end` is scanned
                // alongside the contained modes and the earliest match wins, so
                // consuming the run here is what stops `end` firing inside it.
                // The unquoted alternative is LAST, so an unterminated quote
                // falls back to it and the closer stays at the first pair.
                className: 'literal',
                // AN UNQUOTED VALUE ENDS AT THE NEXT MARKER:
                // `include_unquoted_value` is `unquoted_value` less the `@`,
                // so `@shift:1@lines:1-8` is two options and never one whose
                // value is `1@lines:1-8`.
                begin: /(?<=:)(?:"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|[^\s}@]+)/,
            },
        ],
    };

    // Raw format marker: {=html} or {=latex}
    const RAW_FORMAT = {
        className: 'meta',
        begin: /\{=[a-zA-Z]+\}/,
        relevance: 5,
    };

    // Hard line break: \ at end of line
    const HARD_BREAK = {
        className: 'meta',
        begin: /\\$(?![^\r\n])/,
        relevance: 2,
    };

    // Inline extension call: :name[content] (corpus 45-inline-extensions).
    // Matched before SYMBOL, whose `:name:` shape cannot claim this one but
    // reads similarly.
    //
    // A trailing `{...}` is deliberately NOT consumed here: an attribute value
    // may itself contain braces (`:kbd[x]{k="{y}"}`), so a `\{[^}]*\}` tail
    // stops at the inner `}` and swallows half the block. ATTRIBUTE already
    // matches it correctly as its own scope.
    const INLINE_EXTENSION = {
        className: 'function',
        begin: /:[A-Za-z][\w-]*\[(?=[^\]\n]*\])/,
        end: /\]/,
        relevance: 5,
    };

    // Symbol shortcodes (e.g. emoji): :name: (parser shape - name starts
    // alphanumeric, then word chars, `+` or `-`; no whitespace, so
    // `a : b : c` stays text)
    const SYMBOL = {
        className: 'symbol',
        begin: /(?<!\w):[A-Za-z0-9+-][\w+-]*:/,
        relevance: 0,
    };

    // A tag is still a tag even inside a heading's literal trailing brace run
    // (carve-grammars#125, corpus 213): a heading takes no trailing attribute
    // block, so `{#id .cls}` is ordinary heading text (that half already
    // worked - it was never scoped as an attribute), but `#id` inside it is
    // still a tag construct. Deliberately narrow - just HEADING_TAG (see its
    // own comment above), not the full inline repertoire - matching the same
    // targeted scope as the TextMate and Prism fixes for this same bug.
    /*
     * A HEADING'S TITLE AND A CAPTION'S CONTENT ARE INLINE RUNS
     * (carve-grammars#601, markup-carve/carve#2682). Neither mode had a
     * `contains` at all, so a trailing `%%` kept the block scope although the
     * engine strips it, and a span went unscoped. Same repair as the table row
     * above, since a cell is an inline run too.
     *
     * highlight.js takes the EARLIEST match among `contains`, so order settles
     * only a tie. `ESCAPE` leads because a backslashed backtick opens no span,
     * and the sigil forms precede `INLINE_CODE`, which would otherwise take the
     * run and leave the `$` or `!` behind.
     */
    /*
     * A VERBATIM MODE IN A ONE-LINE BLOCK ENDS AT THE LINE. `verbatimFence` ends
     * on a matching run or a PARAGRAPH break, so an unclosed run in a heading
     * held the mode open and scoped every block after it as code. highlight.js
     * applies a child's `end` before the parent's, so the bound has to sit on
     * the child.
     */
    const lineBounded = (mode) => ({
        ...mode,
        // FIRST in the alternation. Last, it lost the position to
        // `verbatimFence`'s own paragraph-break branch, which CONSUMES the blank
        // line, so the child popped past the parent's `$` and carried the block
        // scope onward.
        end: new RegExp(`(?=\\n)|${mode.end.source}`),
        'on:begin': runOpener(() => LINE_END),
        'on:end': (match, response) => {
            // The line boundary is an end in its own right, never width-checked.
            if (match[0] === '') return;
            mode['on:end'](match, response);
        },
    });
    const ONE_LINE_VERBATIM = [MATH_DISPLAY, MATH_INLINE, LITERAL_INLINE, INLINE_CODE].map(lineBounded);

    /*
     * The rest of the inline set, since the engine renders every inline
     * construct in a title or caption. An opener whose closer is not on the
     * line is text there, so the two sinks in front keep a mode that may span
     * lines from opening at all.
     */
    const LINE_INLINE = [
        { begin: /([*/_~=])(?![^\n]*?(?<=\S)\1)/, relevance: 0 },
        // Only the brace: a heading's `{#id}` is text whose `#id` is still a tag (corpus 213).
        { begin: /\{(?=([*/_~=^,+\-#%])(?![^\n]*?\1\}))/, relevance: 0 },
        INLINE_FOOTNOTE, FOOTNOTE_REF, IMAGE, REFERENCE_IMAGE, SPAN, REFERENCE_LINK, CITATION, INLINE_EXTENSION,
        LINK, AUTOLINK, EMAIL_AUTOLINK, INSERT, DELETE, CRITIC_COMMENT, MENTION, CROSS_REF,
        HIGHLIGHT, SUBSCRIPT, SUPERSCRIPT, BOLD_ITALIC, STRONG, EMPHASIS, UNDERLINE, STRIKETHROUGH,
        FORCED_STRONG, FORCED_EMPHASIS, FORCED_UNDERLINE, FORCED_STRIKE, FORCED_HIGHLIGHT, TYPOGRAPHY,
    ];
    // A block glued to an inline host is its attributes (`# *a b*{.q}`); a trailing `{#id}` stays text.
    HEADING.contains = [ESCAPE, ...ONE_LINE_VERBATIM, RAW_FORMAT, LINE_COMMENT, HEADING_TAG, ATTRIBUTE, ...LINE_INLINE];
    // A CAPTION'S CONTENT IS AN INLINE RUN TOO, and it was flat for the same
    // reason: `^ cap %% hidden` renders `<figcaption>cap</figcaption>` and
    // `^ cap `x %% b` c` keeps the span. No `HEADING_TAG` here - a caption takes
    // no trailing attribute block argument, so nothing asks for it.
    CAPTION.contains = [
        { begin: /\^/, 'on:begin': scopeUnless('punctuation.caption-marker', (m) => !captionHost(m.input, lineStartBefore(m.input, m.index)) || m.input.slice(lineStartBefore(m.input, m.index), m.index).trim() !== ''), relevance: 0 },
        ESCAPE, ...ONE_LINE_VERBATIM, RAW_FORMAT, LINE_COMMENT, ...LINE_INLINE,
    ];
    // A TABLE CELL IS AN INLINE RUN that ends at its pipe, so an opener whose
    // closer is not in the same cell is text.
    const CELL_INLINE = [
        { begin: /([*/_~=])(?!(?:\\.|[^\\\n|])*?(?<=\S)\1)/, relevance: 0 },
        { begin: /\{(?=([*/_~=^,+\-#%])(?!(?:\\.|[^\\\n|])*?\1\}))/, relevance: 0 },
        ...LINE_INLINE.slice(2),
    ];
    for (const row of [TABLE_HEADER_ROW, TABLE_ROW, TABLE_CONTINUATION_ROW]) {
        row.contains.splice(row.contains.length - 1, 0, ...CELL_INLINE);
        // Math and literal sigils ahead of the cell's code span (C2-B-169).
        row.contains.unshift(...ONE_LINE_VERBATIM.filter((mode) => mode !== ONE_LINE_VERBATIM.at(-1)));
    }
    // A LABEL IS AN INLINE RUN TOO (link and span text, an extension's content,
    // an inline footnote), ending at its own `]`. A nested bracket pair is
    // skipped whole, and an opener whose closer lies past the `]` is text.
    const BRACKETED = [INLINE_FOOTNOTE, FOOTNOTE_REF, IMAGE, REFERENCE_IMAGE, SPAN, REFERENCE_LINK, CITATION, INLINE_EXTENSION, LINK];
    const BRACKET_PAIR = { begin: /\[/, end: /\]/, relevance: 0 };
    const LABEL_CONTENT = [
        ESCAPE,
        BRACKET_PAIR,
        { begin: /([*/_~=])(?!(?:\\[\s\S]|[^\\\]]){0,512}?(?<=\S)\1)/, relevance: 0 },
        { begin: /\{(?=([*/_~=^,+\-#%])(?!(?:\\[\s\S]|[^\\\]]){0,512}?\1\}))/, relevance: 0 },
        { begin: /`+(?![^`\]\n]{0,512}`)/, relevance: 0 },
        ...ONE_LINE_VERBATIM,
        ...LINE_INLINE.slice(2).filter((mode) => !BRACKETED.includes(mode)),
    ];
    BRACKET_PAIR.contains = LABEL_CONTENT;
    for (const mode of [LINK, REFERENCE_LINK, SPAN, INLINE_FOOTNOTE]) mode.contains = LABEL_CONTENT;
    // An extension's content closes at its first `]` (`:foo[a [b] c]`).
    INLINE_EXTENSION.contains = LABEL_CONTENT.filter((mode) => mode !== BRACKET_PAIR);
    // A definition term is a one-line inline run like a title.
    DEFINITION_TERM.contains = [ESCAPE, ...ONE_LINE_VERBATIM, RAW_FORMAT, LINE_COMMENT, ...LINE_INLINE];
    // A quoted div fence line scopes as an unquoted one, further words included (C2-B-122).
    BLOCKQUOTE.contains.push({
        className: 'keyword',
        begin: RegExp('(?=:)' + QUOTED + DIV_BLOCK.begin.source.slice(DIV_BLOCK.begin.source.indexOf('(:{3,})'))
            .replace('(:{3,})(?:', '(:{3,})(?:[ \\t]*$(?![^\\r\\n])|')),
        'on:begin': (m) => { m.rule.scope = quotedMarkerIsParagraphText(m) ? undefined : 'keyword'; },
    });
    // A term and its descriptions in a quoted footnote body.
    BLOCKQUOTE.contains.push(
        {
            className: 'punctuation',
            begin: /(?=:)(?<=(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*>(?: ?>)*[ \t]+)::(?= +[^ \t\r\n])/,
            'on:begin': scopeUnless('punctuation', (m) => !definitionListLines(m.input).terms.has(m.index)),
        },
        {
            className: 'punctuation',
            begin: /(?=:)(?<=(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*>(?: ?>)*[ \t]*):(?= +[^ \t\r\n])/,
            'on:begin': scopeUnless('punctuation', (m) => !definitionListLines(m.input).markers.has(m.index)),
        },
    );
    // A term takes no lazy line and is never folded into a description, so it
    // always opens an entry (the 0.1.14 layout readings).
    DEFINITION_TERM['on:begin'] = (match) => {
        match.rule.scope = 'title';
        descriptionColumn = Infinity;
    };
    // The content of a quoted heading or caption line: entered right after
    // its marker, so no rule in it has to ask which line it is on. The fixed
    // `[#^] ` test runs first, so the long lookbehind is paid at those spots only.
    BLOCKQUOTE.contains.push({
        begin: /(?<=[#^] )(?=[^\r\n])(?<=^(?<![^\r\n])(?:(?<![\s\S])\uFEFF)?[ \t]*(?:> )+(?:#{1,6} |\^ ))(?![ \t]*$(?![^\r\n]))/,
        end: /$(?![^\r\n])/,
        contains: [ESCAPE, ...ONE_LINE_VERBATIM, { ...LINE_COMMENT, begin: /(?<=[ \t])%%/ }],
    });
    // A glued attribute block attaches on a quoted line too (carve-grammars#865);
    // a verbatim span or an escape keeps its brace out of it, and stays unscoped.
    BLOCKQUOTE.contains.push(
        ...[ESCAPE, ...ONE_LINE_VERBATIM].map(({ className, ...sink }) => sink),
        ATTRIBUTE_EMPTY, SPAN_ATTRIBUTE, ATTRIBUTE,
    );


    const inlineContent = (boundary, openCode) => [
        ESCAPE, CRITIC_COMMENT, DELIMITED_COMMENT, MATH_DISPLAY, MATH_INLINE, LITERAL_INLINE,
        ...openCode, INLINE_CODE, IMAGE, REFERENCE_IMAGE, INLINE_FOOTNOTE, FOOTNOTE_REF, SPAN,
        REFERENCE_LINK, LINK, AUTOLINK, EMAIL_AUTOLINK, MENTION, CROSS_REF, TAG, INSERT, DELETE,
        FORCED_STRONG, FORCED_EMPHASIS, FORCED_UNDERLINE, FORCED_STRIKE, FORCED_HIGHLIGHT,
        // An emphasis opener whose closer lies only past the boundary is text.
        { begin: new RegExp(`([*/_=])(?!(?:(?!${boundary}).){0,4096}?\\1)`), relevance: 0 },
        HIGHLIGHT, SUBSCRIPT, SUPERSCRIPT, BOLD_ITALIC, STRONG, EMPHASIS, UNDERLINE, TYPOGRAPHY,
    ];
    // A bare run holds inline content. Inside it, a same-kind braced span nests
    // and `{**}` is text, and so is a bare opener whose closer lies only past
    // this run's.
    // Once a highlight is open its closer beats an arrow; a comparison is no closer.
    // A link whose label the LINK mode cannot read, or an autolink, is still
    // opaque to a bare closer.
    const OPAQUE_DESTINATION = { begin: new RegExp(OPAQUE_INLINE_SOURCE.replace(OPAQUE_BRACED_SOURCE + '|', '')), relevance: 0 };
    const bareContent = (d, own) => [
        ESCAPE, CRITIC_COMMENT, DELIMITED_COMMENT,
        { begin: new RegExp(`\\{${d}${d}\\}`), relevance: 0 },
        ...inlineContent('(?!)', []).slice(3).filter((mode) => mode !== own
            && !(d === '=' && mode === TYPOGRAPHY)
            && mode.begin?.source !== '([*/_=])(?!(?:(?!(?!)).){0,4096}?\\1)'),
        OPAQUE_DESTINATION,
    ];
    for (const [d, mode] of [['\\*', STRONG], ['/', EMPHASIS], ['_', UNDERLINE], ['~', STRIKETHROUGH], ['=', HIGHLIGHT]]) {
        const others = ['*', '/', '_', '~', '='].filter((c) => `\\${c}` !== d && c !== d).map((c) => (c === '*' ? '\\*' : c)).join('');
        const crossing = {
            begin: new RegExp(`([${others}])(?=[^\\n]*?${bareCloser('\\1')})(?=(?:${sameKindAtoms(d)}|(?!${sameKindAtoms(d)})(?!${bareCloser('\\1')})[^\\n])*?${bareCloser(d)})`),
            relevance: 0,
        };
        const content = bareContent(d, mode);
        const at = content.findIndex((m) => m === HIGHLIGHT || m === STRONG || m === EMPHASIS);
        content.splice(at, 0, crossing);
        // The `=` of a comparison is no closer (PART 9 §9).
        const comparison = d === '=' ? [{ className: 'literal', begin: /[>!]=|<=(?![=>])/, relevance: 0 }] : [];
        mode.contains = [{ begin: new RegExp(`\\s${d}`), relevance: 0 }, DELIMITED_COMMENT, ...comparison, ...content];
    }

    // A braced span holds inline content. Its own bare delimiter is text inside
    // it while a braced span of its kind nests, a code span still open at its
    // closer ends there, and a bare opener whose closer lies only past the
    // span's closer is text.
    for (const [d, mode, own] of [
        ['\\*', FORCED_STRONG, [STRONG]], ['/', FORCED_EMPHASIS, [EMPHASIS]], ['_', FORCED_UNDERLINE, [UNDERLINE]],
        ['~', FORCED_STRIKE, [STRIKETHROUGH]], ['=', FORCED_HIGHLIGHT, [HIGHLIGHT]], ['\\^', SUPERSCRIPT, []],
        [',', SUBSCRIPT, []], ['\\+', INSERT, []], ['-', DELETE, []],
    ]) {
        const closer = `${d}\\}`;
        // An insertion or deletion has no atoms: a braced opener whose own
        // closer lies only past this one is text.
        const unscoped = mode === INSERT || mode === DELETE
            ? [{ begin: new RegExp(`\\{([*/_~=^,+-])(?=(?:(?!\\1\\})[^\\n]){0,4096}?${closer})`), relevance: 0 }]
            : [];
        const nests = !unscoped.length;
        // A nested span of this kind holds its own closer, so it is skipped.
        const skip = nests ? `${sameKindAtoms(d)}|(?!${sameKindAtoms(d)})` : '';
        mode.contains = [
            ESCAPE, CRITIC_COMMENT, DELIMITED_COMMENT, ...unscoped,
            ...(nests ? [{ begin: new RegExp(`\\{${d}${d}\\}`), relevance: 0 }] : []),
            { begin: new RegExp(`${d}(?!\\})`), relevance: 0 },
            { className: 'code', begin: /(?:\$\$?|!)?`+(?![^`\n]{0,4096}`)/, end: new RegExp(`(?=${closer})`) },
            {
                begin: new RegExp(`([${['\\*', '/', '_', '~', '='].filter((c) => c !== d).join('')}])(?=[^\\n]*?${bareCloser('\\1')})(?=(?:${skip}(?!${bareCloser('\\1')})[^\\n])*?${closer})`),
                relevance: 0,
            },
            ...inlineContent('(?!)', []).slice(3).filter((m) => (nests || m !== mode) && !own.includes(m)
                && m.begin?.source !== '([*/_=])(?!(?:(?!(?!)).){0,4096}?\\1)'),
            OPAQUE_DESTINATION,
        ];
    }

    /*
     * A fence inside a container (an item, a description, a footnote or a
     * quote), as definitionListLines reads it: it runs to its closer or to the
     * end of its container and takes no lazy line (PART 0 S1, S2;
     * carve-grammars#871, #873, #874). `quoted` picks the fences behind a quote
     * marker, reached through BLOCKQUOTE; the others begin at their line start,
     * so they outrank LONE_CODE_FENCE and UNTERMINATED_BLOCK_COMMENT there.
     */
    const containerFenceRun = (m, at, quoted) => {
        const lines = definitionListLines(m.input);
        if (!lines.fenceIndex) lines.fenceIndex = new Map(lines.fences.map((run) => [run.at, run]));
        const run = lines.fenceIndex.get(at);
        return run && run.depth > 0 && run.quoted === quoted && (quoted || !run.closed) ? run : null;
    };
    const CODE_FENCE_LINE = '(?:`{3,}|~{3,})(?: ?(?:' + CODE_FENCE_INFO + '|' + RAW_FENCE_INFO + '))?[ \\t]*$(?![^\\r\\n])';
    const CONTAINER_FENCE_LINE = '(?:' + CODE_FENCE_LINE + '|%{3,})';
    // A fence the walk did not report keeps its line, scoped as the line-only
    // rules would scope it (no `on:begin` veto, see hljs-block-context-test).
    const containerFence = (quoted, line) => ({
        className: 'code',
        begin: RegExp(quoted
            ? '(?=[`~%])(?<=>[ \\t]*)' + line
            : '^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*' + line),
        'on:begin': (m, resp) => {
            const at = m.index + m[0].search(/[`~%]/);
            const run = containerFenceRun(m, at, quoted);
            const comment = m.input.charAt(at) === '%';
            m.rule.scope = run ? (comment ? 'comment' : 'code') : (comment ? 'comment' : quoted ? undefined : 'keyword');
            resp.data.fenceEnd = run ? run.end : -1;
        },
        // The line break is left to the quote, which ends there.
        end: /\r?\n|\r|$(?![\s\S])/,
        returnEnd: true,
        'on:end': (m, resp) => {
            if (m.index < resp.data.fenceEnd) resp.ignoreMatch();
        },
        relevance: 0,
    });
    const CONTAINER_FENCE = containerFence(false, CODE_FENCE_LINE);
    // After BLOCK_COMMENT, which takes a closed comment fence first.
    const CONTAINER_COMMENT_FENCE = containerFence(false, '%{3,}');
    BLOCKQUOTE.contains.splice(BLOCKQUOTE.contains.indexOf(UNTERMINATED_BLOCK_COMMENT), 0, containerFence(true, CONTAINER_FENCE_LINE));

    /*
     * Snippets (C2-B-236, C2-I-128), the TextMate rules' spelling. A definition
     * `{$name}: value` stands at column 0 outside every container; its marker
     * parts and glued blocks hold no id, and its value is inline content of
     * that line. A use `{{ $name }}` goes ahead of INCLUDE_DIRECTIVE, which
     * would read `$name` as a path; a name of another shape, no space, a tab
     * or an option makes no use and stays with the include rule.
     */
    const SNIPPET_NAME = '[A-Za-z0-9_][A-Za-z0-9_-]*';
    const SNIPPET_PART_TAIL = /:(?:[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8})*)?|[A-Za-z_][A-Za-z0-9_-]*=(?:"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'|[^\s"'{}|\\]+)|[A-Za-z][A-Za-z0-9_-]*/.source;
    const SNIPPET_DEFINITION_PART = '(?:\\.[A-Za-z0-9_-]+|' + SNIPPET_PART_TAIL + ')';
    const SNIPPET_USE_PART = '(?:[.#][A-Za-z0-9_-]+|' + SNIPPET_PART_TAIL + ')';
    const snippetBlock = (part) => '\\{ *' + part + '(?: +' + part + ')* *\\}';
    // Only below a blank line, a block line, an attribute line with no id or
    // another definition: under paragraph text, a quote line or an item it is
    // a lazy line (C2-B-024), as a reference definition there is, and under an
    // attribute line with an id it is a paragraph (#6865). The line above is
    // refused in the regex, since each ignoreMatch builds highlight.js a new
    // matcher; a run of definition lines is traced to its first line once.
    const SNIPPET_HEAD = '\\{\\$' + SNIPPET_NAME + '(?:(?: +' + SNIPPET_DEFINITION_PART + ')+ *)?\\}(?:'
        + snippetBlock(SNIPPET_DEFINITION_PART) + ')*: (?=[ \\t]*[^ \\t\\r\\n])';
    const SNIPPET_RUN = '\\[[^\\]\\r\\n]+\\]:|\\*\\[[A-Za-z0-9]+\\]:|' + SNIPPET_HEAD
        + '|\\{(?:"[^"\\r\\n]*"|\'[^\'\\r\\n]*\'|[^{}#"\'\\r\\n])*\\}[ \\t]*\\r?$';
    const SNIPPET_ABOVE = '\\uFEFF?(?:[ \\t]*\\r?$|[ \\t]*%%|#{1,6} |={1,6} |`{3,}|~{3,}|:{3,}|(?:\\*{3,}|-{3,}|_{3,})[ \\t]*\\r?$'
        + '|\\||' + SNIPPET_RUN + ')';
    const snippetRunLine = RegExp('^\\uFEFF?(?:' + SNIPPET_RUN + ')');
    const snippetAboveLine = RegExp('^(?:' + SNIPPET_ABOVE + ')');
    let snippetInput = null;
    let snippetVerdicts = null;
    const snippetRunAllowed = (input, at) => {
        if (input !== snippetInput) {
            snippetInput = input;
            snippetVerdicts = new Map();
        }
        const run = [];
        let start = at;
        let allowed;
        for (;;) {
            if (snippetVerdicts.has(start)) {
                allowed = snippetVerdicts.get(start);
                break;
            }
            run.push(start);
            if (start === 0) {
                allowed = true;
                break;
            }
            const above = previousLineStart(input, start);
            const text = lineAt(input, above);
            if (!snippetRunLine.test(text)) {
                allowed = snippetAboveLine.test(text);
                break;
            }
            start = above;
        }
        for (const line of run) snippetVerdicts.set(line, allowed);
        return allowed;
    };
    const SNIPPET_DEFINITION = {
        begin: [
            RegExp('(?=\\uFEFF?\\{\\$)^(?<![^\\r\\n])(?<!(?<![^\\r\\n])(?!' + SNIPPET_ABOVE + ')[^\\r\\n]*\\r?\\n)(?:(?<![\\s\\S])\\uFEFF)?\\{\\$'),
            RegExp(SNIPPET_NAME),
            RegExp('(?:(?: +' + SNIPPET_DEFINITION_PART + ')+ *)?'),
            /\}/,
            RegExp('(?:' + snippetBlock(SNIPPET_DEFINITION_PART) + ')*'),
            /:(?= (?=[ \t]*[^ \t\r\n]))/,
        ],
        beginScope: { 1: 'punctuation', 2: 'variable', 3: 'attr', 4: 'punctuation', 5: 'attr', 6: 'punctuation' },
        'on:begin': (m, resp) => {
            if (!snippetRunAllowed(m.input, lineStartBefore(m.input, m.index))) resp.ignoreMatch();
        },
        end: /(?=\r\n|\r|\n)|$(?![\s\S])/,
        relevance: 0,
    };
    const SNIPPET_USE = {
        className: 'template-variable',
        begin: RegExp('\\{\\{(?= +\\$' + SNIPPET_NAME + ' +\\}\\})'),
        beginScope: 'punctuation',
        end: /\}\}/,
        endScope: 'punctuation',
        contains: [{ className: 'variable', begin: RegExp('\\$' + SNIPPET_NAME) }],
        relevance: 0,
    };
    // A use carries no attributes: valid blocks glued after it are text. A
    // braced or critic comment there is no valid block and keeps its scope.
    const SNIPPET_USE_BLOCKS = {
        begin: RegExp('(?<=\\{\\{ +\\$' + SNIPPET_NAME + ' +\\}\\})(?:' + snippetBlock(SNIPPET_USE_PART) + ')+'),
        relevance: 0,
    };

    const CONTAINS = [
        // Block-level elements (order matters - more specific first)
        ...FRONT_MATTER,
        ...LATER_METADATA,
        HEADING,
        CODE_BLOCK,        // ``` ... ``` - before the delimiter-only fallback
        RAW_BLOCK,         // ```=html ... ``` - same, with the raw info string
        ...CODE_BLOCK_ON_MARKER_LINE,
        ...RAW_BLOCK_ON_MARKER_LINE,
        UNCLOSED_CODE_BLOCK,  // an unpaired fence at column 0: to the end of the document
        CONTAINER_FENCE,   // an unclosed fence in a container: to the end of it
        LONE_CODE_FENCE,   // a fence line neither of those paired: the line only
        LINE_BLOCK,        // Must be before DIV_BLOCK (both match `::: |`)
        FIGURE_GROUP_BLOCK,  // Must be before DIV_BLOCK (both match `::: figure`)
        DIV_BLOCK,
        BARE_DIV_BLOCK,    // document level only - every container list drops it
        LINE_BLOCK_ON_MARKER_LINE,    // Must be before DIV_ON_MARKER_LINE, as above
        FIGURE_GROUP_ON_MARKER_LINE,  // Must be before DIV_ON_MARKER_LINE, as above
        DIV_ON_MARKER_LINE,
        HORIZONTAL_RULE,
        TABLE_SEPARATOR,
        TABLE_CONTINUATION,
        TABLE_CONTINUATION_ROW,
        TABLE_HEADER_ROW,
        TABLE_ROW,
        QUOTED_LINE_BLOCK,  // Must be before BLOCKQUOTE (both match `> ::: |`)
        BLOCKQUOTE,
        CAPTION,
        TASK_LIST,         // Must be before LIST_BULLET
        LIST_BULLET,
        LIST_NUMBER,
        MARKER_LINE_CONTINUATION,
        DEFINITION_LIST_ENTRY,  // `:: term` / `:  definition` (carve-grammars#91)
        // A marker after a block inside the list (an item, a fence) ended the entry.
        DESCRIPTION_MARKER,
        abbreviationOnDescription('[ \\t]+'),
        SNIPPET_DEFINITION, // {$name}: value - column 0, top level only
        FOOTNOTE_DEF,      // Must be before REFERENCE_DEF
        ABBREVIATION_DEF,  // Must be before REFERENCE_DEF (*[ABBR]: vs [ref]:)
        ABBREVIATION_ON_MARKER_LINE,
        REFERENCE_DEF,

        // Inline elements (order matters - more specific first)
        INLINE_FOOTNOTE,   // ^[content] - before FOOTNOTE_REF ([^label])
        FOOTNOTE_REF,
        IMAGE,             // Must be before LINK (starts with !)
        REFERENCE_IMAGE,   // ![alt][ref] and ![alt][] - before REFERENCE_LINK
        SPAN,              // Must be before LINK ([text]{attr} vs [text](url))
        REFERENCE_LINK,    // Must be before LINK ([text][ref] vs [text](url))
        CITATION,          // Must be after SPAN/REF_LINK (no (url)/[ref]/{attr} tail)
        CODE_CALLOUT,      // <n> callout markers
        INLINE_EXTENSION,  // :name[content] - before SYMBOL and LINK
        SYMBOL,            // :name: shortcodes
        LINK,
        AUTOLINK,
        EMAIL_AUTOLINK,
        INCLUDE_DIRECTIVE, // {{ path }} - before MENTION/TAG, which claim its selector
        RAW_FORMAT,        // {=html} - must be before INSERT/DELETE braces
        INSERT,            // {+text+}
        DELETE,            // {-text-}
        BLOCK_COMMENT,     // %%% fence - before LINE_COMMENT
        BLOCK_COMMENT_ON_MARKER_LINE,  // `- %%%` - the marker is left to the list rules
        UNCLOSED_COMMENT_ON_MARKER_LINE,
        UNCLOSED_BLOCK_COMMENT,        // a column-0 `%%%` run with no closer: to the end
        CONTAINER_COMMENT_FENCE,       // an unclosed `%%%` run in a container: to the end of it
        UNTERMINATED_BLOCK_COMMENT,    // a `%%%` run with no closer - AFTER both fences
        DELIMITED_COMMENT, // {% ... %}
        LINE_COMMENT,      // %% to end of line
        TRAILING_PERCENT_RUN,
        CRITIC_COMMENT,    // {# ... #} - must be before ATTRIBUTE
        MENTION,
        CROSS_REF,         // </#id> - before TAG, which claims the `#id`
        TAG,
        HIGHLIGHT,         // =text=
        SUBSCRIPT,         // ,text,
        SUPERSCRIPT,       // ^text^
        BOLD_ITALIC,       // the combined opener - before STRONG and EMPHASIS
        STRONG,
        EMPHASIS,          // /text/
        UNDERLINE,         // _text_
        STRIKETHROUGH,     // ~text~
        MATH_DISPLAY,      // $$`...` - before $`...` and inline code
        MATH_INLINE,       // $`...` - before inline code (leading $)
        LITERAL_INLINE,    // !`...` - before inline code (leading !)
        INLINE_CODE,       // `code` at any fence width
        FORCED_STRONG,
        FORCED_EMPHASIS,
        FORCED_UNDERLINE,
        FORCED_STRIKE,
        FORCED_HIGHLIGHT,
        {
            begin: new RegExp('(?<!\\\\)(?:\\\\\\\\)*\\\\\\[(?=(?:[^\\[\\]\\\\\\n]|\\\\.)*\\]\\{[ \\t]*(?:' + ATTR_ITEM + '(?:[ \\t]+' + ATTR_ITEM + ')*[ \\t]*)?\\})'),
            end: new RegExp('\\](?:\\{[ \\t]*(?:' + ATTR_ITEM + '(?:[ \\t]+' + ATTR_ITEM + ')*[ \\t]*)?\\})?'),
            relevance: 0,
            contains: [ESCAPE, STRONG, EMPHASIS, INLINE_CODE],
        },
        ATTRIBUTE_EMPTY,
        SPAN_ATTRIBUTE,
        ATTRIBUTE,
        ESCAPE,
        HARD_BREAK,
        TYPOGRAPHY,        // dashes/arrows - after the structural rules
    ];

    // A term's lazy lines and a description's body read as a paragraph does;
    // a reference definition there still registers.
    // A description body collects abbreviation definitions, on its `: ` line too (carve-grammars#842).
    DEFINITION_LIST_ENTRY.contains.push(ABBREVIATION_DEF, abbreviationOnDescription('[ \\t]*'), FOOTNOTE_DEF, REFERENCE_DEF, ...CONTAINS.slice(CONTAINS.indexOf(INLINE_FOOTNOTE)));
    FOOTNOTE_DEF.contains.push(...CONTAINS.slice(CONTAINS.indexOf(INLINE_FOOTNOTE)));
    // A comment block hides line-block lines too (C2-B-109, C2-B-111), but a
    // line comment there is text (C2-B-135).
    LINE_BLOCK.contains = [BLOCK_COMMENT, UNCLOSED_BLOCK_COMMENT, ...CONTAINS.slice(CONTAINS.indexOf(INLINE_FOOTNOTE))
        .filter((mode) => !(mode.className === 'comment' && /%%(?!%)|%\{3,\}/.test(mode.begin?.source ?? '') && !mode.begin.source.includes('\\{%')))];
    LINE_BLOCK_ON_MARKER_LINE.contains = [LINE_BLOCK_MARKER_LINE_CLOSER, ...LINE_BLOCK.contains];

    // A div's body holds the full top-level mode list, abbreviation definitions
    // included (markup-carve/carve#4874, carve-grammars#852), minus the
    // bare opener, which BARE_FENCE_LINE stands in for. DIV_BLOCK is in that
    // list, so a div nests in a div.
    const IN_CONTAINER = CONTAINS
        .filter((mode) => !LATER_METADATA.includes(mode) && mode !== SNIPPET_DEFINITION)
        .map((mode) => (mode === BARE_DIV_BLOCK ? BARE_FENCE_LINE : mode));
    DIV_BLOCK.contains = IN_CONTAINER;
    BARE_DIV_BLOCK.contains = IN_CONTAINER;

    // A composite figure's body is the div body MINUS FIGURE_GROUP_BLOCK (PART 9
    // §4c: GROUPS DO NOT NEST - a bare `::: figure` inside an open group is a
    // generic container at any depth, corpus 318-composite-figures-9). Dropping
    // the mode is what makes the inner opener fall to the div mode, which is
    // exactly the generic reading the clause asks for.
    //
    // The div reached from here is DIV_BLOCK_IN_GROUP rather than DIV_BLOCK, so
    // the exclusion survives a level of nesting: DIV_BLOCK still offers
    // FIGURE_GROUP_BLOCK (a bare opener inside a `::: note` IS a group - only a
    // group suppresses one), and this variant does not, so
    // `::: figure` > `::: note` > `::: figure` reads generic too.
    //
    // RESIDUAL, written down rather than left to be rediscovered: a bare opener
    // reached through a LIST ITEM or a BLOCKQUOTE inside a group is matched by
    // the top-level modes again, so it over-colours as a group there. That is
    // the same block-context limit every mode in this file has (see the
    // indented-block-openers note in the module docblock); tree-sitter-carve is
    // where a real container model lives.
    const IN_GROUP = IN_CONTAINER
        .filter((mode) => mode !== FIGURE_GROUP_BLOCK && mode !== FIGURE_GROUP_ON_MARKER_LINE)
        .map((mode) => {
            if (mode === DIV_BLOCK) return DIV_BLOCK_IN_GROUP;
            if (mode === DIV_ON_MARKER_LINE) return DIV_ON_MARKER_LINE_IN_GROUP;
            return mode;
        });
    FIGURE_GROUP_BLOCK.contains = IN_GROUP;
    DIV_BLOCK_IN_GROUP.contains = IN_GROUP;

    // A marker-line container's body is the line-start one's, led by its closer.
    DIV_ON_MARKER_LINE.contains = [DIV_MARKER_LINE_CLOSER, ...IN_CONTAINER];
    FIGURE_GROUP_ON_MARKER_LINE.contains = [FIGURE_GROUP_MARKER_LINE_CLOSER, ...IN_GROUP];
    DIV_ON_MARKER_LINE_IN_GROUP.contains = [DIV_IN_GROUP_MARKER_LINE_CLOSER, ...IN_GROUP];

    // Every inline list that reads a tag reads an unattached block as one atom
    // first: after the attached-block rules, before a sink that takes a lone `{`.
    {
        const attached = [ATTRIBUTE, ATTRIBUTE_EMPTY, SPAN_ATTRIBUTE];
        const tagish = [TAG, HEADING_TAG, MENTION];
        const braceSink = (mode) => mode && !mode.className && mode.begin instanceof RegExp && mode.begin.source.startsWith('\\{(?=(');
        const seen = new Set();
        const visit = (mode) => {
            if (!mode || typeof mode !== 'object' || seen.has(mode)) return;
            seen.add(mode);
            for (const child of [].concat(mode.contains || [], mode.starts || [], mode.variants || [])) visit(child);
            const list = mode.contains;
            if (!Array.isArray(list) || list.includes(ATTRIBUTE_UNATTACHED) || !list.some((m) => tagish.includes(m))) return;
            const last = Math.max(...attached.map((m) => list.indexOf(m)));
            const first = list.findIndex((m) => tagish.includes(m) || braceSink(m));
            list.splice(last >= 0 ? last + 1 : first, 0, ATTRIBUTE_UNATTACHED);
        };
        CONTAINS.forEach(visit);
        visit({ contains: CONTAINS });
    }
    // C2-I-024: a line comment takes every closer on its line, so a form whose
    // closing line holds a comment ahead of the closer stays open there.
    {
        const span = '(?<!`)(`{1,16})(?!`)(?:[^\\n`]|(?!(?<!`)\\1(?!`))`)*(?<!`)\\1(?!`)';
        const lone = '(?<!`)(`{1,16})(?!`)(?![^\\n]*?(?<!`)\\2(?!`))';
        const commentOnLine = RegExp('^(?:[ \\t>]*%%|(?:[^\\n`\\\\]|\\\\[^\\n]|' + span + '|' + lone + ')*?[ \\t]%%)');
        const takenByComment = (input, from, to) => {
            const head = input.slice(from, to);
            return commentOnLine.test(head.slice(head.lastIndexOf('\n') + 1));
        };
        const labelEnd = (input, from) => {
            let depth = 0;
            // Bounded like the label patterns, so a run of open brackets stays linear.
            for (let i = from, stop = Math.min(input.length, from + 2048); i < stop && input[i] !== '\n'; i++) {
                if (input[i] === '\\') i++;
                else if (input[i] === '[') depth++;
                else if (input[i] === ']' && --depth === 0) return i;
            }
            return -1;
        };
        // A link's or span's label is inline content, an image's alt text is not;
        // a reference label behind either is (C2-I-077).
        const labelTaken = (input, index, altText) => {
            const open = input.indexOf('[', index);
            const close = open < 0 ? -1 : labelEnd(input, open);
            if (close < 0) return false;
            if (!altText && takenByComment(input, open, close)) return true;
            if (input[close + 1] !== '[') return false;
            const second = labelEnd(input, close + 1);
            return second >= 0 && takenByComment(input, close + 1, second);
        };
        const gate = (mode, label) => {
            const before = mode['on:begin'];
            const end = mode.end && new RegExp(mode.end.source, 'gm');
            mode['on:begin'] = (m, resp) => {
                // The mode's own check first: the comment check below scans to the closer.
                before?.(m, resp);
                if (resp.isMatchIgnored) return;
                let taken;
                if (label) taken = labelTaken(m.input, m.index, label === 'alt');
                else if (!end) taken = takenByComment(m.input, m.index, m.index + m[0].length);
                else {
                    end.lastIndex = m.index + m[0].length;
                    const closer = end.exec(m.input);
                    taken = takenByComment(m.input, m.index, closer ? closer.index : m.index);
                }
                if (taken) resp.ignoreMatch();
            };
        };
        [STRONG, EMPHASIS, UNDERLINE, BOLD_ITALIC, HIGHLIGHT, SUBSCRIPT, SUPERSCRIPT, STRIKETHROUGH, INSERT, DELETE,
            FORCED_STRONG, FORCED_EMPHASIS, FORCED_UNDERLINE, FORCED_STRIKE, FORCED_HIGHLIGHT, INLINE_FOOTNOTE].forEach((mode) => gate(mode));
        [LINK, REFERENCE_LINK, SPAN, INLINE_EXTENSION].forEach((mode) => gate(mode, 'label'));
        [IMAGE, REFERENCE_IMAGE].forEach((mode) => gate(mode, 'alt'));
        // The plain shape, a comment in the first label, fails in the regex:
        // each refused begin costs highlight.js a new matcher on first use.
        for (const mode of [LINK, REFERENCE_LINK, SPAN, INLINE_EXTENSION, INLINE_FOOTNOTE]) {
            mode.begin = RegExp('(?=[\\[:^])(?![^\\[\\n]{0,64}\\[[^\\[\\]`\\n]{0,512}?[ \\t]%%)(?:' + mode.begin.source + ')');
        }
    }
    // C2-B-024: a quote marker, a term, an attribute line or an include directive
    // directly under paragraph text is a lazy line of that paragraph.
    {
        const previousLine = previousLineStart;
        const blank = /^\uFEFF?[ \t]*(?:>[ \t]*)*$/;
        const commentOnly = /^\uFEFF?[ \t]*%%(?!%)(?![ \t]*#(?:region|endregion)\b)/;
        const boundary = /^\uFEFF?[ \t]*(?:#{1,6}(?: |$)|={1,6} |`{3,}|:{3,}|%{3,}|%%[ \t]*#(?:region|endregion)\b|(?:\*{3,}|-{3,}|_{3,})[ \t]*$|\|.*\||\{[^{}]*\}[ \t]*$|\[\^?[^\]]+\]:(?: |$)|\*\[[A-Za-z0-9]+\]:|\^ |:: |\+[ \t]*$)/;
        // The first line of the paragraph that the line at `at` would continue, or null.
        const paragraphHead = (input, at) => {
            let head = null;
            for (let line = previousLine(input, at), n = 0; line !== -1 && n < 64; line = previousLine(input, line), n++) {
                const text = lineAt(input, line);
                if (commentOnly.test(text)) continue;
                if (blank.test(text) || boundary.test(text)) {
                    // An indented line under a heading, caption or term continues that label (C2-B-234).
                    if (head !== null && /^[ \t]/.test(head) && /^\uFEFF?[ \t]*(?:#{1,6} |={1,6} |\^ |:: )/.test(text)) return null;
                    break;
                }
                // Only an indented line can continue a label, so a column-0 one settles it.
                if (!/^[ \t]/.test(text)) return text;
                head = text;
            }
            return head;
        };
        const lazy = (input, index) => {
            // Only white space may stand before it on its line. Reading back to
            // the first other character, not slicing from the line start,
            // keeps a long line of directives linear (#988).
            let at = index;
            while (at > 0 && input[at - 1] !== '\n' && input[at - 1] !== '\r') {
                if (input[at - 1].trim() !== '') return false;
                at--;
            }
            const text = lineAt(input, at);
            if (/^\uFEFF?: /.test(text)) {
                // A description line follows its term's reading.
                for (let line = previousLine(input, at), n = 0; line !== -1 && n < 64; line = previousLine(input, line), n++) {
                    const above = lineAt(input, line);
                    if (blank.test(above)) return false;
                    if (/^\uFEFF?:: /.test(above)) return lazy(input, line);
                }
                return false;
            }
            const head = paragraphHead(input, at);
            // A term under a description starts the next entry.
            if (head === null || (/^\uFEFF?:: /.test(text) && /^\uFEFF?: /.test(head))) return false;
            if (/^\uFEFF?[ \t]*>/.test(text)) return !/^\uFEFF?[ \t]*>/.test(head);
            return true;
        };
        const quoteBegin = BLOCKQUOTE['on:begin'];
        BLOCKQUOTE['on:begin'] = (m, resp) => {
            quoteBegin(m, resp);
            if (lazy(m.input, m.index)) m.rule.scope = undefined;
        };
        const ATTRIBUTE_LINE = CONTAINS.find((mode) => mode.className === 'attr' && mode.begin?.source?.startsWith('(?:(?=\\{)(?<=(?:^(?<![^\\r\\n])|\\n))'));
        const LOOSE_DESCRIPTION = CONTAINS.find((mode) => mode.className === 'punctuation' && mode.begin?.source === '^(?<![^\\r\\n])([ \\t]*)(?=:):(?= +(?![ \\t]*$(?![^\\r\\n])))');
        // The common shape, a column-0 text line right above, is refused in the
        // regex: every ignoreMatch makes highlight.js build another matcher.
        const TEXT_ABOVE = '^(?!\\uFEFF?(?:#{1,6}(?: |$)|={1,6} |`{3,}|(?:\\*{3,}|-{3,}|_{3,})[ \\t]*$|\\[\\^?[^\\]\\r\\n]+\\]:|\\*\\[|\\^ |\\+[ \\t]*$))'
            + '(?!\\uFEFF?(?:>[ \\t]*)+\\r?$)\\uFEFF?[^ \\t\\r\\n:%|{][^\\r\\n]*\\r?\\n';
        const refuse = (mode, ahead, above) => {
            mode.begin = RegExp('(?=' + ahead + ')(?<!' + above + ')(?:' + mode.begin.source + ')');
        };
        refuse(ATTRIBUTE_LINE, '\\{', TEXT_ABOVE);
        refuse(INCLUDE_DIRECTIVE, '\\{\\{', TEXT_ABOVE + '[ \\t]*');
        refuse(DEFINITION_LIST_ENTRY, '[ \\t]*::', TEXT_ABOVE);
        refuse(LOOSE_DESCRIPTION, '[ \\t]*:', TEXT_ABOVE + '::[^\\r\\n]*\\r?\\n');
        for (const mode of [DEFINITION_LIST_ENTRY, INCLUDE_DIRECTIVE, ATTRIBUTE_LINE, LOOSE_DESCRIPTION]) {
            const before = mode['on:begin'];
            mode['on:begin'] = (m, resp) => {
                if (lazy(m.input, m.index)) return resp.ignoreMatch();
                return before?.(m, resp);
            };
        }
    }
    // A quoted line holds the inline set a heading does (C2-B-147). Each mode
    // ends with the quote line, so no span carries the next line's `>` (C2-B-001).
    {
        const lineBound = (mode) => (mode.end ? { ...mode, endsWithParent: true } : mode);
        const inline = [ESCAPE, ...ONE_LINE_VERBATIM, RAW_FORMAT, DELIMITED_COMMENT, LINE_COMMENT, ATTRIBUTE_EMPTY,
            SPAN_ATTRIBUTE, ATTRIBUTE, ATTRIBUTE_UNATTACHED, CROSS_REF, TAG, SYMBOL, ...LINE_INLINE].map(lineBound);
        const sink = BLOCKQUOTE.contains.findIndex((mode) => !mode.className && mode.begin === ESCAPE.begin);
        BLOCKQUOTE.contains.splice(sink, 0, ...inline);
        const content = BLOCKQUOTE.contains.find((mode) => mode.contains?.some((child) => child.begin?.source === '(?<=[ \\t])%%'));
        content.contains.push(...inline.slice(ONE_LINE_VERBATIM.length + 4));
    }

    // A definition's value reads as a quoted line's text does, bounded by its
    // line. Every inline list reads a use: ahead of the include directive, or
    // first where there is none (no other rule opens on `{{`).
    {
        const lineBound = (mode) => (mode.end ? { ...mode, endsWithParent: true } : mode);
        SNIPPET_DEFINITION.contains = [ESCAPE, ...ONE_LINE_VERBATIM, RAW_FORMAT, DELIMITED_COMMENT, LINE_COMMENT, ATTRIBUTE_EMPTY,
            SPAN_ATTRIBUTE, ATTRIBUTE, ATTRIBUTE_UNATTACHED, CROSS_REF, TAG, SYMBOL, ...LINE_INLINE].map(lineBound);
        const inline = [INCLUDE_DIRECTIVE, STRONG, EMPHASIS, INLINE_CODE, LINK];
        const isInline = (mode) => inline.some((known) => mode === known || (mode.begin && mode.begin === known.begin));
        const seen = new Set();
        const visit = (mode) => {
            if (!mode || typeof mode !== 'object' || seen.has(mode)) return;
            seen.add(mode);
            for (const child of [].concat(mode.contains ?? [], mode.variants ?? [], mode.starts ?? [])) visit(child);
            const list = mode.contains;
            if (!Array.isArray(list) || list.includes(SNIPPET_USE) || !list.some((child) => child && typeof child === 'object' && isInline(child))) return;
            const at = list.findIndex((child) => child === INCLUDE_DIRECTIVE || child?.begin === INCLUDE_DIRECTIVE.begin);
            list.splice(at === -1 ? 0 : at, 0, SNIPPET_USE, SNIPPET_USE_BLOCKS);
        };
        visit({ contains: CONTAINS });
    }

    // A refused begin resumes on the rules after it, which may find nothing for
    // the rest of the document; a line break stops that scan at the line. Only
    // resume matchers carry it: in the full matcher it would end every scan at
    // the line and cost one more scan per line (isolateResumeMatchers).
    CONTAINS.push({ begin: /\n/, relevance: 0, resumeStop: true });

    return {
        // `crv` is the canonical file extension, and every surface this package
        // ships answers it (tests/lib/aliases.js). `registerLanguage` registers
        // the definition's own aliases, so listing it here is the whole
        // registration. No casing variant belongs in this list: highlight.js
        // lowercases both what it stores and what `getLanguage` is asked for,
        // so `Carve` already resolves and a second spelling would be dead.
        name: 'Carve',
        aliases: ['carve', 'crv'],
        case_insensitive: false,
        contains: CONTAINS,
    };
    };
}));
