/**
 * The interactive bar shared by tab sets and code groups.
 *
 * Both constructs are the same shape to a reader - a strip of labels, one panel
 * visible - and were not the same shape in the editor. A tab set had a bar that
 * could only SWITCH panels; a code group had no bar at all, so its per-block
 * labels were invisible and its blocks were a plain stack. Neither could be
 * edited as a widget: adding, removing, renaming or reordering a panel meant
 * leaving the visual editor and editing source. That is the one place where
 * what the author sees is structurally not what the reader gets, which is why
 * it is worth a shared implementation rather than two partial ones.
 *
 * What is deliberately NOT shared is the document shape. A tab set holds
 * `carveTab` children with a `label` attribute; a code group is a plain
 * `carveDiv` whose children are code blocks carrying `carveLabel`. Introducing
 * a node type for the second in order to unify them would change what the
 * serializer sees, and the round trip is the thing most worth not breaking. So
 * the caller supplies four small functions and this file owns only the bar.
 *
 * Switching stays view-local: a `data-active` index on the wrapper, which the
 * stylesheet uses to show one panel. It dispatches no transaction, so moving
 * between tabs never marks the document dirty or reaches the serializer.
 * Editing does dispatch, because it changes the document.
 */

/**
 * Move one child of `node` from index `from` to index `to`.
 *
 * Shared because getting it wrong is easy and silent. The obvious version -
 * delete the child, then insert at the old target position mapped through the
 * deletion - is correct moving LEFT and a no-op moving RIGHT: for [A][B][C]
 * moving B right, the old position of index 2 is where B itself began, and the
 * deletion maps it straight back to B's own start, so the child lands exactly
 * where it was and the button appears dead.
 *
 * So the target is computed against the list WITHOUT the moved child. That
 * position is already a post-deletion one, because the container's own start is
 * not moved by removing something inside it.
 */
export function movePanelWithin({ tr, node, pos, from, to }) {
    const children = [];
    node.forEach(child => children.push(child));
    const moved = children[from];
    const target = children[to];
    if (!moved || !target || from === to) return false;

    const base = pos + 1;
    let start = base;
    for (let i = 0; i < from; i += 1) start += children[i].nodeSize;

    const remaining = children.filter((_child, index) => index !== from);
    let insertAt = base;
    for (let i = 0; i < to; i += 1) insertAt += remaining[i].nodeSize;

    tr.delete(start, start + moved.nodeSize);
    tr.insert(insertAt, moved);
    return true;
}

/**
 * Build a NodeView that renders a label bar above the node's content.
 *
 * @param {object} spec
 * @param {string} spec.className          - block class, e.g. `carve-tabset`.
 * @param {(child: object, index: number) => string} spec.labelOf
 * @param {(index: number) => string} spec.fallbackLabel
 * @param {(args: object) => boolean} [spec.setLabel]  - rename one panel.
 * @param {(args: object) => boolean} [spec.addPanel]  - append a panel.
 * @param {(args: object) => boolean} [spec.removePanel]
 * @param {(args: object) => boolean} [spec.movePanel]
 * @param {string} [spec.noun]             - what one panel is called, for
 *                                           button labels and prompts.
 */
export function createPanelBarView(spec) {
    const {
        className,
        labelOf,
        fallbackLabel = index => `Tab ${index + 1}`,
        setLabel = null,
        addPanel = null,
        removePanel = null,
        movePanel = null,
        noun = 'tab',
    } = spec;

    const editable = Boolean(setLabel || addPanel || removePanel || movePanel);

    return ({ node, editor, getPos }) => {
        let current = node;

        const dom = document.createElement('div');
        dom.className = className;
        dom.setAttribute('data-active', '0');

        const bar = document.createElement('div');
        bar.className = `${className}-bar`;
        // The bar is chrome, not content. Without this the caret can land in a
        // label and ProseMirror will try to reconcile typing there against a
        // document position that does not exist.
        bar.contentEditable = 'false';
        bar.setAttribute('role', 'tablist');

        const panels = document.createElement('div');
        panels.className = `${className}-panels`;

        // Editing needs a position in the document, and getPos is absent when
        // the view is rendered outside one (a static render, a decoration).
        // Without it the controls would be present and inert, which is worse
        // than absent.
        const positioned = () => typeof getPos === 'function';

        const activeIndex = () => {
            const raw = Number(dom.getAttribute('data-active'));
            return Number.isInteger(raw) && raw >= 0 ? raw : 0;
        };

        const setActive = index => {
            const max = Math.max(0, current.childCount - 1);
            dom.setAttribute('data-active', String(Math.min(Math.max(index, 0), max)));
        };

        /** Absolute document position of the child at `index`. */
        const childPos = index => {
            if (!positioned()) return null;
            // +1 steps inside this node; each child occupies its own nodeSize.
            let pos = getPos() + 1;
            for (let i = 0; i < index; i += 1) {
                const child = current.maybeChild(i);
                if (!child) return null;
                pos += child.nodeSize;
            }
            return pos;
        };

        // Deliberately no `.focus()` in the chain. Two reasons, and the second
        // is the one that bites: focusing would pull the caret out of the bar
        // and into the document on every button press, and Tiptap's focus()
        // schedules through requestAnimationFrame, which does not exist outside
        // a browser - so a chain with focus() in it throws in any headless or
        // server-side mount rather than merely doing nothing.
        const run = fn => {
            if (!positioned()) return;
            editor.chain().command(args => fn({ ...args, node: current, pos: getPos(), childPos })).run();
        };

        const makeButton = (text, extraClass, ariaLabel) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = extraClass;
            button.textContent = text;
            if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
            // mousedown rather than click: by click time the editor has already
            // moved the selection toward the button, and a selection inside
            // non-editable chrome is what makes a NodeView feel broken.
            button.addEventListener('mousedown', event => event.preventDefault());
            return button;
        };

        /** Swap a label button for an input, in place. */
        const beginRename = (index, button) => {
            if (!setLabel || !positioned()) return;
            const input = document.createElement('input');
            input.type = 'text';
            input.className = `${className}-rename`;
            input.value = labelOf(current.maybeChild(index), index) ?? '';
            input.setAttribute('aria-label', `Rename ${noun}`);

            let settled = false;
            const commit = keep => {
                if (settled) return;
                settled = true;
                const value = input.value.trim();
                input.replaceWith(button);
                if (!keep) return;
                run(args => setLabel({ ...args, index, value: value || null }));
            };

            input.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    commit(true);
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    commit(false);
                }
            });
            input.addEventListener('blur', () => commit(true));
            // Typing in the input must not reach the editor's own keymap.
            input.addEventListener('mousedown', event => event.stopPropagation());

            button.replaceWith(input);
            input.focus();
            input.select();
        };

        const renderBar = () => {
            bar.textContent = '';

            current.forEach((child, _offset, index) => {
                const label = labelOf(child, index) || fallbackLabel(index);
                const button = makeButton(label, `${className}-tab`, null);
                button.setAttribute('role', 'tab');
                button.addEventListener('mousedown', () => setActive(index));
                if (setLabel && positioned()) {
                    button.title = `Double-click to rename this ${noun}`;
                    button.addEventListener('dblclick', event => {
                        event.preventDefault();
                        beginRename(index, button);
                    });
                }
                bar.appendChild(button);
            });

            if (!editable || !positioned()) return;

            const controls = document.createElement('span');
            controls.className = `${className}-controls`;

            if (movePanel) {
                const left = makeButton('‹', `${className}-move`, `Move this ${noun} left`);
                left.addEventListener('mousedown', () => {
                    const index = activeIndex();
                    if (index <= 0) return;
                    run(args => movePanel({ ...args, from: index, to: index - 1 }));
                    setActive(index - 1);
                });
                const right = makeButton('›', `${className}-move`, `Move this ${noun} right`);
                right.addEventListener('mousedown', () => {
                    const index = activeIndex();
                    if (index >= current.childCount - 1) return;
                    run(args => movePanel({ ...args, from: index, to: index + 1 }));
                    setActive(index + 1);
                });
                controls.append(left, right);
            }

            if (addPanel) {
                const add = makeButton('+', `${className}-add`, `Add a ${noun}`);
                add.addEventListener('mousedown', () => {
                    const index = current.childCount;
                    run(args => addPanel({ ...args, index }));
                    setActive(index);
                });
                controls.appendChild(add);
            }

            if (removePanel) {
                const remove = makeButton('×', `${className}-remove`, `Remove this ${noun}`);
                remove.addEventListener('mousedown', () => {
                    // A container with no panels is not a smaller container, it
                    // is an invalid one - the schema requires at least one child
                    // and the serializer would write a fence around nothing.
                    if (current.childCount <= 1) return;
                    const index = activeIndex();
                    run(args => removePanel({ ...args, index }));
                    setActive(Math.min(index, current.childCount - 2));
                });
                controls.appendChild(remove);
            }

            if (controls.childElementCount > 0) bar.appendChild(controls);
        };

        const applySelected = () => {
            let active = 0;
            current.forEach((child, _offset, index) => {
                if (child.attrs?.selected) active = index;
            });
            setActive(active);
        };

        renderBar();
        applySelected();
        dom.append(bar, panels);

        return {
            dom,
            contentDOM: panels,
            // The bar is regenerated from the node, so a click inside it must
            // not be treated as an edit of the document.
            ignoreMutation: mutation => bar.contains(mutation.target),
            stopEvent: event => bar.contains(event.target),
            update: updated => {
                if (updated.type.name !== current.type.name) return false;
                const previous = activeIndex();
                current = updated;
                renderBar();
                // Keep the reader where they were. Falling back to the
                // `selected` flag on every update would yank the view back to
                // the authored tab on each keystroke in another one.
                setActive(previous < updated.childCount ? previous : updated.childCount - 1);
                return true;
            },
        };
    };
}
