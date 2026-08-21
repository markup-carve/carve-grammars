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
        files: ['src/grammar.json'],
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
            walk(JSON.parse(text));

            return flat;
        }

        // `name: 'carveAdmonition'` in an extension, `case 'admonition':` in the converter.
        return [
            ...text.matchAll(/\bname:\s*'([A-Za-z][\w-]*)'/g),
            ...text.matchAll(/\bcase\s+'([a-z][\w-]*)':/g),
        ].map((match) => match[1]);
    },

    /** tree-sitter: the rule names of the compiled grammar. */
    treesitter(text) {
        return Object.keys(JSON.parse(text).rules || {});
    },

    /** Sublime: every `scope:` / `meta_scope:` value and every context name. */
    sublime(text) {
        return [
            ...text.matchAll(/(?:meta_scope|meta_content_scope|scope):\s*([A-Za-z0-9_.\- ]+)/g),
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

/** Lowercase and drop the separators, so `code_block`, `code-block` and `code.block` all meet. */
export const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '');

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
    comment_line: ['commentline', 'linecomment', 'trailingcomment'],
    raw_block: ['rawblock'],
    reference_definition: ['referencedefinition', 'linkreferencedefinition', 'refdef', 'referencedef'],
    footnote_definition: ['footnotedefinition', 'footdef', 'footnotedef', 'footnotecontent'],
    abbreviation_definition: ['abbreviation', 'abbr'],
    paragraph: ['paragraph', 'textcarve'],
    block_attributes: ['blockattr', 'blockattribute', 'metaattributes', 'attributes'],
    blank_line: ['blankline', 'emptyline'],

    // Inlines.
    escaped_char: ['escape', 'backslashescape'],
    raw_inline: ['rawinline'],
    literal_inline: ['inlineliteral', 'literalinline', 'markuprawinlineliteral'],
    code_span: ['codespan', 'inlinecode', 'markuprawcode', 'carvecode', 'codecarve'],
    autolink: ['autolink'],
    auto_text_link: ['autotextlink', 'crossref', 'crossreference'],
    inline_link: ['inlinelink', 'linkinline', 'carvelink', 'markupunderlinelinkcarve', 'link'],
    reference_link: ['referencelink', 'fullreferencelink', 'linkreference', 'linkref'],
    collapsed_reference_link: ['collapsedreferencelink', 'collapsedlink'],
    inline_span: ['span'],
    inline_image: ['inlineimage', 'image'],
    reference_image: ['referenceimage', 'fullreferenceimage'],
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
    forced_super: ['superscript', 'forcedsuper'],
    forced_sub: ['subscript', 'forcedsub'],
    forced_highlight: ['forcedhighlight', 'bracedhighlight'],
    reference_footnote: ['footnotereference', 'footnoteref', 'footref', 'otherfootnote'],
    inline_footnote: ['inlinefootnote', 'footnoteinline', 'noteinline', 'inlinenote', 'footinline'],
    extension_inline: ['extension'],
    addition: ['inserted', 'insert', 'criticins', 'addition'],
    deletion: ['deleted', 'delete', 'criticdel', 'deletion'],
    substitution: ['substitution', 'changed', 'criticsub'],
    editorial_comment: ['editorialcomment', 'criticcom', 'commentcritic', 'criticcomment'],
    mention: ['mention'],
    tag: ['symboltag', 'carvetag', 'tagcarve', 'hashtag', 'mentionstags'],
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
    inline_comment: ['inlinecomment', 'commentlinepercent', 'commentinline'],
    braced_comment: ['bracedcomment', 'commentblockinline', 'delimitedcomment'],
    hard_break: ['hardbreak'],
    soft_break: ['softbreak'],
};

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
        reference_image: ['image'],
        collapsed_reference_image: ['image'],
        reference_footnote: ['footnote'],
        forced_highlight: ['highlight'],
        tag: ['tag'],
    },
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

    return names.map((raw) => ({ raw, norm: normalize(raw) }));
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
         * What backstops the rest is the `evidence` field: it goes in the
         * ledger, a reviewer sees it in the diff, and for the four surfaces in
         * this repository the test asserts the shipped grammar still carries
         * that exact string.
         */
        const hit = vocab
            .filter((entry) => signatures.some((signature) => entry.norm.includes(signature)))
            .sort((a, b) => a.raw.length - b.raw.length || a.raw.localeCompare(b.raw))[0];
        if (hit) found.set(construct, hit.raw);
    }

    return found;
}
