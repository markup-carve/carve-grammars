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

// The ordered-marker TOKEN for one item: `1`, `a`, `iv`. `olType` is the style
// the author used (`a`/`A` alphabetic, `i`/`I` roman, absent = decimal) and
// `num` is that item's ordinal.
//
// The two styles OVERLAP on single letters, and the parser resolves the overlap
// by looking at the following markers: `v.` alone is alphabetic 22, while
// `v.` + `vi.` is roman 5, and `i.` + `j.` is alphabetic 9 where `i.` + `ii.` is
// roman 1. So an ambiguous token is safe in a list of two or more items - the
// next token always disambiguates - and unwritable in a ONE-item list, which
// falls back to the decimal token: that changes the marker style but keeps the
// ORDINAL, and a wrong number would be the worse of the two.
function orderedToken(num, olType, itemCount) {
    if (olType === 'a' || olType === 'A') {
        if (num >= 1 && num <= 26 && (num !== 9 || itemCount > 1)) {
            const letter = String.fromCharCode(96 + num);
            return olType === 'A' ? letter.toUpperCase() : letter;
        }
        return String(num);
    }
    if (olType === 'i' || olType === 'I') {
        const roman = toRoman(num);
        if (roman && (roman.length > 1 || roman === 'i' || itemCount > 1)) {
            return olType === 'I' ? roman.toUpperCase() : roman;
        }
        return String(num);
    }
    return String(num);
}

const ROMAN = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
    [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
];

function toRoman(num) {
    if (!Number.isInteger(num) || num < 1 || num > 3999) return null;
    let rest = num, out = '';
    for (const [value, token] of ROMAN) {
        while (rest >= value) {
            out += token;
            rest -= value;
        }
    }
    return out;
}

// Tiptap's Link extension FILLS IN `target` and `rel` on every link mark it
// parses from HTML, so a document that went through an editor carries them
// whether or not the author wrote anything. Writing them back turned every
// ordinary `[t](/u)` into `[t](/u){target="_blank" rel="noopener noreferrer
// nofollow"}` - attributes nobody authored, on the round trip that matters most.
//
// Only the stock DEFAULTS are dropped: a link that really does carry
// `rel="me"` keeps it, and a Carve-authored `{target="x"}` arrives in
// `keyValues` rather than here, so it is never affected either way.
const TIPTAP_LINK_DEFAULTS = { target: '_blank', rel: 'noopener noreferrer nofollow' };

function linkAttrRun(attrs) {
    if (!attrs) return attrs;
    const out = { ...attrs };
    for (const [key, value] of Object.entries(TIPTAP_LINK_DEFAULTS)) {
        if (out[key] === value) delete out[key];
    }
    return out;
}

// `String.prototype.trim` strips U+00A0 - it is whitespace to JavaScript and
// CONTENT to Carve, so trimming a serialized document with it silently deleted a
// no-break space at either edge (the engine's own writer keeps it). Only ASCII
// layout whitespace is structural here.
const ASCII_EDGE_WS = /^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g;

function trimSource(text) {
    return text.replace(ASCII_EDGE_WS, '');
}

export function serializeToCarve(doc) {
    const preservedSource = doc?.attrs?.carveSource;
    const preservedFingerprint = doc?.attrs?.carveFingerprint;
    if (typeof preservedSource === 'string' && typeof preservedFingerprint === 'string') {
        const clean = { ...doc };
        delete clean.attrs;
        if (pmFingerprint(clean) === preservedFingerprint) return preservedSource;
    }
    // A whole-document fallback is already exact Carve source. Sending it
    // through the normal block joiner and edge trimmer would corrupt precisely
    // the whitespace-sensitive documents for which the fallback exists.
    if (doc?.type === 'doc' && doc.content?.length === 1 && doc.content[0]?.type === 'carveUnsupported') {
        return doc.content[0].attrs?.carveSource || '';
    }

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
    // at which this node's own lines start - the width of the marker prefix
    // actually written.
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

            case 'paragraph': {
                const paragraphAttrs = serializeAttributes(node.attrs);
                if (paragraphAttrs) output += paragraphAttrs + '\n';
                output += serializeParagraphText(node.content) + '\n';
                break;
            }

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
                const listAttrs = serializeAttributes(node.attrs, ['start', 'type', 'olType', 'delim', 'bareMarker']);
                if (listAttrs) output += listAttrs + '\n';
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
                // `olType` comes from the Carve AST; `type` is what Tiptap's own
                // OrderedList records when the editor is seeded from rendered
                // HTML (`<ol type="a">`). Reading only the first lost every
                // alphabetic and roman list on the WYSIWYG path.
                const htmlType = /^[aAiI]$/.test(String(node.attrs?.type ?? '')) ? node.attrs.type : null;
                const olType = node.attrs?.olType || htmlType;
                const delim = node.attrs?.delim === ')' ? ')' : '.';
                (node.content || []).forEach((item, i) => {
                    // The marker splits in two around the attribute slot: a
                    // marker attribute goes directly after the marker CHARACTER
                    // and before the separating space, so a task item is
                    // `-{.c} [ ] text` and never `- [ ]{.c} text` - the latter
                    // makes the brace run an inline span on the item's text.
                    let marker, taskBox = '';
                    if (node.type === 'orderedList') {
                        marker = (node.attrs?.bareMarker ? '' : orderedToken(num, olType, (node.content || []).length)) + delim;
                        num++;
                    } else if (node.type === 'taskList') {
                        marker = '-';
                        taskBox = '[' + (item.attrs?.checked ? 'x' : ' ') + '] ';
                    } else {
                        marker = '-';
                    }
                    // Written with NO space before the brace. A SPACE there
                    // (`- {.c} item`) is a different document: the brace is then
                    // content, either literal text or a block-attribute line for
                    // what follows (corpus 90-list-item-attributes-7, 172).
                    const markerAttrs = serializeAttributes(item.attrs, ['checked']);
                    const prefix = marker + markerAttrs + ' ';
                    output += indent + prefix + taskBox;
                    // The content column is measured from the prefix ACTUALLY
                    // written, attributes included - that is how the engine this
                    // round trip is checked against reads it back, and indenting
                    // a continuation to the bare marker width would dedent the
                    // block out of an attributed item. Which reading is correct
                    // is open (markup-carve/carve#711); the task checkbox is
                    // content either way, so it never counts.
                    serializeListItem(item, indent + ' '.repeat(prefix.length));
                    // Add blank line between items in loose lists
                    if (isLoose && i < (node.content || []).length - 1) {
                        output += '\n';
                    }
                });
                break;

            case 'blockquote':
                const quoteAttrs = serializeAttributes(node.attrs);
                if (quoteAttrs) output += quoteAttrs + '\n';
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
                const longest = (code.match(/`+/g) || []).reduce((max, run) => Math.max(max, run.length), 0);
                const fence = '`'.repeat(Math.max(3, longest + 1));
                const header = node.attrs?.header != null ? ` "${String(node.attrs.header).replace(/"/g, '\\"')}"` : '';
                const label = node.attrs?.label != null ? ` [${String(node.attrs.label).replace(/]/g, '\\]')}]` : '';
                const blockAttrs = serializeAttributes(node.attrs, ['language', 'languageRaw', 'header', 'label']);
                if (blockAttrs) output += blockAttrs + '\n';
                output += fence + lang + header + label + '\n' + code + '\n' + fence + '\n';
                break;
            }

            case 'horizontalRule':
                const ruleAttrs = serializeAttributes(node.attrs);
                if (ruleAttrs) output += ruleAttrs + '\n';
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
                const rawDivLabel = node.attrs?.label;
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
                const divLabel = rawDivLabel != null && rawDivLabel !== ''
                    ? ' [' + String(rawDivLabel).replace(/]/g, '\\]') + ']'
                    : '';
                output += divFence + (divClass ? ' ' + divClass : '') + divTitle + divLabel + '\n';
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
                } else if (label !== null && label !== '') {
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

            case 'carveFigure': {
                const figureAttrs = serializeAttributes(node.attrs);
                if (figureAttrs) output += figureAttrs + '\n';
                const content = node.content || [];
                for (const child of content) serializeNode(child, indent, fenceDepth);
                break;
            }

            case 'carveSection':
                for (const child of node.content || []) serializeNode(child, indent, fenceDepth);
                break;

            case 'carveFrontmatter': {
                const format = node.attrs?.format || 'yaml';
                const opener = format === 'yaml' ? '---' : `---${format}`;
                const content = node.attrs?.content || '';
                output += `${opener}\n${content}${content.endsWith('\n') ? '' : '\n'}---\n`;
                break;
            }

            case 'carveLinkRefDef': {
                const title = node.attrs?.title != null ? ` "${escapeTitle(String(node.attrs.title))}"` : '';
                output += `[${node.attrs?.label || ''}]: ${node.attrs?.href || ''}${title}\n`;
                break;
            }

            case 'carveCaption':
                if (node.attrs?.short) break;
                output += '^ ' + serializeInline(node.content) + '\n';
                break;

            case 'carveRawBlock': {
                const raw = (node.content || []).map(child => child.text || '').join('').replace(/\n$/, '');
                const longest = (raw.match(/`+/g) || []).reduce((max, run) => Math.max(max, run.length), 0);
                const fence = '`'.repeat(Math.max(3, longest + 1));
                output += `${fence}=${node.attrs?.format || ''}\n${raw}\n${fence}\n`;
                break;
            }

            case 'carveComment': {
                const comment = (node.content || []).map(child => child.text || '').join('');
                if (!node.attrs?.block && !comment.includes('\n')) {
                    output += `%%${comment ? ` ${comment}` : ''}\n`;
                    break;
                }
                // A comment closes on a percent fence at least as wide as its
                // opener. Widen past every run in the body so edited content
                // can never terminate the block early.
                const longest = (comment.match(/%+/g) || []).reduce((max, run) => Math.max(max, run.length), 0);
                const fence = '%'.repeat(Math.max(3, longest + 1));
                output += `${fence}\n${comment}${comment.endsWith('\n') || !comment ? '' : '\n'}${fence}\n`;
                break;
            }

            case 'carveLineBlock': {
                const mode = node.attrs?.mode === '\\' ? '\\' : '|';
                output += `::: ${mode}\n`;
                for (const [childIndex, child] of (node.content || []).entries()) {
                    if (childIndex > 0) output += '\n';
                    if (child.type === 'paragraph') {
                        let line = '';
                        for (const inline of child.content || []) {
                            if (inline.type === 'hardBreak') {
                                line += '\n';
                            } else {
                                line += serializeInline([inline]);
                            }
                        }
                        output += line + '\n';
                    } else {
                        serializeNode(child, indent, fenceDepth + 1);
                    }
                }
                output += ':::\n';
                break;
            }

            case 'carveFootnoteDefinition': {
                const fnLabel = node.attrs?.label || 'note';
                const content = node.content || [];
                // The body's own continuation column, fixed regardless of the
                // label's width or the source's original indentation (verified
                // against carve-js's own writer, which canonicalizes on 3).
                const bodyIndent = '   ';
                // The lead paragraph sits on the marker line itself; any block
                // after it - a second paragraph, a table, a list, anything
                // `serializeNodeToString` can render - is serialized standalone
                // and indented to the body column, the same pattern
                // `serializeListItem` uses for a list item's own non-lead
                // blocks. A body whose first block ISN'T a plain paragraph (no
                // faithful "marker line" text) still opens the marker line, just
                // with nothing on it.
                let startIndex = 0;
                if (content.length === 0) {
                    // A bare `[^label]:` is paragraph text, not a footnote
                    // definition. PART 11 §7b gives the empty AST body this
                    // explicit spelling so the definition survives reparsing.
                    output += '[^' + fnLabel + ']: {empty}\n';
                } else if (content[0]?.type === 'paragraph') {
                    output += '[^' + fnLabel + ']: ' + serializeParagraphText(content[0].content) + '\n';
                    startIndex = 1;
                } else {
                    output += '[^' + fnLabel + ']:\n';
                }
                for (let i = startIndex; i < content.length; i++) {
                    output += '\n';
                    const blockText = serializeNodeToString(content[i]);
                    blockText.split('\n').forEach((line) => {
                        output += (line ? bodyIndent + line : '') + '\n';
                    });
                }
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
                if (cell.attrs?.carveSpanMarker) {
                    out.push({ header: Boolean(cell.type === 'tableHeader'), content: cell.attrs.carveSpanMarker });
                    col++;
                    continue;
                }
                const colspan = cell.attrs?.colspan || 1;
                const rowspan = cell.attrs?.rowspan || 1;
                const header = cell.type === 'tableHeader';
                const content = (cell.content || [])
                    .map(p => (p.content || []).map(inline => {
                        let rendered = serializeInline([inline]);
                        // Pipes inside code spans are literal already: escaping
                        // one there adds a real backslash to the code payload.
                        // Every other inline form still needs table-delimiter
                        // protection.
                        const isCode = inline.type === 'text'
                            && (inline.marks || []).some(mark => mark.type === 'code');
                        // Bare superscript-looking text (`^2^`) is literal in
                        // Carve; only the braced `{^2^}` form is a mark. The
                        // generic prose escaper is intentionally conservative,
                        // but retaining that escape changes the parsed AST.
                        if (inline.type === 'text' && !(inline.marks || []).length) {
                            rendered = rendered.replace(/\\\^/g, '^');
                        }
                        return isCode ? rendered : rendered.replace(/\|/g, '\\|');
                    }).join(''))
                    .join(' ')
                    // A table cell occupies one physical line.
                    .replace(/\n/g, ' ');
                out.push({ header, content, align: cell.attrs?.textAlign || null, attrs: cell.attrs });
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
                const align = c.align === 'left' ? '<' : c.align === 'right' ? '>' : c.align === 'center' ? '~' : '';
                const cellAttrs = serializeAttributes(c.attrs, ['colspan', 'rowspan', 'colwidth', 'textAlign', 'carveSpanMarker']);
                // A cell attribute run sits immediately after `|`, before the
                // header/alignment marker: `|{.hot}= value`. Putting it after
                // `=` makes the braces literal cell text.
                line += '|' + cellAttrs + (c.header ? '=' : '') + align + ' ' + c.content + ' ';
            }
            const rowAttrs = serializeAttributes(row.attrs, ['textAlign']);
            output += line + '|' + rowAttrs + '\n';
        });
    }

    function serializeNodeToString(node) {
        const oldOutput = output;
        output = '';
        serializeNode(node);
        const result = output;
        output = oldOutput;
        return trimSource(result);
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
                // Lead paragraph sits on the marker line already emitted - but
                // only its FIRST line does. A soft break puts every later line
                // at column 0, where a block opener stops being text
                // (carve-grammars#145).
                output += escapeContinuationOpeners(serializeInline(child.content)) + '\n';
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

    // A block-level paragraph is always written flush at column 0 (or right
    // after a container's own marker/prefix, which itself occupies column 0),
    // so its escaped text is exactly where a `[label]:` / `[^label]:` shaped
    // run would also be read as a document- or footnote-level DEFINITION.
    // `escapeStructural` guards that by escaping the opening `[`, but the
    // backslash reparses into an `escaped_text` + `text` pair where the
    // original (typically written with no backslash at all, just enough
    // indentation to not be column 0) held a single plain `text` node - so a
    // strict AST comparison sees a difference that isn't really there
    // (carve-grammars#121). A single leading space defeats the same column-0
    // read without the escape machinery, and reparses to the original shape.
    // Only the colon-suffixed (definition) shape needs this: the other
    // bracket shapes `\[text](`, `\[text][`, `\[text]{` are ordinary INLINE
    // link/reference/span syntax, recognized at any column, so they still
    // need the real escape.
    //
    // The literal space can't always be written directly: when this
    // paragraph ends up being the very first thing in the whole document,
    // `trimSource`'s final edge trim (below) strips exactly that leading
    // space back off before it ever reaches the parser - so only THAT one
    // position needs a stand-in. The stand-in is a long, deliberately
    // unlikely string so a real document's own text is never mistaken for
    // it, and it is only ever swapped back at the exact front of the
    // output (never a global replace), so an authored occurrence of the
    // same text anywhere else in the document is left untouched.
    const LEADING_DEFINITION_ESCAPE = /^\\\[[^\]\n]*\]:/;
    const LEADING_SPACE_SENTINEL = 'carve-grammars#121-leading-space';

    // A BLOCK OPENER at the start of a paragraph line has to be escaped, or the
    // line stops being part of the paragraph.
    //
    // Every line of a serialized paragraph lands at column 0 - the first after
    // whatever container prefix precedes it, the rest after a soft break with
    // nothing at all. So a line beginning `> ` or `# ` reparses as a block
    // quote or a heading, and the text that was INSIDE the paragraph is gone
    // from it: `1. a` + four spaces + `> quote` came back as `1. a` / `> quote`,
    // which is a list item and a block quote beside it rather than one item
    // holding a soft break (carve-grammars#145).
    //
    // Re-emitting the original indentation is not the fix, and measuring says
    // so: the source's four spaces reach column 4, one PAST the item's content
    // column of 3, and writing three spaces instead makes the line a nested
    // quote - a different document again. The ProseMirror doc does not record
    // the column either. Escaping is what states "this is text", at any column.
    //
    // Only the openers that actually take a line at column 0 are escaped. A
    // bullet or an ordered marker is deliberately NOT here: §10 says a list
    // marker does not interrupt a paragraph, so `- b` on a soft-break line is
    // already text and escaping it would add a backslash the reader sees.
    // Scoped to a LIST ITEM's lead paragraph, and to lines after a soft break
    // within it. Both halves of that scope are measured, not assumed:
    //
    //   - the first line sits on the marker line the caller already emitted, so
    //     its position is that caller's business;
    //   - a paragraph inside a BLOCK QUOTE is not at column 0 either, because
    //     the quote prefixes every line with `> ` - corpus 210 (`> ok` /
    //     `>bad`) turns `>bad` into `> \>bad` under a blanket rule, which is a
    //     backslash the reader sees and a document that no longer reparses to
    //     itself.
    //
    // A list item's continuation line is the case where nothing precedes it.
    // `>` and `#` ONLY, and the set is measured rather than reasoned:
    //
    //   - `^` is the caption marker, and escaping it is the defect that kept
    //     207/209/231 out of coverage in the first place - a caption is its own
    //     block and the caller that emits it owns the marker;
    //   - `|`, `~`, `:::`, `%%`, `---` and `===` produced no round-trip that
    //     was broken without them, so escaping them would only add backslashes
    //     a reader sees.
    //
    // Widening this set is a measurement, not a judgement: add a case that
    // loses its paragraph without the escape, then add the character.
    const CONTINUATION_BLOCK_OPENER = /\n([>#])/g;

    function escapeContinuationOpeners(text) {
        // A single SPACE, not a backslash. Both keep the line as text - the
        // engines render `1. a` + ` > quote` and `1. a` + `\> quote`
        // identically - but a backslash reparses into an `escaped_text` node
        // beside a `text` one where the source held a single `text`, so a
        // strict AST comparison reports a difference that is not one. That is
        // the same trade carve-grammars#121 made for a leading `[label]:`, and
        // for the same reason.
        //
        // One space is below every item's content column (the shallowest is 2,
        // for `- `), so the line stays a lazy continuation rather than becoming
        // the block it would be at that column.
        return text.replace(CONTINUATION_BLOCK_OPENER, (match, opener) => '\n ' + opener);
    }

    function serializeParagraphText(content) {
        const text = serializeInline(content);
        if (LEADING_DEFINITION_ESCAPE.test(text)) {
            // A real leading space is safe here UNLESS this paragraph is
            // about to be the first thing written to `output` at all - only
            // then can the final edge trim reach it.
            return (output === '' ? LEADING_SPACE_SENTINEL : ' ') + text.slice(1);
        }
        return text;
    }

    function serializeInline(content) {
        if (!content) return '';
        let result = '';

        const referenceLinkAt = (index) => {
            const candidate = content[index];
            if (candidate?.type !== 'text') return null;
            const mark = (candidate.marks || []).find((item) => item.type === 'link');
            return typeof mark?.attrs?.ref === 'string' && mark.attrs.ref !== '' ? mark : null;
        };
        const markAt = (index, type) => {
            const candidate = content[index];
            return candidate?.type === 'text'
                ? (candidate.marks || []).find((item) => item.type === type) || null
                : null;
        };
        const sameMark = (left, right) => Boolean(left && right
            && pmFingerprint(left.attrs || {}) === pmFingerprint(right.attrs || {}));
        const sameReferenceLink = (left, right) => {
            if (!left || !right) return false;
            const keys = ['href', 'title', 'ref', 'rawRef', 'referenceDefinition'];
            return keys.every((key) => (left.attrs?.[key] ?? '') === (right.attrs?.[key] ?? ''));
        };

        content.forEach((node, idx) => {
            if (node.type === 'carveInlineNote') {
                result += '^[' + serializeInline(node.content) + ']';
                return;
            }
            if (node.type === 'carveRawInline') {
                const raw = node.attrs?.content || '';
                const longest = (raw.match(/`+/g) || []).reduce((m, run) => Math.max(m, run.length), 0);
                const fence = '`'.repeat(longest + 1);
                result += `${fence}${raw}${fence}{=${node.attrs?.format || ''}}`;
                return;
            }
            if (node.type === 'carveLiteral') {
                const literal = node.attrs?.content || '';
                const longest = (literal.match(/`+/g) || []).reduce((m, run) => Math.max(m, run.length), 0);
                const fence = '`'.repeat(longest + 1);
                result += `!${fence}${literal}${fence}`;
                return;
            }
            if (node.type === 'carveSubstitution') {
                result += `{~${node.attrs?.oldText || ''}~>${node.attrs?.newText || ''}~}`;
                return;
            }
            if (node.type === 'carveSymbol') {
                result += `:${node.attrs?.name || ''}:`;
                return;
            }
            if (node.type === 'carveCitation') {
                result += node.attrs?.raw || '';
                return;
            }
            if (node.type === 'carveCrossref') {
                result += `</#${node.attrs?.target || ''}>`;
                return;
            }
            if (node.type === 'carveCommentInline') {
                // Inline comments require a separating space. Without it,
                // mounting `text %% note` and serializing produced
                // `text%% note`, which reparses as visible paragraph text.
                if (result && !/\s$/.test(result)) result += ' ';
                result += `%%${node.attrs?.content ? ` ${node.attrs.content}` : ''}`;
                return;
            }
            if (node.type === 'carveUnsupportedInline') {
                result += node.attrs?.carveSource || '';
                return;
            }
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

                // An AUTOLINK is its own text and its content is LITERAL, so its
                // form is decided BEFORE any escaping or mark wrapper is applied:
                // the escaped label would no longer match the target (`<…/a*b*>`),
                // and wrapping has to happen OUTSIDE the angle brackets so
                // `*<https://e.com>*` keeps its emphasis.
                const autoRaw = node.text || '';
                const autoTarget = link?.attrs?.href || '';
                const writeAutolink = !!link?.attrs?.autolink
                    && !link.attrs?.title
                    && (autoRaw === autoTarget || 'mailto:' + autoRaw === autoTarget)
                    // `>` would close the form early and whitespace ends it.
                    && autoRaw !== '' && !/[>\s]/.test(autoRaw);
                let t;
                if (writeAutolink) {
                    t = '<' + autoRaw + '>';
                } else if (hasCriticComment) {
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
                    // NOT trailing-safe, whatever follows this run: the
                    // mark's own closing delimiter comes next, and a
                    // RESOLVED space before it kills the span - `*a\ *`
                    // parses as literal text where `*a<U+00A0>*` is still
                    // strong. So a trailing sentinel inside a marked run
                    // is written as a real no-break space.
                    // Inside an emphasis span ANY literal delimiter closes it
                    // early (`*a*b*`), so escape every emphasis delimiter char.
                    // (Bare `=x=` IS a single-char delimiter at a word
                    // boundary; a bare `^` / `,` is literal text - sup/sub are
                    // the braced `{^ ^}` / `{, ,}` forms only.)
                    t = escapeStructural(text).replace(/[*/_~^]/g, '\\$&');
                } else {
                    // Plain text: structural + pair-aware emphasis-opener escaping.
                    // More inline content after this run means a trailing
                    // escaped space still has something to attach to.
                    t = escapeCarve(text, idx < content.length - 1);
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
                if ((link || carveSpan || abbr) && !hasCode && !hasCriticComment && !writeAutolink) {
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
                    let replayedReferenceSource = false;
                    const title = link.attrs?.title ? ' "' + escapeTitle(link.attrs.title) + '"' : '';
                    const ref = link.attrs?.ref;
                    const referenceContinuesNext = typeof ref === 'string' && ref !== ''
                        && sameReferenceLink(link, referenceLinkAt(idx + 1));
                    if (writeAutolink) {
                        // Already written in its own form above, brackets and
                        // all; only the attribute run is still owed.
                    } else if (typeof ref === 'string' && ref !== '') {
                        const continuesPrevious = sameReferenceLink(link, referenceLinkAt(idx - 1));
                        const continuesNext = referenceContinuesNext;
                        // COLLAPSED (`[text][]`) where the label is the link's
                        // own text, FULL (`[text][label]`) otherwise - the two
                        // forms the language has. `rawRef` records which one was
                        // written; the text may have been edited since, so the
                        // label is compared rather than the raw string replayed.
                        //
                        // ProseMirror splits one link into adjacent text nodes
                        // whenever an inner mark starts or ends. Open the label
                        // on the first run and close it on the last; wrapping
                        // every run independently turned `[*bold* heading][]`
                        // into two unrelated references.
                        if (!continuesPrevious) t = '[' + t;
                        if (!continuesNext) {
                            const rawRef = link.attrs?.rawRef || '';
                            if (!continuesPrevious && rawRef.startsWith(t + ']')) {
                                t = rawRef;
                                replayedReferenceSource = true;
                            } else {
                                const collapsed = rawRef.endsWith('[]')
                                    || ref.toLowerCase() === t.trim().toLowerCase();
                                t += ']' + (collapsed ? '[]' : '[' + ref + ']');
                            }
                        }
                        // Only where there IS a destination. An UNRESOLVED
                        // reference carries an empty one, and writing
                        // `[label]: ` back invents a definition the author never
                        // had - one that turns literal text into a link to the
                        // empty string on the next parse.
                        if (link.attrs.href && !referenceDefs.has(ref)) {
                            referenceDefs.set(ref, link.attrs.referenceDefinition
                                || '[' + ref + ']: ' + link.attrs.href + title);
                        }
                    } else {
                        // ProseMirror splits one marked range whenever an inner
                        // mark begins or ends. Keep those pieces inside one link
                        // instead of emitting adjacent `<a>` elements.
                        const continuesPrevious = sameMark(link, markAt(idx - 1, 'link'));
                        const continuesNext = sameMark(link, markAt(idx + 1, 'link'));
                        if (!continuesPrevious) t = '[' + t;
                        if (!continuesNext) t += '](' + link.attrs.href + title + ')';
                    }
                    // An attribute RUN on the link, which is not the same thing
                    // as the destination or the reference label - and was
                    // dropped in silence before, taking the author's id and
                    // classes with it.
                    // Attributes belong after the complete link, not between
                    // adjacent text runs that make up one marked label.
                    const linkContinuesNext = sameMark(link, markAt(idx + 1, 'link'));
                    if (!referenceContinuesNext && !linkContinuesNext && !replayedReferenceSource) {
                        t += serializeAttributes(linkAttrRun(link.attrs), ['href', 'title', 'ref', 'rawRef', 'referenceDefinition', 'autolink']);
                    }
                }
                if (carveSpan) {
                    // A span mark has to write SOMETHING after `[text]`: bare
                    // `[x]` is not a span on the next parse, it is literal
                    // brackets (or a reference link). With no attributes to
                    // write, that something is the blessed empty block `{}` -
                    // valid Carve, and the explicit "make this a span" hook
                    // (corpus 39-inline-span-2). It used to be `{.class}`, a
                    // class named "class" that the document never had; unlike a
                    // dropped attribute, an invented one cannot be recognized as
                    // invented by anything downstream.
                    //
                    // An explicit `custom` class still writes `{.custom}`. The
                    // schema default is null, so an empty authored span remains
                    // distinguishable from that real class after mounting.
                    const continuesPrevious = sameMark(carveSpan, markAt(idx - 1, 'carveSpan'));
                    const continuesNext = sameMark(carveSpan, markAt(idx + 1, 'carveSpan'));
                    if (!continuesPrevious) t = '[' + t;
                    if (!continuesNext) {
                        const spanAttrs = serializeAttributes(carveSpan.attrs, [], true)
                            || (carveSpan.attrs?.class ? '{.' + carveSpan.attrs.class + '}' : '{}');
                        t += ']' + spanAttrs;
                    }
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
                    if (src && !referenceDefs.has(ref)) {
                        referenceDefs.set(ref, '[' + ref + ']: ' + src + title);
                    }
                } else {
                    result += '![' + alt + '](' + src + title + ')' + imgAttrs;
                }
            } else if (node.type === 'carveMention') {
                result += '@' + (node.attrs?.id || '');
            } else if (node.type === 'carveTag') {
                result += '#' + (node.attrs?.id || '');
            } else if (node.type === 'carveFootnote') {
                if (node.attrs?.carveSource) {
                    result += node.attrs.carveSource;
                } else {
                    const label = node.attrs?.label || 'note';
                    result += '[^' + label + ']';
                }
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
    let result = trimSource(output);
    // Swap the sentinel back to the real space it stands in for, now that the
    // edge trim above can no longer eat it (see LEADING_SPACE_SENTINEL). Only
    // the exact front of the document is ever touched - never a global
    // replace - so authored text elsewhere that happens to contain this
    // string is left exactly as written.
    if (result.startsWith(LEADING_SPACE_SENTINEL)) {
        result = ' ' + result.slice(LEADING_SPACE_SENTINEL.length);
    }
    if (referenceDefs.size > 0) {
        const defs = [...referenceDefs.values()];
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
function escapeStructural(text, trailingSafe = false) {
    return resolvedSpaces(text, trailingSafe)
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
export function escapeCarve(text, trailingSafe = false) {
    return escapeEmphasisOpeners(escapeStructural(text, trailingSafe));
}

/**
 * Spell the engines' resolved-no-break-space SENTINEL (U+E000) as the escape the
 * author wrote, `\ `.
 *
 * The sentinel is not a character anyone typed: it marks a no-break space the
 * parser resolved from `\ ` or from preserved line-block indentation, and
 * `carve fmt` writes it back as that escape. Emitting it verbatim put a
 * private-use codepoint into Carve source and a tofu box in the editor, and the
 * round trip could not see it - `\ ` parses back to the same sentinel, so both
 * sides of the AST comparison held it (markup-carve/carve#721). A literal U+00A0
 * the author typed is published as itself, which is the distinction the sentinel
 * exists to keep.
 *
 * `\ ` needs something after it: a trailing backslash at the END of a block is a
 * HARD BREAK, so the escape has no spelling in that one position. `trailingSafe`
 * says whether more inline content follows in this block - anywhere else,
 * including before a space, before a sibling span and before a soft break, the
 * escape is what the engines parse back. Where it is not available a real U+00A0
 * goes out: the rendered document is then right and only the resolved-vs-typed
 * distinction is lost, which is much the cheaper failure.
 *
 * @param {string} text
 * @param {boolean} trailingSafe
 * @returns {string}
 */
function resolvedSpaces(text, trailingSafe) {
    if (!text.includes('\uE000')) return text;
    const last = text.length - 1;
    let out = '';
    for (let i = 0; i < text.length; i++) {
        if (text[i] !== '\uE000') {
            out += text[i];
            continue;
        }
        out += (i < last || trailingSafe) ? '\\ ' : '\u00A0';
    }
    return out;
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
    const language = (v) => {
        const value = String(v);
        return /^(?:[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8})*)?$/.test(value)
            ? ':' + value
            : pair('lang', value);
    };
    for (const [k, v] of Object.entries(attrs)) {
        if (ignore.has(k) || v == null || v === false) continue;
        if (k === 'lang') parts.push(language(v));
        else if (v !== '') parts.push(pair(k, v));
    }
    // A node that keeps authored key/values in one declared attribute - Tiptap
    // needs every attribute declared, and `data-k=v` cannot be known upfront.
    if (attrs.keyValues && typeof attrs.keyValues === 'object') {
        for (const [k, v] of Object.entries(attrs.keyValues)) {
            if (v == null || v === false || (v === '' && k !== 'lang')) continue;
            if (k === 'lang') {
                if (attrs.lang == null) parts.push(language(v));
            } else {
                parts.push(pair(k, v));
            }
        }
    }

    return parts.length ? '{' + parts.join(' ') + '}' : '';
}

export default serializeToCarve;

function pmFingerprint(value) {
    if (Array.isArray(value)) return '[' + value.map(pmFingerprint).join(',') + ']';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + pmFingerprint(value[key])).join(',') + '}';
}
