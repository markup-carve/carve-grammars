import { Node, mergeAttributes } from '@tiptap/core';
import { createDefinitionCardView } from './editable-atom-view.js';

/** An authored document-level abbreviation definition: `*[HTML]: expansion`. */
export const CarveAbbreviationDefinition = Node.create({
    name: 'carveAbbreviationDefinition',
    group: 'block',
    atom: true,
    addAttributes() {
        return {
            abbr: { default: '' },
            expansion: { default: '' },
        };
    },
    parseHTML() { return [{ tag: 'div[data-carve-abbreviation-definition]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['div', mergeAttributes(HTMLAttributes, {
            'data-carve-abbreviation-definition': 'true',
        }), `${node.attrs.abbr}: ${node.attrs.expansion}`];
    },
    addNodeView() {
        return createDefinitionCardView({
            className: 'carve-abbreviation-definition-card', title: 'Abbreviation definition',
            fields: [{ name: 'abbr', label: 'Abbreviation' }, { name: 'expansion', label: 'Expansion', multiline: true }],
        });
    },
});

export default CarveAbbreviationDefinition;
