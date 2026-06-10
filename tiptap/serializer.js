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

            case 'heading':
                output += '#'.repeat(node.attrs?.level || 1) + ' ' + serializeInline(node.content) + '\n';
                break;

            case 'bulletList':
            case 'orderedList':
            case 'taskList':
                // Check if list is "loose" (any item has multiple blocks)
                const isLoose = (node.content || []).some(item =>
                    (item.content || []).length > 1
                );
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

            case 'codeBlock':
                const lang = node.attrs?.language || '';
                // Carve uses space between ``` and language
                output += '```' + (lang ? ' ' + lang : '') + '\n';
                output += (node.content || []).map(c => c.text || '').join('') + '\n';
                output += '```\n';
                break;

            case 'horizontalRule':
                output += '---\n';
                break;

            case 'hardBreak':
                output += '\\\n';
                break;

            case 'image':
                const imgAlt = node.attrs?.alt || '';
                const imgSrc = node.attrs?.src || '';
                const imgTitle = node.attrs?.title ? ' "' + escapeTitle(node.attrs.title) + '"' : '';
                output += '![' + imgAlt + '](' + imgSrc + imgTitle + ')\n';
                break;

            case 'table':
                serializeTable(node);
                break;

            case 'carveDiv':
                const divClass = node.attrs?.class || '';
                output += ':::' + (divClass ? ' ' + divClass : '') + '\n';
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

            case 'carveEmbed':
                // Output the original source URL (YouTube, Vimeo, etc.)
                const embedSrc = node.attrs?.src || '';
                if (embedSrc) {
                    output += embedSrc + '\n';
                }
                break;

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
                // Add blank line before term if we just finished a description
                if (afterDescription) {
                    output += '\n';
                }
                output += ': ' + serializeInline(child.content) + '\n';
                afterDescription = false;
            } else if (child.type === 'definitionDescription') {
                output += '\n';
                (child.content || []).forEach(block => {
                    if (block.type === 'paragraph') {
                        output += '  ' + serializeInline(block.content) + '\n';
                    } else {
                        // For other block types, serialize with indentation
                        const blockText = serializeNodeToString(block);
                        blockText.split('\n').filter(l => l).forEach(line => {
                            output += '  ' + line + '\n';
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

        rows.forEach((row, rowIndex) => {
            const cells = row.content || [];
            const cellTexts = cells.map(cell => {
                const content = (cell.content || [])
                    .map(p => serializeInline(p.content))
                    .join(' ');
                return content;
            });
            output += '| ' + cellTexts.join(' | ') + ' |\n';

            // Add separator after header row
            if (rowIndex === 0) {
                const separator = cells.map(() => '---').join(' | ');
                output += '| ' + separator + ' |\n';
            }
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
                // Add blank line after paragraph if followed by more content (nested list, etc.)
                if (i < content.length - 1) {
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
                    t = escapeStructural(text).replace(/[*/_~^=,]/g, '\\$&');
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
                if (hasSub) t = ',,' + t + ',,';
                if (hasSup) t = '^' + t + '^';
                // NOTE: Carve has no escape for a CriticMarkup closing delimiter,
                // so insert/delete content that literally contains `+}` / `-}`
                // cannot round-trip - a Carve limitation, not fixable here.
                if (hasInsert) t = '{+' + t + '+}';
                if (hasDelete) t = '{-' + t + '-}';
                if (hasStrike && !hasDelete) t = '~' + t + '~';
                if (hasHighlight) t = '==' + t + '==';
                if (hasUnderline) t = '_' + t + '_';
                if (hasItalic) t = '/' + t + '/';
                if (hasBold) t = '*' + t + '*';
                if (link) {
                    const title = link.attrs?.title ? ' "' + escapeTitle(link.attrs.title) + '"' : '';
                    t = '[' + t + '](' + link.attrs.href + title + ')';
                }
                if (carveSpan) t = '[' + t + ']{.' + (carveSpan.attrs?.class || 'class') + '}';
                if (abbr) t = '[' + t + ']{abbr="' + (abbr.attrs?.title || '') + '"}';

                result += t;
            } else if (node.type === 'hardBreak') {
                result += '\\\n';
            } else if (node.type === 'image') {
                const alt = node.attrs?.alt || '';
                const src = node.attrs?.src || '';
                const title = node.attrs?.title ? ' "' + escapeTitle(node.attrs.title) + '"' : '';
                result += '![' + alt + '](' + src + title + ')';
            } else if (node.type === 'carveFootnote') {
                const label = node.attrs?.label || 'note';
                result += '[^' + label + ']';
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
 * - mentions `@name`, tags `#tag`, emoji `:name:` (not modeled by CarveKit)
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
 * `* ~ ^` can open intraword; `/ _` only at a word boundary; `== ,,` are
 * two-char delimiters.
 */
function escapeEmphasisOpeners(text) {
    return text
        .replace(/(?<!\*)\*(?=[^*\s\n](?:[^*\n]*[^*\s\n])?\*(?!\*))/g, '\\*')
        .replace(/(?<!~)~(?=[^~\s\n](?:[^~\n]*[^~\s\n])?~(?!~))/g, '\\~')
        .replace(/(?<!\^)\^(?=[^^\s\n](?:[^^\n]*[^^\s\n])?\^(?!\^))/g, '\\^')
        .replace(/==(?=[^=\s\n](?:[^=\n]*[^=\s\n])?==)/g, '\\==')
        .replace(/,,(?=[^,\s\n](?:[^,\n]*[^,\s\n])?,,)/g, '\\,,')
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
        .replace(/^_(?!_)/, '\\_')
        .replace(/^==(?!=)/, '\\==')
        .replace(/^,,(?!,)/, '\\,,');
}

/** Escape a lone emphasis delimiter at the end of a run (cross-node opener). */
function escapeTrailingDelimiter(s) {
    return s
        .replace(/(?<![*\\])\*$/, '\\*')
        .replace(/(?<![~\\])~$/, '\\~')
        .replace(/(?<![\^\\])\^$/, '\\^')
        .replace(/(?<![/\\])\/$/, '\\/')
        .replace(/(?<![_\\])_$/, '\\_')
        .replace(/(?<![=\\])==$/, '\\==')
        .replace(/(?<![,\\]),,$/, '\\,,');
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

export default serializeToCarve;
