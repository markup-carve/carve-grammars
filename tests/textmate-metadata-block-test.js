import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { covered, textmateLineTokenizer } from './lib/textmate-lines.js';

const tokenize = await textmateLineTokenizer(resolve('textmate/carve.tmLanguage.json'));
const opening = 'punctuation.definition.frontmatter.begin.carve';
const closing = 'punctuation.definition.frontmatter.end.carve';
const type = 'entity.name.type.frontmatter.carve';

for (const [format, source, payload, name] of [
    ['yaml', 'Text\n\n---yaml\na: b\n---\nAfter\n', 'a: b', 'yaml'],
    ['yaml', 'Text\n\n---yml\na: b\n---\nAfter\n', 'a: b', 'yml'],
    ['toml', 'Text\n\n---toml\na = 1\n---\nAfter\n', 'a = 1', 'toml'],
    ['json', 'Text\n\n---json\n{"a":1}\n---\nAfter\n', '{"a":1}', 'json'],
    ['unknown', 'Text\n\n---custom\nopaque\n---\nAfter\n', 'opaque', 'custom'],
]) {
    const scope = `meta.frontmatter.${format}.carve`;
    assert.equal(covered(tokenize, source, opening), '---', `${format} opener`);
    assert.equal(covered(tokenize, source, type), name, `${format} format word`);
    assert.equal(covered(tokenize, source, closing), '---', `${format} closer`);
    assert.equal(covered(tokenize, source, `meta.embedded.block.${format === 'unknown' ? 'frontmatter' : format}`).trim(), payload);
    assert.ok(tokenize(source).some(({ scope: scopes, text }) => text.includes(payload.slice(0, 1)) && scopes.includes(scope)), `${format} payload scope`);
    assert.ok(!tokenize(source).some(({ scope: scopes, text }) => text === 'After' && scopes.includes(scope)), `${format} ends at closer`);
}

assert.equal(covered(tokenize, '---\na: b\n---\n\n---yaml\nb: c\n---\n', opening), '------', 'leading bare opener and later typed opener');
assert.equal(covered(tokenize, 'Text\n\n---\nAfter\n', opening), '', 'later bare delimiter stays text');
for (const opener of ['-----', '---x-y', '---x_y']) {
    assert.equal(covered(tokenize, `Text\n\n${opener}\nAfter\n`, opening), '', `${opener} is not a typed opener`);
}
assert.equal(covered(tokenize, 'Text\n\n  ---yaml\na: b\n---\n', opening), '', 'indented opener stays text');
assert.equal(covered(tokenize, 'Text\n\n{#key}\n---yaml\na: b\n---\n', opening), '---', 'attribute line above opener');
assert.equal(covered(tokenize, '{#key}\n---json\n{"a":1}\n---\n', opening), '---', 'line-1 attribute precedes document frontmatter');
assert.equal(covered(tokenize, 'Text\n\n---yaml\na: b\n', opening), '---', 'unclosed block runs to end');
assert.equal(covered(tokenize, '> ---yaml\n> a: b\n> ---\n', opening), '', 'quoted opener stays text');
assert.equal(covered(tokenize, '- item\n\n  ---yaml\n  a: b\n  ---\n', opening), '', 'list item opener stays text');
assert.equal(covered(tokenize, '::: note\n\n---yaml\na: b\n---\n:::\n', opening), '', 'div opener stays text');

// C2-B-232 requires a blank line or pending attributes. TextMate cannot inspect
// the previous line across all editors, nor reliably determine every enclosing
// div. These tests pin the scopes it can distinguish, including column 0 and
// explicit container prefixes; the spec model decides the remaining cases.
console.log('TextMate later metadata block scopes passed');
