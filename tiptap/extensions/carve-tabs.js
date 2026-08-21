import { Node, mergeAttributes } from '@tiptap/core';

import { createPanelBarView, movePanelWithin } from './panel-bar.js';

/**
 * Carve tab-set nodes for Tiptap.
 *
 * A `:::: tabs` container holds `::: tab` children, each carrying a `label`
 * and an optional `selected` flag. In the editor seed (rendered without the
 * TabsExtension) this is plain HTML - `<div class="tabs"><div class="tab"
 * label="First" selected>…</div></div>` - so these nodes parse that raw form,
 * capturing the label/selected attributes the generic CarveDiv would otherwise
 * drop. They round-trip back to Carve via serializer.js.
 *
 * Two nodes:
 * - `carveTabSet` - the `<div class="tabs">` wrapper, holding `carveTab+`.
 * - `carveTab` - one `<div class="tab">` panel, attrs `{ label, selected }`.
 *
 * The parse rules use a high priority so a `div.tabs` / `div.tab` is claimed
 * here rather than by CarveDiv's generic `div[class]` rule.
 */

export const CarveTabSet = Node.create({
    name: 'carveTabSet',

    group: 'block',

    content: 'carveTab+',

    defining: true,

    parseHTML() {
        return [{ tag: 'div.tabs', priority: 60 }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'tabs' }), 0];
    },

    // Interactive tab bar: switch, rename, add, remove and reorder.
    //
    // The bar itself lives in panel-bar.js and is shared with code groups,
    // which are the same thing to a reader and were not the same thing here.
    // This file supplies only what is specific to a tab set: where the label
    // lives (`carveTab.attrs.label`) and what a new tab is made of.
    //
    // Switching is view-local and dispatches nothing. The other four change the
    // document, so they go through transactions and are undoable.
    addNodeView() {
        return createPanelBarView({
            className: 'carve-tabset',
            noun: 'tab',
            labelOf: child => child?.attrs?.label ?? null,
            fallbackLabel: index => `Tab ${index + 1}`,

            setLabel: ({ tr, index, value, childPos }) => {
                const pos = childPos(index);
                if (pos == null) return false;
                tr.setNodeAttribute(pos, 'label', value);
                return true;
            },

            addPanel: ({ tr, state, node, pos, index }) => {
                const type = state.schema.nodes.carveTab;
                const paragraph = state.schema.nodes.paragraph;
                if (!type || !paragraph) return false;
                const tab = type.create({ label: `Tab ${index + 1}`, selected: false }, paragraph.create());
                // +1 to step inside the set, then past every existing child.
                tr.insert(pos + 1 + node.content.size, tab);
                return true;
            },

            removePanel: ({ tr, node, index, childPos }) => {
                if (node.childCount <= 1) return false;
                const from = childPos(index);
                const child = node.maybeChild(index);
                if (from == null || !child) return false;
                tr.delete(from, from + child.nodeSize);
                return true;
            },

            movePanel: ({ tr, node, pos, from, to, childPos }) => movePanelWithin({ tr, node, pos, from, to, childPos }),
        });
    },
});

export const CarveTab = Node.create({
    name: 'carveTab',

    content: 'block+',

    defining: true,

    addAttributes() {
        return {
            label: {
                default: null,
                // Attribute form (`{label="..."}` -> label="...") or the
                // canonical opener form (`::: tab [Label]`), which both engines
                // render as a leading <p class="div-label"> child.
                parseHTML: element => {
                    const attr = element.getAttribute('label');
                    if (attr != null) return attr;
                    const first = element.firstElementChild;
                    return first && first.tagName === 'P' && first.classList.contains('div-label')
                        ? first.textContent
                        : null;
                },
                renderHTML: attributes => (attributes.label == null ? {} : { label: attributes.label }),
            },
            // `selected` is a boolean flag: present (any value, incl. "") means
            // selected. Serialized as a bare `selected` in the attribute line.
            selected: {
                default: false,
                parseHTML: element => element.hasAttribute('selected'),
                renderHTML: attributes => (attributes.selected ? { selected: '' } : {}),
            },
        };
    },

    parseHTML() {
        return [{
            tag: 'div.tab',
            priority: 60,
            // The div-label paragraph becomes the label attr above; keep it
            // out of the editable panel content.
            contentElement: element => {
                const first = element.firstElementChild;
                if (!first || first.tagName !== 'P' || !first.classList.contains('div-label')) {
                    return element;
                }
                const clone = element.cloneNode(true);
                clone.removeChild(clone.firstElementChild);
                return clone;
            },
        }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'tab' }), 0];
    },
});
