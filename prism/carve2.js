/** Carve 0.2 Prism grammar. Load Prism before this module. */
import './carve.js';

const Prism = globalThis.Prism;
if (Prism?.languages.carve) {
    let paragraphCacheSource;
    const paragraphCache = new Map();
    function inParagraph(source, offset) {
        if (source !== paragraphCacheSource) {
            paragraphCacheSource = source;
            paragraphCache.clear();
        }
        let end = offset - 1;
        const visited = [];
        let result = false;
        while (end >= 0) {
            if (paragraphCache.has(end)) {
                result = paragraphCache.get(end);
                break;
            }
            visited.push(end);
            const start = source.lastIndexOf('\n', end - 1) + 1;
            const line = source.slice(start, end).trim();
            if (!line) break;
            if (/^%%(?!%)(?![ \t]*#(?:region|endregion)\b)/.test(line)
                || /^(?:#{1,6}|={1,6}) +\S/.test(line)) {
                end = start - 1;
                continue;
            }
            result = !/^\*{3,}$|^`{3,}|^\|.*\||^%%[ \t]*#(?:region|endregion)\b|^%{3,}/.test(line);
            break;
        }
        for (const position of visited) paragraphCache.set(position, result);
        return result;
    }
    const grammar = Prism.util.clone(Prism.languages.carve);
    const visited = new WeakSet();
    const removed = new Set(['underline', 'strike', 'changed', 'table-separator', 'table-alignment', 'continuation-marker']);
    function visit(node) {
        if (!node || typeof node !== 'object' || visited.has(node)) return;
        visited.add(node);
        if (Array.isArray(node)) {
            node.forEach(visit);
            return;
        }
        for (const key of Object.keys(node)) {
            if (removed.has(key)) delete node[key];
            else if (node[key] instanceof RegExp) {
                const old = node[key];
                const source = old.source.replaceAll('~{3,}', '(?!)')
                    .replaceAll('(`|~)', '(`)')
                    .replaceAll('(?<=~)~', '(?!)');
                if (source !== old.source) node[key] = new RegExp(source, old.flags);
            }
            else if (key === 'highlight' && node[key]?.pattern) {
                node[key].pattern = /(?<!\\)\{=(?!=\})(?:[^\r\n]|\r?\n(?![ \t\r]*\r?\n)){1,4096}?=\}/;
                if (node[key].inside) delete node[key].inside.highlight;
                visit(node[key]);
            }
            else visit(node[key]);
        }
    }
    visit(grammar);

    // C2-B-100: a block attribute run is one line in 0.2.
    const attributePattern = grammar.attributes[1].pattern;
    const singleLineAttributes = new RegExp(attributePattern.source, attributePattern.flags);
    const originalExec = attributePattern.exec;
    singleLineAttributes.exec = function (source) {
        let match;
        while ((match = originalExec.call(this, source))) {
            if (!/[\r\n]/.test(match[0])) return match;
            this.lastIndex = match.index + 1;
        }
        return null;
    };
    grammar.attributes[1].pattern = singleLineAttributes;
    for (const commentFence of grammar.comment.slice(1, 4)) {
        commentFence.pattern = new RegExp(commentFence.pattern.source.replace('[^\\r\\n]*$', '[ \\t]*$'), commentFence.pattern.flags);
    }

    // C2-B-152, C2-B-108, C2-B-171, C2-I-046.
    const lineStart = '^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*';
    grammar['thematic-break'] = { pattern: new RegExp(lineStart + '\\*{3,}[ \\t]*$', 'm'), alias: 'punctuation' };
    grammar.table.inside['table-header'].pattern = /\|=(?=[ \t\{|<>?~]|$)/;
    const titlePattern = new RegExp(lineStart + '(?:#{1,6}|={1,6}) +\\S[^\\r\\n]*$', 'm');
    const titleScan = new RegExp(titlePattern.source, 'gm');
    titlePattern.exec = function (source) {
        titleScan.lastIndex = 0;
        let match;
        while ((match = titleScan.exec(source))) {
            if (!match[0].trimStart().startsWith('=') || !inParagraph(source, match.index)) return match;
        }
        return null;
    };
    grammar.title = {
        ...grammar.title,
        pattern: titlePattern,
        inside: {
            ...grammar.title.inside,
            punctuation: /^(?<![^\r\n])\uFEFF?(?:#{1,6}|={1,6})/,
        },
    };
    const region = {
        pattern: new RegExp(lineStart + '%%[ \\t]*#(?:region[ \\t]+[A-Za-z_][A-Za-z_0-9-]*|endregion(?:[ \\t]+[A-Za-z_][A-Za-z_0-9-]*)?)[ \\t]*$', 'm'),
        greedy: true,
        alias: 'comment',
    };
    Prism.languages.carve2 = {
        'region-marker': region,
        'letter-list-marker': { pattern: new RegExp(lineStart + '[A-Za-z]\\.(?= \\S)', 'm'), alias: 'bullet' },
        ...grammar,
    };
}
