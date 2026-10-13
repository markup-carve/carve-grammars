/**
 * A text run's escapes have to account for the delimiters its NEIGHBORS write.
 * A literal `{` before a marked run spells a braced opener (`{*x*}`), and a lone
 * delimiter in one run can pair with a mark delimiter in a later one. Each row
 * is parsed, written back without the source envelope, and must render as the
 * source does.
 */
import assert from 'node:assert/strict';
import { carveToHtml } from '@markup-carve/carve';

import { carveToProseMirror, serializeToCarve } from '../tiptap/index.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

assertThisFileRuns(import.meta.url);

const B = '\\';
const write = (source) => serializeToCarve({ ...carveToProseMirror(source, { unsupported: 'throw' }), attrs: undefined });

const equivalent = [
    // The two corpus documents (471-braced-emphasis-can-nest-its-own-kind-11, -12).
    `${B}{*x*}`,
    `{~a {*x ~>y~} z*}`,
    // Every forced kind behind an escaped brace.
    `${B}{/x/}`,
    `${B}{_x_}`,
    `${B}{~x~}`,
    `${B}{=x=}`,
    `${B}{^x^}`,
    `${B}{,x,}`,
    `${B}{+x+}`,
    `${B}{-x-}`,
    `${B}{{*x*}}`,
    `${B}{,[x],}`,
    `${B}{,a${B}],}`,
    `${B}{,a\n,}`,
    // A lone delimiter that pairs with a later mark's delimiter.
    `${B}~a *x* b~`,
    `${B}*a /x/ b*`,
    `a ${B}/b /x/ c/ d`,
    `${B}~a ~x~`,
    `${B}_a _x_`,
    `${B}{~a ~x~`,
];
const failures = [];
for (const source of equivalent) {
    const written = write(source);
    if (carveToHtml(written) !== carveToHtml(source)) {
        failures.push(`${JSON.stringify(source)} -> ${JSON.stringify(written)}`);
    }
}
assert.deepEqual(failures, [], `written back with a different render:\n${failures.join('\n')}`);

// Ordinary text keeps its spelling: no neighbor can pair with these.
for (const [source, expected] of [
    ['{ *x*}', '{ *x*}'],
    ['a{*x*}b', 'a{*x*}b'],
    ['a ~ b *x*', 'a ~ b *x*'],
    ['a/b *x*', 'a/b *x*'],
    ['a ~b *x*', 'a ~b *x*'],
    ['{,,} *x*', '{,,} *x*'],
    ['x { *y*', 'x { *y*'],
    // A braced run cannot close beyond the bracket run it opens in.
    ['[{,a],}', '[{,a],}'],
    // Code content is literal, so its `*` pairs with nothing outside it.
    ['*a ` b*', '*a ` b*`'],
]) {
    assert.equal(write(source), expected, source);
}
