/**
 * A `:::` CONTAINER MAY OPEN ON A LIST ITEM'S OWN MARKER LINE, in every grammar
 * this repository ships.
 *
 * Corpus 116-fence-opener-with-a-nested-list-body-inside-a-list-item-2 renders
 * `- ::: note` / `  1. para text` / `  :::` as an admonition inside the `<li>`.
 * All three grammars anchored the container opener at a line start, so the
 * opener after the marker scoped as nothing, and the indented closer was then
 * read as an opener of its own. That second half is the leak: everything after
 * it sat inside a container the document does not have.
 *
 * Both directions are asserted, as `tests/lib/marker-line-fences.js` asks for
 * its own shape: every fence line scopes as a delimiter of the right kind, AND
 * the text after the closed container is outside any container scope.
 * highlight.js gives a container body no class, so the second check cannot see
 * it there; its pairing is pinned by the delimiter kinds instead, since a
 * closer taken for an opener shifts every later delimiter by one.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hljsTokens, prismTokens } from './lib/engines.js';
import { textmateTokenizer } from './lib/textmate-engine.js';
import { assertThisFileRuns } from './lib/runs-in-ci.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const failed = [];

function ok(name, fn) {
    try {
        fn();
    } catch (error) {
        failed.push(name);
        console.log(`  ✗ ${name}\n    ${error.message.split('\n')[0]}`);
        return;
    }
    passed++;
    console.log(`  ✓ ${name}`);
}

const ENGINES = {
    prism: {
        tokenize: prismTokens,
        delimiter: { div: /div-delimiter/, figure: /figure-group-delimiter/ },
        container: /^(?:div|figure-group)>/,
    },
    highlightjs: {
        tokenize: hljsTokens,
        delimiter: { div: /^keyword$/, figure: /^section$/ },
        container: null,
    },
    textmate: {
        tokenize: await textmateTokenizer(resolve(repoRoot, 'textmate/carve.tmLanguage.json')),
        delimiter: {
            div: /punctuation\.definition\.admonition\.carve/,
            figure: /punctuation\.definition\.figure-group\.carve/,
        },
        container: /meta\.(?:admonition|figure-group)\.carve/,
    },
};

/*
 * `fences` names the kind of every `:::` line in order, opener and closer
 * alike: each grammar scopes a closer with its opener's delimiter scope.
 */
const CASES = [
    {
        label: 'corpus 116-2: an admonition holding an ordered list',
        src: '- ::: note\n  1. para text\n  :::\n\nafter\n',
        fences: ['div', 'div'],
    },
    {
        label: 'an admonition with an indented body and closer',
        src: '- ::: note\n  text\n  :::\n\nafter\n',
        fences: ['div', 'div'],
    },
    {
        label: 'a composite figure',
        src: '- ::: figure\n  ![a](b.png)\n  :::\n\nafter\n',
        fences: ['figure', 'figure'],
    },
    {
        label: 'the issue document: a note item, then a figure item',
        src: '- ::: note\n  text\n  :::\n\n- ::: figure\n  ![a](b.png)\n  :::\n\nafter\n',
        fences: ['div', 'div', 'figure', 'figure'],
    },
    {
        label: 'a paragraph between two such items',
        src: '- ::: note\n  text\n  :::\n\nbetween\n\n- ::: note\n  text\n  :::\n\nafter\n',
        fences: ['div', 'div', 'div', 'div'],
    },
    {
        label: 'an ordered marker',
        src: '1. ::: note\n   text\n   :::\n\nafter\n',
        fences: ['div', 'div'],
    },
    {
        label: 'a task marker and a titled opener',
        src: '- [ ] ::: note "T"\n      text\n      :::\n\nafter\n',
        fences: ['div', 'div'],
    },
    {
        label: 'a marker run',
        src: '- - ::: note\n    text\n    :::\n\nafter\n',
        fences: ['div', 'div'],
    },
    {
        label: 'a document-leading BOM before the marker',
        src: '\uFEFF- ::: note\n  text\n  :::\n\nafter\n',
        fences: ['div', 'div'],
    },
];

for (const [id, engine] of Object.entries(ENGINES)) {
    console.log(`${id}:`);
    for (const { label, src, fences } of CASES) {
        const leaves = engine.tokenize(src);
        ok(`${label}: every fence line is a delimiter of its kind`, () => {
            const fenceLeaves = leaves.filter((leaf) => leaf.text.includes(':::'));
            assert.equal(fenceLeaves.length, fences.length, `fence leaves: ${JSON.stringify(fenceLeaves)}`);
            fenceLeaves.forEach((leaf, i) => {
                assert.match(leaf.scope ?? '', engine.delimiter[fences[i]], `fence ${i + 1} of ${JSON.stringify(src)}`);
            });
        });
        if (!engine.container) continue;
        ok(`${label}: the text outside the containers is in no container`, () => {
            for (const needle of ['between', 'after'].filter((word) => src.includes(word))) {
                const outside = leaves.filter((leaf) => leaf.text.includes(needle));
                assert.ok(outside.length, `no leaf carries ${needle}`);
                for (const leaf of outside) assert.doesNotMatch(leaf.scope ?? '', engine.container, needle);
            }
        });
    }
}

/*
 * AN UNCLOSED MARKER-LINE CONTAINER ENDS WITH ITS ITEM. A column-0 line closes
 * the item and the container in it, so the text from there on is outside both
 * (corpus 362, 364 and 365). The last case is Prism's: its closer scan used to
 * cross `between` and pair the first opener with the second item's closer.
 */
const UNCLOSED = [
    { label: 'corpus 362: a paragraph after a blank line', src: '- ::: d\n  b\n\ntail\n', outside: 'tail' },
    { label: 'corpus 364: a paragraph after the blank opener line', src: '- ::: d\n\ntail\n', outside: 'tail' },
    { label: 'corpus 365: a sibling item after a blank line', src: '- ::: d\n  b\n\n- sibling\n', outside: 'sibling' },
    {
        label: 'a later item\'s closer does not close an earlier opener',
        src: '- ::: d\n  b\n\nbetween\n\n- ::: e\n  c\n  :::\n',
        outside: 'between',
    },
];

console.log('\nan unclosed marker-line container ends with its item:');

// highlight.js gives a body no class, so a container left open shows on the
// construct after it: a group nested in a group reads generic, and a div body
// does not offer the abbreviation definition.
const AFTER_UNCLOSED = [
    {
        label: 'a document-level figure after an unclosed one is a group again',
        src: '- ::: figure\n  x\n\n::: figure\n![a](b.png)\n:::\n',
        needle: 'figure',
        nth: 1,
        scope: { prism: /figure-group-delimiter/, highlightjs: /^section$/, textmate: /entity\.name\.tag\.figure-group/ },
    },
    {
        label: 'an abbreviation definition after an unclosed container is one again',
        src: '- ::: note\n  x\n\n*[ABC]: Alpha\n',
        needle: 'ABC',
        nth: 0,
        scope: { prism: /abbreviation/, highlightjs: /^symbol$/, textmate: /abbreviation/ },
    },
];
for (const [id, engine] of Object.entries(ENGINES)) {
    for (const { label, src, needle, nth, scope } of AFTER_UNCLOSED) {
        ok(`${id}: ${label}`, () => {
            const leaf = engine.tokenize(src).filter((l) => l.text.includes(needle))[nth];
            assert.match(leaf?.scope ?? '', scope[id], JSON.stringify(leaf));
        });
    }
}

for (const [id, engine] of Object.entries(ENGINES)) {
    if (!engine.container) continue;
    for (const { label, src, outside } of UNCLOSED) {
        ok(`${id}: ${label}`, () => {
            const leaves = engine.tokenize(src).filter((leaf) => leaf.text.includes(outside));
            assert.ok(leaves.length, `no leaf carries ${outside}`);
            for (const leaf of leaves) assert.doesNotMatch(leaf.scope ?? '', engine.container);
        });
    }
}

/*
 * A MARKER-LINE OPENER THE SPEC DEMOTES STAYS TEXT. When the very next line is
 * lazy or below the item's content column, the engine reads `::: d` as item
 * text and a later closer does not rescue it. highlight.js sees the next line
 * and pins every case. Prism sees only the column-0 one (364-2). TextMate sees
 * none of them, and over-colours them all - a line-based grammar's limit.
 * 482-7 and 482-8 are the controls: there the next line is at the content
 * column, so the container opens.
 */
const corpus = (name) => readFileSync(resolve(repoRoot, 'spec/tests/corpus', `${name}.crv`), 'utf8');
const FOLDED = 'a-closer-does-not-rescue-a-marker-line-colon-opener-whose-body-folded-in';
const DEMOTED = [
    '161-below-content-column-div-body-in-a-list-item-stays-literal',
    '364-only-lazy-folding-demotes-a-marker-line-colon-opener-2',
    `482-${FOLDED}`,
    ...[2, 3, 4, 5, 6].map((n) => `482-${FOLDED}-${n}`),
];
const OPENS = [`482-${FOLDED}-7`, `482-${FOLDED}-8`];
const SEES_DEMOTION = {
    highlightjs: DEMOTED,
    prism: ['364-only-lazy-folding-demotes-a-marker-line-colon-opener-2'],
};

console.log('\na marker-line opener the spec demotes stays text:');

for (const [id, names] of Object.entries(SEES_DEMOTION)) {
    const engine = ENGINES[id];
    for (const name of names) {
        ok(`${id}: ${name} stays text`, () => {
            const opener = engine.tokenize(corpus(name)).find((leaf) => leaf.text.includes(':::'));
            assert.doesNotMatch(opener?.scope ?? '', engine.delimiter.div);
        });
    }
    for (const name of OPENS) {
        ok(`${id}: ${name} opens`, () => {
            const opener = engine.tokenize(corpus(name)).find((leaf) => leaf.text.includes(':::'));
            assert.match(opener?.scope ?? '', engine.delimiter.div);
        });
    }
}

/*
 * GROUPS DO NOT NEST through a marker-line div either (PART 9 section 4c). Only
 * highlight.js models the group context; Prism and TextMate re-enter their
 * top-level rules inside a list item, the residual their own comments record.
 */
ok('highlightjs: a bare figure inside a marker-line div inside a group stays generic', () => {
    const src = '::: figure\n- :::: note\n  ::::: figure\n    x\n  :::::\n::::\n:::\n';
    const inner = hljsTokens(src).find((leaf) => leaf.text.includes('::::: figure'));
    assert.match(inner?.scope ?? '', /^keyword$/, JSON.stringify(inner));
});

console.log('\na glued or tab-separated fence after a marker stays text:');

for (const [id, engine] of Object.entries(ENGINES)) {
    for (const src of ['- :::note\n  x\n', '- :::\tnote\n  x\n']) {
        ok(`${id}: ${JSON.stringify(src.split('\n')[0])}`, () => {
            const fence = engine.tokenize(src).find((leaf) => leaf.text.includes(':::'));
            assert.doesNotMatch(fence?.scope ?? '', engine.delimiter.div);
        });
    }
}

ok('this file is part of the suite npm test runs', () => {
    assertThisFileRuns(import.meta.url);
});

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length) process.exit(1);
