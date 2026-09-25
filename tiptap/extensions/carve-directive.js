import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';

/**
 * A generated-content container: `::: toc`, `::: footnotes`, `::: bibliography`.
 *
 * Its own node rather than the `carveDiv` an admonition rides, because `kind` is
 * what tells the three named-container types apart (CARVE-P12-057) and the AST
 * schema now REFUSES an `admonition` carrying one of the six generated-content
 * kinds. Sharing `carveDiv` would leave a bridge going back to the AST with two
 * options: emit the admonition the schema rejects, or carry its own copy of the
 * six-kind enum - which is the per-consumer list the clause exists to remove.
 *
 * The body is usually empty. Blocks written inside the opener are carried, and
 * the renderer decides what they mean.
 */
export const CarveDirective = Node.create({
    name: 'carveDirective',
    group: 'block',
    content: 'block*',
    defining: true,
    addAttributes() {
        return {
            kind: { default: '' },
            title: { default: null },
            label: { default: null },
            ...attributeSlots(['kind', 'title', 'label', 'data-carve-directive']),
        };
    },
    parseHTML() { return [{ tag: 'div[data-carve-directive]' }]; },
    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-carve-directive': 'true' }), 0];
    },
});

export default CarveDirective;
