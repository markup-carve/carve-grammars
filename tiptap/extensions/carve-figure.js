import { Node, mergeAttributes } from '@tiptap/core';
import { attributeOrderSlot } from './carve-attribute-slots.js';

export const CarveFigure = Node.create({
    name: 'carveFigure',
    group: 'block',
    content: 'block+',
    defining: true,
    addAttributes() {
        return {
            id: { default: null },
            class: { default: null },
            carveKeyValues: { default: null },
            ...attributeOrderSlot(),
        };
    },
    parseHTML() { return [{ tag: 'figure[data-carve-figure]' }]; },
    renderHTML({ HTMLAttributes }) {
        return ['figure', mergeAttributes(HTMLAttributes, { 'data-carve-figure': 'true' }), 0];
    },
});

/**
 * A composite figure: one figure of ordered panels (PART 9 §4c).
 *
 * The panels are the `carveFigure` and `table` children; everything else is
 * plain group content preserved in place between them, which is why the
 * content expression is the same `block` group every other container uses
 * rather than a panel-only list. A zero-panel group is a valid parse (the
 * degenerate counts are lint findings, not errors), so the expression is
 * `block*` and not `block+`.
 *
 * The GROUP CAPTION rides as a trailing `carveCaption` child. It is authored
 * after the CLOSING fence, and the serializer is what knows to write it there;
 * holding it in the node keeps one caption node for both hosts, and a group
 * with no caption simply has no `carveCaption` child - an empty one would
 * serialize to a bare `^ ` line and invent a caption nobody wrote.
 *
 * There is no title and no label attribute BY DESIGN: an opener carrying
 * either is not this production at all, it is a generic Tier-2 container, and
 * the loader builds a `carveDiv` for it.
 */
export const CarveFigureGroup = Node.create({
    name: 'carveFigureGroup',
    group: 'block',
    content: 'block*',
    defining: true,
    addAttributes() {
        return {
            id: { default: null },
            class: { default: null },
            carveKeyValues: { default: null },
            ...attributeOrderSlot(),
        };
    },
    parseHTML() { return [{ tag: 'figure[data-carve-figure-group]' }]; },
    renderHTML({ HTMLAttributes }) {
        return ['figure', mergeAttributes(HTMLAttributes, { 'data-carve-figure-group': 'true' }), 0];
    },
});

export const CarveCaption = Node.create({
    name: 'carveCaption',
    group: 'block',
    content: 'inline*',
    addAttributes() { return { short: { default: false } }; },
    parseHTML() { return [{ tag: 'figcaption[data-carve-caption]' }]; },
    renderHTML({ HTMLAttributes }) {
        return ['figcaption', mergeAttributes(HTMLAttributes, { 'data-carve-caption': 'true' }), 0];
    },
});
