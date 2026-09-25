import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * An interchange-only small-caps wrapper (CARVE-P12-050).
 *
 * A MARK, not a node: it wraps inline content and takes span attributes, so it
 * nests with every other mark and an editor can toggle it over a selection. A
 * node would make it an atom and stop the text inside being edited.
 *
 * The node's own `attrs` do NOT ride here. CARVE-P12-050 says a canonical writer
 * preserves them "on an ordinary attributed span around those children", so the
 * converter adds a `carveSpan` mark for them and the existing span machinery
 * writes the run. This mark carries the small-caps distinction and nothing else.
 *
 * Carve 0.1 source spells no small caps, so one only ever arrives over the AST
 * wire, and a canonical writer drops the wrapper and reports the loss.
 */
export const CarveSmallCaps = Mark.create({
    name: 'carveSmallCaps',

    parseHTML() {
        return [
            { tag: 'span.smallcaps' },
            { tag: 'span.carve-small-caps' },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        // `<span class="smallcaps">`, the spelling CARVE-P12-050 names.
        return ['span', mergeAttributes(HTMLAttributes, { class: 'smallcaps' }), 0];
    },

    addCommands() {
        return {
            toggleCarveSmallCaps: () => ({ commands }) => commands.toggleMark(this.name),
            setCarveSmallCaps: () => ({ commands }) => commands.setMark(this.name),
            unsetCarveSmallCaps: () => ({ commands }) => commands.unsetMark(this.name),
        };
    },
});

export default CarveSmallCaps;
