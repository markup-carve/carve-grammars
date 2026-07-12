import { Node, mergeAttributes } from '@tiptap/core';

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

    // Interactive tab bar. The wrapper holds a (non-editable) row of buttons -
    // one per tab, labelled from each carveTab's `label` - plus the editable
    // panel container (contentDOM) where the tab nodes render. Active-tab state
    // is view-local: a `data-active` index on the wrapper that CSS uses to show
    // one panel at a time; clicking a button just moves it. No ProseMirror
    // transaction, so switching tabs never touches the document or serialize.
    addNodeView() {
        return ({ node }) => {
            const dom = document.createElement('div');
            dom.className = 'carve-tabset';
            dom.setAttribute('data-active', '0');

            const bar = document.createElement('div');
            bar.className = 'carve-tabset-bar';
            bar.contentEditable = 'false';

            const panels = document.createElement('div');
            panels.className = 'carve-tabset-panels';

            const renderBar = (n) => {
                bar.textContent = '';
                n.forEach((tab, _offset, index) => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'carve-tabset-tab';
                    btn.textContent = tab.attrs?.label || `Tab ${index + 1}`;
                    btn.addEventListener('mousedown', (e) => {
                        // mousedown (not click) so the editor selection isn't
                        // moved into the button before we switch.
                        e.preventDefault();
                        dom.setAttribute('data-active', String(index));
                    });
                    bar.appendChild(btn);
                });
                // Default the active tab to the one flagged `selected`, else 0.
                let active = 0;
                n.forEach((tab, _o, i) => {
                    if (tab.attrs?.selected) active = i;
                });
                dom.setAttribute('data-active', String(active));
            };

            renderBar(node);
            dom.appendChild(bar);
            dom.appendChild(panels);

            return {
                dom,
                contentDOM: panels,
                update: (updated) => {
                    if (updated.type.name !== 'carveTabSet') return false;
                    const active = dom.getAttribute('data-active');
                    renderBar(updated);
                    // renderBar resets active to the selected tab; keep the
                    // user's current choice if it is still in range.
                    if (active != null && Number(active) < updated.childCount) {
                        dom.setAttribute('data-active', active);
                    }
                    return true;
                },
            };
        };
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
