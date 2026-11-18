/** Carve 0.2 Prism grammar. Load Prism before this module. */
import './carve.js';

const Prism = globalThis.Prism;
if (Prism?.languages.carve) {
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
                node[key].pattern = /(?<!\\)\{=(?!=\})[\s\S]{1,4096}?=\}/;
                if (node[key].inside) delete node[key].inside.highlight;
                visit(node[key]);
            }
            else visit(node[key]);
        }
    }
    visit(grammar);

    // C2-B-100: a block attribute run is one line in 0.2.
    grammar.attributes[1].pattern = /(?<!\\)\{[ \t]*(?:[.#][A-Za-z_][\w-]*|[A-Za-z_][\w-]*(?:=(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s{}]+))?)(?:[ \t]+(?:[.#][A-Za-z_][\w-]*|[A-Za-z_][\w-]*(?:=(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s{}]+))?))*[ \t]*\}/;
    const commentFence = grammar.comment[3];
    commentFence.pattern = new RegExp(commentFence.pattern.source.replace('\\1(?!%)[^\\r\\n]*$', '\\1(?!%)[ \\t]*$'), commentFence.pattern.flags);

    // C2-B-152, C2-B-108, C2-B-171, C2-I-046.
    grammar['thematic-break'] = { pattern: /^[ \t]*\*{3,}[ \t]*$/m, alias: 'punctuation' };
    grammar.table.inside['table-header'].pattern = /\|=(?=[ \t\{|<>?~]|$)/;
    grammar.title = {
        ...grammar.title,
        pattern: /^[ \t]*(?:#{1,6}|={1,6}) +\S[^\r\n]*$/m,
    };
    grammar['code-block'] = {
        pattern: /^([ \t]*)(`{3,})[^\r\n]*(?:\r\n?|\n)[\s\S]*?^\1\2[ \t]*$/m,
        greedy: true,
        alias: 'code',
        inside: grammar['code-block']?.inside,
    };
    delete grammar['code-block-unclosed'];
    delete grammar['code-block-in-container'];
    const region = {
        pattern: /^[ \t]*%%[ \t]*#(?:region[ \t]+[A-Za-z_][A-Za-z_0-9-]*|endregion(?:[ \t]+[A-Za-z_][A-Za-z_0-9-]*)?)[ \t]*$/m,
        greedy: true,
        alias: 'comment',
    };
    Prism.languages.carve2 = {
        'region-marker': region,
        'letter-list-marker': { pattern: /^[ \t]*[A-Za-z]\.(?= \S)/m, alias: 'bullet' },
        ...grammar,
    };
}
