(function (root, factory) {
    var delimited = factory();
    if (typeof module === 'object' && module.exports) module.exports = delimited;
    if (root) {
        root.carveHljsDelimited = delimited;
        if (root.hljs && typeof root.hljs.registerLanguage === 'function') {
            root.hljs.registerLanguage('csv', delimited.csv);
            root.hljs.registerLanguage('tsv', delimited.tsv);
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    function language(name, separator) {
        return function () {
            var escaped = separator === ',' ? ',' : '\\t';
            var quoted = {
                scope: 'string',
                begin: new RegExp('(?<=^' + (separator === ',' ? '[ \\t]*' : ' *') + '|' + escaped + ')"'),
                end: /"(?!")/,
                contains: [{ scope: 'char.escape', match: /""/ }],
            };
            var punctuation = { scope: 'operator', match: new RegExp(escaped) };
            var indent = { match: separator === ',' ? /^[ \t]+(?=")/ : /^ +(?=")/ };
            var field = { scope: 'string', match: new RegExp('[^' + escaped + '\\r\\n]+') };
            return {
                name: name,
                aliases: [name.toLowerCase()],
                contains: [
                    {
                        begin: /(?<![\s\S])(?=[\s\S])/,
                        end: /$/,
                        contains: [indent, quoted, punctuation, {
                            scope: 'attr',
                            match: new RegExp('[^' + escaped + '\\r\\n]+'),
                        }],
                    },
                    indent,
                    quoted,
                    punctuation,
                    field,
                ],
            };
        };
    }
    return { csv: language('CSV', ','), tsv: language('TSV', '\t') };
}));
