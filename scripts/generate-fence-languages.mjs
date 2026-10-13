#!/usr/bin/env node
/*
 * Writes the per-language fenced code rules into textmate/carve.tmLanguage.json.
 *
 *   node scripts/generate-fence-languages.mjs          rewrite the generated entries
 *   node scripts/generate-fence-languages.mjs --check  exit 1 when they are stale
 *
 * Each generated rule is a copy of a hand-written fence rule (`fenced_code`,
 * `fenced_code_in_container`) with its language capture narrowed to one row of
 * fence-languages/fence-languages.json, so fence, title, label and closer
 * handling cannot drift from the generic rule. A host that has not loaded the
 * embedded grammar gets the plain body, as before. The same layout as
 * vscode-carve's generator, which reads the same table.
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
const BARE_FENCE = '[ \\t]*[`~]{3,}[ \\t]*$';
const WHILE_GUARD = `(^|\\G)(?!${BARE_FENCE})`;

// [generated entry, hand-written entry it copies]
const VARIANTS = [
    ['fenced_code_languages', 'fenced_code'],
    ['fenced_code_languages_in_container', 'fenced_code_in_container'],
];

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
function embedded(rule, id, scopes) {
    const include = scopes.map((scope) => ({ include: scope }));
    if (id === 'carve') {
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
 * `{.diff}` on the line above a fence with no language makes it a diff block
 * (carve-js renders `<pre class="diff">`). TextMate sees one line at a time, so
 * the attribute line opens a region that holds the fence. It ends on the next
 * line when that is no bare fence opener, or right after the fence's closer:
 * Shiki skips blank lines, so a blank line after the block cannot end it.
 */
function diffAttribute(generic, indent) {
    const fence = narrowed(generic, '()');
    // `\s*` would consume the newline and leave the region's end nothing to match.
    fence.end = fence.end.replace('\\s*$', '[ \\t]*$');

    return {
        begin: `^(?:\\A\\x{FEFF})?${indent}(\\{(?=[^{}\\n]*(?<=[{\\s])\\.diff(?![\\w-]))[^{}\\n]*\\})[ \\t]*$`,
        beginCaptures: { 1: { patterns: [{ include: '#attributes' }] } },
        end: `^(?!${indent}(?:\`{3,}|~{3,})[ \\t]*(?:"[^"\\n]*"[ \\t]*)?(?:\\[[^\\]\\n]*\\][ \\t]*)?$)|(?<=[\`~])$|(?<=[\`~][ \\t])$`,
        patterns: [embedded(fence, 'diff', ['source.diff'])],
    };
}

export function generate(grammar) {
    const entries = {};
    for (const [key, source] of VARIANTS) {
        const generic = grammar.repository[source];
        const rules = LANGUAGES.map(([id, words, scopes]) => embedded(narrowed(generic, `((?i:${words.join('|')}))`), id, scopes));
        for (const [id, words, scopes] of RAW_FORMATS) {
            rules.push(embedded(narrowed(generic, `(=(?i:${words.join('|')}))`), id, scopes));
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
    `{\n      "patterns": [\n${value.patterns.map((rule) => `        ${JSON.stringify(rule)}`).join(',\n')}\n      ]\n    }`;

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
