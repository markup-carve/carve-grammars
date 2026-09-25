import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';

/** The text an inline array reads as, for the places that can only show a string. */
function inlineText(nodes) {
    return (nodes || []).map(node => node.text ?? inlineText(node.content)).join('');
}

/**
 * An interchange-only ruby annotation (CARVE-P12-054).
 *
 * An atom, because `pairs` is the association: each pair holds a `base` and an
 * `annotation` as inline arrays, and there is no parallel `children` field a
 * ProseMirror content expression could stand in for. The same shape
 * `carveSubstitution` uses for its two halves and `carveCitation` for an item's
 * prefix, locator and suffix.
 *
 * Carve 0.1 source spells no ruby, so one only ever arrives over the AST wire.
 */
export const CarveRuby = Node.create({
    name: 'carveRuby',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() {
        return {
            // `rendered: false` for the reason `carveSubstitution` gives: an HTML
            // attribute holds a string, and a pair is an object.
            pairs: { default: [], rendered: false },
            ...attributeSlots(['data-carve-ruby']),
        };
    },
    parseHTML() { return [{ tag: 'ruby[data-carve-ruby]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        // One `<ruby>` in pair order, with generated `<rp>` parentheses around
        // each `<rt>` so a reader without ruby support still sees `base(ann)`.
        const children = [];
        for (const pair of node.attrs.pairs || []) {
            children.push(inlineText(pair?.base));
            children.push(['rp', '(']);
            children.push(['rt', inlineText(pair?.annotation)]);
            children.push(['rp', ')']);
        }

        return ['ruby', mergeAttributes(HTMLAttributes, { 'data-carve-ruby': 'true' }), ...children];
    },
});

export default CarveRuby;
