/**
 * What each grammar surface NAMES, and which spec construct each name is about.
 *
 * The construct list is derived from the spec (`scripts/spec-constructs.mjs`).
 * This file is the other half of carve-grammars#284: a probe that reads a
 * surface's own vocabulary - its scope names, rule names, token keys, mode
 * constants, faces - and reports which constructs that vocabulary mentions.
 *
 * WHY A VOCABULARY AND NOT THE WHOLE FILE. Every one of these files is heavily
 * commented, and the comments name constructs the file does not implement (the
 * one in `highlightjs/carve.js` explaining why a rule is NOT there, for
 * instance). Scanning the source text would report those as coverage. The
 * vocabulary is the set of names the surface gives to things it actually
 * scopes, so a hit means a rule exists.
 *
 * WHAT A HIT IS AND IS NOT. A hit says the surface has a rule NAMED for the
 * construct. It does not say the rule is correct, and it says nothing at all
 * about the second axis - whether the construct keeps its payload inert. That
 * is why the ledger (`tests/lib/construct-ledger.json`) is the authority and
 * this is the instrument: the probe seeds and re-checks the ledger's
 * IMPLEMENTED claims for the four surfaces that live in this repo, and the
 * ledger records what a human measured for the six that do not.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/**
 * The ten surfaces Carve's syntax lives on.
 *
 * `local: true` means the files are in THIS repo, so CI can re-probe them on
 * every run. The other six are read from a checkout whose path comes from the
 * matching `CARVE_SURFACE_*` environment variable; without it they are not
 * probed and the ledger's recorded rows stand.
 */
export const SURFACES = {
    textmate: {
        repo: 'markup-carve/carve-grammars',
        local: true,
        files: ['textmate/carve.tmLanguage.json'],
        extract: 'tmlanguage',
    },
    prism: {
        repo: 'markup-carve/carve-grammars',
        local: true,
        files: ['prism/carve.js'],
        extract: 'prism',
    },
    highlightjs: {
        repo: 'markup-carve/carve-grammars',
        local: true,
        files: ['highlightjs/carve.js'],
        extract: 'hljs',
    },
    tiptap: {
        repo: 'markup-carve/carve-grammars',
        local: true,
        files: ['tiptap/schema-map.json', 'tiptap/carve-kit.js', 'tiptap/carve-to-pm.js'],
        extract: 'tiptap',
    },
    'tree-sitter-carve': {
        repo: 'markup-carve/tree-sitter-carve',
        files: ['src/grammar.json', 'src/node-types.json'],
        extract: 'treesitter',
    },
    'vscode-carve': {
        repo: 'markup-carve/vscode-carve',
        files: ['syntaxes/carve.tmLanguage.json'],
        extract: 'tmlanguage',
    },
    'intellij-carve': {
        repo: 'markup-carve/intellij-carve',
        files: ['src/main/resources/textmate/carve.tmLanguage.json'],
        extract: 'tmlanguage',
    },
    'sublime-carve': {
        repo: 'markup-carve/sublime-carve',
        files: ['Carve.sublime-syntax'],
        extract: 'sublime',
    },
    'vim-carve': {
        repo: 'markup-carve/vim-carve',
        files: ['syntax/carve.vim'],
        extract: 'vim',
    },
    'emacs-carve': {
        repo: 'markup-carve/emacs-carve',
        files: ['carve-mode.el'],
        extract: 'emacs',
    },
};

/** The environment variable naming a checkout of a surface that is not in this repo. */
export const rootVariable = (id) => `CARVE_SURFACE_${id.toUpperCase().replace(/-/g, '_')}`;

/*
 * The sections of `tiptap/schema-map.json` that DECLARE a modeled type.
 *
 * The file has an anti-list as well: `unmapped` names the constructs the bridge
 * does NOT model and says why ("smart-typography output is lossy on reparse, so
 * it is not modeled"). Walking the whole document read those keys as
 * vocabulary, so nine constructs - the eight smart-typography ones and
 * `soft_break` - were seeded IMPLEMENTED on the strength of an entry saying
 * they are not (carve-grammars#314).
 *
 * This is the carve-grammars#311 over-read surviving a narrowing: that round
 * stopped reading the prose VALUES, and the same sentences were still reaching
 * the vocabulary as KEYS. Naming the modeled sections is what closes it, and it
 * closes it structurally - a new section is not read until someone says it
 * declares types.
 */
const MODELED_TIPTAP_SECTIONS = ['types', 'preservationNodes', 'markCarrierNodes'];

/*
 * VOCABULARY EXTRACTORS, one per grammar formalism.
 *
 * Each returns the names the surface gives to what it scopes. They are
 * deliberately dumb string scans: a parser for six formalisms would be a
 * bigger maintenance surface than the thing it measures, and a name is all
 * that is wanted.
 */
const EXTRACTORS = {
    /** TextMate: every `name` / `contentName` scope plus the repository keys. */
    tmlanguage(text) {
        const out = [];
        const walk = (node) => {
            if (Array.isArray(node)) {
                node.forEach(walk);
            } else if (node && typeof node === 'object') {
                for (const [key, value] of Object.entries(node)) {
                    if ((key === 'name' || key === 'contentName') && typeof value === 'string') out.push(value);
                    walk(value);
                }
            }
        };
        const grammar = JSON.parse(text);
        walk(grammar);
        out.push(...Object.keys(grammar.repository || {}));

        return out;
    },

    /** Prism: the token keys of the language definition, plus every `alias`. */
    prism(text) {
        return [
            ...text.matchAll(/^[ \t]{4,}'?([A-Za-z][\w-]*)'?:/gm),
            ...text.matchAll(/alias:\s*'([^']+)'/g),
        ].map((match) => match[1]);
    },

    /** highlight.js: the mode constants. The modes carry no names of their own. */
    hljs(text) {
        return [...text.matchAll(/\b(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\b/g)].map((match) => match[1]);
    },

    /*
     * Tiptap: the schema map's keys and its IDENTIFIER-shaped values - the Carve
     * AST type on one side, the ProseMirror node or mark name on the other.
     *
     * Identifier-shaped is the whole rule, and it is not cosmetic. The map also
     * carries prose - an `about`, an `attributeNaming` essay, a `note` per
     * entry - and taking every string value read those as vocabulary. The note
     * "smart-typography output is lossy on reparse, so it is not modeled"
     * contains the word `typography`, so eight constructs seeded as IMPLEMENTED
     * on the strength of a sentence saying they are not. That is the same trap
     * the comment at the top of this file describes, walked into one extractor
     * later: a file's prose names the constructs it does NOT have.
     */
    tiptap(text, file) {
        if (file.endsWith('.json')) {
            const flat = [];
            const identifier = /^[A-Za-z_][\w-]*$/;
            const walk = (node) => {
                if (Array.isArray(node)) return node.forEach(walk);
                if (node && typeof node === 'object') {
                    for (const [key, value] of Object.entries(node)) {
                        flat.push(key);
                        walk(value);
                    }
                } else if (typeof node === 'string' && identifier.test(node)) {
                    flat.push(node);
                }
            };
            const map = JSON.parse(text);
            for (const section of MODELED_TIPTAP_SECTIONS) walk(map[section]);

            return flat;
        }

        // `name: 'carveAdmonition'` in an extension, `case 'admonition':` in the converter.
        return [
            ...text.matchAll(/\bname:\s*'([A-Za-z][\w-]*)'/g),
            ...text.matchAll(/\bcase\s+'([a-z][\w-]*)':/g),
        ].map((match) => match[1]);
    },

    /*
     * tree-sitter: the rule names, the EXTERNAL token names, and the node types
     * the generated parser actually emits.
     *
     * Reading `rules` alone under-read the grammar by 150 names
     * (carve-grammars#314). Two whole categories of name live outside it:
     *
     *   EXTERNALS. Anything the external scanner produces is declared in
     *   `externals` and has no entry in `rules` - which on this grammar is
     *   where `hard_line_break` and every list marker are.
     *
     *   ALIASED AND INLINED NODES. `node-types.json` is the generated parser's
     *   own statement of what it puts in a tree, so a rule that reaches the
     *   tree under another name appears there and nowhere else - `paragraph`,
     *   `list_item`, `table_cell`, `line_block_marker`, `trailing_comment`.
     *
     * The widening is BY STRUCTURE, not by loosening what counts as a name:
     * each of the three sources is a list of identifiers the grammar declares,
     * and `node-types.json` is filtered to `named: true` so the anonymous
     * literal tokens (`X`, `_`, `TODO`) stay out. That discipline is the
     * lesson of carve-grammars#311, where reading every string in a file
     * seeded eight constructs off a sentence saying they are NOT modeled.
     */
    treesitter(text, file) {
        const doc = JSON.parse(text);

        if (file.endsWith('node-types.json')) {
            const out = [];
            const walk = (node) => {
                if (Array.isArray(node)) return node.forEach(walk);
                if (node && typeof node === 'object') {
                    if (typeof node.type === 'string' && node.named === true) out.push(node.type);
                    Object.values(node).forEach(walk);
                }

                return undefined;
            };
            walk(doc);

            return out;
        }

        return [
            ...Object.keys(doc.rules || {}),
            ...(doc.externals || []).map((token) => token.name).filter(Boolean),
        ];
    },

    /*
     * Sublime: every `scope:` / `meta_scope:` value, every NUMBERED CAPTURE
     * scope, and every context name.
     *
     * The captures were the under-read (carve-grammars#314). A
     * `.sublime-syntax` puts a scope on a whole match with `scope:` and on one
     * group of it with `captures: {1: ...}`, and this file uses the second form
     * 357 times - which is where `markup.bold.italic.carve`,
     * `markup.strikethrough.carve` and `constant.other.reference.crossref.carve`
     * live. Reading only `scope:` reported those constructs as having no rule.
     *
     * The capture pattern stops at whitespace on purpose: a scope value is one
     * identifier, and letting it run to end of line would join two scopes into
     * a name that is neither.
     */
    sublime(text) {
        return [
            ...text.matchAll(/(?:meta_scope|meta_content_scope|scope):\s*([A-Za-z0-9_.\- ]+)/g),
            ...text.matchAll(/^\s+\d+:\s*([A-Za-z0-9_.-]+)/gm),
            ...text.matchAll(/^ {2}([a-z0-9_-]+):/gm),
        ].map((match) => match[1]);
    },

    /** Vim: the `carveXxx` syntax group names. */
    vim(text) {
        return [...text.matchAll(/\bcarve[A-Z][A-Za-z0-9]*/g)].map((match) => match[0]);
    },

    /*
     * Emacs: the faces, plus the FIRST line of each comment block.
     *
     * The faces alone are far too coarse - one `carve-markup-face' carries a
     * dozen constructs - so the comment above each font-lock entry is the only
     * per-rule name the file has, and its first line is the header ("ATX
     * headings.", "Images: ![alt](src)", "Inline math: $`...`"). The rest of
     * the block is explanation, and explanation names constructs the rule does
     * NOT cover - the trap the Tiptap extractor above walked into, so taking
     * only the first line is the point rather than tidiness. This is still the
     * loosest of the ten extractors, which is why the emacs rows carry the
     * commit they were read at.
     */
    emacs(text) {
        const table = text.slice(text.indexOf(';;;; Font-lock keywords'));
        const headers = [];
        let inComment = false;
        for (const line of table.split('\n')) {
            const comment = line.match(/^\s*;;+\s*(.+)$/);
            if (comment && !inComment) headers.push(comment[1].trim());
            inComment = Boolean(comment);
        }

        return [...[...text.matchAll(/\(defface\s+(carve-[a-z-]+)/g)].map((match) => match[1]), ...headers];
    },
};

/**
 * The words of a name, in order, lowercased.
 *
 * `markup.underline.link.carve` and `carveLinkRefDef` are both sequences of
 * words; the separators differ and camelCase has none at all, so the split is
 * on non-alphanumerics AND on a lower-to-upper transition.
 *
 * @param {string} text - A name from a surface's vocabulary.
 * @returns {string[]} The words.
 */
const words = (text) => text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

/** Lowercase and drop the separators, so `code_block`, `code-block` and `code.block` all meet. */
export const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * The offsets in `normalize(text)` at which a word of `text` begins.
 *
 * @param {string} text - A name from a surface's vocabulary.
 * @returns {Set<number>} The offsets.
 */
const wordStarts = (text) => {
    const starts = new Set();
    let at = 0;
    for (const word of words(text)) {
        starts.add(at);
        at += word.length;
    }

    return starts;
};

/**
 * Whether `signature` occurs in `entry.norm` starting at a word boundary.
 *
 * @param {{norm: string, starts: Set<number>}} entry - A vocabulary entry.
 * @param {string} signature - A normalized signature.
 * @returns {boolean} True when some occurrence begins a word.
 */
const alignedHit = (entry, signature) => {
    for (let at = entry.norm.indexOf(signature); at !== -1; at = entry.norm.indexOf(signature, at + 1)) {
        if (entry.starts.has(at)) return true;
    }

    return false;
};

/*
 * Construct -> the names a surface plausibly gives it, normalized on lookup.
 *
 * One table for all ten surfaces rather than ten tables: the surfaces really do
 * converge on the same words, and a per-surface table would be ten hand-written
 * lists - the artifact carve-grammars#284 exists to stop maintaining.
 *
 * A construct with NO signatures here is one no surface has a name for; the
 * test below requires the table to be total over the derived list, so a new
 * construct arriving in the grammar fails until someone decides what it would
 * be called.
 */
export const SIGNATURES = {
    // Blocks.
    heading: ['heading', 'section', 'atx'],
    thematic_break: ['thematicbreak', 'carverule', 'horizontalrule'],
    code_block: ['codeblock', 'fencedcode', 'codefence', 'fencedblock'],
    blockquote: ['blockquote', 'markupquote', 'quotecarve', 'blockquotes'],
    unordered_list: ['listunnumbered', 'listdash', 'liststar', 'listbullet', 'unorderedlist', 'bulletlist'],
    ordered_list: ['listnumbered', 'listdecimal', 'listlower', 'listupper', 'listnumber', 'orderedlist'],
    definition_list: ['definitionlist', 'listdefinition', 'defterm', 'deflist', 'definitionterm', 'listitemdefinition'],
    table: ['table'],
    line_block: ['lineblock'],
    local_hard_break_block: ['localhardbreak', 'hardbreakblock'],
    figure_group: ['figuregroup'],
    admonition: ['admonition'],
    div: ['div'],
    comment_block: ['commentblock', 'fencedcomment', 'blockcomment', 'commentsblock'],
    /*
     * `linecomment` is a substring of `inlinecomment`, so on the surfaces that
     * call the trailing `%%` run `inline-comment` this construct used to be
     * seeded with the INLINE rule's name as its evidence - a row citing a rule
     * that is about the other construct. What separates them now is the
     * word-boundary rank in `probe` below, not a narrower signature: `line` is
     * a whole word of `comment.line.percent.carve` and only half a word of
     * `inline-comment`.
     */
    comment_line: ['commentline', 'linecomment', 'commentlinepercent'],
    raw_block: ['rawblock'],
    reference_definition: ['referencedefinition', 'linkreferencedefinition', 'refdef', 'referencedef'],
    footnote_definition: ['footnotedefinition', 'footdef', 'footnotedef', 'footnotecontent'],
    abbreviation_definition: ['abbreviation', 'abbr'],
    /*
     * `textcarve` is in WHOLE_NAME_ONLY below. Sublime names the default scope
     * `text.carve` and that IS this construct's only name there; on the three
     * TextMate surfaces the same letters are the TAIL of
     * `markup.underline.text.carve`, the UNDERLINE rule, and they align to a
     * word there - so the word-boundary rank cannot separate them and all
     * three cited the underline rule as the evidence for a paragraph.
     */
    paragraph: ['paragraph', 'textcarve'],
    block_attributes: ['blockattr', 'blockattribute', 'metaattributes', 'attributes'],
    blank_line: ['blankline', 'emptyline'],

    // Inlines.
    escaped_char: ['escape', 'backslashescape'],
    raw_inline: ['rawinline'],
    literal_inline: ['inlineliteral', 'literalinline', 'markuprawinlineliteral'],
    /*
     * `codeinline` is the TextMate family's own key for the INLINE rule, and it
     * was missing: the only signature that reached that surface was
     * `markuprawcode`, which is `markup.raw.code.carve` - the fenced code
     * BLOCK's `contentName`. So this row cited the block's payload scope as the
     * rule for the inline span, one construct over, while `code_inline` sat in
     * the vocabulary unread. `markuprawcode` stays because a surface may really
     * name its inline rule that way, but it now loses to the exact name.
     */
    code_span: ['codespan', 'inlinecode', 'codeinline', 'markuprawcode', 'carvecode', 'codecarve', 'verbatim'],
    autolink: ['autolink'],
    auto_text_link: ['autotextlink', 'crossref', 'crossreference'],
    inline_link: ['inlinelink', 'linkinline', 'carvelink', 'markupunderlinelinkcarve', 'link'],
    reference_link: ['referencelink', 'fullreferencelink', 'linkreference', 'linkref'],
    collapsed_reference_link: ['collapsedreferencelink', 'collapsedlink'],
    inline_span: ['span'],
    inline_image: ['inlineimage', 'image'],
    // `imageref` is the TextMate family's spelling, the way `linkref` is on
    // `reference_link` above.
    reference_image: ['referenceimage', 'fullreferenceimage', 'imageref'],
    collapsed_reference_image: ['collapsedreferenceimage', 'collapsedimage'],
    math_inline: ['mathinline', 'inlinemath'],
    math_display: ['mathdisplay', 'blockmath', 'mathblock', 'displaymath'],
    emphasis: ['emphasis', 'italic'],
    strong: ['strong', 'bold'],
    bold_italic: ['bolditalic'],
    underline: ['underline'],
    strikethrough: ['strikethrough', 'strike'],
    highlight: ['highlight'],
    forced_emphasis: ['forcedemphasis', 'forceditalic'],
    forced_strong: ['forcedstrong', 'forcedbold'],
    forced_underline: ['forcedunderline'],
    forced_strike: ['forcedstrike'],
    /*
     * `superscript` and `subscript` are the right names, not a lucky fold.
     * Carve has NO bare `^x^` / `,x,` spelling - sup and sub are braced-only -
     * so a rule a surface calls `superscript` can only be `{^ ... ^}`, and
     * there is no sibling construct for the name to be confused with. The five
     * constructs below are the ones where that is not true.
     */
    forced_super: ['superscript', 'forcedsuper'],
    forced_sub: ['subscript', 'forcedsub'],
    forced_highlight: ['forcedhighlight', 'bracedhighlight'],
    reference_footnote: ['footnotereference', 'footnoteref', 'footref', 'otherfootnote'],
    inline_footnote: ['inlinefootnote', 'footnoteinline', 'noteinline', 'inlinenote', 'footinline'],
    extension_inline: ['extension'],
    addition: ['inserted', 'insert', 'criticins', 'addition'],
    deletion: ['deleted', 'delete', 'criticdel', 'deletion'],
    substitution: ['substitution', 'changed', 'criticsub'],
    editorial_comment: [
        'editorialcomment', 'criticcom', 'commentcritic', 'criticcomment',
        // `comment.block.critic.carve`, the scope the TextMate family gives it.
        'commentblockcritic',
    ],
    mention: ['mention'],
    /*
     * `tag` bare, alongside the compounds. Two surfaces have a rule named
     * exactly `tag` and read as gaps for want of it. It is the shortest
     * signature in this table and the one most able to land somewhere else -
     * what keeps it honest is the ranking in `probe`: a signature that IS the
     * whole name outranks one buried in a longer one, so a vocabulary holding
     * both `tag` and `entity.name.tag.admonition.carve` cites the first.
     */
    tag: ['tag', 'symboltag', 'carvetag', 'tagcarve', 'hashtag', 'mentionstags'],
    symbol: ['symbol'],
    /*
     * The eight smart-typography constructs share one signature set on purpose.
     * The grammar lists them separately, and tree-sitter really does have a rule
     * per shape - but every highlighter here folds the whole family into a
     * single `typography` / `smart_punctuation` rule, so that one name IS the
     * evidence for each of the eight. A signature narrow enough to name only
     * `arrow` matched `NO_ARROW_AHEAD`, a lookahead that belongs to the
     * substitution rule: narrower was not more accurate, it was wrong.
     */
    em_dash: ['emdash', 'typography', 'smarttypography', 'smartpunctuation'],
    en_dash: ['endash', 'typography', 'smarttypography', 'smartpunctuation'],
    braced_en_dash: ['bracedendash', 'typography', 'smarttypography', 'smartpunctuation'],
    ellipsis: ['ellipsis', 'typography', 'smarttypography', 'smartpunctuation'],
    smart_quote: ['smartquote', 'quotationmarks', 'smartquotes', 'typography', 'smarttypography', 'smartpunctuation'],
    arrow: ['smartarrow', 'typography', 'smarttypography', 'smartpunctuation'],
    comparison: ['comparison', 'typography', 'smarttypography', 'smartpunctuation'],
    typographic_symbol: ['typographicsymbol', 'typography', 'smarttypography', 'smartpunctuation'],
    /*
     * `trailingcomment` is what this construct is called nearly everywhere: the
     * spec's `inline_comment` is `%%` to end of line ATTACHED to content, and
     * six surfaces name that rule `trailing-comment` / `trailing_comment`. It
     * was on `comment_line` above, where it matched nothing, while the
     * construct that has it read as a gap.
     */
    inline_comment: ['inlinecomment', 'commentinline', 'trailingcomment'],
    braced_comment: ['bracedcomment', 'commentblockinline', 'delimitedcomment'],
    hard_break: ['hardbreak', 'hardlinebreak'],
    soft_break: ['softbreak'],
};

/*
 * SIGNATURES THAT ONLY COUNT AS THE WHOLE NAME.
 *
 * A TextMate scope is a dotted PATH, and every scope in the Carve grammars ends
 * in `.carve`. A signature that ends in `carve` therefore matches the TAIL of
 * any scope whose second-to-last segment happens to be its first - and the tail
 * of a path says nothing about what the whole path names. `textcarve` matched
 * `markup.underline.text.carve` that way, at a word boundary, so the ranking
 * added in carve-grammars#315 could not see it: three surfaces cited the
 * UNDERLINE rule as the evidence that they scope a paragraph.
 *
 * A signature listed here is a hit only when it IS the whole name, which is the
 * one reading that cannot be about a longer name's tail. It is deliberately a
 * short list: the general case is that a compound scope really does name the
 * construct one of its segments names.
 */
const WHOLE_NAME_ONLY = new Set(['textcarve']);

/*
 * WHERE ONE SURFACE CALLS A FAMILY BY ONE NAME.
 *
 * Prism's grammar is a flat map of token names and it is deliberately coarser
 * than the others: one `list` token for both list kinds, one `comment` for all
 * four comment shapes, one `math`, one `url` for links and autolinks, `title`
 * for headings. Those are real rules under a name the shared table cannot
 * guess, and calling them gaps would fill the ledger with rows that are not
 * defects - the noise the ruling on carve-grammars#284 says gets a check muted.
 *
 * This is a per-surface NAMING table, not a per-surface construct list: it says
 * what this surface calls a construct, never which constructs exist. When a
 * new construct lands in the grammar it is still unclassified everywhere until
 * someone says so.
 */
const SIGNATURE_OVERRIDES = {
    prism: {
        heading: ['title'],
        unordered_list: ['list'],
        ordered_list: ['list'],
        /*
         * ONE `div` RULE FOR EVERY `:::` CONTAINER. Read off `prism/carve.js`:
         * the opener is `(:{3,})(?:[ \t]*(?:\||\\)|[ \t]*[a-zA-Z_][\w-]*...)`,
         * so the admonition's kind word and the two layout tokens are branches
         * of one alternation, and `div-delimiter`'s `class-name` scopes all
         * three the same way. `figure-group` is the one container this file
         * splits out, because the clause makes a bare `::: figure` a different
         * production.
         */
        admonition: ['div'],
        line_block: ['div'],
        local_hard_break_block: ['div'],
        /*
         * A RAW BLOCK IS A CODE FENCE WITH AN `=FORMAT` INFO STRING, and this
         * grammar's `code-block` opener takes the info string as `[^\n]{0,512}`
         * - so ```` ```=html ```` opens the same block ```` ```js ```` does,
         * with the same inert body. highlight.js gave the raw block a rule of
         * its own in carve-grammars#313; here it is the code fence's own
         * shape and there is nothing separate to name.
         */
        raw_block: ['codeblock'],
        /*
         * ONE DEFINITION RULE for both definition shapes: the pattern is
         * `\[[^\]]+\]: +\S+`, and a footnote label is `^a` - a bracketed run
         * like any other - so `[^a]: note` is the same match as `[r]: /url`.
         * The same fold this file makes for the four comment shapes.
         */
        footnote_definition: ['referencedefinition'],
        comment_block: ['comment'],
        comment_line: ['comment'],
        inline_comment: ['comment'],
        braced_comment: ['comment'],
        math_inline: ['math'],
        math_display: ['math'],
        code_span: ['code'],
        literal_inline: ['literal'],
        autolink: ['url'],
        inline_link: ['url'],
        reference_link: ['url'],
        /*
         * The `url` rule's reference alternative reads
         * `\[text\]\[[^\]]{0,512}\]`, and the `{0,512}` accepts the EMPTY
         * label - the same fold vim-carve and sublime-carve make, recorded in
         * carve-grammars#318.
         */
        collapsed_reference_link: ['url'],
        /*
         * ... and the same fold one construct over: `reference-image` closes on
         * `[^\]]{0,512}`, so the collapsed image is that rule with an empty
         * label. Until carve-grammars#307 both image rows claimed a fold onto
         * `image`, which needs a `](` and matches neither - two rows reading
         * IMPLEMENTED on a rule that cannot fire for them.
         */
        collapsed_reference_image: ['referenceimage'],
        reference_footnote: ['footnote'],
        forced_highlight: ['highlight'],
        tag: ['tag'],
    },
    /*
     * The TextMate grammar in this repository folds four `:::` containers into
     * one `admonition` rule and both maths into one `math_inline` rule, and
     * takes the empty reference label the way vim-carve and sublime-carve do
     * (carve-grammars#318). Read off `textmate/carve.tmLanguage.json` rather
     * than guessed:
     *
     *   `admonition` opens on a colon run followed by EITHER a layout token
     *   (`|` or a backslash) OR a kind word, and both land in capture groups
     *   named `entity.name.tag.admonition.carve` - so `::: |`, the local
     *   hard-break block, `::: note` and a bare `:::` are branches of one
     *   alternation.
     *
     *   `fenced_code` takes its info string as an optional `=` and then a word;
     *   the optional `=` is there for the raw block and nothing else.
     *
     *   `math_inline` opens on one or two dollar signs, so the display form is
     *   the same rule.
     *
     *   `link_ref` closes on a bracket pair whose body is starred, and the star
     *   accepts the empty label.
     *
     *   `highlight` is two match rules in one repository entry, the first of
     *   them the braced spelling.
     */
    textmate: {
        div: ['admonition'],
        line_block: ['admonition'],
        local_hard_break_block: ['admonition'],
        raw_block: ['fencedcode'],
        math_display: ['mathinline'],
        collapsed_reference_link: ['linkref'],
        /* `image_ref` closes on the same starred bracket pair `link_ref` does. */
        collapsed_reference_image: ['imageref'],
        forced_highlight: ['highlight'],
    },
    /*
     * The VS Code grammar makes the same three folds its sibling in this
     * repository does, under its own spellings, and puts all four braced
     * emphasis shapes in one `forced-emphasis` context the way sublime-carve
     * does. Read off `syntaxes/carve.tmLanguage.json`:
     *
     *   the generic `divs` pattern takes the kind word as a run of
     *   non-space, non-brace, non-bracket, non-quote characters, which is the
     *   `|` and the layout backslash as readily as `note` - all three come back
     *   `entity.name.type.div.carve`;
     *
     *   `meta.link.reference.carve` closes on a bracket pair whose body is
     *   starred, the empty-label fold carve-grammars#318 recorded for
     *   sublime-carve under this very scope name;
     *
     *   `forced-emphasis` holds the braced strong, emphasis, underline and
     *   strike rules, whose SCOPES are the bare spellings' so a colour scheme
     *   lights them up - which leaves the context name as their only
     *   vocabulary.
     */
    'vscode-carve': {
        admonition: ['div'],
        line_block: ['div'],
        local_hard_break_block: ['div'],
        collapsed_reference_link: ['metalinkreference'],
        /*
         * The braced highlight joined `forced-emphasis` in
         * markup-carve/vscode-carve#151, so all five braced spellings are that
         * one context and all five answer to its name. Without this the row
         * seeds UNMEASURED off the bare `highlight`, which is a different rule.
         */
        forced_strong: ['forcedemphasis'],
        forced_underline: ['forcedemphasis'],
        forced_strike: ['forcedemphasis'],
        forced_highlight: ['forcedemphasis'],
        /*
         * `meta.image.reference.carve` closes on a starred bracket pair, so the
         * collapsed image is that rule with an empty label - the same fold this
         * table already records for the collapsed LINK one line up, and the one
         * `textmate` and `prism` make under their own names.
         */
        collapsed_reference_image: ['metaimagereference'],
    },
    /*
     * highlight.js calls the block-attribute rule `ATTRIBUTE`, singular. The
     * shared table has `attributes` and cannot reach it, and the singular does
     * not belong in the shared table: on Tiptap it lands on `attributeNaming`,
     * a key holding an ESSAY about attribute naming rather than a rule - the
     * carve-grammars#311 over-read, one signature later.
     */
    highlightjs: {
        block_attributes: ['attribute'],
        /*
         * FIVE FOLDS, read off `highlightjs/carve.js` in carve-grammars#317.
         * Each row read GAP because the shared table cannot reach the name,
         * not because the rule is missing.
         *
         *   DIV_BLOCK's opener takes the layout tokens and the kind word as
         *   branches of ONE alternation - a colon run, then either a pipe or a
         *   backslash, or an identifier with its optional title and label - so
         *   `::: note` and `::: \` are that mode. It is the fold
         *   `prism`, `textmate` and `vscode-carve` already record under
         *   their own spellings.
         *
         *   `line_block` is here for the same reason and did NOT read GAP: it
         *   cited a mode called LINE_BLOCK whose opener is a bare `| ` line,
         *   which Carve renders as a paragraph - a line block opens on a COLON
         *   FENCE. That mode is now PIPE_LED_LINE, after what it matches, and
         *   the row cites the container that really scopes `::: |`.
         *
         *   REFERENCE_LINK closes on a second bracket pair whose body is
         *   starred, and the star accepts the EMPTY label, so `[text][]` is
         *   that rule - the carve-grammars#318 fold, one surface over.
         *
         *   LINE_COMMENT opens on a `%%` run at a line start OR after
         *   whitespace, so the trailing comment attached to content is the same
         *   mode as the `%%` line. vim-carve records this exact fold for the
         *   same two constructs.
         *
         *   RAW_FORMAT is the `{=FORMAT}` marker, which only a raw inline
         *   carries; INLINE_CODE scopes the backticked run beside it, so the
         *   construct is fully scoped by two modes and this is the one named
         *   for it. The marker rule is not guarded on a preceding code span, so
         *   a bare `{=html}` in prose scopes too - an over-colour this row
         *   records rather than introduces.
         */
        admonition: ['divblock'],
        line_block: ['divblock'],
        local_hard_break_block: ['divblock'],
        collapsed_reference_link: ['referencelink'],
        inline_comment: ['linecomment'],
        raw_inline: ['rawformat'],
        /*
         * ... and the same empty-label fold one construct over: REFERENCE_IMAGE
         * closes on a starred label too, so the collapsed image is that rule
         * with nothing between its second brackets. `prism`, `textmate` and
         * `vscode-carve` each record this under their own name for the
         * reference image.
         */
        collapsed_reference_image: ['referenceimage'],
    },
    /*
     * Tiptap's map is keyed by CARVE AST type, and three of its entries carry
     * two spec constructs each - the map says so itself. `code` is the inline
     * code mark; `math` is one node with a `display` attr "for the `$$` form";
     * `comment` is one node whose "block attr distinguishes %% line comments
     * from fenced comments". The shared table cannot guess `code` or `math`
     * bare without landing on half the vocabulary of the other nine surfaces.
     */
    tiptap: {
        code_span: ['code'],
        math_inline: ['math'],
        math_display: ['math'],
        comment_line: ['carvecomment'],
        comment_block: ['carvecomment'],
        /*
         * The fourth comment shape rides the same node: the braced comment
         * parses to a `comment` whose `delimited` attr is what tells it from
         * the other three, exactly as `block` tells the line comment from the
         * fence. The map says so in its own note on the entry.
         */
        braced_comment: ['carvecomment'],
        /*
         * The local hard-break block is a `div` carrying `class="hardbreaks"`
         * in the engine's own AST - it has no type of its own, unlike the line
         * block, which does. So the bridge models it as the div it is.
         */
        local_hard_break_block: ['div'],
        /*
         * The combined bold-italic spelling is not a type either: the engine
         * emits an `emphasis` mark INSIDE a `strong` mark, and the map carries
         * both. The row cites the outer one, the way `math_inline` and
         * `math_display` both cite `math`.
         */
        bold_italic: ['strong'],
        /*
         * A REFERENCE IS RESOLVED BEFORE THE BRIDGE SEES IT. All three link
         * spellings arrive as a `link` and all three image spellings as an
         * `image` - an unresolved one keeps `carveRef` / `carveRawRef` on the
         * same node - so the reference forms have no separate type to name.
         * `carveLinkRefDef` is the DEFINITION line, a different construct, and
         * it was this row's evidence until now.
         */
        reference_link: ['link'],
        collapsed_reference_link: ['link'],
        reference_image: ['image'],
        collapsed_reference_image: ['image'],
        /*
         * The braced emphasis spellings are the bare ones' marks: the braced
         * and bare strong are both a `strong`, so one mark implements both
         * constructs - the fold `INDISTINGUISHABLE` below cannot decide from a
         * name, and tree-sitter-carve records the same thing for the same
         * reason.
         */
        forced_emphasis: ['emphasis'],
        forced_strong: ['strong'],
        forced_underline: ['underline'],
        forced_strike: ['strike'],
        forced_highlight: ['highlight'],
    },
    /*
     * The Vim syntax names five constructs in its own spelling, and folds two
     * pairs into one rule each. Read off `syntax/carve.vim` rather than
     * guessed:
     *
     *   `carveComment` is `/%%.*$/` with no anchor, so it is the `%%` LINE
     *   comment and the trailing one at once - the same fold Prism makes under
     *   the name `comment`. Naming it for both is what stops the ledger citing
     *   `carveCommentInline` for `inline_comment`, which it did: that rule is
     *   the BRACED `{% ... %}` comment, so the row named a rule about another
     *   construct while the braced row read as a gap.
     *
     *   `carveLinkRef` is `/\[[^]]*\]/`, whose star accepts the EMPTY label,
     *   so the full and collapsed reference links are one rule.
     *
     *   `carveSuper`, `carveSub` and `carveExtInline` are the same constructs
     *   the shared table knows under their longer spellings.
     */
    'vim-carve': {
        comment_line: ['carvecomment'],
        inline_comment: ['carvecomment'],
        braced_comment: ['carvecommentinline'],
        collapsed_reference_link: ['carvelinkref'],
        forced_super: ['carvesuper'],
        forced_sub: ['carvesub'],
        extension_inline: ['extinline'],
    },
    /*
     * The Sublime syntax puts all four braced emphasis spellings in ONE
     * context, `forced-emphasis` - `{*x*}`, `{/x/}`, `{_x_}` and `{~x~}` are
     * four `match:` rules inside it - and the braced highlight `{=x=}` is the
     * first rule of `highlight`. Their SCOPES are deliberately the same as the
     * bare spellings' so a color scheme lights them up, so the context name is
     * the only vocabulary they have, and one name cannot carry four constructs
     * through the shared table. Recorded here rather than by splitting the
     * contexts on the surface: the rules are right, only the instrument could
     * not see them.
     *
     * `meta.link.reference.carve` is the same empty-label fold as Vim's - the
     * rule reads `(\[)([^\]]+)(\])(\[)([^\]]*)(\])`, and the second
     * bracket's star is what makes `[text][]` the same rule as `[text][ref]`.
     */
    'sublime-carve': {
        collapsed_reference_link: ['metalinkreference'],
        forced_strong: ['forcedemphasis'],
        forced_underline: ['forcedemphasis'],
        forced_strike: ['forcedemphasis'],
        forced_highlight: ['highlight'],
    },
    /*
     * tree-sitter folds each bare emphasis spelling and its braced twin into
     * one rule, so the braced constructs have no name of their own. This is
     * not a guess about the surface: `src/grammar.json` gives
     * `emphasis_begin` as `choice("{/", seq("/", _non_whitespace_check))`, and
     * `strong_begin`, `underline_begin`, `strikethrough_begin` and
     * `highlighted_begin` have the same shape with their own delimiters. The
     * `{` branch IS the forced spelling, so the rule implements both.
     *
     * Recorded here rather than in the shared table because it is a fact about
     * THIS grammar. On a surface that has not been read, the same shape is
     * undecidable from a name, and `INDISTINGUISHABLE` below says so out loud
     * instead of calling it a gap.
     */
    'tree-sitter-carve': {
        forced_emphasis: ['emphasisbegin'],
        forced_strong: ['strongbegin'],
        forced_underline: ['underlinebegin'],
        forced_strike: ['strikethroughbegin'],
        forced_highlight: ['highlightedbegin'],
    },
};

/*
 * WHERE A NAME CANNOT DECIDE THE QUESTION.
 *
 * Five constructs have a bare spelling and a braced one - `/x/` and `{/x/}` -
 * and the spec counts them as two constructs. A grammar may implement them as
 * two rules or as one rule with two openers, and BOTH look identical from the
 * outside: the vocabulary holds `emphasis` and nothing else either way. The
 * probe reads names, deliberately, so it cannot tell those apart.
 *
 * Reporting that as `GAP` is a claim the probe has not earned - it says "no
 * rule found" when the honest answer is "this instrument cannot see it". So a
 * construct listed here, on a surface that names its SIBLING but not it, is
 * seeded `UNMEASURED` with a ticket: visible, counted separately from the real
 * gaps, and closed by a human reading the rule's opener. carve-grammars#313
 * introduced the same shape for the payload axis (`payload: "unmeasured"`);
 * this is the recognition axis of it.
 *
 * `forced_super` and `forced_sub` are NOT here: Carve has no bare `^x^`, so a
 * rule named `superscript` can only be the braced one.
 */
export const INDISTINGUISHABLE = {
    forced_emphasis: 'emphasis',
    forced_strong: 'strong',
    forced_underline: 'underline',
    forced_strike: 'strikethrough',
    forced_highlight: 'highlight',
};

/**
 * The vocabulary of one surface.
 *
 * @param {string} id - A key of `SURFACES`.
 * @param {string} [root] - Checkout root; defaults to this repo for local surfaces.
 * @returns {Array<{raw: string, norm: string}>|null} The names, or null when the
 *   surface's checkout is not available.
 */
export function vocabulary(id, root = undefined) {
    const surface = SURFACES[id];
    if (!surface) throw new Error(`unknown surface ${id}`);
    const base = root ?? (surface.local ? repoRoot : process.env[rootVariable(id)]);
    if (!base) return null;

    const extract = EXTRACTORS[surface.extract];
    const names = [];
    for (const file of surface.files) {
        names.push(...extract(readFileSync(resolve(base, file), 'utf8'), file));
    }

    return names.map((raw) => ({ raw, norm: normalize(raw), starts: wordStarts(raw) }));
}

/**
 * The constructs a surface's vocabulary names.
 *
 * @param {string} id - A key of `SURFACES`.
 * @param {string} [root] - Checkout root.
 * @returns {Map<string, string>|null} Construct name -> the surface's own name for
 *   it, or null when the checkout is not available.
 */
export function probe(id, root = undefined) {
    const vocab = vocabulary(id, root);
    if (vocab === null) return null;

    /**
     * How well a name answers to a construct: lower is better.
     *
     * 0 - the name IS the construct's name (`abbreviation_definition`).
     * 1 - a signature is the whole name (`code`, `tag`).
     * 2 - a signature begins a word of it (`comment.line.percent.carve`).
     * 3 - every hit is mid-word (`linecomment` inside `inline-comment`).
     */
    const rank = (entry, construct, signatures) => {
        if (entry.norm === normalize(construct)) return 0;
        if (signatures.includes(entry.norm)) return 1;

        return signatures.some((signature) => !WHOLE_NAME_ONLY.has(signature) && alignedHit(entry, signature))
            ? 2
            : 3;
    };

    /*
     * A leading underscore marks a rule the surface keeps to itself -
     * tree-sitter hides such a rule from the tree, and the same spelling reads
     * as private everywhere else. It is still a name the grammar gives the
     * construct, so it still counts as a hit: `_smart_punctuation` is the only
     * name that grammar has for four typography constructs, and dropping
     * hidden names outright turned six answered rows back into gaps. It is
     * only ever the LAST candidate, so `link_reference_definition` is cited
     * rather than the shorter `_link_ref_def_label_end`.
     */
    const hidden = (entry) => (entry.raw.startsWith('_') ? 1 : 0);

    const overrides = SIGNATURE_OVERRIDES[id] || {};
    const found = new Map();
    for (const [construct, shared] of Object.entries(SIGNATURES)) {
        const signatures = [...shared, ...(overrides[construct] || [])].map(normalize);

        /*
         * THE SHORTEST NAME IN THE WHOLE VOCABULARY THAT CARRIES ANY SIGNATURE.
         *
         * Matching is on a substring because these names are compound - a
         * TextMate scope is `markup.underline.link.carve`, a Sublime one is
         * `meta.link.inline.carve` - so an exact match would find nothing on
         * six of the ten surfaces. The cost is that a signature can land on a
         * longer, unrelated name, and taking the shortest is what keeps it from
         * doing so: `carvelink` matches Tiptap's `carveLinkRefDef`, a reference
         * DEFINITION, while the vocabulary also holds a plain `link` - and
         * signature order alone gave the wrong one, because `carvelink` is
         * tried before the bare `link`. Scoring across every signature at once
         * fixes the order dependency and picks the name a reader would cite.
         *
         * SHORTEST, BUT ONLY AFTER HOW WELL THE NAME FITS. Shortest alone
         * reaches INTO a word: `linecomment` is a substring of
         * `inline-comment`, which is shorter than
         * `comment.line.percent.carve`, so the block-level `%%` line was cited
         * as the trailing `%%` rule on three surfaces. `rank` below orders the
         * candidates - the construct's own name, then a signature that IS the
         * whole name, then one that begins a word of it, then a mid-word hit -
         * and length breaks the tie inside a rank. Nothing stops matching: a
         * mid-word hit is still a hit, it is just the last candidate rather
         * than the first.
         *
         * What backstops the rest is the `evidence` field: it goes in the
         * ledger, a reviewer sees it in the diff, and for the four surfaces in
         * this repository the test asserts the shipped grammar still carries
         * that exact string.
         */
        const hit = vocab
            .filter((entry) => signatures.some((signature) => (WHOLE_NAME_ONLY.has(signature)
                ? entry.norm === signature
                : entry.norm.includes(signature))))
            .sort((a, b) => rank(a, construct, signatures) - rank(b, construct, signatures)
                || hidden(a) - hidden(b)
                || a.raw.length - b.raw.length
                || a.raw.localeCompare(b.raw))[0];
        if (hit) found.set(construct, hit.raw);
    }

    return found;
}
