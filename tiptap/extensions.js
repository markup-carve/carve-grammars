import { Extension, Mark, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Code from '@tiptap/extension-code';
import CodeBlock from '@tiptap/extension-code-block';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import * as TableModule from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';

// Tiptap 3 exports Table by name only, Tiptap 2 only as the default.
const Table = TableModule.Table ?? Reflect.get(TableModule, 'default');

function readCarve(element) {
    const raw = element.getAttribute('data-carve');
    if (raw === null) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/** The `carve` attribute: tree fields the editor does not own. Not copied when a node is split. */
const carveAttribute = {
    default: null,
    keepOnSplit: false,
    parseHTML: readCarve,
    renderHTML: (attributes) => {
        const carve = attributes.carve;
        if (carve === null || carve === undefined) return {};
        const out = { 'data-carve': JSON.stringify(carve) };
        if (typeof carve.task?.mark === 'string') out['data-task-state'] = carve.task.mark;
        const classes = carve.attrs?.classes;
        if (Array.isArray(classes) && classes.length > 0) out.class = classes.join(' ');
        return out;
    },
};

const STOCK_TYPES = [
    'doc', 'paragraph', 'heading', 'blockquote', 'codeBlock', 'horizontalRule', 'bulletList', 'orderedList', 'listItem',
    'taskList', 'taskItem', 'hardBreak', 'image', 'table', 'tableRow', 'tableCell', 'tableHeader',
    'bold', 'italic', 'underline', 'strike', 'highlight', 'subscript', 'superscript', 'code', 'link',
];

/** Adds the `carve` attribute to the stock Tiptap nodes and marks the kit maps to. */
export const CarveAttributes = Extension.create({
    name: 'carveAttributes',
    addGlobalAttributes() {
        return [{ types: STOCK_TYPES, attributes: { carve: carveAttribute } }];
    },
    addCommands() {
        return {
            // `setContent` keeps the attributes of the current doc node, which hold the document's own fields.
            // Built on the transaction, since Tiptap 2 and 3 disagree on `setContent`'s second argument.
            setCarveContent: (content, options = {}) => ({ tr, dispatch, editor }) => {
                const doc = editor.schema.nodeFromJSON(content);
                if (dispatch) {
                    tr.replaceWith(0, tr.doc.content.size, doc.content).setDocAttribute('carve', doc.attrs.carve ?? null);
                    if (options.emitUpdate === false) tr.setMeta('preventUpdate', true);
                }
                return true;
            },
        };
    },
});

function carveAttributes(extra = {}) {
    return () => ({ carve: carveAttribute, ...extra });
}

function plainAttribute(name, fallback = null) {
    return {
        default: fallback,
        parseHTML: (element) => element.getAttribute(`data-${name}`) ?? fallback,
        renderHTML: (attributes) => (attributes[name] === null || attributes[name] === undefined ? {} : { [`data-${name}`]: String(attributes[name]) }),
    };
}

function containerNode(name, treeType, { content = 'block+', group = 'block', tag = 'div', extra = {}, className, dataOf } = {}) {
    return Node.create({
        name,
        ...(group ? { group } : {}),
        content,
        defining: true,
        addAttributes: carveAttributes(extra),
        parseHTML: () => [{ tag: `${tag}[data-carve-type="${treeType}"]` }],
        renderHTML: ({ HTMLAttributes, node }) => [tag, {
            ...HTMLAttributes,
            ...dataOf?.(node),
            'data-carve-type': treeType,
            class: [className ?? `carve-${treeType.replace(/_/g, '-')}`, HTMLAttributes.class].filter(Boolean).join(' '),
        }, 0],
    });
}

function textblockNode(name, treeType, { group = 'block', tag = 'p' } = {}) {
    return Node.create({
        name,
        ...(group ? { group } : {}),
        content: 'inline*',
        addAttributes: carveAttributes(),
        parseHTML: () => [{ tag: `${tag}[data-carve-type="${treeType}"]` }],
        renderHTML: ({ HTMLAttributes }) => [tag, { ...HTMLAttributes, 'data-carve-type': treeType }, 0],
    });
}

function codeNode(name, treeType) {
    return Node.create({
        name,
        group: 'block',
        content: 'text*',
        marks: '',
        code: true,
        defining: true,
        addAttributes: carveAttributes(),
        parseHTML: () => [{ tag: `pre[data-carve-type="${treeType}"]`, preserveWhitespace: 'full' }],
        renderHTML: ({ HTMLAttributes }) => ['pre', { ...HTMLAttributes, 'data-carve-type': treeType, class: `carve-${treeType.replace(/_/g, '-')}` }, ['code', 0]],
    });
}

function inlineMark(name, treeType, tag = 'span') {
    return Mark.create({
        name,
        addAttributes: carveAttributes(),
        parseHTML: () => [{ tag: `${tag}[data-carve-type="${treeType}"]` }],
        renderHTML: ({ HTMLAttributes }) => [tag, { ...HTMLAttributes, 'data-carve-type': treeType }, 0],
    });
}

/** A short text standing for an atom in the editor. */
function atomLabel(node) {
    if (node === null || typeof node !== 'object') return '';
    for (const key of ['glyph', 'value', 'text', 'raw', 'label', 'target', 'name', 'key', 'href', 'path']) {
        if (typeof node[key] === 'string' && node[key] !== '') return node[key];
    }
    if (node.type === 'soft_break') return ' ';
    if (node.type === 'non_breaking_space') return ' ';
    return node.type ?? '';
}

export const CarveDiv = containerNode('carveDiv', 'div', { content: 'carveTitle? block+' });
export const CarveAdmonition = containerNode('carveAdmonition', 'admonition', {
    content: 'carveTitle? block+',
    extra: { kind: plainAttribute('kind', 'note') },
});
export const CarveDirective = containerNode('carveDirective', 'directive', { content: 'carveTitle? block+' });
export const CarveSection = containerNode('carveSection', 'section', { tag: 'section' });
export const CarveFigureGroup = containerNode('carveFigureGroup', 'figure_group', { tag: 'figure' });
export const CarveBlockExtension = containerNode('carveBlockExtension', 'block_extension');
export const CarveFootnote = containerNode('carveFootnote', 'footnote', {
    tag: 'aside',
    dataOf: (node) => (typeof node.attrs.carve?.key === 'string' ? { 'data-key': node.attrs.carve.key } : {}),
});
export const CarveCaption = containerNode('carveCaption', 'caption', { group: '', tag: 'figcaption' });
/** A block with its caption: the tree keeps the caption as a field of the block. */
export const CarveCaptioned = containerNode('carveCaptioned', 'captioned', { content: 'block carveCaption', tag: 'figure' });
export const CarveDefinitionList = containerNode('carveDefinitionList', 'definition_list', {
    content: '(carveDefinitionTerm | carveDefinitionDescription | carveComment)+',
    tag: 'dl',
});
export const CarveDefinitionTerm = textblockNode('carveDefinitionTerm', 'definition_term', { group: '', tag: 'dt' });
export const CarveDefinitionDescription = containerNode('carveDefinitionDescription', 'definition_description', { group: '', tag: 'dd' });
export const CarveLineBlock = containerNode('carveLineBlock', 'line_block', { content: '(carveLine | carveComment)+' });
export const CarveLine = textblockNode('carveLine', 'line', { group: '' });
export const CarveTitle = textblockNode('carveTitle', 'title', { group: '', tag: 'div' });
export const CarveCitationDefinition = textblockNode('carveCitationDefinition', 'citation_definition');
export const CarveComment = codeNode('carveComment', 'comment');
export const CarveRawBlock = codeNode('carveRawBlock', 'raw_block');
export const CarveFrontmatter = codeNode('carveFrontmatter', 'frontmatter');

/** Any block the kit has no editable node for, kept whole. */
export const CarveBlock = Node.create({
    name: 'carveBlock',
    group: 'block',
    atom: true,
    selectable: true,
    addAttributes: carveAttributes(),
    parseHTML: () => [{ tag: 'div[data-carve-type="block"]' }],
    renderHTML: ({ HTMLAttributes, node }) => ['div', {
        ...HTMLAttributes,
        'data-carve-type': 'block',
        class: `carve-block carve-block-${String(node.attrs.carve?.type ?? '').replace(/_/g, '-')}`,
    }, atomLabel(node.attrs.carve)],
});

/** Any inline the kit has no editable node or mark for, kept whole. */
export const CarveInline = Node.create({
    name: 'carveInline',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    addAttributes: carveAttributes(),
    parseHTML: () => [{ tag: 'span[data-carve-type="inline"]' }],
    renderHTML: ({ HTMLAttributes, node }) => ['span', {
        ...HTMLAttributes,
        'data-carve-type': 'inline',
        class: `carve-inline carve-inline-${String(node.attrs.carve?.type ?? '').replace(/_/g, '-')}`,
    }, atomLabel(node.attrs.carve)],
    renderText: ({ node }) => atomLabel(node.attrs.carve),
});

export const CarveMath = Node.create({
    name: 'carveMath',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    addAttributes: carveAttributes({
        value: plainAttribute('value', ''),
        display: {
            default: false,
            parseHTML: (element) => element.getAttribute('data-display') === 'true',
            renderHTML: (attributes) => ({ 'data-display': attributes.display ? 'true' : 'false' }),
        },
    }),
    parseHTML: () => [{ tag: 'span[data-carve-type="math"]' }],
    renderHTML: ({ HTMLAttributes, node }) => ['span', { ...HTMLAttributes, 'data-carve-type': 'math', class: 'carve-math' }, node.attrs.value],
    renderText: ({ node }) => node.attrs.value,
});

export const CarveFootnoteRef = Node.create({
    name: 'carveFootnoteRef',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    addAttributes: carveAttributes({ key: plainAttribute('key', '') }),
    // Above Superscript, which claims every <sup>.
    parseHTML: () => [{ tag: 'sup[data-carve-type="footnote_ref"]', priority: 60 }],
    // Shown as the HTML target shows a reference, a superscript label; the source spelling is for renderText.
    renderHTML: ({ HTMLAttributes, node }) => ['sup', { ...HTMLAttributes, 'data-carve-type': 'footnote_ref', class: 'carve-footnote-ref', title: `[^${node.attrs.key}]` }, String(node.attrs.key)],
    renderText: ({ node }) => `[^${node.attrs.key}]`,
});

export const CarveInsert = inlineMark('carveInsert', 'insert', 'ins');
export const CarveDelete = inlineMark('carveDelete', 'delete', 'del');
export const CarveSmallCaps = inlineMark('carveSmallCaps', 'small_caps');
export const CarveSpan = inlineMark('carveSpan', 'span');
export const CarveInlineFootnote = inlineMark('carveInlineFootnote', 'inline_footnote');
export const CarveInlineExtension = inlineMark('carveInlineExtension', 'inline_extension');

export const CARVE_NODES = [
    CarveDiv, CarveAdmonition, CarveDirective, CarveSection, CarveFigureGroup, CarveBlockExtension, CarveFootnote,
    CarveCaption, CarveCaptioned, CarveDefinitionList, CarveDefinitionTerm, CarveDefinitionDescription, CarveLineBlock,
    CarveLine, CarveTitle, CarveCitationDefinition, CarveComment, CarveRawBlock, CarveFrontmatter, CarveBlock,
    CarveInline, CarveMath, CarveFootnoteRef,
];
export const CARVE_MARKS = [CarveInsert, CarveDelete, CarveSmallCaps, CarveSpan, CarveInlineFootnote, CarveInlineExtension];

/**
 * The stock Tiptap extensions the kit maps to, set up for the Carve tree, plus the Carve nodes and marks.
 * `CarveKit.configure({ starterKit: {...} })` passes options to StarterKit; `link`, `image`, `table`,
 * `taskItem` and `codeBlock` pass options to those extensions.
 */
export const CarveKit = Extension.create({
    name: 'carveKit',
    addOptions() {
        return { starterKit: {}, link: {}, image: {}, table: {}, taskItem: {}, codeBlock: {} };
    },
    addExtensions() {
        const options = this.options;
        return [
            StarterKit.configure({
                // Tiptap 3 folds these into StarterKit; Tiptap 2 ignores the keys.
                underline: false,
                link: false,
                listKeymap: false,
                ...options.starterKit,
                code: false,
                codeBlock: false,
                bulletList: false,
                orderedList: false,
                listItem: false,
            }),
            // Carve lets any inline wrap a code span.
            Code.extend({ excludes: '' }),
            CodeBlock.configure(options.codeBlock),
            BulletList,
            OrderedList,
            ListItem,
            TaskList,
            TaskItem.configure({ nested: true, ...options.taskItem }),
            Underline,
            Link.configure({ openOnClick: false, autolink: false, ...options.link }),
            Highlight,
            Subscript,
            Superscript,
            Image.configure({ inline: true, ...options.image }),
            Table.configure(options.table),
            TableRow,
            TableHeader,
            TableCell,
            ...CARVE_NODES,
            ...CARVE_MARKS,
            CarveAttributes,
        ];
    },
});
