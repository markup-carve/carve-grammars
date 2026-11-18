/** Carve 0.2 highlight.js grammar. */
import carve from './carve.mjs';

export default function carve2(hljs) {
    const grammar = carve(hljs);
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
            || source.startsWith('(?<![\\w~])~')
            || source.startsWith('(?<![\\w/])_')
            || source.startsWith('(?<![=\\w])=')
            || (source.startsWith('\\{~') && source.includes('~>'))
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
    hashHeading['on:begin'] = (match) => {
        match.rule.scope = inParagraph(match.input, match.index) ? undefined : 'section';
    };
    grammar.contains = grammar.contains.filter(mode => !mode?.begin?.source?.includes('-{3,}|\\*{3,}|_{3,}'));
    const lineStart = '^(?<![^\\r\\n])(?:(?<![\\s\\S])\\uFEFF)?[ \\t]*';
    // C2-B-081: a definition stands at column 0 outside every container and
    // is text below a paragraph line.
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
    const isDefinition = mode => /\\\]:/.test(mode?.begin?.source || '');
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
        { className: 'section', begin: new RegExp(lineStart + '={1,6} +\\S[^\\r\\n]*$'), 'on:begin': (match) => {
            match.rule.scope = inParagraph(match.input, match.index) ? undefined : 'section';
        } },
        { className: 'meta', begin: new RegExp(lineStart + '\\*{3,}[ \\t]*$') },
    );
    return grammar;
}
