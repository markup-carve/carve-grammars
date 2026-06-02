import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Carve Div container node extension for Tiptap
 *
 * Renders as ::: class in Carve markup
 *
 * @example
 * ```js
 * import { CarveDiv } from 'carve-grammars/tiptap'
 *
 * const editor = new Editor({
 *   extensions: [CarveDiv],
 * })
 *
 * // Wrap selection in a div container
 * editor.chain().focus().setCarveDiv({ class: 'warning' }).run()
 * ```
 */
export const CarveDiv = Node.create({
    name: 'carveDiv',

    group: 'block',

    content: 'block+',

    defining: true,

    addAttributes() {
        return {
            class: {
                default: null,
                parseHTML: element => element.getAttribute('data-carve-class') || element.className.replace('carve-div', '').trim() || null,
                renderHTML: attributes => {
                    if (!attributes.class) return {};
                    return { 'data-carve-class': attributes.class };
                },
            },
        };
    },

    parseHTML() {
        return [
            { tag: 'div.carve-div' },
            // Also match common container classes rendered by carve-php
            { tag: 'div.note' },
            { tag: 'div.tip' },
            { tag: 'div.warning' },
            { tag: 'div.danger' },
            { tag: 'div.info' },
            // Match any div with a single class (likely a ::: container)
            {
                tag: 'div[class]',
                getAttrs: element => {
                    // Only match divs with a simple class (not complex component divs)
                    const className = element.className;
                    // Skip if it looks like a WordPress/editor component
                    if (className.includes('wp-') || className.includes('block-') ||
                        className.includes('editor-') || className.includes('is-')) {
                        return false;
                    }
                    // Skip Torchlight code block line divs
                    if (className === 'line' || className.includes('line-')) {
                        return false;
                    }
                    // Skip if inside a pre or code element (syntax highlighting)
                    if (element.closest('pre') || element.closest('code')) {
                        return false;
                    }
                    // Accept single-word classes or carve-div
                    if (/^[a-z-]+$/i.test(className) || className.includes('carve-div')) {
                        return {};
                    }
                    return false;
                },
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        const classes = ['carve-div'];
        if (HTMLAttributes['data-carve-class']) {
            classes.push(HTMLAttributes['data-carve-class']);
        }
        return ['div', mergeAttributes(HTMLAttributes, { class: classes.join(' ') }), 0];
    },

    addCommands() {
        return {
            setCarveDiv: (attributes) => ({ commands }) => {
                return commands.wrapIn(this.name, attributes);
            },
            toggleCarveDiv: (attributes) => ({ commands }) => {
                return commands.toggleWrap(this.name, attributes);
            },
            unsetCarveDiv: () => ({ commands }) => {
                return commands.lift(this.name);
            },
        };
    },
});

export default CarveDiv;
