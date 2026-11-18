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
    .replace('(?=[ \\t]*$|\\1[ \\t]|', '(?=[ \\t]*$|\\1[ \\t]|(?:#{1,6}|={1,6})(?= )|:{1,2}(?= )|')
    .replace('|#(?![# \\t]|$)|', '|#{1,6}(?= )|={1,6}(?= )|#(?![# \\t]|$)|')
    // A definition shape below item text is a lazy line too (C2-B-081).
    .replace('\\*(?![ \\t*\\[{]|$)', '\\*(?![ \\t*{]|$)')
    .replace('\\[(?!\\^)(?![^\\]\\n]*\\]:)', '\\[');
// Heading, definition and description shapes at column 0 below item text
// are lazy lines of the item (C2-B-012, C2-B-081).
const lazyShapes = '(?:#{1,6}|={1,6})(?= )|\\[[^\\]\\n]*\\]:|\\*\\[|:{1,2}(?= )|';
const lazyText = [
    { begin: '^[ \\t]*(?:#{1,6}|={1,6}) +', end: '$', patterns: [{ include: '#inline' }] },
    { begin: '^:{1,2} ', end: '$', patterns: [{ include: '#inline' }] },
];
for (const item of [...grammar.repository.list_item.patterns, ...grammar.repository.numbered_item.patterns, grammar.repository.task_item]) {
    if (!item.while) continue;
    item.while = item.while.replace('[ \\t]*$|', '').replace('^(?=', '^(?=' + lazyShapes);
    item.patterns?.unshift(...lazyText);
}
// The item rules above end at a blank line, so an indented line after one
// resumes the item body with the container block rules (C2-B-012).
grammar.repository.list_item_resume = {
    begin: '^(?=([ \\t]+)\\S)',
    while: '^(?=' + lazyShapes + '\\1)',
    patterns: [
        { begin: '^(?:#{1,6}|={1,6}) +', end: '$', patterns: [{ include: '#inline' }] },
        lazyText[1],
        { include: '#container_blocks' },
    ],
};
// `- ***` is an item that holds a break.
grammar.repository.container_blocks.patterns.unshift({
    match: '\\G(?<=[ \\t])\\*{3,}[ \\t]*$',
    name: 'meta.separator.thematic-break.carve',
});
{
    const patterns = grammar.repository.list_block.patterns;
    patterns.splice(patterns.findIndex(pattern => pattern.include === '#numbered_item') + 1, 0, { include: '#list_item_resume' });
}
for (const item of grammar.repository.quoted_item_context.patterns) {
    if (!item.end) continue;
    item.end = item.end.replace('^(?!\\G)', '^(?!\\G)(?!(?:#{1,6}|={1,6}) )');
    item.patterns?.unshift({
        begin: '^[ \\t]*(?:#{1,6}|={1,6}) +',
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
// C2-B-081: a definition stands at column 0 outside every container, so only
// the top-level rules survive and every container form is text.
const definitionRules = /^#(?:link_ref_def|abbreviation|footnote_def)/;
function dropContainerDefinitions(node, topLevel) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        for (let i = node.length - 1; i >= 0; i--) {
            const item = node[i];
            const raw = !item?.name && item?.captures && JSON.stringify(item.captures).includes('abbreviation');
            if ((!topLevel && definitionRules.test(item?.include ?? '')) || raw) node.splice(i, 1);
            else dropContainerDefinitions(item, false);
        }
        return;
    }
    for (const value of Object.values(node)) dropContainerDefinitions(value, false);
}
dropContainerDefinitions(grammar.patterns, true);
for (const [name, rule] of Object.entries(grammar.repository)) {
    // The list wrapper is not a container: after a blank line its column-0
    // lines are document lines.
    if (name === 'list_block') {
        dropContainerDefinitions(rule.patterns, true);
        const at = rule.patterns.findIndex(pattern => pattern.include === '#abbreviation') + 1;
        rule.patterns.splice(at, 0, { include: '#footnote_def' }, { include: '#link_ref_def' }, { include: '#definition_list' });
    }
    else dropContainerDefinitions(rule, false);
}
for (const name of Object.keys(grammar.repository)) {
    if (/^(?:link_ref_def|abbreviation)_|^footnote_def_/.test(name)) delete grammar.repository[name];
}
grammar.repository.abbreviation.match = grammar.repository.abbreviation.match.replace('(?:\\A\\x{FEFF})?[ \\t]*', '(?:\\A\\x{FEFF})?');
grammar.repository.hr.match ='^(?:\\A\\x{FEFF})?[ \\t]*\\*{3,}[ \\t]*$';
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
// C2-B-040: an uppercase letter or roman marker with a dot needs two spaces,
// so `J. R. R. Tolkien` stays text; a lowercase one needs one.
const attributeRun = '\\{[^}\\r\\n]{0,4096}\\}';
const markerLetters = {
    '[a-zA-Z]|[ivxlcdm]+|[IVXLCDM]+': ['[a-z]|[ivxlcdm]+', '[A-Z]|[IVXLCDM]+'],
    '[A-Za-z]|[ivxlcdm]+|[IVXLCDM]+': ['[a-z]|[ivxlcdm]+', '[A-Z]|[IVXLCDM]+'],
    '[A-Za-z]': ['[a-z]', '[A-Z]'],
    '[ivxlcdm]{2}|[IVXLCDM]{2}': ['[ivxlcdm]{2}', '[IVXLCDM]{2}'],
    '[ivxlcdm]{3}|[IVXLCDM]{3}': ['[ivxlcdm]{3}', '[IVXLCDM]{3}'],
    '[ivxlcdm]{4,}|[IVXLCDM]{4,}': ['[ivxlcdm]{4,}', '[IVXLCDM]{4,}'],
};
function splitMarkerCase(value) {
    for (const [letters, [lower, upper]] of Object.entries(markerLetters)) {
        const caseless = `(?:${letters})(?:\\)|\\.`;
        value = value.replaceAll(`${caseless}(?= +|${attributeRun} +))`,
            `(?:(?:${letters})\\)|(?:${lower})\\.(?= +|${attributeRun} +)|(?:${upper})\\.(?= {2}|${attributeRun} {2}))`)
            .replaceAll(`${caseless}(?= {2}))`,
                `(?:(?:${letters})\\)|(?:${lower})\\.(?= )|(?:${upper})\\.(?= {2}))`);
    }
    return value;
}
function splitMarkers(node) {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
        if (typeof value === 'string') node[key] = splitMarkerCase(value);
        else splitMarkers(value);
    }
}
splitMarkers(grammar);
const result = JSON.stringify(grammar, null, 2) + '\n';
if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== result) {
        console.error('Carve 0.2 TextMate grammar is out of date');
        process.exitCode = 1;
    }
} else fs.writeFileSync(target, result);
