import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DOMSerializer } from '@tiptap/pm/model';

import { createPanelBarView, movePanelWithin } from './panel-bar.js';

/**
 * The interactive bar for `:::: code-group` containers.
 *
 * A code group is the same thing as a tab set to a reader - a strip of labels,
 * one panel visible - and was nothing like it in the editor. A tab set had a
 * bar; a code group had no bar at all, so its per-block labels (`[one.js]`,
 * `[two.php]`) were invisible and the group rendered as a plain vertical stack
 * of code blocks. There was no way to tell a code group from two adjacent code
 * blocks, and no way to add, remove, rename or reorder one without editing
 * source.
 *
 * DELIBERATELY NOT A NODE TYPE. A code group reaches Tiptap as a generic
 * `carveDiv` with `class: "code-group"`, and its labels already survive on each
 * child code block's `carveLabel` attribute. Introducing `carveCodeGroup` and
 * `carveCodePanel` nodes to mirror the tab-set shape would change what the
 * serializer sees, for a feature that is entirely about presentation. So this
 * attaches a view to the existing node instead, and the document shape, the
 * serializer and the round trip are all untouched.
 *
 * That choice has one consequence worth stating: a nodeView registered for
 * `carveDiv` is called for EVERY div, not only code groups. Every other div -
 * admonitions, figures, plain containers - is handed straight back to the
 * schema's own `toDOM`, which is exactly what ProseMirror would have done with
 * no view at all.
 */

export const codeGroupPluginKey = new PluginKey('carveCodeGroupBar');

const CODE_GROUP_CLASS = 'code-group';

/** The label shown for one code block: its `[label]`, else its language. */
function codeLabel(child) {
    if (!child) return null;
    const attrs = child.attrs ?? {};
    return attrs.carveLabel ?? attrs.carveHeader ?? attrs.language ?? null;
}

function isCodeGroup(node) {
    if (!node || node.type.name !== 'carveDiv') return false;
    const cls = node.attrs?.class;
    if (typeof cls !== 'string') return false;
    // The class attribute can carry more than the type word.
    return cls.split(/\s+/).includes(CODE_GROUP_CLASS);
}

/**
 * Render a node the way the schema says to, with no view involved.
 *
 * This is the passthrough for every div that is not a code group. Calling the
 * spec's own `toDOM` rather than rebuilding the markup here means an admonition
 * keeps its title paragraph and body wrapper even when carve-div.js changes how
 * it builds them.
 */
function defaultView(node) {
    const spec = node.type.spec.toDOM?.(node);
    if (!spec) return null;
    const { dom, contentDOM } = DOMSerializer.renderSpec(document, spec);
    return { dom, contentDOM };
}

export const CarveCodeGroup = Extension.create({
    name: 'carveCodeGroup',

    addOptions() {
        return {
            /** Set false for a bar that can switch panels but not edit them. */
            editable: true,
        };
    },

    addProseMirrorPlugins() {
        const { editable } = this.options;

        const barView = createPanelBarView({
            className: 'carve-codegroup',
            noun: 'code block',
            labelOf: codeLabel,
            fallbackLabel: index => `Block ${index + 1}`,

            setLabel: !editable ? null : ({ tr, index, value, childPos }) => {
                const pos = childPos(index);
                if (pos == null) return false;
                // carveLabel, not language: renaming the tab should not silently
                // change which grammar highlights the block.
                tr.setNodeAttribute(pos, 'carveLabel', value);
                return true;
            },

            addPanel: !editable ? null : ({ tr, state, node, pos, index }) => {
                const type = state.schema.nodes.codeBlock;
                if (!type) return false;
                // No language: an empty fence is valid Carve and the language
                // picker on the block itself is where that choice belongs.
                tr.insert(pos + 1 + node.content.size, type.create({ carveLabel: `Block ${index + 1}` }));
                return true;
            },

            removePanel: !editable ? null : ({ tr, node, index, childPos }) => {
                if (node.childCount <= 1) return false;
                const from = childPos(index);
                const child = node.maybeChild(index);
                if (from == null || !child) return false;
                tr.delete(from, from + child.nodeSize);
                return true;
            },

            movePanel: !editable ? null : movePanelWithin,
        });

        return [
            new Plugin({
                key: codeGroupPluginKey,
                props: {
                    nodeViews: {
                        carveDiv: (node, view, getPos, decorations, innerDecorations) => {
                            if (!isCodeGroup(node)) {
                                return defaultView(node);
                            }
                            return barView({
                                node,
                                view,
                                getPos,
                                decorations,
                                innerDecorations,
                                editor: this.editor,
                                extension: this,
                                HTMLAttributes: {},
                            });
                        },
                    },
                },
            }),
        ];
    },
});
