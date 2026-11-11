#!/usr/bin/env node
/*
 * Writes the TextMate rules that read a line by the quoted line before it
 * (carve-grammars#856) into textmate/carve.tmLanguage.json.
 *
 *   node scripts/generate-lazy-quote-rules.mjs          rewrite the generated entries
 *   node scripts/generate-lazy-quote-rules.mjs --check  exit 1 when they are stale
 *
 * - `lazy_*_item` copy the column-0 item rules; their marker-line definition
 *   rules read the definition as text. A marker line right after a quoted item
 *   with text is lazy, so carve-js opens the item but defines nothing (corpus 383).
 * - `quoted_prose_continuation_depth_N` copy the quoted paragraph rule at one
 *   depth, so its unpartnered verbatim spans can end on a deeper quote line.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { grammarPath, valueSpan } from './generate-fence-languages.mjs';

const ITEMS = ['task_item', 'list_item', 'numbered_item'];
const DEPTHS = [1, 2, 3];
const LINE_START = '^(?:\\A\\x{FEFF})?([ \\t]*)';
const VERBATIM = ['code_inline_unpartnered', 'math_inline_unpartnered', 'literal_inline_unpartnered'];
const CLOSED_SPANS = ['#math_inline_multi', '#math_inline', '#literal_inline_multi', '#literal_inline', '#footnote_inline', '#raw_inline', '#code_inline_multi', '#code_inline'];
const OPENERS = '#{1,6}(?: |$)|`{3,}|~{3,}|:{3,}|%{3,}|(?:-{3,}|\\*{3,}|_{3,})[ \\t]*$|\\||\\{[^{}\\n]*\\}[ \\t]*$|%%|\\[\\^?[^\\]\\n]+\\]:(?: |$)|\\*\\[[A-Za-z0-9]+\\]:';

const clone = (value) => JSON.parse(JSON.stringify(value));

function neuterDefinition(rule) {
    const out = clone(rule);
    delete out.comment;
    if (out.name === 'meta.abbreviation.carve') delete out.name;
    for (const [key, capture] of Object.entries(out.captures ?? {})) {
        if (!/abbreviation|punctuation\.separator/.test(capture.name ?? '')) continue;
        out.captures[key] = /string\.unquoted/.test(capture.name) ? { patterns: [{ include: '#inline' }] } : {};
    }

    return out;
}

function lazyPatterns(patterns) {
    return patterns.map((rule) => {
        if (rule.include === '#container_blocks') return { include: '#lazy_container_blocks' };
        if (rule.match && /abbreviation definition after a glued attribute block/.test(rule.comment ?? '')) return neuterDefinition(rule);
        return lazyItem(rule);
    });
}

function lazyItem(rule) {
    if (rule.include) return rule;
    const out = clone(rule);
    delete out.comment;
    if (out.begin) {
        if (!out.begin.startsWith(LINE_START)) throw new Error(`item begin without a line start: ${out.begin.slice(0, 40)}`);
        out.begin = `^()${out.begin.slice(LINE_START.length)}`;
    }
    if (out.patterns) out.patterns = lazyPatterns(out.patterns);

    return out;
}

const itemBegins = (rule) => (rule.begin ? [rule.begin] : (rule.patterns ?? []).flatMap(itemBegins));

function quotedItemLine(match) {
    const tail = '(?![ \\t]*$))?(.*)$';
    if (!match.endsWith(tail)) throw new Error('quoted item line changed shape');

    return `${match.slice(0, -tail.length)}(?![ \\t]*$))(?![ \\t]*(?:${OPENERS}|::? |\\+[ \\t]*$))(.*)$\\n?`;
}

function lazyHold(quoteRule, lazyLine) {
    return {
        comment: 'A column-0 marker line right after a quoted item with text is lazy: carve-js opens the item, but a definition on it defines nothing (corpus 383, carve-grammars#856). The begin takes the end of line, so \\G holds only at the next line start; once that item ends the rule ends too.',
        begin: quotedItemLine(quoteRule.match),
        beginCaptures: { 0: { name: quoteRule.name }, ...quoteRule.captures },
        end: `^(?!\\G)|^\\G(?!${lazyLine})`,
        patterns: ITEMS.map((key) => ({ include: `#lazy_${key}` })),
    };
}

function depthRule(prose, depth) {
    const anyDepth = '((?:>(?= ) )*)';
    if (!prose.begin.includes(anyDepth)) throw new Error('quoted paragraph begin changed shape');
    const out = clone(prose);
    out.comment = `The quoted paragraph at depth ${depth}: its unpartnered verbatim spans end where it ends, at a deeper quote line too (carve-grammars#856).`;
    out.begin = prose.begin.replace(anyDepth, `(${'> '.repeat(depth - 1)})`);
    const inline = out.patterns.findIndex((rule) => rule.include === '#inline');
    out.patterns.splice(inline, 0, ...CLOSED_SPANS.map((include) => ({ include })), ...VERBATIM.map((key) => ({ include: `#${key}_in_quote_depth_${depth}` })));

    return out;
}

function quotedSpan(rule, depth) {
    const out = clone(rule);
    delete out.comment;
    const boundary = '^(?=[ \\t]*$|[ \\t]*:{3,})';
    if (!out.end.endsWith(boundary)) throw new Error('unpartnered span end changed shape');
    const deeper = `[ \\t]*> ${'> '.repeat(depth - 1)}>`;
    const opener = `(?:[ \\t]*>(?= ) (?:>(?= ) )*)?[ \\t]*(?:${OPENERS}|:: |\\+[ \\t]*$)`;
    out.end = `${out.end.slice(0, -boundary.length)}^(?=[ \\t]*$|[ \\t]*:{3,}|[ \\t]*>(?:[ \\t]*>)*[ \\t]*$|${deeper}|${opener})`;

    return out;
}

export function generate(grammar) {
    const repo = grammar.repository;
    const entries = {};
    const containerBlocks = clone(repo.container_blocks);
    delete containerBlocks.comment;
    containerBlocks.patterns = containerBlocks.patterns.map((rule) => {
        if (rule.include === '#abbreviation_on_marker_line') return { include: '#lazy_abbreviation_on_marker_line' };
        if (rule.include === '#abbreviation_in_quote_on_marker_line') return { include: '#lazy_abbreviation_in_quote_on_marker_line' };
        return rule;
    });
    entries.lazy_container_blocks = containerBlocks;
    entries.lazy_abbreviation_on_marker_line = neuterDefinition(repo.abbreviation_on_marker_line);
    entries.lazy_abbreviation_in_quote_on_marker_line = neuterDefinition(repo.abbreviation_in_quote_on_marker_line);
    for (const key of ITEMS) entries[`lazy_${key}`] = lazyItem(repo[key]);
    const lazyLine = ITEMS.flatMap((key) => itemBegins(entries[`lazy_${key}`])).map((begin) => begin.slice(1)).join('|');
    const findLine = (patterns) => patterns.find((rule) => rule.match?.endsWith('(?![ \\t]*$))?(.*)$') && rule.captures?.[10]);
    entries.quoted_item_lazy_marker_line = lazyHold(findLine(repo.blockquote.patterns), lazyLine);
    entries.quoted_item_lazy_marker_line_in_container = lazyHold(findLine(repo.blockquote_in_container.patterns), lazyLine);

    for (const depth of DEPTHS) {
        entries[`quoted_prose_continuation_depth_${depth}`] = depthRule(repo.quoted_prose_continuation, depth);
        for (const key of VERBATIM) entries[`${key}_in_quote_depth_${depth}`] = quotedSpan(repo[key], depth);
    }

    return entries;
}

export function splice(text, entries) {
    for (const [key, value] of Object.entries(entries)) {
        const span = valueSpan(text, key);
        const json = JSON.stringify(value);
        if (span) {
            text = text.slice(0, span[0]) + json + text.slice(span[1]);
        } else {
            const anchor = valueSpan(text, 'quoted_verbatim_span');
            text = `${text.slice(0, anchor[1])},\n    "${key}": ${json}${text.slice(anchor[1])}`;
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
            console.error('textmate/carve.tmLanguage.json: generated lazy quote rules are stale; run node scripts/generate-lazy-quote-rules.mjs');
            process.exit(1);
        }
    } else {
        writeFileSync(grammarPath, next);
    }
}
