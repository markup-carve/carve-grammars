import { Mark, mergeAttributes } from '@tiptap/core';
import { attributeOrderSlot } from './carve-attribute-slots.js';

/**
 * Carve Span mark extension for Tiptap
 *
 * Renders as [text]{.class} in Carve markup
 *
 * @example
 * ```js
 * import { CarveSpan } from '@markup-carve/carve-grammars/tiptap'
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
                // `custom` is UI chrome, not authored Carve. A schema default
                // is materialized by ProseMirror even when the AST supplied no
                // class, turning `[x]{}` into `[x]{.custom}` on first mount.
                default: null,
                parseHTML: element => {
                    // First check data-carve-class, then fall back to class attribute
                    const carveClass = element.getAttribute('data-carve-class');
                    if (carveClass) return carveClass;
                    // Extract class from className, filtering out carve-span
                    const className = element.className || '';
                    return className.replace('carve-span', '').trim() || null;
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
            lang: {
                default: null,
                parseHTML: element => element.hasAttribute('lang') ? element.getAttribute('lang') : null,
                renderHTML: attributes => attributes.lang === null ? {} : { lang: attributes.lang },
            },
            carveKeyValues: {
                default: null,
                parseHTML: element => {
                    const raw = element.getAttribute('data-carve-key-values');
                    if (!raw) return null;
                    try { return JSON.parse(raw); } catch { return null; }
                },
                renderHTML: attributes => attributes.carveKeyValues
                    ? { 'data-carve-key-values': JSON.stringify(attributes.carveKeyValues) }
                    : {},
            },
            ...attributeOrderSlot(),
        };
    },

    parseHTML() {
        return [
            { tag: 'span[data-carve-class]' },
            { tag: 'span[lang]' },
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
        const className = HTMLAttributes['data-carve-class'] || '';
        return ['span', mergeAttributes(HTMLAttributes, {
            class: `carve-span${className ? ` ${className}` : ''}`,
            ...(className ? { 'data-carve-class': className } : {}),
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
