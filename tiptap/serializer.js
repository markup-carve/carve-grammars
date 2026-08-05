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

// Carve closes a `:::` block at the first fence of the SAME OR GREATER length,
// so a div that contains other divs must open with a longer fence than any div
// nested inside it (`:::: tabs` wrapping `::: tab`). Compute a carveDiv's fence
// length as one more colon than its longest descendant carveDiv fence (min 3),
// mirroring how code/math fences widen past their content.
// Node types that serialize to a `:::` fenced container, so a fence surrounding
// them must be longer than theirs.
const FENCE_CONTAINERS = new Set(['carveDiv', 'carveTabSet', 'carveTab']);

// Colon-fence width is LOCAL DEPTH: three at the top, one more per level
// (carve#439, PART 9 section 12). A closer matches its opener's length exactly,
// so nesting only needs the lengths to differ - and widening inward is what
// `carve fmt` emits in every engine, so a document serialized here matches the
// canonical form byte for byte.
//
// This used to scan a container's whole subtree and make the outer fence longer
// than the deepest inner one, because an equal-or-greater closer meant an outer
// container had to outrank everything below it. That is no longer true, and it
// was never cheap: a container's width could not be known until its entire
// subtree had been walked, which is the property that made a canonical writer
// need to know its own maximum depth before it could emit its opening line.
const CARVE_MIN_FENCE = 3;

function carveDivFenceLength(depth) {
    return CARVE_MIN_FENCE + depth;
}

// Column width a list marker occupies, i.e. the offset of the item's content
// column relative to the marker's own indent. A nested block (sublist marker or
// continuation block) must sit at exactly that column to stay inside the item;
// anything shallower dedents out of it.
//
// Bullet (`- `) and ordered (`1. `, `10. `) markers own their full text, so an
// ordered item's content column grows with the number's digits. A task item's
// `[ ]` is CONTENT of a plain `- ` bullet, not part of the marker, so its
// content column stays 2 regardless of the checkbox.
function listMarkerWidth(listType, marker) {
    return listType === 'taskList' ? 2 : marker.length;
}

export function serializeToCarve(doc) {
    let output = '';

    // Reference links write their LABEL, so the definitions they point at have
    // to be written too - otherwise the round trip turns a link into literal
    // text, which is worse than the inline rewrite it replaces. Collected while
    // serializing and emitted once at the end (carve-grammars#101).
    //
    // Position is not preserved: the author may have written the definition
    // anywhere, and a definition is document-level metadata that renders
    // nothing wherever it sits. What IS preserved is the reference FORM, which
    // is what PART 12 section 3a keeps in the tree.
    const referenceDefs = new Map();

    // `indent` is the literal whitespace prefix (a string, not a depth counter)
    // at which this node's own lines start - see listMarkerWidth.
    function serializeNode(node, indent = '', fenceDepth = 0) {
        if (!node) return;

        switch (node.type) {
            case 'doc':
                (node.content || []).forEach((child, i) => {
                    serializeNode(child, indent, fenceDepth);
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
                {
                    const paragraphAttrs = serializeAttributes(node.attrs);
                    if (paragraphAttrs) output += paragraphAttrs + '\n';
                }
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
                    let marker;
                    if (node.type === 'orderedList') {
                        marker = num + '. ';
                        num++;
                    } else if (node.type === 'taskList') {
                        marker = '- [' + (item.attrs?.checked ? 'x' : ' ') + '] ';
                    } else {
                        marker = '- ';
                    }
                    output += indent + marker;
                    serializeListItem(item, indent + ' '.repeat(listMarkerWidth(node.type, marker)));
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
                // Container title, captured from the rendered admonition-title
                // paragraph by the CarveDiv node. Canonical form is the quoted
                // opener (::: note "Custom title"), whose grammar is "[^"]*"
                // after a type token: no escapes and no inner double quotes.
                // A title CONTAINING a double quote is emitted as a block
                // attribute line ({title="Say \"hi\""}) instead - carve-php's
                // attribute parser supports backslash escapes there, so the
                // text survives losslessly. An empty title is meaningful, and
                // a bare ::: cannot carry a title.
                const rawDivTitle = node.attrs?.title;
                let divTitle = '';
                if (divClass && rawDivTitle != null) {
                    const t = String(rawDivTitle);
                    if (t.includes('"')) {
                        output += '{title="' + t.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"}\n';
                    } else {
                        divTitle = ' "' + t + '"';
                    }
                }
                const divFence = ':'.repeat(carveDivFenceLength(fenceDepth));
                output += divFence + (divClass ? ' ' + divClass : '') + divTitle + '\n';
                // Serialize children with blank line separation (like doc level)
                (node.content || []).forEach((child, i) => {
                    serializeNode(child, indent, fenceDepth + 1);
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
                output += divFence + '\n';
                break;

            case 'carveTabSet': {
                const setFence = ':'.repeat(carveDivFenceLength(fenceDepth));
                output += setFence + ' tabs\n';
                (node.content || []).forEach((child, i) => {
                    serializeNode(child, indent, fenceDepth + 1);
                    // Tabs are always distinct-type siblings, so separate them
                    // with a blank line (matching authored `::: tab` blocks).
                    if (i < (node.content || []).length - 1) output += '\n';
                });
                output += setFence + '\n';
                break;
            }

            case 'carveTab': {
                // Canonical opener: `::: tab [Label]`. The `selected` flag (and
                // a label containing `]`, which the opener token cannot carry)
                // rides the attribute line before the opener.
                const tabAttrs = [];
                let opener = ' tab';
                const label = node.attrs?.label != null ? String(node.attrs.label) : null;
                if (label !== null && label !== '' && !label.includes(']') && !label.includes('\n')) {
                    opener += ' [' + label + ']';
                } else if (label !== null) {
                    const l = label.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    tabAttrs.push('label="' + l + '"');
                }
                if (node.attrs?.selected) tabAttrs.push('selected');
                if (tabAttrs.length) output += '{' + tabAttrs.join(' ') + '}\n';
                const tabFence = ':'.repeat(carveDivFenceLength(fenceDepth));
                output += tabFence + opener + '\n';
                (node.content || []).forEach((child, i) => {
                    serializeNode(child, indent, fenceDepth + 1);
                    if (i < (node.content || []).length - 1) {
                        const curr = child.type;
                        const next = node.content[i + 1]?.type;
                        const bothSameList = curr === next && ['bulletList', 'orderedList', 'taskList'].includes(curr);
                        if (!bothSameList) output += '\n';
                    }
                });
                output += tabFence + '\n';
                break;
            }

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

            case 'carveUnsupported': {
                output += node.attrs?.carveSource || '';
                if (output && !output.endsWith('\n')) output += '\n';
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

    function serializeListItem(item, contentIndent) {
        const content = item.content || [];
        // `contentIndent` is this item's content column: the marker (`- ` /
        // `1. ` / `- [ ] `) was already emitted by the caller, which measured
        // its width. Every FOLLOWING block must be indented to that column to
        // stay in the item; a shallower block dedents out of the list, and a
        // block type not recognized here (code, quote, div, table) was dropped
        // entirely.
        const isList = (type) => ['bulletList', 'orderedList', 'taskList'].includes(type);
        content.forEach((child, i) => {
            if (i === 0 && child.type === 'paragraph') {
                // Lead paragraph sits on the marker line already emitted.
                output += serializeInline(child.content) + '\n';
            } else if (isList(child.type)) {
                // A nested list opens at the parent's content column, so its
                // own markers are emitted at that indent.
                serializeNode(child, contentIndent);
            } else {
                // Any other block (a second+ paragraph, code block, quote,
                // div, table, ...) is serialized standalone and indented to
                // the content column so it stays inside the item.
                const blockText = serializeNodeToString(child);
                blockText.split('\n').forEach(line => {
                    output += (line ? contentIndent + line : '') + '\n';
                });
            }
            // Separate blocks with a blank line (loose item), EXCEPT keep a
            // nested list tight directly under its lead - Carve nests a
            // content-column sublist marker without a blank line, and adding
            // one would render the list loose.
            const next = content[i + 1];
            if (next && !isList(next.type)) {
                output += '\n';
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
                const hasCriticComment = marks.some(m => m.type === 'carveCriticComment');
                const hasSup = marks.some(m => m.type === 'superscript');
                const hasSub = marks.some(m => m.type === 'subscript');
                const hasStrike = marks.some(m => m.type === 'strike');
                const hasUnderline = marks.some(m => m.type === 'underline');
                const link = marks.find(m => m.type === 'link');
                const carveSpan = marks.find(m => m.type === 'carveSpan');
                const abbr = marks.find(m => m.type === 'carveAbbreviation');

                // Apply marks from innermost to outermost.
                // Tokens target carve-php's PARSER (the contract): `code`,
                // braced {,sub,} / {^sup^}, {+ins+}, {-del-}, ~strike~ -> <s>,
                // =mark=, _underline_, /em/, *strong*.
                const isEmphasized = hasBold || hasItalic || hasUnderline || hasStrike
                    || hasHighlight || hasSup || hasSub;
                let t;
                if (hasCriticComment) {
                    // An editorial comment's content is LITERAL - nothing inside
                    // it is markup - so it is emitted raw. Escaping it the way
                    // prose is escaped would put real backslashes in the
                    // comment, since the parser does not resolve escapes there.
                    // Carve has no escape for `#}`, so content containing that
                    // cannot round-trip; same limitation as {+ +} and {- -}.
                    t = text;
                } else if (hasCode) {
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
                    // (Bare `=x=` IS a single-char delimiter at a word
                    // boundary; a bare `^` / `,` is literal text - sup/sub are
                    // the braced `{^ ^}` / `{, ,}` forms only.)
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
                // An editorial comment is excluded alongside code because its
                // content is LITERAL: the parser resolves no escapes inside
                // `{# ... #}`, so a `\]` written here is not an escaped bracket,
                // it is a backslash in the comment text.
                //
                // Neither answer is whole for `]` inside a linked comment.
                // Escaping keeps the link and silently corrupts the comment;
                // not escaping keeps the comment and the label ends early, so
                // the link renders as literal text. Content integrity wins:
                // broken output is visible, altered text is not. Code has no
                // such dilemma - the engines skip code spans when scanning for
                // a label's closing bracket, and skipping editorial comments
                // the same way is the real fix (markup-carve/carve#403).
                if ((link || carveSpan || abbr) && !hasCode && !hasCriticComment) {
                    t = t.replace(/]/g, '\\]');
                }
                const bareable = (delim) => {
                    // Bare single-char form only when this run is the sole mark,
                    // is flanked by boundaries, and the content cannot re-close
                    // early or double the delimiter (doubled = literal).
                    const alone = !hasBold && !hasItalic && !hasUnderline && !hasStrike
                        && !hasHighlight && !hasSub && !hasSup && !hasInsert && !hasDelete
                        && !link && !carveSpan && !abbr
                        || (delim === '=' && hasHighlight);
                    const soleMark = marks.length === 1;
                    const before = result.slice(-1);
                    const after = (content[idx + 1] && content[idx + 1].text) ? content[idx + 1].text[0] : '';
                    const flanked = (!before || /[\s([{<"']/.test(before))
                        && (!after || /[\s)\]}>"'.,;:!?]/.test(after) && after !== delim);
                    return soleMark && alone && flanked
                        && t.length > 0 && !t.includes(delim) && !t.includes('\n')
                        && !/^\s|\s$/.test(t);
                };
                // Superscript and subscript have NO bare form: a bare `^` or `,`
                // is literal text, so both always serialize braced.
                // Innermost, because the content is literal: any other mark
                // has to wrap the whole `{# ... #}`, never sit inside it.
                if (hasCriticComment) t = '{#' + t + '#}';
                if (hasSub) t = '{,' + t + ',}';
                if (hasSup) t = '{^' + t + '^}';
                // NOTE: Carve has no escape for a CriticMarkup closing delimiter,
                // so insert/delete content that literally contains `+}` / `-}`
                // cannot round-trip - a Carve limitation, not fixable here.
                if (hasInsert) t = '{+' + t + '+}';
                if (hasDelete) t = '{-' + t + '-}';
                if (hasStrike && !hasDelete) t = '~' + t + '~';
                if (hasHighlight) t = bareable('=') ? '=' + t + '=' : '{=' + t + '=}';
                if (hasUnderline) t = '_' + t + '_';
                if (hasItalic) t = '/' + t + '/';
                if (hasBold) t = '*' + t + '*';
                if (link) {
                    const title = link.attrs?.title ? ' "' + escapeTitle(link.attrs.title) + '"' : '';
                    const ref = link.attrs?.ref;
                    if (typeof ref === 'string' && ref !== '') {
                        // COLLAPSED (`[text][]`) where the label is the link's
                        // own text, FULL (`[text][label]`) otherwise - the two
                        // forms the language has. `rawRef` records which one was
                        // written; the text may have been edited since, so the
                        // label is compared rather than the raw string replayed.
                        const collapsed = ref.toLowerCase() === t.trim().toLowerCase();
                        t = '[' + t + ']' + (collapsed ? '[]' : '[' + ref + ']');
                        // Only where there IS a destination. An UNRESOLVED
                        // reference carries an empty one, and writing
                        // `[label]: ` back invents a definition the author never
                        // had - one that turns literal text into a link to the
                        // empty string on the next parse.
                        if (link.attrs.href && !referenceDefs.has(ref)) {
                            referenceDefs.set(ref, link.attrs.href + title);
                        }
                    } else {
                        t = '[' + t + '](' + link.attrs.href + title + ')';
                    }
                }
                if (carveSpan) {
                    const spanAttrs = serializeAttributes(carveSpan.attrs, [], true)
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
                const imgAttrs = serializeAttributes(node.attrs, ['alt', 'src', 'title', 'ref', 'rawRef']);
                const ref = node.attrs?.ref;
                if (typeof ref === 'string' && ref !== '') {
                    // Collapsed where the label IS the alt text, full otherwise -
                    // the same two forms the link path writes, and the definition
                    // is emitted with the others at the end.
                    const collapsed = ref.toLowerCase() === alt.trim().toLowerCase();
                    result += '![' + alt + ']' + (collapsed ? '[]' : '[' + ref + ']') + imgAttrs;
                    if (src && !referenceDefs.has(ref)) referenceDefs.set(ref, src + title);
                } else {
                    result += '![' + alt + '](' + src + title + ')' + imgAttrs;
                }
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
                result += serializeAttributes(node.attrs, ['src', 'display']);
            }
        });

        return result;
    }

    serializeNode(doc);
    let result = output.trim();
    if (referenceDefs.size > 0) {
        const defs = [...referenceDefs].map(([label, target]) => '[' + label + ']: ' + target);
        result += '\n\n' + defs.join('\n');
    }
    return result;
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
        // A `:name:` symbol only opens at a word boundary, and its name starts
        // with a letter, digit, `+` or `-` (never `_`). Escape the opening `:`
        // only where a symbol would actually form, so plain text round-trips.
        .replace(/(^|[^\w]):(?=[A-Za-z0-9+-][\w+-]*:)/g, '$1\\:');
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
 * there is nothing to emit.
 *
 * @param {object} attrs
 * @param {string[]} [skip] - attribute keys to ignore (structural node attrs).
 * @param {boolean} [placeholderClass] - treat a `class` of `'custom'` as absent.
 *   CarveSpan's `class` attribute DEFAULTS to `'custom'`, so an unstyled span
 *   would otherwise serialize as `{.custom}`. Every other node defaults to null,
 *   where `.custom` can only be a class the author wrote - suppressing it there
 *   loses it.
 * @returns {string}
 */
function serializeAttributes(attrs, skip = [], placeholderClass = false) {
    if (!attrs) return '';
    const ignore = new Set(['id', 'class', 'keyValues', ...skip]);
    const parts = [];
    if (attrs.id) parts.push('#' + attrs.id);
    if (attrs.class && !(placeholderClass && attrs.class === 'custom')) {
        for (const c of String(attrs.class).split(/\s+/).filter(Boolean)) {
            parts.push('.' + c);
        }
    }
    const pair = (k, v) => k + '="' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    for (const [k, v] of Object.entries(attrs)) {
        if (ignore.has(k) || v == null || v === false || v === '') continue;
        parts.push(pair(k, v));
    }
    // A node that keeps authored key/values in one declared attribute - Tiptap
    // needs every attribute declared, and `data-k=v` cannot be known upfront.
    if (attrs.keyValues && typeof attrs.keyValues === 'object') {
        for (const [k, v] of Object.entries(attrs.keyValues)) {
            if (v == null || v === false || v === '') continue;
            parts.push(pair(k, v));
        }
    }

    return parts.length ? '{' + parts.join(' ') + '}' : '';
}

export default serializeToCarve;
