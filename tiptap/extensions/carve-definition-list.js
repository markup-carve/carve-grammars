import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Carve Definition List extension for Tiptap
 *
 * Provides full definition list support with keyboard navigation.
 *
 * Carve syntax:
 * ```
 * : term
 *
 *   Definition paragraph (indented)
 * ```
 *
 * Multiple terms sharing definition:
 * ```
 * : color
 * : colour
 *
 *   The visual property...
 * ```
 *
 * Multiple definitions (: + continuation):
 * ```
 * : term
 *
 *   First definition.
 *
 * : +
 *
 *   Second definition.
 * ```
 *
 * Keyboard shortcuts:
 * - Enter in term: go to definition
 * - Shift+Enter in term: add another term (for synonyms)
 * - Enter in empty definition: create new term+definition pair
 * - Shift+Enter in definition: add another definition (: + syntax)
 */

/**
 * Definition List container node (<dl>)
 */
export const CarveDefinitionList = Node.create({
    name: 'definitionList',

    group: 'block',

    // Allow multiple terms followed by multiple descriptions, repeating
    content: '(definitionTerm+ definitionDescription+)+',

    parseHTML() {
        return [{ tag: 'dl', priority: 51 }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['dl', mergeAttributes(HTMLAttributes, { class: 'carve-definition-list' }), 0];
    },

    addCommands() {
        return {
            insertDefinitionList: () => ({ chain, state }) => {
                const { $from } = state.selection;
                const insertPos = $from.end();

                return chain()
                    .insertContentAt(insertPos, {
                        type: 'definitionList',
                        content: [
                            { type: 'definitionTerm' },
                            { type: 'definitionDescription', content: [{ type: 'paragraph' }] },
                        ],
                    })
                    // Focus at the start of the term
                    .focus(insertPos + 2)
                    .run();
            },
        };
    },
});

/**
 * Definition Term node (<dt>)
 * Note: No group - can only appear inside definitionList
 */
export const CarveDefinitionTerm = Node.create({
    name: 'definitionTerm',

    content: 'inline*',

    defining: true,

    parseHTML() {
        return [{ tag: 'dt', priority: 51 }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['dt', mergeAttributes(HTMLAttributes), 0];
    },

    addKeyboardShortcuts() {
        return {
            // Enter in term: go to description or create one
            'Enter': () => {
                const { state } = this.editor;
                const { $from } = state.selection;

                if ($from.parent.type.name !== 'definitionTerm') {
                    return false;
                }

                const termEnd = $from.end();

                // Empty term - let default behavior handle it
                if ($from.parent.content.size === 0) {
                    return false;
                }

                // Check what comes next
                const $afterTerm = state.doc.resolve(termEnd + 1);
                const nextNode = $afterTerm.nodeAfter;

                if (nextNode && nextNode.type.name === 'definitionDescription') {
                    // Move cursor to the description
                    return this.editor.chain()
                        .focus(termEnd + 2)
                        .run();
                } else {
                    // Insert a description after this term
                    return this.editor.chain()
                        .insertContentAt(termEnd + 1, {
                            type: 'definitionDescription',
                            content: [{ type: 'paragraph' }],
                        })
                        .focus(termEnd + 3)
                        .run();
                }
            },
            // Shift+Enter: add another term (for multiple terms sharing a definition)
            'Shift-Enter': () => {
                const { state } = this.editor;
                const { $from } = state.selection;

                if ($from.parent.type.name !== 'definitionTerm') {
                    return false;
                }

                const termEnd = $from.end();

                return this.editor.chain()
                    .insertContentAt(termEnd + 1, {
                        type: 'definitionTerm',
                    })
                    .focus(termEnd + 2)
                    .run();
            },
        };
    },
});

/**
 * Definition Description node (<dd>)
 * Note: No group - can only appear inside definitionList
 */
export const CarveDefinitionDescription = Node.create({
    name: 'definitionDescription',

    content: 'block+',

    defining: true,

    parseHTML() {
        return [{ tag: 'dd', priority: 51 }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['dd', mergeAttributes(HTMLAttributes), 0];
    },

    addKeyboardShortcuts() {
        return {
            // Enter in empty paragraph inside description: create new term+description pair
            'Enter': () => {
                const { state } = this.editor;
                const { $from } = state.selection;

                // Check if we're in a paragraph inside a description
                let inDescription = false;
                let descriptionDepth = 0;
                for (let d = $from.depth; d > 0; d--) {
                    if ($from.node(d).type.name === 'definitionDescription') {
                        inDescription = true;
                        descriptionDepth = d;
                        break;
                    }
                }

                if (!inDescription) {
                    return false;
                }

                // Check if current paragraph is empty
                const paragraph = $from.parent;
                if (paragraph.type.name !== 'paragraph' || paragraph.content.size !== 0) {
                    return false;
                }

                // Find the definition list
                let listDepth = 0;
                for (let d = $from.depth; d > 0; d--) {
                    if ($from.node(d).type.name === 'definitionList') {
                        listDepth = d;
                        break;
                    }
                }

                if (listDepth === 0) {
                    return false;
                }

                const descNode = $from.node(descriptionDepth);

                // If description only has one empty paragraph, add new term + description
                if (descNode.childCount === 1) {
                    const descEnd = $from.end(descriptionDepth);

                    return this.editor.chain()
                        .insertContentAt(descEnd + 1, [
                            { type: 'definitionTerm' },
                            { type: 'definitionDescription', content: [{ type: 'paragraph' }] },
                        ])
                        .focus(descEnd + 2)
                        .run();
                }

                return false;
            },
            // Shift+Enter: add another description (for : + continuation)
            'Shift-Enter': () => {
                const { state } = this.editor;
                const { $from } = state.selection;

                // Check if we're in a description
                let descriptionDepth = 0;
                for (let d = $from.depth; d > 0; d--) {
                    if ($from.node(d).type.name === 'definitionDescription') {
                        descriptionDepth = d;
                        break;
                    }
                }

                if (descriptionDepth === 0) {
                    return false;
                }

                const descEnd = $from.end(descriptionDepth);

                return this.editor.chain()
                    .insertContentAt(descEnd + 1, {
                        type: 'definitionDescription',
                        content: [{ type: 'paragraph' }],
                    })
                    .focus(descEnd + 3)
                    .run();
            },
        };
    },
});

export default { CarveDefinitionList, CarveDefinitionTerm, CarveDefinitionDescription };
