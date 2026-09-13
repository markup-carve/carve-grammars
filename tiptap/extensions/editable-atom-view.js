let nextEditorId = 0;

function transact(editor, getPos, current, attrs) {
    if (!editor.isEditable || typeof getPos !== 'function') return;
    editor.chain().command(({ tr }) => {
        tr.setNodeMarkup(getPos(), undefined, { ...current.attrs, ...attrs });
        return true;
    }).run();
}

export function documentValues(editor, type, attr) {
    const values = new Set();
    editor.state.doc.descendants(node => {
        if (node.type.name === type && node.attrs?.[attr]) values.add(String(node.attrs[attr]));
    });
    return [...values].sort((a, b) => a.localeCompare(b));
}

export function createInlinePickerView({ className, label, value, attribute, choices }) {
    return ({ node, editor, getPos }) => {
        let current = node;
        const dom = document.createElement('span');
        dom.className = `carve-inline-control ${className}`;
        dom.contentEditable = 'false';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'carve-inline-control-trigger';
        const editorBox = document.createElement('span');
        editorBox.className = 'carve-inline-control-editor';
        editorBox.hidden = true;
        editorBox.id = `carve-inline-editor-${++nextEditorId}`;
        button.setAttribute('aria-controls', editorBox.id);
        button.setAttribute('aria-expanded', 'false');
        const input = document.createElement('input');
        input.dataset.carveEditControl = '';
        input.setAttribute('aria-label', label);
        const list = document.createElement('datalist');
        list.id = `${editorBox.id}-choices`;
        input.setAttribute('list', list.id);
        const save = document.createElement('button');
        save.dataset.carveEditControl = '';
        save.type = 'button';
        save.textContent = 'Apply';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        editorBox.append(input, list, save, cancel);
        dom.append(button, editorBox);

        const close = () => {
            editorBox.hidden = true;
            button.setAttribute('aria-expanded', 'false');
            button.focus();
        };
        const render = () => {
            const shown = value(current);
            button.textContent = shown;
            button.setAttribute('aria-label', `${label}: ${shown}. Activate to edit.`);
            input.value = String(current.attrs?.[attribute] || '');
            input.disabled = !editor.isEditable;
            save.disabled = !editor.isEditable;
            list.replaceChildren(...choices(editor).map(choice => {
                const option = document.createElement('option');
                option.value = choice;
                return option;
            }));
        };
        button.addEventListener('click', () => {
            editorBox.hidden = !editorBox.hidden;
            button.setAttribute('aria-expanded', String(!editorBox.hidden));
            if (!editorBox.hidden) { render(); input.focus(); input.select(); }
        });
        save.addEventListener('click', () => {
            transact(editor, getPos, current, { [attribute]: input.value.trim() });
            close();
        });
        cancel.addEventListener('click', close);
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') { event.preventDefault(); save.click(); }
            if (event.key === 'Escape') { event.preventDefault(); close(); }
        });
        render();
        return {
            dom,
            update(updated) {
                if (updated.type !== current.type) return false;
                current = updated; render(); return true;
            },
            stopEvent: event => dom.contains(event.target),
            ignoreMutation: mutation => dom.contains(mutation.target),
        };
    };
}

export function createDefinitionCardView({ className, title, fields }) {
    return ({ node, editor, getPos }) => {
        let current = node;
        const dom = document.createElement('section');
        dom.className = `carve-definition-card ${className}`;
        dom.contentEditable = 'false';
        dom.setAttribute('aria-label', title);
        const summary = document.createElement('button');
        summary.type = 'button';
        summary.className = 'carve-definition-summary';
        const body = document.createElement('div');
        body.className = 'carve-definition-body';
        body.hidden = true;
        body.id = `carve-definition-body-${++nextEditorId}`;
        summary.setAttribute('aria-controls', body.id);
        summary.setAttribute('aria-expanded', 'false');
        const inputs = new Map();
        for (const field of fields) {
            const label = document.createElement('label');
            label.textContent = field.label;
            const input = field.multiline ? document.createElement('textarea') : document.createElement('input');
            input.dataset.carveEditControl = '';
            input.name = field.name;
            label.append(input);
            body.append(label);
            inputs.set(field.name, input);
        }
        const save = document.createElement('button');
        save.dataset.carveEditControl = '';
        save.type = 'button';
        save.className = 'carve-definition-save';
        save.textContent = 'Apply';
        body.append(save);
        dom.append(summary, body);
        const render = () => {
            const first = fields[0];
            summary.textContent = `${title} · ${current.attrs?.[first.name] || 'Untitled'}`;
            for (const field of fields) {
                const input = inputs.get(field.name);
                input.value = current.attrs?.[field.name] ?? '';
                input.disabled = !editor.isEditable;
            }
            save.disabled = !editor.isEditable;
        };
        summary.addEventListener('click', () => {
            body.hidden = !body.hidden;
            summary.setAttribute('aria-expanded', String(!body.hidden));
            if (!body.hidden) inputs.get(fields[0].name)?.focus();
        });
        save.addEventListener('click', () => {
            transact(editor, getPos, current, Object.fromEntries([...inputs].map(([key, input]) => [key, input.value.trim() || null])));
        });
        render();
        return {
            dom,
            update(updated) { if (updated.type !== current.type) return false; current = updated; render(); return true; },
            stopEvent: event => dom.contains(event.target),
            ignoreMutation: mutation => dom.contains(mutation.target),
        };
    };
}

export function createRawSourceView({ inline = false } = {}) {
    return ({ node, editor, getPos }) => {
        let current = node;
        const dom = document.createElement(inline ? 'span' : 'section');
        dom.className = inline ? 'carve-raw-atom carve-raw-atom-inline' : 'carve-raw-atom';
        dom.contentEditable = 'false';
        const summary = document.createElement('button');
        summary.type = 'button';
        summary.className = 'carve-raw-atom-summary';
        summary.textContent = `${node.attrs.carveType || 'Unsupported'} source`;
        const box = inline ? document.createElement('span') : document.createElement('div');
        box.className = 'carve-raw-atom-editor';
        box.hidden = true;
        box.id = `carve-raw-editor-${++nextEditorId}`;
        summary.setAttribute('aria-controls', box.id);
        summary.setAttribute('aria-expanded', 'false');
        const input = inline ? document.createElement('input') : document.createElement('textarea');
        input.dataset.carveEditControl = '';
        input.setAttribute('aria-label', 'Exact Carve source');
        const save = document.createElement('button');
        save.dataset.carveEditControl = '';
        save.type = 'button'; save.textContent = 'Apply source';
        box.append(input, save); dom.append(summary, box);
        const render = () => { input.value = current.attrs.carveSource || ''; input.disabled = !editor.isEditable; save.disabled = !editor.isEditable; };
        summary.addEventListener('click', () => {
            box.hidden = !box.hidden; summary.setAttribute('aria-expanded', String(!box.hidden));
            if (!box.hidden) { render(); input.focus(); }
        });
        save.addEventListener('click', () => transact(editor, getPos, current, { carveSource: input.value }));
        render();
        return {
            dom,
            update(updated) { if (updated.type !== current.type) return false; current = updated; render(); return true; },
            stopEvent: event => dom.contains(event.target),
            ignoreMutation: mutation => dom.contains(mutation.target),
        };
    };
}
