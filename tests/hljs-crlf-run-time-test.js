/**
 * A CRLF paragraph past the 4096-step run window reads in linear time. A CR
 * before an LF matched both the run's text class and its line break, so a
 * closer the run could not reach backtracked through every way to split the
 * CRLFs, and highlight.js never returned (carve-grammars#1002).
 */
import assert from 'node:assert/strict';

import hljs from 'highlight.js';
import carve from '../highlightjs/carve.mjs';

hljs.registerLanguage('carve', carve);

const run = (source) => hljs.highlight(source, { language: 'carve', ignoreIllegals: true });
const shapes = [['/', 'a/'], ['*', 'a*'], ['{/', 'a/}'], ['{+', 'a+}'], ['x /a ', 'b/']];

function cpuMs(source) {
    const start = process.cpuUsage();
    run(source);
    const elapsed = process.cpuUsage(start);
    return (elapsed.user + elapsed.system) / 1000;
}

for (const [head, tail] of shapes) {
    const lf = head + 'x\n'.repeat(1400) + tail;
    const crlf = lf.replaceAll('\n', '\r\n');
    assert.equal(run(crlf).value, run(lf).value.replaceAll('\n', '\r\n'), JSON.stringify(head));
    let ratio = Infinity;
    for (let retry = 0; retry < 3 && ratio >= 3; retry++) {
        ratio = Math.min(cpuMs(crlf), cpuMs(crlf)) / Math.max(1, Math.min(cpuMs(lf), cpuMs(lf)));
    }
    assert.ok(ratio < 3, `${JSON.stringify(head)} over CRLF took ${ratio.toFixed(2)} times its LF copy`);
}
console.log('highlight.js CRLF runs past the window: linear');
