/**
 * A label (heading, caption, term) continues on a line indented past the
 * COLUMN of its marker, with a tab advancing to the next multiple of 4
 * (C2-B-004, C2-B-154, C2-B-234; carve-grammars#959). TextMate compared the
 * indent characters, so `\t= H` over five spaces and `x` ended the heading.
 * Every indent spelling up to three characters, checked against carve-js.
 */
import assert from 'node:assert/strict';

import { textmateLineTokenizer } from './lib/textmate-lines.js';

const tokenize = await textmateLineTokenizer('textmate/carve.tmLanguage.json');
const column = (indent) => [...indent].reduce((at, char) => (char === '\t' ? at + 4 - (at % 4) : at + 1), 0);
const indents = [''];
for (let length = 1; length <= 3; length++) {
    for (let bits = 0; bits < 2 ** length; bits++) indents.push([...Array(length)].map((_, at) => ((bits >> at) & 1 ? '\t' : ' ')).join(''));
}
const labels = [
    ['heading', (marker, line) => `${marker}= H\n${line}x\n`, 'markup.heading.carve'],
    ['term', (marker, line) => `${marker}:: t\n${line}x\n`, 'entity.name.tag.definition.term.carve'],
    ['caption', (marker, line) => `| a |\n${marker}^ c\n${line}x\n`, 'markup.caption.carve'],
];
let checked = 0;
for (const [name, make, scope] of labels) {
    for (const marker of indents) {
        for (const line of indents) {
            const source = make(marker, line);
            const last = tokenize(source).find((token) => token.text.trim() === 'x');
            assert.equal(last.scope.includes(scope), column(line) > column(marker), `${name}: ${JSON.stringify(source)}`);
            checked++;
        }
    }
}
console.log(`label column continuation: ${checked} TextMate rows agree with carve-js`);
