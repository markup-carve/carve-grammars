import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
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
import ListItem from '@tiptap/extension-list-item';
import HardBreak from '@tiptap/extension-hard-break';

import { CarveInsert } from './extensions/carve-insert.js';
import { CarveDelete } from './extensions/carve-delete.js';
import { CarveCriticComment } from './extensions/carve-critic-comment.js';
import { CarveDiv } from './extensions/carve-div.js';
import { CarveTabSet, CarveTab } from './extensions/carve-tabs.js';
import { CarveSpan } from './extensions/carve-span.js';
import { CarveFootnote } from './extensions/carve-footnote.js';
import { CarveMath } from './extensions/carve-math.js';
import { CarveFootnoteDefinition } from './extensions/carve-footnote-definition.js';
import { CarveEmbed } from './extensions/carve-embed.js';
import { CarveAbbreviation } from './extensions/carve-abbreviation.js';
import { CarveDefinitionList, CarveDefinitionTerm, CarveDefinitionDescription } from './extensions/carve-definition-list.js';
import { CarveUnsupported } from './extensions/carve-unsupported.js';

// Tiptap 3 dropped the default export from @tiptap/extension-table - it now
// exports Table (plus TableRow/TableCell/TableHeader/TableKit) by name. Tiptap 2
// only had the default. This reads whichever the installed major provides; the
// row/cell/header packages kept their defaults in both, so they import plainly.
const Table = TableModule.default ?? TableModule.Table;
import { CarveKeymap } from './extensions/carve-keymap.js';
import { CarveMention, CarveTag } from './extensions/carve-mention.js';

// Languages offered by the code-block picker. The current language is always
// shown even if it is not in this list.
const CODE_LANGS = [
    { value: '', label: 'Plain text' },
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
 * import { CarveKit, serializeToCarve } from 'carve-grammars/tiptap'
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
 * import { CarveKit } from 'carve-grammars/tiptap'
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
export const CarveKit = Extension.create({
    name: 'carveKit',

    addExtensions() {
        const extensions = [];

        // StarterKit provides: Document, Paragraph, Text, Bold, Italic, Code,
        // CodeBlock, Blockquote, BulletList, OrderedList, ListItem, Heading,
        // HardBreak, HorizontalRule, Dropcursor, Gapcursor, History
        if (this.options.starterKit !== false) {
            extensions.push(StarterKit.configure({
                // Disable CodeBlock from StarterKit, we add a custom one below
                codeBlock: false,
                // Disable default lists - we add custom ones that handle task-list
                bulletList: false,
                listItem: false,
                // Disable HardBreak, we add a custom one with visible indicator
                hardBreak: false,
                // Tiptap 3 folded Underline and Link INTO StarterKit, while this
                // kit pushes both separately below (underline maps to Carve's
                // `_text_`, link carries the Carve-specific attribute handling).
                // Leaving them enabled registers each mark twice, which Tiptap
                // rejects as a duplicate name. Tiptap 2's StarterKit has no such
                // keys and ignores them, so this is safe on both majors.
                underline: false,
                link: false,
                ...this.options.starterKit,
            }));
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
                        languageRaw: {
                            default: null,
                            parseHTML: element => {
                                // Check parent <pre> for data-language-raw
                                const pre = element.closest('pre');
                                return pre?.getAttribute('data-language-raw') || null;
                            },
                            renderHTML: attributes => {
                                if (!attributes.languageRaw) return {};
                                return { 'data-language-raw': attributes.languageRaw };
                            },
                        },
                    };
                },

                // Floating language picker: a <select> in the corner of every
                // code block that shows the current language and edits it in
                // place (the toolbar can't show a per-block value). Disable with
                // CarveKit.configure({ codeBlock: { languagePicker: false } }).
                addNodeView() {
                    if (this.options.languagePicker === false) {
                        return null;
                    }
                    return ({ node, editor, getPos }) => {
                        let current = node;
                        const pre = document.createElement('pre');
                        if (node.attrs.languageRaw) {
                            pre.setAttribute('data-language-raw', node.attrs.languageRaw);
                        }

                        const select = document.createElement('select');
                        select.className = 'carve-code-lang';
                        select.contentEditable = 'false';
                        select.setAttribute('aria-label', 'Code language');
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
                        pre.appendChild(select);
                        pre.appendChild(code);

                        return {
                            dom: pre,
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
                            ignoreMutation: (m) => select.contains(m.target),
                            stopEvent: (e) => select.contains(e.target),
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

        // Custom ListItem that excludes task items (those with checkboxes)
        if (this.options.listItem !== false) {
            const CustomListItem = ListItem.extend({
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

        // Highlight mark (built-in, maps to ==text==)
        if (this.options.highlight !== false) {
            extensions.push(Highlight.configure(this.options.highlight ?? {}));
        }

        // Subscript mark (maps to the braced {,text,})
        if (this.options.subscript !== false) {
            extensions.push(Subscript.configure(this.options.subscript ?? {}));
        }

        // Superscript mark (maps to the braced {^text^})
        if (this.options.superscript !== false) {
            extensions.push(Superscript.configure(this.options.superscript ?? {}));
        }

        // Underline mark (maps to _text_)
        if (this.options.underline !== false) {
            extensions.push(Underline.configure(this.options.underline ?? {}));
        }

        // Link extension with keyboard shortcut
        if (this.options.link !== false) {
            extensions.push(
                Link.configure({
                    openOnClick: false,
                    ...this.options.link,
                }).extend({
                    // A REFERENCE link keeps the label the author wrote. The
                    // converter puts `ref`/`rawRef` on the mark (PART 12
                    // section 3a) and the serializer writes the reference form
                    // from them - but ProseMirror drops any attribute the mark
                    // does not declare, so without this the metadata survives
                    // only when the JSON never reaches an editor, which is not
                    // the path anyone uses (carve-grammars#101).
                    addAttributes() {
                        return {
                            ...this.parent?.(),
                            ref: { default: null },
                            rawRef: { default: null },
                        };
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
            extensions.push(Image.configure({ inline: true, ...(this.options.image ?? {}) }));
        }

        // Table extensions
        if (this.options.table !== false) {
            extensions.push(Table.configure({
                resizable: true,
                ...this.options.table,
            }));
            extensions.push(TableRow.configure(this.options.tableRow ?? {}));
            extensions.push(TableCell.configure(this.options.tableCell ?? {}));
            extensions.push(TableHeader.configure(this.options.tableHeader ?? {}));
        }

        // Task list extensions - extend to match PHP output format
        if (this.options.taskList !== false) {
            // Extend TaskList to also match ul.task-list with high priority
            const CustomTaskList = TaskList.extend({
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

        // Definition list nodes (maps to : term with definition)
        if (this.options.definitionList !== false) {
            extensions.push(CarveDefinitionList.configure(this.options.definitionList ?? {}));
            extensions.push(CarveDefinitionTerm.configure(this.options.definitionTerm ?? {}));
            extensions.push(CarveDefinitionDescription.configure(this.options.definitionDescription ?? {}));
        }

        if (this.options.carveUnsupported !== false) {
            extensions.push(CarveUnsupported.configure(this.options.carveUnsupported ?? {}));
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
