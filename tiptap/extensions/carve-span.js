import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * Carve Span mark extension for Tiptap
 *
 * Renders as [text]{.class} in Carve markup
 *
 * @example
 * ```js
 * import { CarveSpan } from 'carve-grammars/tiptap'
 *
 * const editor = new Editor({
 *   extensions: [CarveSpan],
 * })
 *
 * // Apply span with class
 * editor.chain().focus().setCarveSpan({ class: 'highlight' }).run()
 * ```
 */
export const CarveSpan = Mark.create({
    name: 'carveSpan',

    addAttributes() {
        return {
            class: {
                default: 'custom',
                parseHTML: element => {
                    // First check data-carve-class, then fall back to class attribute
                    const carveClass = element.getAttribute('data-carve-class');
                    if (carveClass) return carveClass;
                    // Extract class from className, filtering out carve-span
                    const className = element.className || '';
                    return className.replace('carve-span', '').trim() || 'custom';
                },
                renderHTML: attributes => {
                    return { 'data-carve-class': attributes.class };
                },
            },
            id: {
                default: null,
                parseHTML: element => element.getAttribute('id') || null,
                renderHTML: attributes => {
                    if (!attributes.id) return {};
                    return { id: attributes.id };
                },
            },
        };
    },

    parseHTML() {
        return [
            { tag: 'span[data-carve-class]' },
            // Also match spans with class attributes from PHP renderer
            {
                tag: 'span[class]',
                getAttrs: element => {
                    // Skip spans that are part of code highlighting or other editor elements
                    const className = element.className || '';
                    // Skip token spans (Phiki/Torchlight syntax highlighting)
                    if (className.includes('token') || className.includes('phiki') ||
                        className.includes('torchlight') || className.includes('ProseMirror')) {
                        return false;
                    }
                    // Skip if inside a pre or code element
                    if (element.closest('pre') || element.closest('code')) {
                        return false;
                    }
                    // Match spans with simple classes (likely from Carve [text]{.class})
                    if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(className)) {
                        return {};
                    }
                    return false;
                },
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        const className = HTMLAttributes['data-carve-class'] || 'custom';
        return ['span', mergeAttributes(HTMLAttributes, {
            class: `carve-span ${className}`,
            'data-carve-class': className,
        }), 0];
    },

    addCommands() {
        return {
            setCarveSpan: (attributes) => ({ commands }) => {
                return commands.setMark(this.name, attributes);
            },
            toggleCarveSpan: (attributes) => ({ commands }) => {
                return commands.toggleMark(this.name, attributes);
            },
            unsetCarveSpan: () => ({ commands }) => {
                return commands.unsetMark(this.name);
            },
        };
    },
});

export default CarveSpan;
