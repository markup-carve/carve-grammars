/**
 * A fenced code block highlights its body with the grammar its language word
 * names (fence-languages/fence-languages.json), a raw block with its format's,
 * and a bare fence under `{.diff}` as a diff. The generated rules stay in step
 * with the generator, and the Carve themes color the punctuation and keys that
 * used to fall back to the default foreground.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { carveDarkExtras, carveLightExtras, carveLightTheme } from '../shiki/themes.js';
import { LANGUAGES, RAW_FORMATS, grammarPath } from '../scripts/generate-fence-languages.mjs';
import { assertThisFileRuns } from './lib/runs-in-ci.js';
import { createHighlighter } from './lib/shiki.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const grammar = JSON.parse(readFileSync(grammarPath, 'utf8'));
let count = 0;

const check = spawnSync(process.execPath, [resolve(root, 'scripts/generate-fence-languages.mjs'), '--check'], { encoding: 'utf8' });
assert.equal(check.status, 0, `generated fence rules are stale:\n${check.stderr}`);
for (const key of ['fenced_code_languages', 'fenced_code_languages_in_container']) {
    assert.equal(grammar.repository[key].patterns.length, LANGUAGES.length + RAW_FORMATS.length, key);
    count++;
}

const highlighter = await createHighlighter({
    themes: [carveLightTheme],
    langs: [{ ...grammar, name: 'carve' }, 'python', 'javascript', 'diff', 'html'],
});
const tokens = (source) => highlighter.codeToTokens(source, { lang: 'carve', theme: carveLightTheme.name, includeExplanation: true }).tokens;

function at(source, line, needle) {
    const parts = tokens(source)[line].flatMap((token) => token.explanation.map((part) => ({ ...part, color: token.color })));
    const found = parts.find((part) => part.content.includes(needle));
    assert.ok(found, `${needle} not on line ${line} of ${JSON.stringify(source)}`);

    return { scopes: found.scopes.map((scope) => scope.scopeName).join(' '), color: found.color };
}

const ROWS = [
    ['```python\ndef f(): pass\n```', 1, 'def', /meta\.embedded\.block\.python .*storage\.type\.function\.python/],
    ['```PY "t" [l]\nx = 1\n```', 1, '1', /constant\.numeric.*python/],
    // A callout outside any region the embedded grammar opened (one inside, say a JS `const` statement, is that grammar's).
    ['```python\nprint(x) <1>\n```', 1, '<', /punctuation\.definition\.callout/],
    ['- item\n\n  ```js\n  let x = 1\n  ```', 3, 'let', /storage\.type\.js/],
    ['```=html\n<b>x</b>\n```', 1, 'b', /entity\.name\.tag\.html/],
    ['```carve\n*b* c\n```', 1, 'b', /markup\.bold\.carve/],
    ['{.diff}\n```\n+ added\n```', 2, 'added', /markup\.inserted\.diff/],
    ['{.c .diff}\n```\n- gone\n```', 2, 'gone', /markup\.deleted\.diff/],
    // An unknown word keeps the plain body, and a language fence under `{.diff}` keeps its language.
    ['```nolang\nx = 1\n```', 1, 'x', /^(?!.*meta\.embedded)(?=.*markup\.raw\.code)/],
    ['{.diff}\n```python\nx = 1\n```', 2, '1', /python/],
];
for (const [source, line, needle, want] of ROWS) {
    assert.match(at(source, line, needle).scopes, want, JSON.stringify(source));
    count++;
}

// The block ends where the engine ends it, whatever the embedded grammar left open.
const ENDINGS = [
    ['```python\ns = """open\n```\n\nafter *b*', 4, 'b', /markup\.bold\.carve/],
    ['```js\nconst s = `open\n`````\n\nafter *b*', 4, 'b', /markup\.bold\.carve/],
    ['{.diff}\n```\n+ a\n```\n```\nplain\n```', 5, 'plain', /^(?!.*diff)/],
    ['{.diff}\npara *b*', 1, 'b', /markup\.bold\.carve/],
];
for (const [source, line, needle, want] of ENDINGS) {
    assert.match(at(source, line, needle).scopes, want, JSON.stringify(source));
    count++;
}
highlighter.dispose();

// Structural punctuation recedes in both themes, and a citation key has its own color.
const SCOPES = [
    'punctuation.definition.footnote.carve', 'punctuation.definition.span.carve', 'punctuation.definition.abbreviation.carve',
    'punctuation.separator.carve', 'punctuation.definition.directive.begin.carve', 'punctuation.definition.directive.end.carve',
    'punctuation.definition.extension.carve', 'punctuation.definition.citation.begin.carve', 'punctuation.definition.citation.end.carve',
    'punctuation.definition.literal.carve', 'punctuation.separator.include.carve', 'punctuation.separator.citation.carve',
    'punctuation.definition.callout.carve', 'punctuation.definition.frontmatter.begin.carve', 'punctuation.definition.label.carve',
];
const colorOf = (extras, scope) => {
    const rule = [...extras].reverse().find((r) => [r.scope].flat().some((s) => scope === s || scope.startsWith(`${s}.`)));

    return rule?.settings.foreground;
};
for (const [extras, gray] of [[carveLightExtras, '#959da5'], [carveDarkExtras, '#6a737d']]) {
    for (const scope of SCOPES) {
        assert.equal(colorOf(extras, scope), gray, scope);
        count++;
    }
    assert.ok(colorOf(extras, 'variable.other.citation.key.carve'), 'citation key color');
    assert.ok(colorOf(extras, 'punctuation.definition.figure-group.carve'), 'figure group fence color');
    assert.ok(colorOf(extras, 'constant.other.raw.format.carve'), 'raw format color');
    // An embedded language's own separators keep their color.
    assert.equal(colorOf(extras, 'punctuation.separator.key-value.mapping.yaml'), undefined);
    count += 4;
}

assertThisFileRuns(import.meta.url);
console.log(`${count} fence embedding and theme assertions passed`);
