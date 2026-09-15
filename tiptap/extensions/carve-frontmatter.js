import { Node, mergeAttributes } from '@tiptap/core';

const DEFAULT_FIELDS = [
    { key: 'title' },
    { key: 'lang' },
    { key: 'author' },
    { key: 'description', multiline: true },
];

// The component owns name, type, value, disabled and readonly, so a descriptor
// may only add native validation and input hints. Anything else - an event
// handler above all - is refused loudly rather than dropped, because a silently
// ignored attribute reads as a working constraint that never fires.
const ALLOWED_INPUT_ATTRIBUTES = new Set([
    'required', 'autocomplete', 'inputmode', 'minlength', 'maxlength', 'pattern', 'aria-describedby',
]);

function normalizeFields(fields) {
    if (!Array.isArray(fields)) throw new TypeError('carveFrontmatter.fields must be an array of field descriptors.');
    const seen = new Set();
    return fields.map(field => {
        if (!field || typeof field.key !== 'string' || !field.key) {
            throw new TypeError('carveFrontmatter.fields: every descriptor needs a non-empty string key.');
        }
        // One control per key: a second one would render blank and write
        // nowhere, because the controls are held by key.
        if (seen.has(field.key)) {
            throw new TypeError(`carveFrontmatter.fields: ${field.key} is configured twice.`);
        }
        seen.add(field.key);
        for (const name of Object.keys(field.inputAttributes ?? {})) {
            if (!ALLOWED_INPUT_ATTRIBUTES.has(name)) {
                throw new TypeError(`carveFrontmatter.fields: ${field.key} may not set the "${name}" attribute.`);
            }
        }
        return field;
    });
}

let nextBodyId = 0;

// Keys are consumer-supplied once fields are configurable, so they reach a
// RegExp as data, not as a pattern.
const escapeKey = key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function fieldValue(source, key, format) {
    if (format === 'json') {
        try {
            const fields = JSON.parse(source);
            return fields && !Array.isArray(fields) && typeof fields[key] === 'string' ? fields[key] : '';
        } catch {
            return '';
        }
    }
    const separator = format === 'toml' ? '=' : ':';
    const match = source.match(new RegExp(`^${escapeKey(key)}\\s*${separator}\\s*(.*?)\\s*$`, 'm'));
    if (!match) return '';
    const value = match[1];
    if (value.startsWith('"') && value.endsWith('"')) {
        try { return JSON.parse(value); } catch { return value.slice(1, -1); }
    }
    if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
    return value;
}

function setField(source, key, value, format) {
    if (format === 'json') {
        try {
            const fields = JSON.parse(source);
            if (!fields || Array.isArray(fields)) return source;
            if (value) fields[key] = value;
            else delete fields[key];
            return JSON.stringify(fields, null, 2);
        } catch {
            return source;
        }
    }
    const separator = format === 'toml' ? '=' : ':';
    const line = format === 'toml' ? `${key} = ${JSON.stringify(value)}` : `${key}: ${JSON.stringify(value)}`;
    const pattern = new RegExp(`^${escapeKey(key)}\\s*${separator}.*(?:\\n|$)`, 'm');
    if (pattern.test(source)) return source.replace(pattern, value ? `${line}\n` : '');
    if (!value) return source;
    if (format === 'toml') {
        const table = source.search(/^\s*\[/m);
        if (table >= 0) return `${source.slice(0, table).replace(/\n*$/, '\n')}${line}\n${source.slice(table)}`;
    }
    return source ? `${source.replace(/\n+$/, '')}\n${line}` : line;
}

function fieldsAreEditable(source, format) {
    if (format !== 'json') return true;
    try {
        const fields = JSON.parse(source);
        return Boolean(fields) && !Array.isArray(fields);
    } catch {
        return false;
    }
}

/** Authored document front matter carried as an opaque block. */
export const CarveFrontmatter = Node.create({
    name: 'carveFrontmatter',
    group: 'block',
    atom: true,
    addOptions() {
        return { highlight: null, fields: DEFAULT_FIELDS };
    },
    addAttributes() {
        return { content: { default: '' }, format: { default: 'yaml' } };
    },
    parseHTML() { return [{ tag: 'pre[data-carve-frontmatter]' }]; },
    renderHTML({ HTMLAttributes, node }) {
        return ['pre', mergeAttributes(HTMLAttributes, { 'data-carve-frontmatter': 'true' }), node.attrs.content];
    },

    addNodeView() {
        return ({ node, editor, getPos }) => {
            let current = node;
            const dom = document.createElement('section');
            dom.className = 'carve-frontmatter-card';
            dom.contentEditable = 'false';

            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'carve-frontmatter-summary';
            toggle.setAttribute('aria-expanded', 'false');

            const body = document.createElement('div');
            body.className = 'carve-frontmatter-body';
            body.id = `carve-frontmatter-body-${++nextBodyId}`;
            body.hidden = true;
            toggle.setAttribute('aria-controls', body.id);

            const descriptors = normalizeFields(this.options.fields ?? DEFAULT_FIELDS);
            const fields = document.createElement('div');
            fields.className = 'carve-frontmatter-fields';
            const inputs = new Map();
            for (const descriptor of descriptors) {
                const key = descriptor.key;
                const label = document.createElement('label');
                label.textContent = descriptor.label ?? (key[0].toUpperCase() + key.slice(1));
                const input = descriptor.multiline ? document.createElement('textarea') : document.createElement('input');
                input.name = key;
                input.autocomplete = 'off';
                if (descriptor.placeholder) input.placeholder = descriptor.placeholder;
                for (const [name, value] of Object.entries(descriptor.inputAttributes ?? {})) {
                    if (value === false || value === null || value === undefined) continue;
                    input.setAttribute(name, value === true ? '' : String(value));
                }
                label.appendChild(input);
                fields.appendChild(label);
                inputs.set(key, input);
            }

            const rawLabel = document.createElement('label');
            rawLabel.className = 'carve-frontmatter-raw';
            rawLabel.textContent = 'Raw frontmatter';
            const rawEditor = document.createElement('div');
            rawEditor.className = 'carve-frontmatter-raw-editor';
            const highlighted = document.createElement('pre');
            highlighted.className = 'carve-frontmatter-highlight';
            highlighted.setAttribute('aria-hidden', 'true');
            const highlightedCode = document.createElement('code');
            highlighted.appendChild(highlightedCode);
            const raw = document.createElement('textarea');
            raw.spellcheck = false;
            rawEditor.appendChild(highlighted);
            rawEditor.appendChild(raw);
            rawLabel.appendChild(rawEditor);
            if (descriptors.length) body.appendChild(fields);
            body.appendChild(rawLabel);
            dom.appendChild(toggle);
            dom.appendChild(body);

            const commit = content => {
                if (!editor.isEditable || typeof getPos !== 'function' || content === current.attrs.content) return;
                editor.chain().command(({ tr }) => {
                    tr.setNodeMarkup(getPos(), undefined, { ...current.attrs, content });
                    return true;
                }).run();
            };
            const render = () => {
                const format = current.attrs.format || 'yaml';
                const title = fieldValue(current.attrs.content || '', 'title', format) || 'Untitled';
                const lang = fieldValue(current.attrs.content || '', 'lang', format);
                const fieldsEditable = editor.isEditable && fieldsAreEditable(current.attrs.content || '', format);
                toggle.textContent = `Document metadata · ${title}${lang ? ` · ${lang}` : ''}`;
                dom.setAttribute('aria-label', 'Document metadata');
                raw.value = current.attrs.content || '';
                rawLabel.firstChild.textContent = `Raw ${format.toUpperCase()}`;
                highlightedCode.className = `language-${format}`;
                highlightedCode.textContent = raw.value;
                if (typeof this.options.highlight === 'function') {
                    const html = this.options.highlight(raw.value, format);
                    if (typeof html === 'string') highlightedCode.innerHTML = html;
                }
                raw.disabled = !editor.isEditable;
                for (const [key, input] of inputs) {
                    input.value = fieldValue(current.attrs.content || '', key, format);
                    input.disabled = !fieldsEditable;
                }
            };
            toggle.addEventListener('click', () => {
                body.hidden = !body.hidden;
                toggle.setAttribute('aria-expanded', String(!body.hidden));
                if (!body.hidden) (inputs.values().next().value ?? raw).focus();
            });
            for (const [key, input] of inputs) {
                input.addEventListener('change', () => {
                    if (typeof input.checkValidity === 'function' && !input.checkValidity()) {
                        input.reportValidity?.();
                        return;
                    }
                    commit(setField(current.attrs.content || '', key, input.value, current.attrs.format || 'yaml'));
                });
            }
            raw.addEventListener('change', () => {
                const hasFence = /(^|\n)---(?:\s|$)/.test(raw.value);
                raw.setCustomValidity(hasFence ? 'Frontmatter content cannot contain its closing --- fence.' : '');
                if (!hasFence) commit(raw.value);
                else raw.reportValidity();
            });
            raw.addEventListener('input', () => {
                highlightedCode.textContent = raw.value;
                if (typeof this.options.highlight === 'function') {
                    const html = this.options.highlight(raw.value, current.attrs.format || 'yaml');
                    if (typeof html === 'string') highlightedCode.innerHTML = html;
                }
            });
            raw.addEventListener('scroll', () => {
                highlighted.scrollTop = raw.scrollTop;
                highlighted.scrollLeft = raw.scrollLeft;
            });
            render();

            return {
                dom,
                update: updated => {
                    if (updated.type !== current.type) return false;
                    current = updated;
                    render();
                    return true;
                },
                stopEvent: event => dom.contains(event.target),
                ignoreMutation: mutation => dom.contains(mutation.target),
            };
        };
    },
});

export default CarveFrontmatter;
