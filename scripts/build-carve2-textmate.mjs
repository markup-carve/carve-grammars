import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'textmate/carve.tmLanguage.json');
const target = path.join(root, 'textmate/carve2.tmLanguage.json');
const grammar = JSON.parse(fs.readFileSync(source, 'utf8'));
grammar.name = 'Carve 0.2';
grammar.scopeName = 'source.carve2';

// C2-I-046, U-069: the 0.1 bare marks and replacement run are text in 0.2.
const removed = new Set(['#underline', '#strike', '#critic_sub', '#marker_line_continuation', '#attributes_multiline']);
function adapt(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        for (let i = node.length - 1; i >= 0; i--) {
            if (removed.has(node[i]?.include)) node.splice(i, 1);
            else adapt(node[i]);
        }
        const comments = node.filter(item => item?.include === '#line_comment');
        for (const comment of comments) node.splice(node.indexOf(comment), 0, { include: '#region_marker' });
        return;
    }
    for (const [key, value] of Object.entries(node)) {
        if (key === 'include' && value === 'source.carve') {
            node[key] = 'source.carve2';
        } else if (typeof value === 'string' && ['begin', 'end', 'match', 'while'].includes(key)) {
            node[key] = value.replaceAll('`{3,}|~{3,}', '`{3,}')
                .replaceAll('(`{3,}|~{3,})', '(`{3,})')
                .replaceAll('(`|~)', '(`)')
                .replaceAll('[`~]', '`')
                .replaceAll('|(?<=~)~', '')
                .replaceAll('~{3,}', '(?!)')
                .replaceAll('#{1,6}', '(?:#{1,6}|={1,6})')
                .replaceAll('(?= {2}|', '(?= +|')
                .replaceAll('\\} {2}', '\\} +');
        } else adapt(value);
    }
}
adapt(grammar);
for (const name of ['heading', 'heading_in_container']) {
    const heading = grammar.repository[name];
    const bom = name === 'heading' ? '(?:\\A\\x{FEFF})?' : '';
    heading.begin = '^' + bom + '([ \\t]*)(#{1,6}|={1,6}) +(?![ \\t]*$)';
    heading.beginCaptures = { '2': heading.beginCaptures['1'] };
    heading.end = '^(?=[ \\t]*$|[ \\t]*\\*{3,}[ \\t]*$|[ \\t]*`{3,}|[ \\t]*\\|[^\\n]*\\||[ \\t]*%%[ \\t]*#(?:region|endregion)\\b)|^(?![ \\t]*%%(?!%))(?!\\1[ \\t]+)';
}
// A heading-shaped line without a blank line continues an open list or quote
// paragraph (C2-B-012, C2-B-154). Keep those states alive for lazy lines.
grammar.repository.list_block.while = grammar.repository.list_block.while
    .replace('(?=[ \\t]*$|\\1[ \\t]|', '(?=[ \\t]*$|\\1[ \\t]|[=#](?= )|')
    .replace('|#(?![# \\t]|$)|', '|#(?= )|=(?= )|#(?![# \\t]|$)|');
for (const name of ['list_item', 'numbered_item']) {
    for (const item of grammar.repository[name].patterns) {
        if (item.while) item.while = item.while
            .replace('[ \\t]*$|', '')
            .replace('^(?=', '^(?=[=#](?= )|');
        item.patterns?.unshift({
            begin: '^[ \\t]*[=#]{1,6} +',
            end: '$',
            patterns: [{ include: '#inline' }],
        });
    }
}
for (const item of grammar.repository.quoted_item_context.patterns) {
    if (!item.end) continue;
    item.end = item.end.replace('^(?!\\G)', '^(?!\\G)(?![=#]{1,6} )');
    item.patterns?.unshift({
        begin: '^[ \\t]*[=#]{1,6} +',
        end: '$',
        patterns: [{ include: '#inline' }],
    });
}
for (const [name, rule] of Object.entries(grammar.repository)) {
    if (name.startsWith('quoted_prose_continuation') && rule.end) {
        rule.end = rule.end.replace('(?:#{1,6}|={1,6})(?: |$)|', '')
            .replace('|(?![ \\t]*>)(?!\\1)', '');
    }
}
grammar.repository.hr.match = '^(?:\\A\\x{FEFF})?[ \\t]*\\*{3,}[ \\t]*$';
for (const [name, rule] of Object.entries(grammar.repository)) {
    if (name.startsWith('block_comment') && rule.end) {
        rule.end = rule.end.replaceAll('[^\\n]*$', '[ \\t]*$');
    }
}
// A heading, quote, definition or attribute line directly below prose is
// paragraph content in 0.2 (U-001 through U-005). Keep that paragraph open
// until a blank line or one of the block shapes that may interrupt it.
grammar.repository.prose_continuation.end = '^(?!\\G)(?=[ \\t]*$|[ \\t]*\\*{3,}[ \\t]*$|[ \\t]*`{3,}|[ \\t]*\\|[^\\n]*\\||[ \\t]*%{2,}|[ \\t]*%%[ \\t]*#(?:region|endregion)\\b)';
grammar.repository.highlight.patterns.splice(1);
grammar.repository.table_row.patterns = grammar.repository.table_row.patterns.filter((pattern) => {
    const source = pattern.match || '';
    return source !== '(\\|=)' && !source.startsWith('(\\|)(?!<') && !source.startsWith('(?<=\\|)\\s*(:?-+:?)');
});
const header = grammar.repository.table_row.patterns.find(pattern => pattern.begin?.startsWith('(\\|=)'));
header.begin = '(\\|=)(?= |\\t|\\{|\\||$|[<>?~])';
delete header.beginCaptures['2'];
grammar.repository.region_marker = {
    match: '^(?:\\A\\x{FEFF})?[ \\t]*%%[ \\t]*#(?:region[ \\t]+[A-Za-z_][A-Za-z_0-9-]*|endregion(?:[ \\t]+[A-Za-z_][A-Za-z_0-9-]*)?)[ \\t]*$',
    name: 'comment.line.percent.carve',
};
const result = JSON.stringify(grammar, null, 2) + '\n';
if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== result) {
        console.error('Carve 0.2 TextMate grammar is out of date');
        process.exitCode = 1;
    }
} else fs.writeFileSync(target, result);
