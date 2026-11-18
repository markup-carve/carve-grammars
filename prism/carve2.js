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
    function withoutTildeFence(pattern) {
        // Prism's clone keeps RegExp instances shared with the 0.1 grammar.
        const independent = new RegExp(pattern.source, pattern.flags);
        const originalExec = pattern.exec;
        independent.exec = function (source) {
            let match;
            while ((match = originalExec.call(this, source))) {
                const opener = match[0].split(/\r\n|\r|\n/, 1)[0];
                if (!/^[ \t]*(?:> ?)*~{3,}/.test(opener)) return match;
            }
            return null;
        };
        return independent;
    }
    grammar['code-block-in-container'].pattern = withoutTildeFence(grammar['code-block-in-container'].pattern);
    for (const rule of grammar.blockquote) {
        if (rule?.pattern?.source === '(?:)' && Object.hasOwn(rule.pattern, 'exec')) {
            rule.pattern = withoutTildeFence(rule.pattern);
        }
    }

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
    // C2-B-040: an uppercase marker with a dot needs two spaces, a lowercase one needs one.
    const letterMarker = '(?:(?:[a-z]|[ivxlcdm]{2,9})\\.(?= \\S)|(?:[A-Z]|[IVXLCDM]{2,9})\\.(?= {2}\\S))';
    grammar['thematic-break'] = { pattern: new RegExp(lineStart + '\\*{3,}[ \\t]*$', 'm'), alias: 'punctuation' };
    grammar.table.inside['table-header'].pattern = /\|=(?=[ \t\{|<>?~]|$)/;
    const titlePattern = new RegExp(lineStart + '(?:#{1,6}|={1,6}) +\\S[^\\r\\n]*$', 'm');
    const titleScan = new RegExp(titlePattern.source, 'gm');
    titlePattern.exec = function (source) {
        titleScan.lastIndex = 0;
        let match;
        while ((match = titleScan.exec(source))) {
            if (!inParagraph(source, match.index)) return match;
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
    // C2-B-081: a definition stands at column 0 outside every container and
    // is text below a paragraph line.
    const nested = new WeakSet();
    function dropNestedDefinitions(node) {
        if (!node || typeof node !== 'object' || nested.has(node) || node instanceof RegExp) return;
        nested.add(node);
        for (const [key, value] of Object.entries(node)) {
            if (key === 'inside' && value && typeof value === 'object') {
                delete value['reference-definition'];
                delete value['abbreviation-definition'];
                delete value['glued-abbreviation-definition'];
            }
            dropNestedDefinitions(value);
        }
    }
    dropNestedDefinitions(grammar);
    delete grammar['glued-abbreviation-definition'];
    function definitionAllowed(source, offset) {
        let start = offset;
        while (start > 0) {
            const end = source[start - 1] === '\n' && source[start - 2] === '\r' ? start - 2 : start - 1;
            const previous = Math.max(source.lastIndexOf('\n', end - 1), source.lastIndexOf('\r', end - 1)) + 1;
            if (!/^\uFEFF?(?:\[[^\]\r\n]+\]:|\*\[[A-Za-z0-9]+\]:)/.test(source.slice(previous, end))) break;
            start = previous;
        }
        return !inParagraph(source, start);
    }
    for (const name of ['reference-definition', 'abbreviation-definition']) {
        const pattern = grammar[name].pattern;
        const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
        const scan = new RegExp(pattern.source, flags);
        const atColumnZero = new RegExp(pattern.source, flags);
        // Greedy, so Prism scans the whole text and a marker before the
        // definition stays visible.
        atColumnZero.exec = function (source) {
            scan.lastIndex = this.lastIndex;
            let match;
            while ((match = scan.exec(source))) {
                if (/^\uFEFF?[^ \t]/.test(match[0]) && definitionAllowed(source, match.index)) {
                    this.lastIndex = scan.lastIndex;
                    return match;
                }
            }
            this.lastIndex = 0;
            return null;
        };
        grammar[name] = { ...grammar[name], pattern: atColumnZero, greedy: true };
    }
    Prism.languages.carve2 = {
        'region-marker': region,
        'letter-list-marker': { pattern: new RegExp(lineStart + letterMarker, 'm'), alias: 'bullet' },
        ...grammar,
    };
}
