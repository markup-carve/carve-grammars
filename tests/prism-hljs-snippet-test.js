/**
 * Prism and highlight.js: snippet definitions and uses (C2-B-236, C2-B-237,
 * C2-I-128; carve-grammars#986), the cases tests/textmate-snippet-test.js
 * pins for the TextMate rules.
 */
import assert from 'node:assert/strict';

import Prism from 'prismjs';
import hljs from 'highlight.js';
import carve from '../highlightjs/carve.mjs';

globalThis.Prism = Prism;
await import('../prism/carve.js');
hljs.registerLanguage('carve', carve);

// The text Prism puts under a token of `type`, nested tokens included.
function prismCovered(source, type) {
    let out = '';
    const visit = (node, inside) => {
        if (typeof node === 'string') {
            if (inside) out += node;
        } else if (Array.isArray(node)) node.forEach((child) => visit(child, inside));
        else visit(node.content, inside || node.type === type);
    };
    visit(Prism.tokenize(source, Prism.languages.carve), false);
    return out;
}
// The type path of each leaf, outermost first.
function prismLeaves(source) {
    const leaves = [];
    const visit = (node, path) => {
        if (typeof node === 'string') leaves.push({ text: node, path });
        else if (Array.isArray(node)) node.forEach((child) => visit(child, path));
        else visit(node.content, [...path, node.type, ...[].concat(node.alias ?? [])]);
    };
    visit(Prism.tokenize(source, Prism.languages.carve), []);
    return leaves;
}
const unescape = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
function hljsLeaves(source) {
    const html = hljs.highlight(source, { language: 'carve' }).value;
    const stack = [];
    const leaves = [];
    for (const [, open, text] of html.matchAll(/<span class="([^"]*)">|<\/span>|([^<]+)/g)) {
        if (open !== undefined) stack.push(...open.split(' ').map((name) => name.replace(/^hljs-/, '')));
        else if (text === undefined) stack.pop();
        else leaves.push({ text: unescape(text), path: [...stack] });
    }
    return leaves;
}
const hljsCovered = (source, kind) => hljsLeaves(source).filter((leaf) => leaf.path.includes(kind)).map((leaf) => leaf.text).join('');
const innermost = (leaves, kind) => leaves.filter((leaf) => leaf.path.at(-1) === kind).map((leaf) => leaf.text).join('');
const pathOf = (leaves, text) => leaves.find((leaf) => leaf.text === text)?.path ?? [];

// Each grammar: the token of a definition line, a use, an include directive,
// and the leaf readings of a source.
const grammars = [
    {
        name: 'prism',
        definition: (source) => prismCovered(source, 'snippet-definition'),
        use: (source) => prismCovered(source, 'snippet-use'),
        include: (source) => prismCovered(source, 'include-directive'),
        leaves: prismLeaves,
        attributes: 'attributes',
        bold: 'bold',
        comment: 'comment',
        link: 'url',
    },
    {
        name: 'hljs',
        // highlight.js has no line token: a definition is its `{$` punctuation and name.
        definition: (source) => {
            const leaves = hljsLeaves(source);
            const at = leaves.findIndex((leaf) => leaf.text.endsWith('{$') && leaf.path.at(-1) === 'punctuation');
            if (at === -1 || leaves[at + 1]?.path.at(-1) !== 'variable') return '';
            const line = source.split('\n').find((text) => text.replace(/^\uFEFF/, '').startsWith(leaves[at].text.replace(/^\uFEFF/, '')));
            return line ?? '';
        },
        use: (source) => hljsCovered(source, 'template-variable'),
        include: (source) => hljsCovered(source, 'meta'),
        leaves: hljsLeaves,
        attributes: 'attr',
        bold: 'strong',
        comment: 'comment',
        link: 'link',
    },
];

let count = 0;
for (const g of grammars) {
    const at = (source) => `${g.name}: ${JSON.stringify(source)}`;

    // The reproduction of carve-grammars#986.
    const repro = '{$name}: value\n\nText with {{ $name }} inside.\n';
    let leaves = g.leaves(repro);
    assert.equal(innermost(leaves, 'variable'), 'name$name', at(repro));
    assert.equal(g.use(repro), '{{ $name }}', at(repro));
    assert.equal(g.include(repro), '', at(repro));
    assert.ok(g.definition(repro).startsWith('{$name}:'), at(repro));
    count++;

    // C2-B-236: a definition line at column 0.
    for (const [source, marker] of [
        ['{$ver}: 0.2.3\n', 'ver'],
        ['{$_v}: X\n', '_v'],
        ['{$9}: X\n', '9'],
        ['{$a_b-c}: X\n', 'a_b-c'],
        ['{$v .c}: X\n', 'v'],
        ['{$v  .c }: X\n', 'v'],
        ['{$v k="a}b"}: X\n', 'v'],
        ['{$v _k=1 :en}: X\n', 'v'],
        ['{$v}{.c}{e=1}: X\n', 'v'],
        ['{$v}:  X\n', 'v'],
        ['{$v}: \tX\n', 'v'],
        ['\u{FEFF}{$v}: X\n', 'v'],
        ['{.k}\n{$v .c}: X\n', 'v'],
        ['{$a}: x\n{$v}: X\n', 'av'],
        ['# H\n{$v}: X\n', 'v'],
        ['- a\n{$v}: X\n', 'v'],
    ]) {
        assert.equal(innermost(g.leaves(source), 'variable'), marker, at(source));
        assert.notEqual(g.definition(source), '', at(source));
        count++;
    }
    const parts = '{$brand .badge}{k=v}: *b* `c`\n';
    leaves = g.leaves(parts);
    assert.ok(pathOf(leaves, '{$').includes('punctuation'), at(parts));
    assert.ok(pathOf(leaves, 'brand').includes('variable'), at(parts));
    assert.ok(leaves.filter((leaf) => leaf.path.includes(g.attributes)).map((leaf) => leaf.text).join('').includes('.badge'), at(parts));
    assert.ok(leaves.filter((leaf) => leaf.path.includes(g.attributes)).map((leaf) => leaf.text).join('').includes('{k=v}'), at(parts));
    assert.ok(leaves.find((leaf) => leaf.text.includes('*b*'))?.path.includes(g.bold), `${at(parts)}: the value is inline content`);
    assert.equal(g.include(parts), '', at(parts));
    count++;
    const below = '{$v}: X\n  Y\n';
    assert.ok(!pathOf(g.leaves(below), '  Y\n').includes('variable'), at(below));
    if (g.name === 'prism') assert.equal(g.definition(below), '{$v}: X', 'the line below never continues it');
    count++;

    // Near misses: no definition.
    for (const source of [
        '{$v}:\n', '{$v}: \n', '{$v}:x\n', '{$v}:\tX\n', '{$v}\n', '\\{$v}: X\n',
        '{$v }: X\n', '{$v.c}: X\n', '{$v #x}: a\n', '{$v .c}{#i}: X\n', '{$v}{.c} {.d}: X\n',
        '{$v _k}: X\n', '{$v %x}: X\n', '{$-v}: X\n', '{$v.x}: X\n', '{$vé}: X\n',
        '{$brand .badge}{#x .q}: x\n', '{#intro}: text\n', '{.c #v}: x\n',
        ' {$v}: X\n', 'text\n{$v}: X\n', 'a *b\n{$v}: X\n', '> a\n{$v}: X\n', '> {$v}: X\n', '- {$v}: X\n',
        '::: d\n{$v}: X\n:::\n', '```\n{$v}: X\n```\n',
    ]) {
        assert.equal(g.definition(source), '', `no definition in ${at(source)}`);
        count++;
    }

    // C2-I-128 and C2-B-237: a use, inline or alone on its line.
    for (const [source, text] of [
        ['Version {{ $ver }}.\n', '$ver'],
        ['{{ $ver }}\n', '$ver'],
        ['{{ $ver }}  \n', '$ver'],
        ['a {{  $v-1  }} b\n', '$v-1'],
        ['# H {{ $v }}\n', '$v'],
        ['| {{ $v }} |\n', '$v'],
        ['[a {{ $v }}](u)\n', '$v'],
        ['*a {{ $v }} b*\n', '$v'],
        ['{*{{ $v }}*}\n', '$v'],
        ['> {{ $v }}\n', '$v'],
        ['- {{ $v }}\n', '$v'],
        ['text\n{{ $v }}\n', '$v'],
        ['::: d\n{{ $v }}\n:::\n', '$v'],
    ]) {
        leaves = g.leaves(source);
        assert.equal(innermost(leaves, 'variable'), text, at(source));
        const spaced = `{{${source.includes('{{  ') ? '  ' : ' '}${text}${source.includes('  }}') ? '  ' : ' '}}}`;
        assert.equal(g.use(source), spaced, at(source));
        assert.equal(leaves.filter((leaf) => leaf.path.at(-1) === 'punctuation' && /^(?:\{\{|\}\})$/.test(leaf.text)).length, 2, at(source));
        assert.equal(g.include(source), '', `no include directive in ${at(source)}`);
        count++;
    }
    const inValue = '{$w}: a {{ $v }}\n';
    assert.equal(g.use(inValue), '{{ $v }}', `a use in a definition value, ${at(inValue)}`);
    count++;

    // Near misses stay with the include rule or stay text.
    for (const source of ['{{ ch.crv }}\n', '{{ $a.crv }}\n', '{{ $v @shift:1 }}\n', '{{ $v#s }}\n', '{{ $-v }}\n']) {
        assert.equal(g.use(source), '', `no use in ${at(source)}`);
        assert.notEqual(g.include(source), '', `include directive kept in ${at(source)}`);
        count++;
    }
    for (const source of ['a {{$v}} b\n', 'a {{\t$v }} b\n', 'a {{ $v\t}} b\n', 'a \\{{ $v }} b\n', 'a `{{ $v }}` b\n', 'a {{ $vé }} b\n']) {
        assert.equal(g.use(source), '', `no use in ${at(source)}`);
        count++;
    }

    // Text after a use reads normally; a glued attribute block is text (C2-I-128).
    const after = 'a {{ $v }}{.c} *b* [l](u) `c`\n';
    leaves = g.leaves(after);
    assert.ok(!leaves.some((leaf) => leaf.path.includes(g.attributes)), `a block glued to a use is text, ${at(after)}`);
    assert.ok(leaves.find((leaf) => leaf.text.includes('*b*') || leaf.text === 'b')?.path.includes(g.bold), at(after));
    assert.ok(leaves.some((leaf) => leaf.text.includes('[l]') || leaf.text === 'l' || leaf.text === '[') && leaves.some((leaf) => leaf.path.includes(g.link)), at(after));
    assert.equal(g.use(after), '{{ $v }}', `the use ends at its closer, ${at(after)}`);
    const idBlock = 'a {{ $v }}{#i .c k="}"} b\n';
    assert.ok(!g.leaves(idBlock).some((leaf) => leaf.path.includes(g.attributes)), at(idBlock));
    for (const comment of ['{# c #}', '{% note %}']) {
        const source = `a {{ $v }}${comment} b\n`;
        assert.equal(g.use(source), '{{ $v }}', at(source));
        assert.ok(g.leaves(source).some((leaf) => /c|note/.test(leaf.text) && leaf.path.includes(g.comment)), `${comment} after a use stays a comment, ${at(source)}`);
        count++;
    }
    const next = '{{ $v }}\n\n# Next\n';
    assert.ok(!pathOf(g.leaves(next), ' Next').includes('template-variable') && !pathOf(g.leaves(next), ' Next').includes('snippet-use'), at(next));
    count += 3;
}

// One long line of uses, glued blocks and near misses stays linear.
const cpuMs = (run, source) => {
    const start = process.cpuUsage();
    run(source);
    const elapsed = process.cpuUsage(start);
    return (elapsed.user + elapsed.system) / 1000;
};
const highlighters = {
    prism: (source) => Prism.tokenize(source, Prism.languages.carve),
    hljs: (source) => hljs.highlight(source, { language: 'carve', ignoreIllegals: true }),
};
for (const [name, run] of Object.entries(highlighters)) {
    for (const unit of ['a {{ $v }} ', '{{ $v }}{.c}{#d} ', '{$v}: {{ $v }} ', '{{  $v{.c} ']) {
        const short = unit.repeat(1000);
        const long = short.repeat(4);
        run(short);
        run(long);
        let ratio = Infinity;
        for (let retry = 0; retry < 3 && ratio >= 3; retry++) {
            const samples = { short: [], long: [] };
            for (let round = 0; round < 2; round++) {
                const order = round % 2 ? [['long', long], ['short', short]] : [['short', short], ['long', long]];
                for (const [size, source] of order) samples[size].push(cpuMs(run, source));
            }
            ratio = Math.min(...samples.long) / (4 * Math.min(...samples.short));
        }
        assert.ok(ratio < 3, `${name} on ${JSON.stringify(unit)} took ${ratio.toFixed(2)} times a linear baseline`);
        count++;
    }
}

console.log(`Prism and highlight.js snippet tokens: ${count} checks passed`);
