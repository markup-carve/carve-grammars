import { Node, mergeAttributes } from '@tiptap/core';
import { attributeSlots } from './carve-attribute-slots.js';

/**
 * An authored bibliography definition: `[@key]: {author= year=} entry`.
 *
 * Shaped after `CarveLinkRefDef` rather than after the footnote definition,
 * which is what PART 12 section 18 asks for: a footnote body holds BLOCKS,
 * while a citation entry holds one line of rendered text. So this node is not
 * an atom - its content is the entry's inline run, and the editor edits it in
 * place.
 *
 * The leading `{author= year=}` metadata block lands in the ordinary attribute
 * slots; `author` and `year` are what author-date mode reads.
 */
export const CarveCitationDefinition = Node.create({
    name: 'carveCitationDefinition',
    group: 'block',
    content: 'inline*',
    addAttributes() {
        return {
            key: { default: '' },
            ...attributeSlots(['data-carve-citation-definition']),
        };
    },
    parseHTML() { return [{ tag: 'div[data-carve-citation-definition]' }]; },
    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-carve-citation-definition': 'true' }), 0];
    },
});

export default CarveCitationDefinition;
