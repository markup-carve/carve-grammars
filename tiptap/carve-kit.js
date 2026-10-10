import { Extension, InputRule, findParentNode, isList, isNodeActive } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import { AllSelection, Plugin, Selection, TextSelection } from '@tiptap/pm/state';
import { canJoin } from '@tiptap/pm/transform';
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
import HardBreak from '@tiptap/extension-hard-break';
import { attributeSlots } from './extensions/carve-attribute-slots.js';
import { CarveHeading } from './extensions/carve-heading.js';

import { CarveInsert } from './extensions/carve-insert.js';
import { CarveDelete } from './extensions/carve-delete.js';
import { CarveCriticComment } from './extensions/carve-critic-comment.js';
import { CarveDiv } from './extensions/carve-div.js';
import { CarveTabSet, CarveTab } from './extensions/carve-tabs.js';
import { CarveCodeGroup } from './extensions/carve-code-group.js';
import { CarveSpan } from './extensions/carve-span.js';
import { CarveFootnote } from './extensions/carve-footnote.js';
import { CarveMath } from './extensions/carve-math.js';
import { CarveFootnoteDefinition } from './extensions/carve-footnote-definition.js';
import { CarveEmbed } from './extensions/carve-embed.js';
import { CarveAbbreviation } from './extensions/carve-abbreviation.js';
import { CarveAbbreviationDefinition } from './extensions/carve-abbreviation-definition.js';
import { CarveDefinitionList, CarveDefinitionTerm, CarveDefinitionDescription } from './extensions/carve-definition-list.js';
import { CarveUnsupported } from './extensions/carve-unsupported.js';
import { CarveUnsupportedInline } from './extensions/carve-unsupported-inline.js';
import { CarveEmptyMark } from './extensions/carve-empty-mark.js';
import { CarveFigure, CarveFigureGroup, CarveCaption } from './extensions/carve-figure.js';
import { CarveRawBlock } from './extensions/carve-raw-block.js';
import { CarveComment, CarveCommentInline } from './extensions/carve-comment.js';
import { CarveCitation } from './extensions/carve-citation.js';
import { CarveCitationDefinition } from './extensions/carve-citation-definition.js';
import { CarveCrossref } from './extensions/carve-crossref.js';
import { CarveFrontmatter } from './extensions/carve-frontmatter.js';
import { CarveInlineExtension } from './extensions/carve-inline-extension.js';
import { CarveInlineNote } from './extensions/carve-inline-note.js';
import { CarveLinkRefDef } from './extensions/carve-link-ref-def.js';
import { CarveLiteral } from './extensions/carve-literal.js';
import { CarveRawInline } from './extensions/carve-raw-inline.js';
import { CarveSection } from './extensions/carve-section.js';
import { CarveSubstitution } from './extensions/carve-substitution.js';
import { CarveSymbol } from './extensions/carve-symbol.js';
import { CarveSourcePreservation } from './extensions/carve-source-preservation.js';
import { CarveLineBlock } from './extensions/carve-line-block.js';
import { CarveDirective } from './extensions/carve-directive.js';
import { CarveBlockExtension } from './extensions/carve-block-extension.js';
import { CarveRuby } from './extensions/carve-ruby.js';
import { CarveSmallCaps } from './extensions/carve-small-caps.js';
import { CARVE_RULED_MARKS, carveMarkRules } from './extensions/carve-mark-rules.js';

// Tiptap 3 dropped the default export from @tiptap/extension-table - it now
// exports Table (plus TableRow/TableCell/TableHeader/TableKit) by name. Tiptap 2
// only had the default. This reads whichever the installed major provides; the
// row/cell/header packages kept their defaults in both, so they import plainly.
const Table = TableModule.Table ?? Reflect.get(TableModule, 'default');
import { CarveKeymap } from './extensions/carve-keymap.js';
import { CarveMention, CarveTag } from './extensions/carve-mention.js';

// Languages offered by the code-block picker. The current language is always
// shown even if it is not in this list.
const CODE_LANGS = [
    { value: '', label: 'Plain text' },
    { value: 'carve', label: 'Carve' },
    { value: 'php', label: 'PHP' },
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'html', label: 'HTML' },
    { value: 'css', label: 'CSS' },
    { value: 'json', label: 'JSON' },
    { value: 'bash', label: 'Bash' },
    { value: 'python', label: 'Python' },
    { value: 'sql', label: 'SQL' },
    { value: 'yaml', label: 'YAML' },
    { value: 'markdown', label: 'Markdown' },
    { value: 'rust', label: 'Rust' },
    { value: 'go', label: 'Go' },
];

/**
 * CarveKit - A Tiptap extension bundle for Carve markup
 *
 * Includes all standard Tiptap extensions plus Carve-specific marks:
 * - CarveInsert: {+text+}
 * - CarveDelete: {-text-}
 * - CarveCriticComment: {# text #}
 * - CarveDiv: ::: containers
 * - CarveSpan: [text]{.class}
 * - CarveFootnote: [^label]
 * - CarveEmbed: video/iframe embeds
 * - CarveAbbreviation: [ABBR]{abbr="expansion"}
 * - CarveDefinitionList: : term with definition
 *
 * @example
 * ```js
 * import { Editor } from '@tiptap/core'
 * import { CarveKit, serializeToCarve } from '@markup-carve/carve-grammars/tiptap'
 *
 * const editor = new Editor({
 *   element: document.getElementById('editor'),
 *   extensions: [CarveKit],
 *   onUpdate: ({ editor }) => {
 *     const carve = serializeToCarve(editor.getJSON())
 *     console.log(carve)
 *   },
 * })
 * ```
 *
 * @example Configuration
 * ```js
 * import { CarveKit } from '@markup-carve/carve-grammars/tiptap'
 *
 * // Disable specific features
 * CarveKit.configure({
 *   table: false,
 *   taskList: false,
 * })
 *
 * // Configure specific extensions
 * CarveKit.configure({
 *   link: {
 *     openOnClick: false,
 *   },
 *   codeBlock: {
 *     HTMLAttributes: {
 *       spellcheck: 'false',
 *     },
 *   },
 * })
 * ```
 */
// Classes that are PRESENTATION HOOKS in rendered task-list HTML, not authored
// Carve attributes: `task-list` is the engines' own list class (carve#2887), the
// other two come from GitHub-flavored HTML and editors. Capturing them invents
// source the author never wrote: `-{.task-list-item} [ ] x`.
const STRUCTURAL_LIST_CLASSES = new Set(['task-list', 'task-list-item', 'contains-task-list']);

// `data-task-state` values that are `checked`'s job, not an extended state.
const DONE_TASK_STATES = new Set(['x', 'X']);

// Items here take `block*`, so `wrapInList` succeeds inside a list of another
// type: stock `toggleList` and the `[ ] ` input rule nest a new list instead of
// converting. These swap the innermost list in place, keeping nesting; a null
// `tr` only checks that the swap is possible.
const LIST_MARKER_ATTRS = ['type', 'carveOlType', 'carveDelim', 'carveBareMarker'];

// The list rebuilt as `listType`, or null when an item's content does not fit.
function convertedList(list, listType, itemType, listAttrs = {}, itemAttrs = () => ({})) {
    const items = [];
    list.forEach((item) => items.push(item));
    if (!items.every((item) => itemType.validContent(item.content))) {
        return null;
    }
    const carry = (type, attrs) => Object.fromEntries(Object.entries(attrs).filter(([key]) => key in type.attrs));
    return listType.create(
        { ...carry(listType, list.attrs), ...listAttrs },
        items.map((item, index) => itemType.create(
            { ...carry(itemType, item.attrs), ...itemAttrs(index) }, item.content, item.marks,
        )),
        list.marks,
    );
}

// Join the two `listType` lists meeting at `pos` when their marker style
// matches, as stock `toggleList` does.
function joinListsAt(tr, pos, listType) {
    const $pos = tr.doc.resolve(pos);
    const [before, after] = [$pos.nodeBefore, $pos.nodeAfter];
    if (before?.type === listType && after?.type === listType
        && LIST_MARKER_ATTRS.every((key) => before.attrs[key] === after.attrs[key]) && canJoin(tr.doc, pos)) {
        tr.join(pos);
    }
}

function swapListType(tr, pos, list, listType, itemType, listAttrs = {}, itemAttrs = () => ({})) {
    const swapped = convertedList(list, listType, itemType, listAttrs, itemAttrs);
    if (!swapped) {
        return false;
    }
    if (!tr) {
        return true;
    }
    const selection = tr.selection.toJSON();
    tr.replaceWith(pos, pos + list.nodeSize, swapped);
    tr.setSelection(Selection.fromJSON(tr.doc, selection));
    joinListsAt(tr, pos + swapped.nodeSize, listType);
    joinListsAt(tr, pos, listType);
    return true;
}

// The innermost list around the selection, or the one list a selection covers
// from outside, flagged `around`. Empty textblocks do not count, so select-all
// over a list and the invisible trailing paragraph still finds it.
function selectedList(state, lists) {
    const { selection } = state;
    const parent = findParentNode((node) => isList(node.type.name, lists))(selection);
    if (parent) return parent;
    const range = selection.$from.blockRange(selection.$to);
    if (!range) return null;
    const covered = [];
    for (let index = range.startIndex, pos = range.start; index < range.endIndex; index++) {
        const node = range.parent.child(index);
        if (!(node.isTextblock && node.content.size === 0)) covered.push({ node, pos });
        pos += node.nodeSize;
    }
    const [only] = covered;
    return covered.length === 1 && isList(only.node.type.name, lists)
        ? { ...only, depth: range.depth, around: true } : null;
}

function convertListType(listName, itemName, listAttrs = {}) {
    return ({ state, tr, dispatch, editor }) => {
        const { selection, schema } = state;
        const parent = selectedList(state, editor.extensionManager.extensions);
        const range = selection.$from.blockRange(selection.$to);
        const listType = schema.nodes[listName];
        const itemType = schema.nodes[itemName];
        // A selection reaching past this list is left to stock `toggleList`.
        if (!parent || !range || range.depth < parent.depth || range.depth - parent.depth > 1
            || parent.node.type === listType || !listType || !itemType) {
            return false;
        }
        return swapListType(dispatch ? tr : null, parent.pos, parent.node, listType, itemType, listAttrs);
    };
}

// A range mixing lists with other blocks: each list converts in place and each
// paragraph becomes an item. Every other block (heading, code, quote, ...) stays
// as it is and splits the list. Where nothing is left to convert, the lists
// unwrap one level. Empty textblocks at the edges stay out, as in
// `selectedList`. Null means the range is not this command's to take.
function toggleMixedRange(listName, itemName, listAttrs = {}) {
    return ({ state, tr, dispatch, editor }) => {
        const { selection, schema } = state;
        const lists = editor.extensionManager.extensions;
        const listType = schema.nodes[listName];
        const itemType = schema.nodes[itemName];
        const range = selection.$from.blockRange(selection.$to);
        if (!range || !listType || !itemType || isList(range.parent.type.name, lists)) return null;
        const blocks = [];
        for (let index = range.startIndex, pos = range.start; index < range.endIndex; index++) {
            const node = range.parent.child(index);
            blocks.push({ node, pos, index });
            pos += node.nodeSize;
        }
        const empty = ({ node }) => node.isTextblock && node.content.size === 0;
        while (blocks.length && empty(blocks[0])) blocks.shift();
        while (blocks.length && empty(blocks[blocks.length - 1])) blocks.pop();
        const holdsList = (node) => {
            let found = isList(node.type.name, lists);
            node.descendants((child) => {
                found ||= isList(child.type.name, lists);
                return !found;
            });
            return found;
        };
        if (!blocks.some(({ node }) => holdsList(node))) return null;
        const paragraph = schema.nodes.paragraph;
        const changes = ({ node }) => (isList(node.type.name, lists) ? node.type !== listType
            : node.type === paragraph && node.content.size > 0);
        if (!blocks.some(({ node }) => node.type === listType) && !blocks.some(changes)) return false;

        // Each rebuilt block keeps its content, only shifted: `moved` records
        // by how much, so a text selection keeps its endpoints.
        const nodes = [];
        const moved = [];
        let at = blocks[0].pos;
        const keep = (start, size, shift) => moved.push({ start, end: start + size, by: at + shift - start });
        if (!blocks.some(changes)) {
            for (const { node, pos } of blocks) {
                if (node.type !== listType) {
                    keep(pos, node.nodeSize, 0);
                    nodes.push(node);
                    at += node.nodeSize;
                    continue;
                }
                node.forEach((item, offset) => {
                    const start = pos + 1 + offset + 1;
                    if (item.childCount) {
                        keep(start, item.content.size, 0);
                        item.forEach((child) => nodes.push(child));
                        at += item.content.size;
                    } else {
                        keep(start, 0, 1);
                        nodes.push(paragraph.create());
                        at += 2;
                    }
                });
            }
        } else {
            for (const { node, pos } of blocks) {
                const list = isList(node.type.name, lists);
                const wrapped = !list && node.type === paragraph;
                let converted = node;
                if (list && node.type !== listType) {
                    converted = convertedList(node, listType, itemType, listAttrs);
                } else if (wrapped) {
                    converted = itemType.validContent(Fragment.from(node))
                        && listType.create(listAttrs, itemType.create(null, node));
                }
                if (!converted) return null;
                keep(pos, node.nodeSize, wrapped ? 2 : 0);
                nodes.push(converted);
                at += converted.nodeSize;
            }
        }
        const first = blocks[0];
        const last = blocks[blocks.length - 1];
        if (!range.parent.canReplace(first.index, last.index + 1, Fragment.from(nodes))) return null;
        if (!dispatch) return true;

        const from = first.pos;
        const to = last.pos + last.node.nodeSize;
        const grown = at - to;
        const map = (pos) => {
            if (pos <= from) return pos;
            if (pos >= to) return pos + grown;
            const hit = moved.find(({ start, end }) => pos >= start && pos <= end);
            return hit ? pos + hit.by : null;
        };
        tr.replaceWith(from, to, nodes);
        const boundaries = [];
        for (let index = 0, pos = from; index < nodes.length; pos += nodes[index].nodeSize, index++) {
            boundaries.push(pos);
        }
        const [anchor, head] = [map(selection.anchor), map(selection.head)];
        if (selection instanceof AllSelection) {
            tr.setSelection(new AllSelection(tr.doc));
        } else if (selection instanceof TextSelection && anchor !== null && head !== null) {
            tr.setSelection(TextSelection.create(tr.doc, anchor, head));
        } else {
            tr.setSelection(TextSelection.between(tr.doc.resolve(from), tr.doc.resolve(at)));
        }
        // Back to front, so each join leaves the earlier positions valid.
        for (const pos of [at, ...boundaries.reverse()]) joinListsAt(tr, pos, listType);
        return true;
    };
}

// The stock command for everything else. A range touching a list that
// `toggleMixedRange` cannot take is cleared to paragraphs first: under `block*`
// wrapping it would nest instead.
function toggleCarveList(listName, itemName, fallback, listAttrs) {
    return (props) => {
        if (convertListType(listName, itemName, listAttrs)(props)) return true;
        const { state, editor, chain } = props;
        const { selection } = state;
        const lists = editor.extensionManager.extensions;
        const parent = selectedList(state, lists);
        const range = selection.$from.blockRange(selection.$to);
        const togglingOff = parent && range && parent.node.type.name === listName && range.depth >= parent.depth;
        let touchesList = false;
        state.doc.nodesBetween(selection.from, selection.to, (node) => {
            touchesList ||= isList(node.type.name, lists);
            return !touchesList;
        });
        if (togglingOff && parent.around) {
            // Stock lifting needs a selection inside the list.
            return chain().command(({ tr }) => {
                const inner = TextSelection.between(
                    tr.doc.resolve(parent.pos + 1), tr.doc.resolve(parent.pos + parent.node.nodeSize - 1),
                );
                tr.setSelection(inner);
                return true;
            }).liftListItem(itemName).run();
        }
        if (togglingOff || !touchesList) return fallback(props);
        const mixed = toggleMixedRange(listName, itemName, listAttrs)(props);
        if (mixed !== null) return mixed;
        return chain().clearNodes().command(fallback).run();
    };
}

// `- [ ] ` typed at the start of a bullet item turns that list into a task list.
function taskMarkerInBulletItem(find, taskItemName) {
    return new InputRule({
        find,
        handler: ({ state, range, match }) => {
            const $from = state.doc.resolve(range.from);
            const depth = $from.depth;
            if (depth < 3 || $from.index(depth - 1) !== 0 || $from.node(depth - 1).type.name !== 'listItem'
                || $from.node(depth - 2).type.name !== 'bulletList') {
                return null;
            }
            const { tr, schema } = state;
            const listPos = $from.before(depth - 2);
            const [taskList, taskItem] = [schema.nodes.taskList, schema.nodes[taskItemName]];
            if (!swapListType(null, listPos, $from.node(depth - 2), taskList, taskItem)) return null;
            const checked = match[match.length - 1] === 'x';
            const index = $from.index(depth - 2);
            // Delete first: joining a neighbor list shifts the marker's range.
            tr.delete(range.from, range.to);
            swapListType(tr, listPos, tr.doc.nodeAt(listPos), taskList, taskItem, {}, (i) => ({ checked: i === index && checked }));
        },
    });
}

function authoredClasses(element) {
    const kept = (element.getAttribute('class') || '')
        .split(/\s+/)
        .filter((c) => c && !STRUCTURAL_LIST_CLASSES.has(c));
    return kept.length ? kept.join(' ') : null;
}

const LEGACY_INLINE_CONTENT_NODES = new Set([
    'carveCommentInline',
    'carveLiteral',
    'carveRawInline',
]);

// These nodes used to store their editable payload in attrs.content. Keep old
// persisted ProseMirror JSON usable by promoting that attribute to child text
// as soon as it enters an editor. Applying replacements from right to left
// keeps every collected position valid as leaf nodes grow children.
function legacyInlineContentTransaction(state) {
    const replacements = [];
    state.doc.descendants((node, pos) => {
        const legacyContent = node.attrs?.content;
        if (LEGACY_INLINE_CONTENT_NODES.has(node.type.name)
            && node.childCount === 0
            && typeof legacyContent === 'string'
            && legacyContent.length > 0) {
            replacements.push({ node, pos, legacyContent });
        }
    });
    if (replacements.length === 0) return null;

    const transaction = state.tr;
    for (const { node, pos, legacyContent } of replacements.reverse()) {
        transaction.replaceWith(
            pos,
            pos + node.nodeSize,
            node.type.create(
                { ...node.attrs, content: null },
                state.schema.text(legacyContent),
                node.marks,
            ),
        );
    }
    transaction.setMeta('addToHistory', false);
    transaction.setMeta('carveLegacyInlineContentMigration', true);
    return transaction;
}

export const CarveKit = Extension.create({
    name: 'carveKit',

    addExtensions() {
        const extensions = [];

        extensions.push(Extension.create({
            name: 'carveLegacyInlineContentMigration',
            onCreate() {
                const transaction = legacyInlineContentTransaction(this.editor.state);
                if (transaction) this.editor.view.dispatch(transaction);
            },
            addProseMirrorPlugins() {
                return [new Plugin({
                    appendTransaction(transactions, _oldState, newState) {
                        if (transactions.some(transaction => transaction.getMeta('carveLegacyInlineContentMigration'))) return null;
                        return legacyInlineContentTransaction(newState);
                    },
                })];
            },
        }));

        // Attributes on ordinary block nodes are part of the Carve document,
        // but the stock Tiptap schema does not declare them. ProseMirror drops
        // undeclared fields while mounting JSON, so retain the common Carve
        // attribute shape globally for nodes whose serializer supports it.
        extensions.push(Extension.create({
            name: 'carveBlockAttributes',
            addGlobalAttributes() {
                return [{
                    types: ['paragraph', 'blockquote', 'horizontalRule'],
                    // `style` is reserved although no block here renders one:
                    // carve-php and carve-js write an authored `{align=right}`
                    // out as `style="text-align: right;"`, and reading that
                    // back as a key/value respells the author's run.
                    attributes: attributeSlots(['style']),
                }, {
                    types: ['bulletList'],
                    attributes: attributeSlots(['carveTight']),
                }, {
                    types: ['orderedList'],
                    attributes: attributeSlots([
                        'carveTight', 'carveOlType', 'carveDelim', 'carveBareMarker', 'type', 'start',
                    ]),
                }, {
                    types: ['taskList'],
                    attributes: {
                        ...attributeSlots(['carveTight', 'data-type']),
                        class: {
                            default: null,
                            parseHTML: authoredClasses,
                            renderHTML: attributes => (attributes.class ? { class: attributes.class } : {}),
                        },
                    },
                }, {
                    // `` `code`{.cls} `` is an attribute run on INLINE CODE. The
                    // stock Code mark declares no attributes at all, so the run
                    // had nowhere to go: it was dropped on the way in, the
                    // serializer had nothing left to write, and NOTHING reported
                    // it - the caller was told the document round-tripped
                    // (markup-carve/carve-grammars#240).
                    types: ['code'],
                    attributes: attributeSlots(),
                }, {
                    // LOOSE or TIGHT is content: a loose list read back as tight
                    // loses the paragraph inside each item. The serializer can
                    // only derive looseness from an item holding more than one
                    // block, so an authored `- a` / blank / `- b` needs the flag
                    // the author's blank lines set.
                    types: ['bulletList', 'orderedList', 'taskList'],
                    attributes: {
                        carveTight: { default: null },
                    },
                }];
            },
        }));

        // StarterKit provides: Document, Paragraph, Text, Bold, Italic, Code,
        // CodeBlock, Blockquote, BulletList, OrderedList, ListItem, Heading,
        // HardBreak, HorizontalRule, Dropcursor, Gapcursor, History
        if (this.options.starterKit !== false) {
            // StarterKit's Bold, Italic and Strike type Markdown spellings.
            const CarveStarterKit = StarterKit.extend({
                // Tiptap 2's StarterKit has no addOptions, and without one here
                // its extend() leaves options undefined, so configure() drops them.
                addOptions() {
                    return this.parent?.() ?? {};
                },
                addExtensions() {
                    return (this.parent?.() ?? []).map((extension) => (CARVE_RULED_MARKS.includes(extension.name)
                        ? extension.extend(carveMarkRules(extension.name))
                        : extension));
                },
            });
            extensions.push(CarveStarterKit.configure({
                // Disable CodeBlock from StarterKit, we add a custom one below
                codeBlock: false,
                // Disable default lists - we add custom ones that handle task-list
                bulletList: false,
                orderedList: false,
                listItem: false,
                // Disable HardBreak, we add a custom one with visible indicator
                hardBreak: false,
                heading: false,
                // Tiptap 3 folded Underline and Link INTO StarterKit, while this
                // kit pushes both separately below (underline maps to Carve's
                // `_text_`, link carries the Carve-specific attribute handling).
                // Leaving them enabled registers each mark twice, which Tiptap
                // rejects as a duplicate name. Tiptap 2's StarterKit has no such
                // keys and ignores them, so this is safe on both majors.
                underline: false,
                link: false,
                ...this.options.starterKit,
                code: false,
            }));
            // Carve lets any inline mark wrap a code span. The stock mark
            // excludes all others, so `*`x`*` lost its strong on the way back
            // in from HTML (#529).
            if (this.options.starterKit?.code !== false) {
                extensions.push(Code.extend({ excludes: '' }).configure(this.options.starterKit?.code ?? {}));
            }
        }

        if (this.options.heading !== false) {
            extensions.push(CarveHeading.configure(this.options.heading ?? {}));
        }

        // Custom HardBreak with visible indicator (shows ↵ symbol)
        if (this.options.hardBreak !== false) {
            const CustomHardBreak = HardBreak.extend({
                addNodeView() {
                    return () => {
                        const dom = document.createElement('span');
                        dom.innerHTML = '<span class="hard-break">↵</span><br>';
                        return { dom };
                    };
                },
            });
            extensions.push(CustomHardBreak.configure(this.options.hardBreak ?? {}));
        }

        // Custom CodeBlock that preserves data-language-raw for syntax highlighter options
        if (this.options.codeBlock !== false) {
            const CustomCodeBlock = CodeBlock.extend({
                addAttributes() {
                    return {
                        ...this.parent?.(),
                        carveLanguageRaw: {
                            default: null,
                            parseHTML: element => {
                                // Check parent <pre> for data-language-raw
                                const pre = element.closest('pre');
                                return pre?.getAttribute('data-language-raw') || null;
                            },
                            renderHTML: attributes => {
                                if (!attributes.carveLanguageRaw) return {};
                                return { 'data-language-raw': attributes.carveLanguageRaw };
                            },
                        },
                        carveHeader: { default: null },
                        carveLabel: { default: null },
                        ...attributeSlots([
                            'spellcheck', 'data-language-raw', 'carveHeader', 'carveLabel',
                            // Both engines render a fence title as `title`.
                            'title',
                        ]),
                    };
                },

                // Language toolbar below every code block. Keeping the control
                // outside <pre>/<code> means it never consumes the first line's
                // horizontal space or becomes part of the editable content,
                // while placing it after the source keeps metadata secondary.
                // Disable with
                // CarveKit.configure({ codeBlock: { languagePicker: false } }).
                addNodeView() {
                    if (this.options.languagePicker === false) {
                        return null;
                    }
                    return ({ node, editor, getPos }) => {
                        let current = node;
                        const dom = document.createElement('div');
                        dom.className = 'carve-code-block';
                        const pre = document.createElement('pre');
                        if (node.attrs.carveLanguageRaw) {
                            pre.setAttribute('data-language-raw', node.attrs.carveLanguageRaw);
                        }

                        const select = document.createElement('select');
                        select.className = 'carve-code-lang';
                        select.contentEditable = 'false';
                        select.setAttribute('aria-label', 'Code language');
                        const chrome = document.createElement('div');
                        chrome.className = 'carve-code-block-chrome';
                        chrome.contentEditable = 'false';
                        const label = document.createElement('span');
                        label.textContent = 'Language';
                        const fill = (lang) => {
                            select.innerHTML = '';
                            const opts = CODE_LANGS.slice();
                            if (lang && !opts.some(o => o.value === lang)) {
                                opts.push({ value: lang, label: lang });
                            }
                            for (const o of opts) {
                                const el = document.createElement('option');
                                el.value = o.value;
                                el.textContent = o.label;
                                if ((lang || '') === o.value) {
                                    el.selected = true;
                                }
                                select.appendChild(el);
                            }
                        };
                        fill(node.attrs.language || '');
                        // Keep clicks/keys inside the select from reaching PM.
                        select.addEventListener('mousedown', e => e.stopPropagation());
                        select.addEventListener('change', () => {
                            if (typeof getPos !== 'function') {
                                return;
                            }
                            editor.chain().focus().command(({ tr }) => {
                                tr.setNodeMarkup(getPos(), undefined, {
                                    ...current.attrs,
                                    language: select.value || null,
                                });
                                return true;
                            }).run();
                        });

                        const code = document.createElement('code');
                        const applyLangClass = (lang) => {
                            code.className = lang ? `language-${lang}` : '';
                        };
                        applyLangClass(node.attrs.language || '');
                        pre.appendChild(code);
                        chrome.append(label, select);
                        dom.append(pre, chrome);

                        return {
                            dom,
                            contentDOM: code,
                            update: (updated) => {
                                if (updated.type !== current.type) {
                                    return false;
                                }
                                current = updated;
                                if (select.value !== (updated.attrs.language || '')) {
                                    fill(updated.attrs.language || '');
                                }
                                applyLangClass(updated.attrs.language || '');
                                return true;
                            },
                            // The <select> is chrome, not editable content.
                            ignoreMutation: (m) => chrome.contains(m.target),
                            stopEvent: (e) => chrome.contains(e.target),
                        };
                    };
                },
            });
            extensions.push(CustomCodeBlock.configure({
                HTMLAttributes: {
                    spellcheck: 'false',
                },
                ...this.options.codeBlock,
            }));
        }

        // Custom BulletList that excludes task-list class
        if (this.options.bulletList !== false) {
            const CustomBulletList = BulletList.extend({
                addCommands() {
                    const parent = this.parent?.();
                    return {
                        ...parent,
                        toggleBulletList: () => toggleCarveList(
                            this.name, this.options.itemTypeName, (props) => parent.toggleBulletList()(props),
                        ),
                    };
                },
                parseHTML() {
                    return [
                        {
                            tag: 'ul',
                            getAttrs: element => {
                                // Don't match task lists - let TaskList handle them.
                                // carve-php renders them as a plain <ul> whose items
                                // carry a checkbox (no .task-list class), so detect
                                // that shape too.
                                if (element.classList.contains('task-list')) {
                                    return false;
                                }
                                const hasCheckbox = Array.from(element.children).some(
                                    (li) => li.tagName === 'LI' && li.querySelector('input[type="checkbox"]'),
                                );
                                if (hasCheckbox) {
                                    return false;
                                }
                                return {};
                            },
                        },
                    ];
                },
            });
            extensions.push(CustomBulletList.configure(this.options.bulletList ?? {}));
        }

        // Custom OrderedList carrying the MARKER STYLE. Carve writes ordered
        // markers four ways (`1.`, `1)`, `a.`, `iv.`) plus the bare `.` form,
        // and the converter records which in (`carveOlType`, `carveDelim`,
        // `carveBareMarker`). Tiptap's
        // OrderedList declares only `start`, so without these an `a.` list came
        // back as `1.` - a different document.
        if (this.options.orderedList !== false) {
            const CustomOrderedList = OrderedList.extend({
                addAttributes() {
                    return {
                        ...this.parent?.(),
                        carveOlType: { default: null },
                        carveDelim: { default: null },
                        carveBareMarker: { default: null },
                    };
                },
                addCommands() {
                    return {
                        ...this.parent?.(),
                        // A list CREATED in Tiptap has no authored marker to
                        // preserve. Prefer Carve's constant-width automatic
                        // marker without changing the schema default: keeping
                        // that nullable preserves older persisted PM JSON.
                        toggleOrderedList: () => toggleCarveList(this.name, this.options.itemTypeName, ({ chain, state }) => {
                            const wasActive = isNodeActive(state, this.name);
                            const command = chain().toggleList(
                                this.name, this.options.itemTypeName, this.options.keepMarks,
                            );
                            if (wasActive) return command.run();
                            return command.updateAttributes(this.name, {
                                carveBareMarker: true, carveDelim: '.',
                            }).run();
                        }, { carveBareMarker: true, carveDelim: '.' }),
                    };
                },
            });
            extensions.push(CustomOrderedList.configure(this.options.orderedList ?? {}));
        }

        // Custom ListItem that excludes task items (those with checkboxes)
        if (this.options.listItem !== false) {
            const CustomListItem = ListItem.extend({
                // An item may open with any block or be empty, as Carve allows;
                // the stock `paragraph block*` moved such content out on HTML
                // parsing (#537).
                content: 'block*',
                // A marker attribute (`-{.c} item`) belongs to the ITEM, and
                // ProseMirror drops any attribute a node does not declare.
                addAttributes() {
                    return {
                        ...this.parent?.(),
                        ...attributeSlots(),
                        class: { default: null, parseHTML: authoredClasses },
                    };
                },
                parseHTML() {
                    return [
                        {
                            tag: 'li',
                            getAttrs: element => {
                                // Don't match list items with checkboxes - let TaskItem handle those
                                const checkbox = element.querySelector('input[type="checkbox"]');
                                if (checkbox) {
                                    return false;
                                }
                                return {};
                            },
                        },
                    ];
                },
            });
            extensions.push(CustomListItem.configure(this.options.listItem ?? {}));
        }

        // Highlight mark (built-in, maps to =text=)
        if (this.options.highlight !== false) {
            extensions.push(Highlight.extend(carveMarkRules('highlight')).configure(this.options.highlight ?? {}));
        }

        // Subscript mark (maps to the braced {,text,})
        if (this.options.subscript !== false) {
            extensions.push(Subscript.extend(carveMarkRules('subscript')).configure(this.options.subscript ?? {}));
        }

        // Superscript mark (maps to the braced {^text^})
        if (this.options.superscript !== false) {
            extensions.push(Superscript.extend(carveMarkRules('superscript')).configure(this.options.superscript ?? {}));
        }

        // Underline mark (maps to _text_)
        if (this.options.underline !== false) {
            extensions.push(Underline.extend(carveMarkRules('underline')).configure(this.options.underline ?? {}));
        }

        // Link extension with keyboard shortcut
        if (this.options.link !== false) {
            extensions.push(
                Link.configure({
                    openOnClick: false,
                    ...this.options.link,
                }).extend({
                    // A REFERENCE link keeps the label the author wrote. The
                    // converter puts `carveRef`/`carveRawRef` on the mark (PART 12
                    // section 3a) and the serializer writes the reference form
                    // from them - but ProseMirror drops any attribute the mark
                    // does not declare, so without this the metadata survives
                    // only when the JSON never reaches an editor, which is not
                    // the path anyone uses (carve-grammars#101).
                    addAttributes() {
                        return {
                            ...this.parent?.(),
                            title: { default: null },
                            carveRef: { default: null },
                            carveRawRef: { default: null },
                            carveReferenceDefinition: { default: null },
                            // An AUTOLINK is `<https://e.com>`; the same target
                            // written `[t](https://e.com)` is a different node
                            // in the AST, so the spelling has to survive as
                            // metadata or every autolink comes back as an
                            // inline link.
                            carveAutolink: { default: null },
                            // An ATTRIBUTE RUN on the link (`[t](/u){#id .c}`).
                            // Without these the run was dropped in silence: an
                            // id and classes the author wrote simply vanished.
                            ...attributeSlots([
                                'href', 'target', 'rel', 'title', 'carveRef', 'carveRawRef',
                                'carveReferenceDefinition', 'carveAutolink',
                            ]),
                        };
                    },
                    // A reference with no target renders `href=""`, which the
                    // stock `a[href]` rule rejects, so the whole link came back
                    // as bare text (#522). The reference carries it instead.
                    parseHTML() {
                        return [
                            ...(this.parent?.() ?? []),
                            { tag: 'a[carveref]', getAttrs: (dom) => (dom.getAttribute('href') ? false : null) },
                        ];
                    },
                    addKeyboardShortcuts() {
                        return {
                            'Mod-Shift-k': () => {
                                if (this.editor.isActive('link')) {
                                    return this.editor.chain().focus().unsetLink().run();
                                }
                                const url = prompt('Enter URL:');
                                if (url) {
                                    return this.editor.chain().focus().setLink({ href: url }).run();
                                }
                                return false;
                            },
                        };
                    },
                })
            );
        }

        // Image extension. Inline by default so `text ![alt](x) more` stays one
        // paragraph (Carve images are inline); a block-level image just becomes a
        // paragraph containing the inline image.
        if (this.options.image !== false) {
            extensions.push(Image.extend({
                addAttributes() {
                    return {
                        ...this.parent?.(),
                        carveRef: { default: null },
                        carveRawRef: { default: null },
                        ...attributeSlots([
                            'src', 'alt', 'title', 'width', 'height', 'carveRef', 'carveRawRef',
                        ]),
                    };
                },
            }).configure({ inline: true, ...(this.options.image ?? {}) }));
        }

        // Table extensions
        if (this.options.table !== false) {
            extensions.push(Table.configure({
                resizable: true,
                ...this.options.table,
            }));
            const tableAlign = {
                default: null,
                parseHTML: element => !element.hasAttribute('data-carve-inherited-align')
                    && ['left', 'center', 'right'].includes(element.style.textAlign)
                    ? element.style.textAlign : null,
                renderHTML: attrs => ['left', 'center', 'right'].includes(attrs.textAlign)
                    ? { style: `text-align: ${attrs.textAlign}` } : {},
            };
            const inheritedTableAlign = {
                default: null,
                parseHTML: () => null,
                renderHTML: attrs => !attrs.textAlign && ['left', 'center', 'right'].includes(attrs.carveInheritedTextAlign)
                    ? {
                        style: `text-align: ${attrs.carveInheritedTextAlign}`,
                        'data-carve-inherited-align': attrs.carveInheritedTextAlign,
                    } : {},
            };
            // `scope` is header-only: both engines write it on a `<th>` and on
            // nothing else, so reserving it on a row or a body cell would drop
            // an authored `|{scope=row} x |` instead.
            const tableAttrs = (own = []) => ({
                ...attributeSlots([
                    'colspan', 'rowspan', 'colwidth', 'data-colwidth', 'style',
                    'data-carve-inherited-align', ...own,
                ]),
                textAlign: tableAlign, carveInheritedTextAlign: inheritedTableAlign,
            });
            // Tiptap 3 cells declare an `align` of their own, read from the
            // same `text-align` the kit writes for `textAlign`, and the
            // serializer wrote it back as an authored `{align=...}` (#532).
            const withoutStockAlign = (parent) => (parent?.align
                ? { ...parent, align: { ...parent.align, parseHTML: () => null } }
                : parent);
            const CustomTableRow = TableRow.extend({ addAttributes() { return { ...this.parent?.(), ...tableAttrs() }; } });
            const CustomTableCell = TableCell.extend({ addAttributes() { return { ...withoutStockAlign(this.parent?.()), ...tableAttrs() }; } });
            const CustomTableHeader = TableHeader.extend({ addAttributes() { return { ...withoutStockAlign(this.parent?.()), ...tableAttrs(['scope']) }; } });
            extensions.push(CustomTableRow.configure(this.options.tableRow ?? {}));
            extensions.push(CustomTableCell.configure(this.options.tableCell ?? {}));
            extensions.push(CustomTableHeader.configure(this.options.tableHeader ?? {}));
        }

        // Task list extensions - extend to match PHP output format
        if (this.options.taskList !== false) {
            // Extend TaskList to also match ul.task-list with high priority
            const CustomTaskList = TaskList.extend({
                addCommands() {
                    const parent = this.parent?.();
                    return {
                        ...parent,
                        toggleTaskList: () => toggleCarveList(
                            this.name, this.options.itemTypeName, (props) => parent.toggleTaskList()(props),
                        ),
                    };
                },
                parseHTML() {
                    return [
                        { tag: 'ul[data-type="taskList"]', priority: 60 },
                        { tag: 'ul.task-list', priority: 60 },
                        // carve-php: a plain <ul> whose items carry a checkbox.
                        {
                            tag: 'ul',
                            priority: 55,
                            getAttrs: (element) => Array.from(element.children).some(
                                (li) => li.tagName === 'LI' && li.querySelector('input[type="checkbox"]'),
                            ) ? {} : false,
                        },
                    ];
                },
            });
            extensions.push(CustomTaskList.configure(this.options.taskList ?? {}));

            // Extend TaskItem to also match li with checkbox input with high priority
            const CustomTaskItem = TaskItem.extend({
                content: 'block*',
                addInputRules() {
                    const parent = this.parent?.() ?? [];
                    return [...parent.map((rule) => taskMarkerInBulletItem(rule.find, this.name)), ...parent];
                },
                addAttributes() {
                    return {
                        ...this.parent?.(),
                        checked: {
                            default: false,
                            keepOnSplit: false,
                            parseHTML: element => {
                                // First check data-checked attribute
                                const dataChecked = element.getAttribute('data-checked');
                                if (dataChecked !== null) {
                                    return dataChecked === 'true';
                                }
                                // Then check for checkbox input
                                const checkbox = element.querySelector('input[type="checkbox"]');
                                return checkbox?.hasAttribute('checked') || false;
                            },
                            renderHTML: attributes => ({
                                'data-checked': attributes.checked,
                            }),
                        },
                        // The four non-space task states (`-` `_` `>` `?`)
                        // the engine emits as `data-task-state`. Null for a
                        // plain `[ ]`/`[x]` item, whose state `checked` holds.
                        // Without this, a load/save cycle collapsed every such
                        // item back to `[ ]` (markup-carve/carve-grammars#371).
                        carveTaskState: {
                            default: null,
                            keepOnSplit: false,
                            parseHTML: (element) => {
                                const state = element.getAttribute('data-task-state');
                                return state && !DONE_TASK_STATES.has(state) ? state : null;
                            },
                            renderHTML: attributes => (
                                attributes.carveTaskState ? { 'data-task-state': attributes.carveTaskState } : {}
                            ),
                        },
                        // A task item takes a marker attribute the same way a
                        // plain item does: `-{.c} [ ] text`.
                        ...attributeSlots(['data-checked', 'data-task-state', 'data-type']),
                        class: { default: null, parseHTML: authoredClasses },
                    };
                },
                parseHTML() {
                    return [
                        { tag: 'li[data-type="taskItem"]', priority: 60 },
                        // Match list items that contain a checkbox input
                        {
                            tag: 'li',
                            priority: 60,
                            getAttrs: element => {
                                const checkbox = element.querySelector('input[type="checkbox"]');
                                if (checkbox) return {};
                                return false;
                            },
                        },
                    ];
                },
            });
            extensions.push(CustomTaskItem.configure({
                nested: true,
                ...this.options.taskItem,
            }));
        }

        // Carve-specific extensions
        if (this.options.carveInsert !== false) {
            extensions.push(CarveInsert.configure(this.options.carveInsert ?? {}));
        }

        if (this.options.carveCriticComment !== false) {
            extensions.push(CarveCriticComment.configure(this.options.carveCriticComment ?? {}));
        }

        if (this.options.carveDelete !== false) {
            extensions.push(CarveDelete.configure(this.options.carveDelete ?? {}));
        }

        if (this.options.carveDiv !== false) {
            extensions.push(CarveDiv.configure(this.options.carveDiv ?? {}));
        }

        // Tab sets (:::: tabs / ::: tab). Registered after CarveDiv but their
        // div.tabs / div.tab parse rules use a higher priority, so a tab set is
        // claimed here instead of by CarveDiv's generic div[class] rule.
        if (this.options.carveTabs !== false) {
            extensions.push(CarveTabSet.configure(this.options.carveTabs ?? {}));
            extensions.push(CarveTab.configure(this.options.carveTabs ?? {}));
        }

        // Code groups (:::: code-group). An Extension rather than a Node: a code
        // group already arrives as a carveDiv whose children carry their own
        // labels, so this attaches a bar to the existing node and leaves the
        // document shape - and therefore the serializer - alone.
        if (this.options.carveCodeGroup !== false) {
            extensions.push(CarveCodeGroup.configure(this.options.carveCodeGroup ?? {}));
        }

        // Span with class mark (maps to [text]{.class})
        if (this.options.carveSpan !== false) {
            extensions.push(CarveSpan.configure(this.options.carveSpan ?? {}));
        }

        // Footnote reference node (maps to [^label])
        if (this.options.carveFootnote !== false) {
            extensions.push(CarveFootnote.configure(this.options.carveFootnote ?? {}));
        }

        // Math node (maps to $`x`$ inline, $$`x`$$ display)
        if (this.options.carveMath !== false) {
            extensions.push(CarveMath.configure(this.options.carveMath ?? {}));
        }

        // Footnote definition block (maps to [^label]: body)
        if (this.options.carveFootnoteDefinition !== false) {
            extensions.push(CarveFootnoteDefinition.configure(this.options.carveFootnoteDefinition ?? {}));
        }

        // Embed node (preserves videos, oEmbed content)
        if (this.options.carveEmbed !== false) {
            extensions.push(CarveEmbed.configure(this.options.carveEmbed ?? {}));
        }

        // Abbreviation mark (maps to [ABBR]{abbr="expansion"})
        if (this.options.carveAbbreviation !== false) {
            extensions.push(CarveAbbreviation.configure(this.options.carveAbbreviation ?? {}));
        }
        if (this.options.carveAbbreviationDefinition !== false) {
            extensions.push(CarveAbbreviationDefinition.configure(this.options.carveAbbreviationDefinition ?? {}));
        }

        // Definition list nodes (maps to : term with definition)
        if (this.options.definitionList !== false) {
            extensions.push(CarveDefinitionList.configure(this.options.definitionList ?? {}));
            extensions.push(CarveDefinitionTerm.configure(this.options.definitionTerm ?? {}));
            extensions.push(CarveDefinitionDescription.configure(this.options.definitionDescription ?? {}));
        }

        if (this.options.carveUnsupported !== false) {
            extensions.push(CarveUnsupported.configure(this.options.carveUnsupported ?? {}));
        }
        if (this.options.carveUnsupportedInline !== false) {
            extensions.push(CarveUnsupportedInline.configure(this.options.carveUnsupportedInline ?? {}));
        }
        if (this.options.carveEmptyMark !== false) {
            extensions.push(CarveEmptyMark.configure(this.options.carveEmptyMark ?? {}));
        }
        if (this.options.carveFigure !== false) {
            extensions.push(CarveFigure.configure(this.options.carveFigure ?? {}));
            // A composite figure (PART 9 §4c) is registered with the figure it
            // groups: its panels ARE carveFigure nodes, so turning figures off
            // and leaving the group on would register a container whose content
            // the schema cannot hold.
            extensions.push(CarveFigureGroup.configure(this.options.carveFigureGroup ?? {}));
            extensions.push(CarveCaption.configure(this.options.carveCaption ?? {}));
        }
        if (this.options.carveFrontmatter !== false) {
            extensions.push(CarveFrontmatter.configure(this.options.carveFrontmatter ?? {}));
        }
        if (this.options.carveLinkRefDef !== false) {
            extensions.push(CarveLinkRefDef.configure(this.options.carveLinkRefDef ?? {}));
        }
        if (this.options.carveCitationDefinition !== false) {
            extensions.push(CarveCitationDefinition.configure(this.options.carveCitationDefinition ?? {}));
        }
        if (this.options.carveInlineExtension !== false) {
            extensions.push(CarveInlineExtension.configure(this.options.carveInlineExtension ?? {}));
        }
        if (this.options.carveInlineNote !== false) {
            extensions.push(CarveInlineNote.configure(this.options.carveInlineNote ?? {}));
        }
        if (this.options.carveRawInline !== false) {
            extensions.push(CarveRawInline.configure(this.options.carveRawInline ?? {}));
        }
        if (this.options.carveLiteral !== false) {
            extensions.push(CarveLiteral.configure(this.options.carveLiteral ?? {}));
        }
        if (this.options.carveSubstitution !== false) {
            extensions.push(CarveSubstitution.configure(this.options.carveSubstitution ?? {}));
        }
        if (this.options.carveSymbol !== false) {
            extensions.push(CarveSymbol.configure(this.options.carveSymbol ?? {}));
        }
        if (this.options.carveCitation !== false) {
            extensions.push(CarveCitation.configure(this.options.carveCitation ?? {}));
        }
        if (this.options.carveCrossref !== false) {
            extensions.push(CarveCrossref.configure(this.options.carveCrossref ?? {}));
        }

        // The four types Carve 0.1 source does not spell, which reach the editor
        // over the AST wire only (CARVE-P12-050, -054, -055, -057). Registered
        // rather than left to the preservation atom: three of them have no source
        // form at all, so an atom holding `carveSource` has nothing to hold and
        // the construct would be lost rather than preserved.
        if (this.options.carveDirective !== false) {
            extensions.push(CarveDirective.configure(this.options.carveDirective ?? {}));
        }
        if (this.options.carveBlockExtension !== false) {
            extensions.push(CarveBlockExtension.configure(this.options.carveBlockExtension ?? {}));
        }
        if (this.options.carveRuby !== false) {
            extensions.push(CarveRuby.configure(this.options.carveRuby ?? {}));
        }
        if (this.options.carveSmallCaps !== false) {
            extensions.push(CarveSmallCaps.configure(this.options.carveSmallCaps ?? {}));
        }
        if (this.options.carveSection !== false) {
            extensions.push(CarveSection.configure(this.options.carveSection ?? {}));
        }
        if (this.options.carveRawBlock !== false) {
            extensions.push(CarveRawBlock.configure(this.options.carveRawBlock ?? {}));
        }
        if (this.options.carveComment !== false) {
            extensions.push(CarveComment.configure(this.options.carveComment ?? {}));
            extensions.push(CarveCommentInline.configure(this.options.carveCommentInline ?? {}));
        }
        if (this.options.carveSourcePreservation !== false) {
            extensions.push(CarveSourcePreservation.configure(this.options.carveSourcePreservation ?? {}));
        }
        if (this.options.carveLineBlock !== false) {
            extensions.push(CarveLineBlock.configure(this.options.carveLineBlock ?? {}));
        }

        // Mentions (@name) and tags (#tag); citations [@key] use a mention.
        if (this.options.mention !== false) {
            extensions.push(CarveMention.configure(this.options.mention ?? {}));
        }
        if (this.options.tag !== false) {
            extensions.push(CarveTag.configure(this.options.tag ?? {}));
        }

        // Keyboard shortcuts (Ctrl/Cmd+1..6 headings, clear formatting, Enter
        // reset, ...). Opt out with CarveKit.configure({ keymap: false }).
        if (this.options.keymap !== false) {
            extensions.push(CarveKeymap.configure(this.options.keymap ?? {}));
        }

        return extensions;
    },
});

export default CarveKit;
