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
                output += '![' + imgAlt + '](' + imgSrc + ')\n';
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

        content.forEach(node => {
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
                const link = marks.find(m => m.type === 'link');
                const carveSpan = marks.find(m => m.type === 'carveSpan');
                const abbr = marks.find(m => m.type === 'carveAbbreviation');

                // Apply marks from innermost to outermost.
                // Tokens target carve-php's PARSER (the contract): /em/, *strong*,
                // ~strike~ -> <s>, {~sub~} -> <sub>, ^sup^, {=mark=}, {+ins+}, {-del-}.
                let t = text;
                if (hasCode) t = '`' + t + '`';
                if (hasSub) t = ',,' + t + ',,';
                if (hasSup) t = '^' + t + '^';
                if (hasInsert) t = '{+' + t + '+}';
                if (hasDelete) t = '{-' + t + '-}';
                if (hasStrike && !hasDelete) t = '~' + t + '~';
                if (hasHighlight) t = '==' + t + '==';
                if (hasItalic) t = '/' + t + '/';
                if (hasBold) t = '*' + t + '*';
                if (link) t = '[' + t + '](' + link.attrs.href + ')';
                if (carveSpan) t = '[' + t + ']{.' + (carveSpan.attrs?.class || 'class') + '}';
                if (abbr) t = '[' + t + ']{abbr="' + (abbr.attrs?.title || '') + '"}';

                result += t;
            } else if (node.type === 'hardBreak') {
                result += '\\\n';
            } else if (node.type === 'image') {
                const alt = node.attrs?.alt || '';
                const src = node.attrs?.src || '';
                result += '![' + alt + '](' + src + ')';
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
 * Escape special Carve characters in text
 *
 * @param {string} text - Plain text to escape
 * @returns {string} Escaped text safe for Carve
 */
export function escapeCarve(text) {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/\*/g, '\\*')
        .replace(/_/g, '\\_')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
        .replace(/\^/g, '\\^')
        .replace(/~/g, '\\~')
        .replace(/`/g, '\\`');
}

export default serializeToCarve;
