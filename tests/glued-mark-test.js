/**
 * A bare emphasis mark glued to a letter or digit neither opens nor closes, so
 * the serializer writes the forced form there (carve-grammars#484). Each HTML
 * row was read off the executable grammar at carve 7bd6577.
 */
import assert from 'node:assert/strict';
import { parse, renderHtml } from '@markup-carve/carve';
import { serializeToCarve } from '../tiptap/index.js';

const t = (text, ...marks) => (marks.length ? { type: 'text', text, marks: marks.map((type) => ({ type })) } : { type: 'text', text });

const rows = [
    [[t('x'), t('a', 'bold'), t(' here')], 'x{*a*} here', '<p>x<strong>a</strong> here</p>'],
    [[t('a', 'bold'), t('x here')], '{*a*}x here', '<p><strong>a</strong>x here</p>'],
    [[t('x'), t('a', 'italic'), t('y')], 'x{/a/}y', '<p>x<em>a</em>y</p>'],
    [[t('x'), t('a', 'underline'), t('y')], 'x{_a_}y', '<p>x<u>a</u>y</p>'],
    [[t('x'), t('a', 'strike')], 'x{~a~}', '<p>x<s>a</s></p>'],
    [[t('1'), t('a', 'bold')], '1{*a*}', '<p>1<strong>a</strong></p>'],
    [[t('é'), t('a', 'bold')], 'é{*a*}', '<p>é<strong>a</strong></p>'],
    [[t('x'), t('a', 'bold', 'italic'), t(' y')], 'x{*/a/*} y', '<p>x<strong><em>a</em></strong> y</p>'],
    [[t('x '), t('a', 'bold'), t('b', 'bold', 'italic'), t(' y')], 'x *a{/b/}* y', '<p>x <strong>a<em>b</em></strong> y</p>'],
    [[t('x *'), t('a', 'bold'), t(' y')], 'x \\*{*a*} y', '<p>x *<strong>a</strong> y</p>'],
    [[t('a/'), t('b', 'underline'), t(' c')], 'a\\/{_b_} c', '<p>a/<u>b</u> c</p>'],
    // Not glued: the bare form stays.
    [[t('x '), t('a', 'bold'), t(' y')], 'x *a* y', '<p>x <strong>a</strong> y</p>'],
    [[t('x '), t('a', 'bold'), t('b', 'italic'), t(' y')], 'x *a*/b/ y', '<p>x <strong>a</strong><em>b</em> y</p>'],
    [[t('('), t('a', 'bold'), t(').')], '(*a*).', '<p>(<strong>a</strong>).</p>'],
];

for (const [content, carve, html] of rows) {
    const written = serializeToCarve({ type: 'doc', content: [{ type: 'paragraph', content }] });
    assert.equal(written, carve);
    assert.equal(renderHtml(parse(written)).trim(), html, `${carve} renders the mark`);
}

console.log(`glued mark: ${rows.length} rows`);
