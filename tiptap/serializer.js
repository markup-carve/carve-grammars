/**
 * Carve Serializer for Tiptap/ProseMirror
 *
 * Converts a Tiptap/ProseMirror JSON document to Carve markup.
 *
 * @example
 * ```js
 * import { serializeToCarve } from 'carve-grammars/tiptap'
 *
 * const editor = new Editor({ ... })
 *
 * // Get Carve output
 * const carveText = serializeToCarve(editor.getJSON())
 * ```
 *
 * Round-trip escaping (see escapeCarve) is verified against the carve-js
 * reference parser for all realistic inputs. Two pathological residuals are not
 * handled, as they would need either whole-paragraph flanking analysis or much
 * noisier escaping:
 * - CriticMarkup content that literally contains its own closing delimiter
 *   (`+}` / `-}`) - Carve provides no escape for it at all.
 * - A literal doubled delimiter directly abutting an emphasized sibling with no
 *   space (e.g. literal `**` immediately followed by bold text) - the run
 *   merges into a longer literal delimiter run on reparse.
 */

/**
 * Serialize a Tiptap/ProseMirror JSON document to Carve markup
 *
 * @param {Object} doc - The document JSON from editor.getJSON()
 * @returns {string} Carve markup
 */
/**
 * Turn an embed src into a Carve media directive. YouTube/Vimeo map to the
 * idiomatic :youtube[id] / :vimeo[id]; anything else falls back to :media[url]
 * so it round-trips through the carve-php-media-embed extension.
 *
 * @param {string} src - iframe / embed URL (may be protocol-relative).
 * @returns {string} Carve directive, or '' for an empty src.
 */
export function carveMediaDirective(src) {
    if (!src) return '';
    const clean = src.replace(/^https?:/i, '').replace(/^\/\//, '');
    let m = clean.match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?(?:.*&)?v=)|youtu\.be\/)([\w-]+)/i);
    if (m) return `:youtube[${m[1]}]`;
    m = clean.match(/(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)/i);
    if (m) return `:vimeo[${m[1]}]`;
    const url = src.startsWith('//') ? `https:${src}` : src;
    return `:media[${url}]`;
}

export function serializeToCarve(doc) {
    let output = '';

    function serializeNode(node, depth = 0) {
        if (!node) return;

        switch (node.type) {
            case 'doc':
                (node.content || []).forEach((child, i) => {
                    serializeNode(child, depth);
                    if (i < (node.content || []).length - 1) {
                        const curr = child.type;
                        const next = node.content[i + 1]?.type;
                        // Only skip blank line between consecutive same-type lists
                        const bothSameList = curr === next && ['bulletList', 'orderedList', 'taskList'].includes(curr);
                        if (!bothSameList) {
                            output += '\n';
                        }
                    }
                });
                break;

            case 'paragraph':
                output += serializeInline(node.content) + '\n';
                break;

            case 'heading': {
                // Strict djot: block attributes live on the preceding line, never
                // trailing the heading text (a trailing `{...}` reparses as literal).
                const headAttrs = serializeAttributes(node.attrs, ['level']);
                if (headAttrs) {
                    output += headAttrs + '\n';
                }
                output += '#'.repeat(node.attrs?.level || 1) + ' ' + serializeInline(node.content) + '\n';
                break;
            }

            case 'bulletList':
            case 'orderedList':
            case 'taskList':
                // A list is "loose" when an item holds more than one
                // paragraph-level block. A nested sub-list does NOT count - an
                // item of `paragraph + sublist` is still tight, so don't let it
                // force blank lines that would turn the whole list loose.
                const isLoose = (node.content || []).some((item) => {
                    const blocks = (item.content || []).filter(
                        (b) => !['bulletList', 'orderedList', 'taskList'].includes(b.type),
                    );
                    return blocks.length > 1;
                });
                let num = node.attrs?.start || 1;
                (node.content || []).forEach((item, i) => {
                    const indent = '  '.repeat(depth);
                    if (node.type === 'bulletList') {
                        output += indent + '- ';
                    } else if (node.type === 'orderedList') {
                        output += indent + num + '. ';
                        num++;
                    } else if (node.type === 'taskList') {
                        const checked = item.attrs?.checked ? 'x' : ' ';
                        output += indent + '- [' + checked + '] ';
                    }
                    serializeListItem(item, depth);
                    // Add blank line between items in loose lists
                    if (isLoose && i < (node.content || []).length - 1) {
                        output += '\n';
                    }
                });
                break;

            case 'blockquote':
                // Serialize each child block with proper blank line separation
                (node.content || []).forEach((child, i) => {
                    const childText = serializeNodeToString(child);
                    // Prefix each line with >
                    childText.split('\n').forEach(line => {
                        output += '> ' + line + '\n';
                    });
                    // Add blank line between blocks (> followed by empty line)
                    if (i < (node.content || []).length - 1) {
                        output += '>\n';
                    }
                });
                break;

            case 'codeBlock': {
                const lang = node.attrs?.language || '';
                // Carve info string sits directly after the fence: ```php
                // Strip one trailing newline from the code text (carve-php renders
                // <code>…\n</code>) so we don't emit a blank line before the fence.
                const code = (node.content || []).map(c => c.text || '').join('').replace(/\n$/, '');
                output += '```' + lang + '\n' + code + '\n```\n';
                break;
            }

            case 'horizontalRule':
                output += '---\n';
                break;

            case 'hardBreak':
                output += '\\\n';
                break;

            case 'image': {
                const imgAlt = node.attrs?.alt || '';
                const imgSrc = node.attrs?.src || '';
                const imgTitle = node.attrs?.title ? ' "' + escapeTitle(node.attrs.title) + '"' : '';
                const imgAttrs = serializeAttributes(node.attrs, ['alt', 'src', 'title']);
                output += '![' + imgAlt + '](' + imgSrc + imgTitle + ')' + imgAttrs + '\n';
                break;
            }

            case 'table':
                serializeTable(node);
                break;

            case 'carveDiv':
                const divClass = node.attrs?.class || '';
                // Quoted container title (::: note "Custom title"), captured from
                // the rendered admonition-title paragraph by the CarveDiv node.
                // The opener grammar is "[^"]*" after a type token: no escapes and
                // no inner double quotes (degrade those to single quotes), an
                // empty title is meaningful, and a bare ::: cannot carry a title.
                const rawDivTitle = node.attrs?.title;
                const divTitle = divClass && rawDivTitle != null
                    ? ' "' + String(rawDivTitle).replace(/"/g, "'") + '"'
                    : '';
                output += ':::' + (divClass ? ' ' + divClass : '') + divTitle + '\n';
                // Serialize children with blank line separation (like doc level)
                (node.content || []).forEach((child, i) => {
                    serializeNode(child, depth);
                    if (i < (node.content || []).length - 1) {
                        const curr = child.type;
                        const next = node.content[i + 1]?.type;
                        // Only skip blank line between consecutive same-type lists
                        const bothSameList = curr === next && ['bulletList', 'orderedList', 'taskList'].includes(curr);
                        if (!bothSameList) {
                            output += '\n';
                        }
                    }
                });
                output += ':::\n';
                break;

            case 'carveEmbed': {
                // Prefer the exact source the renderer stamped (data-carve-source):
                // lossless for every provider. Fall back to reconstructing a
                // directive from the URL only for un-stamped embeds (e.g. a raw
                // iframe the user pasted).
                const directive = node.attrs?.carveSource || carveMediaDirective(node.attrs?.src || '');
                if (directive) {
                    output += directive + '\n';
                }
                break;
            }

            case 'carveFootnoteDefinition': {
                const fnLabel = node.attrs?.label || 'note';
                const paras = (node.content || []).map(b => serializeInline(b.content || []));
                // First paragraph on the marker line; further paragraphs are
                // indented continuation lines.
                output += '[^' + fnLabel + ']: ' + (paras.shift() || '') + '\n';
                paras.forEach(p => { output += '  ' + p + '\n'; });
                break;
            }

            case 'definitionList':
                serializeDefinitionList(node);
                break;
        }
    }

    function serializeDefinitionList(dl) {
        const children = dl.content || [];
        let afterDescription = false;
        children.forEach(child => {
            if (child.type === 'definitionTerm') {
                // Blank line between pairs (but not before the first term).
                if (afterDescription) {
                    output += '\n';
                }
                // Carve term marker is `:: `; the description is `:  ` on the very
                // next line (a blank line between them would end the list).
                output += ':: ' + serializeInline(child.content) + '\n';
                afterDescription = false;
            } else if (child.type === 'definitionDescription') {
                (child.content || []).forEach(block => {
                    if (block.type === 'paragraph') {
                        output += ':  ' + serializeInline(block.content) + '\n';
                    } else {
                        // For other block types, serialize with indentation.
                        const blockText = serializeNodeToString(block);
                        blockText.split('\n').filter(l => l).forEach(line => {
                            output += ':  ' + line + '\n';
                        });
                    }
                });
                afterDescription = true;
            }
        });
    }

    function serializeTable(table) {
        const rows = table.content || [];
        if (rows.length === 0) return;

        // Carve marks header cells with `|=`, and reconstructs ProseMirror
        // colspan/rowspan with filler cells: `<` continues the cell to its left
        // (colspan) and `^` continues the cell above (rowspan). ProseMirror omits
        // a cell node for grid positions covered by a span, so we rebuild the grid
        // row by row, carrying rowspans forward per column.
        const rowspanCarry = []; // rowspanCarry[col] = remaining rows to fill with `^`
        rows.forEach(row => {
            const cells = row.content || [];
            const out = []; // { header, content } per grid column, incl. `^`/`<` fillers
            let col = 0;
            let ci = 0;
            while (ci < cells.length || rowspanCarry.slice(col).some(c => c > 0)) {
                if (rowspanCarry[col] > 0) {
                    out.push({ header: false, content: '^' });
                    rowspanCarry[col]--;
                    col++;
                    continue;
                }
                if (ci >= cells.length) break;
                const cell = cells[ci++];
                const colspan = cell.attrs?.colspan || 1;
                const rowspan = cell.attrs?.rowspan || 1;
                const header = cell.type === 'tableHeader';
                const content = (cell.content || [])
                    .map(p => serializeInline(p.content))
                    .join(' ')
                    // A cell is one line; fold newlines and escape pipes so a `|`
                    // in the text is not read as a column separator.
                    .replace(/\n/g, ' ')
                    .replace(/\|/g, '\\|');
                out.push({ header, content });
                if (rowspan > 1) rowspanCarry[col] = rowspan - 1;
                col++;
                for (let k = 1; k < colspan; k++) {
                    out.push({ header: false, content: '<' });
                    if (rowspan > 1) rowspanCarry[col] = rowspan - 1;
                    col++;
                }
            }
            let line = '';
            for (const c of out) {
                line += (c.header ? '|= ' : '| ') + c.content + ' ';
            }
            output += line + '|\n';
        });
    }

    function serializeNodeToString(node) {
        const oldOutput = output;
        output = '';
        serializeNode(node);
        const result = output;
        output = oldOutput;
        return result.trim();
    }

    function serializeListItem(item, depth) {
        const content = item.content || [];
        content.forEach((child, i) => {
            if (child.type === 'paragraph') {
                output += serializeInline(child.content) + '\n';
                // Blank line before a following *paragraph-level* block (loose
                // item), but NOT before a nested list - that stays tight
                // (`- b` directly followed by `  - c`).
                const next = content[i + 1];
                if (next && !['bulletList', 'orderedList', 'taskList'].includes(next.type)) {
                    output += '\n';
                }
            } else if (['bulletList', 'orderedList', 'taskList'].includes(child.type)) {
                serializeNode(child, depth + 1);
                // Add blank line after nested list if followed by more content
                if (i < content.length - 1) {
                    output += '\n';
                }
            }
        });
    }

    function serializeInline(content) {
        if (!content) return '';
        let result = '';

        content.forEach((node, idx) => {
            if (node.type === 'text') {
                let text = node.text || '';
                const marks = node.marks || [];

                // Check each mark type
                const hasCode = marks.some(m => m.type === 'code');
                const hasBold = marks.some(m => m.type === 'bold');
                const hasItalic = marks.some(m => m.type === 'italic');
                const hasHighlight = marks.some(m => m.type === 'highlight');
                const hasDelete = marks.some(m => m.type === 'carveDelete');
                const hasInsert = marks.some(m => m.type === 'carveInsert');
                const hasSup = marks.some(m => m.type === 'superscript');
                const hasSub = marks.some(m => m.type === 'subscript');
                const hasStrike = marks.some(m => m.type === 'strike');
                const hasUnderline = marks.some(m => m.type === 'underline');
                const link = marks.find(m => m.type === 'link');
                const carveSpan = marks.find(m => m.type === 'carveSpan');
                const abbr = marks.find(m => m.type === 'carveAbbreviation');

                // Apply marks from innermost to outermost.
                // Tokens target carve-php's PARSER (the contract): `code`, ,,sub,,,
                // ^sup^, {+ins+}, {-del-}, ~strike~ -> <s>, ==mark==, _underline_,
                // /em/, *strong*.
                const isEmphasized = hasBold || hasItalic || hasUnderline || hasStrike
                    || hasHighlight || hasSup || hasSub;
                let t;
                if (hasCode) {
                    // Code content is raw (no escaping inside code), so a literal
                    // backtick is handled by widening the fence to one more than
                    // the longest internal backtick run, padding if it touches an
                    // edge - e.g. `` `a`b` `` -> `` ``a`b`` ``.
                    const longest = (text.match(/`+/g) || []).reduce((m, r) => Math.max(m, r.length), 0);
                    const fence = '`'.repeat(longest + 1);
                    const pad = (text.startsWith('`') || text.endsWith('`') || text === '') ? ' ' : '';
                    t = fence + pad + text + pad + fence;
                } else if (isEmphasized) {
                    // Inside an emphasis span ANY literal delimiter closes it
                    // early (`*a*b*`), so escape every emphasis delimiter char.
                    // (`=` and `,` are NOT delimiters - highlight/sub use the
                    // braced `{= =}` / `{, ,}`, and bare `==` / `,,` are literal.)
                    t = escapeStructural(text).replace(/[*/_~^]/g, '\\$&');
                } else {
                    // Plain text: structural + pair-aware emphasis-opener escaping.
                    t = escapeCarve(text);
                    // A lone emphasis delimiter at this run's edge can pair with
                    // one in an adjacent inline node across the mark boundary
                    // (`*` + linked `bold` + `*` -> `*[bold](u)*`). Escape an
                    // unescaped, non-doubled edge delimiter when a sibling abuts it.
                    if (idx < content.length - 1) t = escapeTrailingDelimiter(t);
                    if (idx > 0) t = escapeLeadingDelimiter(t);
                }
                // If this run will be wrapped in a bracket label (link / span /
                // abbreviation), escape literal `]` from the original text now -
                // before mark wrapping adds its own brackets - so a `]` in the
                // content does not terminate the label, without touching the
                // brackets of an inner already-serialized mark.
                if ((link || carveSpan || abbr) && !hasCode) {
                    t = t.replace(/]/g, '\\]');
                }
                if (hasSub) t = '{,' + t + ',}';
                if (hasSup) {
                    // `^x^` only forms a superscript when flanked by a boundary;
                    // intraword (`mc^2^`) is literal and needs the braced `{^x^}`.
                    // Emit the clean bare form when this run is alone and flanked,
                    // matching how strike (`~x~`) already serializes.
                    const supAlone = !hasBold && !hasItalic && !hasUnderline && !hasStrike
                        && !hasHighlight && !hasInsert && !hasDelete && !link && !carveSpan && !abbr;
                    const before = result.slice(-1);
                    const after = (content[idx + 1] && content[idx + 1].text) ? content[idx + 1].text[0] : '';
                    const flanked = (!before || /[\s([{<"']/.test(before))
                        && (!after || /[\s)\]}>"'.,;:!?]/.test(after));
                    t = (supAlone && flanked) ? '^' + t + '^' : '{^' + t + '^}';
                }
                // NOTE: Carve has no escape for a CriticMarkup closing delimiter,
                // so insert/delete content that literally contains `+}` / `-}`
                // cannot round-trip - a Carve limitation, not fixable here.
                if (hasInsert) t = '{+' + t + '+}';
                if (hasDelete) t = '{-' + t + '-}';
                if (hasStrike && !hasDelete) t = '~' + t + '~';
                if (hasHighlight) t = '{=' + t + '=}';
                if (hasUnderline) t = '_' + t + '_';
                if (hasItalic) t = '/' + t + '/';
                if (hasBold) t = '*' + t + '*';
                if (link) {
                    const title = link.attrs?.title ? ' "' + escapeTitle(link.attrs.title) + '"' : '';
                    t = '[' + t + '](' + link.attrs.href + title + ')';
                }
                if (carveSpan) {
                    const spanAttrs = serializeAttributes(carveSpan.attrs)
                        || ('{.' + (carveSpan.attrs?.class || 'class') + '}');
                    t = '[' + t + ']' + spanAttrs;
                }
                // `[text]{abbr="…"}` is carve/djot-php's SemanticSpanExtension
                // syntax: with that extension enabled the `abbr` attribute is
                // promoted to a real `<abbr title="…">`; without it, it stays a
                // `<span abbr="…">`. (Title escaped like a link title.)
                if (abbr) t = '[' + t + ']{abbr="' + escapeTitle(abbr.attrs?.title || '') + '"}';

                result += t;
            } else if (node.type === 'hardBreak') {
                result += '\\\n';
            } else if (node.type === 'image') {
                const alt = node.attrs?.alt || '';
                const src = node.attrs?.src || '';
                const title = node.attrs?.title ? ' "' + escapeTitle(node.attrs.title) + '"' : '';
                const imgAttrs = serializeAttributes(node.attrs, ['alt', 'src', 'title']);
                result += '![' + alt + '](' + src + title + ')' + imgAttrs;
            } else if (node.type === 'carveMention') {
                result += '@' + (node.attrs?.id || '');
            } else if (node.type === 'carveTag') {
                result += '#' + (node.attrs?.id || '');
            } else if (node.type === 'carveFootnote') {
                const label = node.attrs?.label || 'note';
                result += '[^' + label + ']';
            } else if (node.type === 'carveMath') {
                // Math source is raw; widen the backtick fence past any internal
                // run and pad if it touches an edge. Inline $`x`, display $$`x`
                // (the leading $/$$ opens; a trailing $ would render literally).
                const mathSrc = node.attrs?.src || '';
                const longest = (mathSrc.match(/`+/g) || []).reduce((m, r) => Math.max(m, r.length), 0);
                const fence = '`'.repeat(longest + 1);
                const pad = (mathSrc.startsWith('`') || mathSrc.endsWith('`') || mathSrc === '') ? ' ' : '';
                const dollars = node.attrs?.display ? '$$' : '$';
                result += dollars + fence + pad + mathSrc + pad + fence;
            }
        });

        return result;
    }

    serializeNode(doc);
    return output.trim();
}

/**
 * Escape the "structural" Carve constructs in a text run - the ones whose
 * delimiters are unambiguous regardless of flanking. Used for both plain and
 * marked text (marked text additionally escapes the emphasis delimiters).
 *
 * - inline code `` `...` ``
 * - links / reference links / spans / footnotes: `[text](`, `[text][`,
 *   `[text]{`, `[text]:`, `[^label]`
 * - CriticMarkup / attribute / raw / comment braces: `{+ {- {~ {# {= {%`
 * - mentions `@name`, tags `#tag` (nodes; escaped here for literal prose),
 *   emoji `:name:` (not modeled by CarveKit)
 */
function escapeStructural(text) {
    return text
        // A backslash that would otherwise escape a following escapable char.
        .replace(/\\(?=[\\`*_/~^=,{}[\]()<>@#%!|.+-])/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\[(?=\^)/g, '\\[')
        .replace(/\[(?=[^\]\n]*\][([{:])/g, '\\[')
        .replace(/\{(?=[+\-~#=%])/g, '\\{')
        .replace(/(^|[^\w.])@(?=[A-Za-z0-9_])/g, '$1\\@')
        .replace(/(^|[^\w])#(?=[A-Za-z0-9_])/g, '$1\\#')
        .replace(/:(?=[A-Za-z0-9_+-]+:)/g, '\\:');
}

/**
 * Escape the *opening* delimiter of any complete emphasis span in plain text so
 * the span round-trips as literal text. Two subtleties, both verified against
 * the carve-js reference parser:
 *
 * - A lone (unpaired) delimiter is inert and left untouched, so ordinary prose
 *   stays clean (`price * 2`, `5^2`, `http://a/b/c`).
 * - Only a *single* delimiter forms a span; doubled delimiters are literal in
 *   Carve (`**bold**`, `~~s~~`, `__u__`), so a delimiter adjacent to the same
 *   character is left alone - escaping one of the pair would *create* a span.
 *
 * `* ~ ^` can open intraword; `/ _` only at a word boundary. (`== ,,` are NOT
 * delimiters - bare `==` / `,,` are literal in both carve-js and carve-php;
 * highlight is `{= =}` and subscript `{, ,}`.)
 */
function escapeEmphasisOpeners(text) {
    return text
        .replace(/(?<!\*)\*(?=[^*\s\n](?:[^*\n]*[^*\s\n])?\*(?!\*))/g, '\\*')
        .replace(/(?<!~)~(?=[^~\s\n](?:[^~\n]*[^~\s\n])?~(?!~))/g, '\\~')
        .replace(/(?<!\^)\^(?=[^^\s\n](?:[^^\n]*[^^\s\n])?\^(?!\^))/g, '\\^')
        .replace(/(^|[\s([{<"'])(?<!\/)\/(?=[^/\s\n](?:[^/\n]*[^/\s\n])?\/(?!\/))/g, '$1\\/')
        .replace(/(^|[\s([{<"'])(?<!_)_(?=[^_\s\n](?:[^_\n]*[^_\s\n])?_(?!_))/g, '$1\\_');
}

/** Escape a lone emphasis delimiter at the start of a run (cross-node closer). */
function escapeLeadingDelimiter(s) {
    return s
        .replace(/^\*(?!\*)/, '\\*')
        .replace(/^~(?!~)/, '\\~')
        .replace(/^\^(?!\^)/, '\\^')
        .replace(/^\/(?!\/)/, '\\/')
        .replace(/^_(?!_)/, '\\_');
}

/** Escape a lone emphasis delimiter at the end of a run (cross-node opener). */
function escapeTrailingDelimiter(s) {
    return s
        .replace(/(?<![*\\])\*$/, '\\*')
        .replace(/(?<![~\\])~$/, '\\~')
        .replace(/(?<![\^\\])\^$/, '\\^')
        .replace(/(?<![/\\])\/$/, '\\/')
        .replace(/(?<![_\\])_$/, '\\_');
}

/**
 * Escape a text run so it round-trips as literal Carve text instead of being
 * re-parsed as markup. Combines structural escaping with emphasis-opener
 * escaping. Used by `serializeToCarve` for unmarked text; exported for callers
 * that build Carve by hand.
 *
 * @param {string} text - Plain text to escape.
 * @returns {string} Text safe to emit as a Carve inline run.
 */
export function escapeCarve(text) {
    return escapeEmphasisOpeners(escapeStructural(text));
}

/**
 * Escape a quoted link/image title so a `"` or `\` in it cannot terminate or
 * corrupt the `"..."` title.
 */
function escapeTitle(title) {
    return title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Build a Carve attribute block `{#id .class key="val"}` from node/mark attrs.
 * Emits `#id` and `.class` (space-separated classes each become a `.token`);
 * any remaining non-structural attrs are emitted as `key="val"`. Returns '' when
 * there is nothing to emit. The `class` default of `'custom'` (CarveSpan's
 * placeholder) is treated as absent.
 *
 * @param {object} attrs
 * @param {string[]} [skip] - attribute keys to ignore (structural node attrs).
 * @returns {string}
 */
function serializeAttributes(attrs, skip = []) {
    if (!attrs) return '';
    const ignore = new Set(['id', 'class', ...skip]);
    const parts = [];
    if (attrs.id) parts.push('#' + attrs.id);
    if (attrs.class && attrs.class !== 'custom') {
        for (const c of String(attrs.class).split(/\s+/).filter(Boolean)) {
            parts.push('.' + c);
        }
    }
    for (const [k, v] of Object.entries(attrs)) {
        if (ignore.has(k) || v == null || v === false || v === '') continue;
        parts.push(k + '="' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
    }
    return parts.length ? '{' + parts.join(' ') + '}' : '';
}

export default serializeToCarve;
