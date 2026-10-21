#!/usr/bin/env node
/*
 * Writes the per-language fenced code rules into textmate/carve.tmLanguage.json.
 *
 *   node scripts/generate-fence-languages.mjs          rewrite the generated entries
 *   node scripts/generate-fence-languages.mjs --check  exit 1 when they are stale
 *
 * Each language rule copies a generic fence rule and narrows its language
 * capture to one row of fence-languages/fence-languages.json. Marker-line
 * fences use the same table. A missing embedded grammar leaves a plain body.
 *
 * The file is spliced, never re-serialized: the rest of it keeps its own layout.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const grammarPath = resolve(root, 'textmate/carve.tmLanguage.json');
const table = JSON.parse(readFileSync(resolve(root, 'fence-languages/fence-languages.json'), 'utf8'));

const escapeWord = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The table names vscode-carve's own scope for a Carve fence; this grammar's is source.carve.
const OWN_SCOPES = { 'text.carve': 'source.carve' };

// [language id, info-string words, grammar scopes to include]. Rows sharing both merge (sh, zsh).
export const LANGUAGES = [];
for (const { words, language, textmate } of table.languages) {
    if (!textmate) continue;
    const scopes = textmate.map((scope) => OWN_SCOPES[scope] ?? scope);
    const same = LANGUAGES.find(([id, , s]) => id === language && s.join() === scopes.join());
    if (same) same[1].push(...words.map(escapeWord));
    else LANGUAGES.push([language, words.map(escapeWord), scopes]);
}

// Raw blocks (```=html) pass their body through to the named format.
export const RAW_FORMATS = [
    ['html', ['html'], ['text.html.basic']],
    ['latex', ['latex', 'tex'], ['text.tex.latex']],
];

const LANGUAGE_CAPTURE = '(=?[a-zA-Z0-9_-]*)';
const DIFF_FENCE_WORDS = LANGUAGES.flatMap(([, words]) => words).filter((word) => /[+#]/.test(word));
const DIFF_LANGUAGE_CAPTURE = '([a-zA-Z0-9_-]*)';
const DIFF_OPENER_LANGUAGE = `(?:(?i:${DIFF_FENCE_WORDS.join('|')})|[a-zA-Z0-9_-]*)`;
const BARE_FENCE = '[ \\t]*[`~]{3,}[ \\t]*$';
const WHILE_GUARD = `(^|\\G)(?!${BARE_FENCE})`;

// [generated entry, hand-written entry it copies]
const VARIANTS = [
    ['fenced_code_languages', 'fenced_code'],
    ['fenced_code_languages_in_container', 'fenced_code_in_container'],
    ['fenced_code_languages_on_marker_line', 'fenced_code_on_marker_line'],
    ['fenced_code_languages_on_marker_line_common', 'fenced_code_on_marker_line_common'],
];

function markerLineCommonRule(generic) {
    const forms = new Map();
    const add = (width, pattern) => forms.set(width, [...(forms.get(width) ?? []), pattern]);
    for (let depth = 1; depth <= 8; depth++) {
        const bullets = '[-*] '.repeat(depth);
        add(depth * 2, bullets);
        add(depth * 2, `${bullets}\\[[ xX\\-_>?]\\] `);
    }
    for (let digits = 1; digits <= 9; digits++) add(digits + 2, `[0-9]{${digits}}[.)] `);
    add(3, '[A-Za-z][.)] ');
    for (let length = 2; length <= 6; length++) {
        add(length + 2, `(?:[ivxlcdm]{${length}}|[IVXLCDM]{${length}})[.)] `);
    }
    add(2, '\\. ');

    const widths = [...forms.keys()].sort((a, b) => a - b);
    const marker = widths.map((width) => `(${forms.get(width).join('|')})`).join('|');
    const guards = widths.map((width, index) => `(?!\\${index + 2})${' '.repeat(width)}`).join('|');
    const fence = widths.length + 2;
    return {
        ...generic,
        begin: generic.begin.replace('\\G(?<=[ \\t])()', `\\G(?<=^([ \\t]*)(?:${marker}))`),
        beginCaptures: Object.fromEntries(Object.entries(generic.beginCaptures)
            .map(([group, capture]) => [String(Number(group) + widths.length), capture])),
        end: `^\\1(?:${guards})\\${fence}(?:(?<=\`)\`|(?<=~)~)*[ \\t]*$`
            + `|^(?![ \\t]*\\r?$)(?!\\1(?:${guards}))`,
        comment: 'A code fence after a list or task marker. Each marker shape selects its content column for the closer and the body boundary.',
    };
}

function narrowed(generic, capture) {
    if (generic.begin.split(LANGUAGE_CAPTURE).length !== 2) {
        throw new Error(`generic fence rule no longer has exactly one language capture: ${generic.begin}`);
    }
    const { comment, ...rule } = generic;

    return { ...rule, begin: generic.begin.replace(LANGUAGE_CAPTURE, capture) };
}

/*
 * Carve holds fences of its own, so it gets the exact closer from the outer
 * `end`. Every other language sits under a `while` that stops at any bare fence
 * line: `while` is checked through every nested region, so an unterminated
 * string in the embedded language cannot swallow the closer.
 */
function embedded(rule, id, scopes, direct = false) {
    const include = scopes.map((scope) => ({ include: scope }));
    if (id === 'carve' || direct) {
        return { ...rule, contentName: `${rule.contentName} meta.embedded.block.${id}`, patterns: [{ include: '#callout_marker' }, ...include] };
    }

    return {
        ...rule,
        patterns: [{
            begin: '\\G',
            while: WHILE_GUARD,
            contentName: `meta.embedded.block.${id}`,
            patterns: [{ include: '#callout_marker' }, ...include],
        }],
    };
}

/*
 * `{.diff}` on the line above a fence makes it a diff block
 * (carve-js renders `<pre class="diff">`). TextMate sees one line at a time, so
 * the attribute line opens a region that holds the fence. It ends on the next
 * line when that is no fence opener, or right after the fence's closer:
 * Shiki skips blank lines, so a blank line after the block cannot end it.
 */
function diffAttribute(generic, indent) {
    const fence = narrowed(generic, '()');
    // `\s*` would consume the newline and leave the region's end nothing to match.
    fence.end = fence.end.replace('\\s*$', '[ \\t]*$');

    const languageRules = LANGUAGES.map(([id, words, scopes]) => {
        const rule = embedded(narrowed(generic, `((?i:${words.join('|')}))`), id, scopes);
        rule.contentName += ' meta.diff.carve';
        rule.end = rule.end.replace('\\s*$', '[ \\t]*$');
        return rule;
    });
    const unknownLanguage = narrowed(generic, DIFF_LANGUAGE_CAPTURE);
    unknownLanguage.contentName += ' meta.diff.carve';
    unknownLanguage.end = unknownLanguage.end.replace('\\s*$', '[ \\t]*$');

    return {
        begin: `^(?:\\A\\x{FEFF})?${indent}(\\{(?=[^{}\\n]*(?<=[{\\s])\\.diff(?![\\w-]))[^{}\\n]*\\})[ \\t]*$`,
        beginCaptures: { 1: { patterns: [{ include: '#attributes' }] } },
        end: `^(?!${indent}(?:\`{3,}|~{3,})[ \\t]*${DIFF_OPENER_LANGUAGE}[ \\t]*(?:"[^"\\n]*"[ \\t]*)?(?:\\[[^\\]\\n]*\\][ \\t]*)?$)|(?<=[\`~])$|(?<=[\`~][ \\t])$`,
        patterns: [...languageRules, embedded(fence, 'diff', ['source.diff']), unknownLanguage],
    };
}

export function generate(grammar) {
    const entries = {};
    entries.fenced_code_on_marker_line_common = markerLineCommonRule(grammar.repository.fenced_code_on_marker_line);
    for (const [key, source] of VARIANTS) {
        const generic = entries[source] ?? grammar.repository[source];
        // An inner while would hide a line that falls below the item's content column from the outer end rule.
        const direct = key === 'fenced_code_languages_on_marker_line_common';
        const rules = LANGUAGES.map(([id, words, scopes]) => embedded(narrowed(generic, `((?i:${words.join('|')}))`), id, scopes, direct));
        for (const [id, words, scopes] of RAW_FORMATS) {
            rules.push(embedded(narrowed(generic, `(=(?i:${words.join('|')}))`), id, scopes, direct));
        }
        entries[key] = { patterns: rules };
    }
    entries.fenced_code_diff_attribute = { patterns: [diffAttribute(grammar.repository.fenced_code, '')] };
    entries.fenced_code_diff_attribute_in_container = { patterns: [diffAttribute(grammar.repository.fenced_code_in_container, '[ \\t]*')] };

    return entries;
}

// [start, end) of the JSON value after `"key": ` at depth 2 (a repository entry).
function valueSpan(text, key) {
    const needle = `"${key}": `;
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
            if (depth === 2 && text.startsWith(needle, i)) {
                const start = i + needle.length;

                return [start, skipValue(text, start)];
            }
            i = skipString(text, i);
        } else if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') depth--;
    }

    return null;
}

function skipString(text, i) {
    for (i++; text[i] !== '"'; i++) if (text[i] === '\\') i++;

    return i;
}

function skipValue(text, i) {
    let depth = 0;
    for (; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') i = skipString(text, i);
        else if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') {
            depth--;
            if (depth === 0) return i + 1;
        }
    }
    throw new Error('unterminated JSON value');
}

// One rule per line keeps a language's variants reviewable as one-line diffs.
const indentValue = (value) =>
    value.begin ? JSON.stringify(value)
        : `{\n      "patterns": [\n${value.patterns.map((rule) => `        ${JSON.stringify(rule)}`).join(',\n')}\n      ]\n    }`;

export function splice(text, entries) {
    for (const [key, value] of Object.entries(entries)) {
        const span = valueSpan(text, key);
        if (span) {
            text = text.slice(0, span[0]) + indentValue(value) + text.slice(span[1]);
        } else {
            const anchor = valueSpan(text, 'fenced_code_in_container');
            text = `${text.slice(0, anchor[1])},\n    "${key}": ${indentValue(value)}${text.slice(anchor[1])}`;
        }
    }

    return text;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const text = readFileSync(grammarPath, 'utf8');
    const next = splice(text, generate(JSON.parse(text)));
    JSON.parse(next);
    if (process.argv.includes('--check')) {
        if (next !== text) {
            console.error('textmate/carve.tmLanguage.json: generated fence rules are stale; run node scripts/generate-fence-languages.mjs');
            process.exit(1);
        }
    } else {
        writeFileSync(grammarPath, next);
    }
}
