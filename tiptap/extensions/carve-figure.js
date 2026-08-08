import { Node, mergeAttributes } from '@tiptap/core';

export const CarveFigure = Node.create({
    name: 'carveFigure',
    group: 'block',
    content: 'block+',
    defining: true,
    addAttributes() {
        return {
            id: { default: null },
            class: { default: null },
            keyValues: { default: null },
        };
    },
    parseHTML() { return [{ tag: 'figure[data-carve-figure]' }]; },
    renderHTML({ HTMLAttributes }) {
        return ['figure', mergeAttributes(HTMLAttributes, { 'data-carve-figure': 'true' }), 0];
    },
});

export const CarveCaption = Node.create({
    name: 'carveCaption',
    group: 'block',
    content: 'inline*',
    parseHTML() { return [{ tag: 'figcaption[data-carve-caption]' }]; },
    renderHTML({ HTMLAttributes }) {
        return ['figcaption', mergeAttributes(HTMLAttributes, { 'data-carve-caption': 'true' }), 0];
    },
});
