/**
 * TextMate: three shapes the 0.2 text reads as plain text.
 *
 * - An unpartnered backtick run, with or without a `!`, `$` or `$$` sigil, is
 *   text, so a `%%` after it starts a comment (C2-I-017, carve-grammars#933).
 * - A frontmatter format word is ASCII letters and digits only (C2-B-164,
 *   carve-grammars#934).
 * - An attribute block that attaches to nothing is one literal atom: no tag
 *   inside it (C2-I-035, C2-I-036, carve-grammars#935).
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { covered, textmateLineTokenizer } from './lib/textmate-lines.js';

const tokenize = await textmateLineTokenizer(resolve('textmate/carve.tmLanguage.json'));
const verbatim = (source) => tokenize(source)
    .filter(({ scope }) => /\b(?:markup\.raw|markup\.math|punctuation\.definition\.(?:raw|math|literal))\b/.test(scope))
    .map(({ text }) => text)
    .join('');
const comment = (source) => covered(tokenize, source, 'comment.line.percent.carve');

// #933: unpartnered runs are text.
const hosts = ['', 'a ', '# a ', '![alt](x.png)\n^ cap ', '> a ', '> # a ', '- a ', '1. a ', '::: note\na '];
const open = ['`x %% b', '!`x %% b', '$`x %% b', '$$`x %% b', '``x ` y %% b', '` x `` y %% b', '\\\\`x %% b'];
let count = 0;
for (const host of hosts) {
    for (const body of open) {
        const source = host + body + '\n\nplain *tail*\n';
        assert.equal(verbatim(source), '', `no verbatim scope: ${JSON.stringify(source)}`);
        assert.equal(comment(source), '%% b', `comment after the run: ${JSON.stringify(source)}`);
        assert.equal(covered(tokenize, source, 'markup.bold.carve'), 'tail', `next paragraph: ${JSON.stringify(source)}`);
        count++;
    }
    for (const [body, code] of [
        ['`x %% b` c', 'x %% b'],
        ['``x %% b`` c', 'x %% b'],
        ['` a `` b ` c', ' a `` b '],
        ['``` a ` b ``` c', ' a ` b '],
        ['!`x %% b` c', 'x %% b'],
        ['$`x %% b` c', 'x %% b'],
        ['$$`x %% b` c', 'x %% b'],
    ]) {
        const source = host + body + '\n';
        assert.ok(verbatim(source).includes(code), `closed span stays verbatim: ${JSON.stringify(source)}`);
        assert.equal(comment(source), '', `no comment inside a closed span: ${JSON.stringify(source)}`);
        count++;
    }
    // A shorter run behind an unpartnered one still opens its own span.
    const source = host + '`` a `b` %% c\n';
    assert.equal(covered(tokenize, source, 'markup.raw.inline.carve'), '`b`', `later run opens: ${JSON.stringify(source)}`);
    assert.equal(comment(source), '%% c', `comment after the later span: ${JSON.stringify(source)}`);
    count++;
}

console.log(`textmate text runs: ${count} assertion groups passed`);
