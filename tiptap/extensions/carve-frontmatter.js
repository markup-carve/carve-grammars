import { Node, mergeAttributes } from '@tiptap/core';

const FIELDS = ['title', 'lang', 'author', 'description'];
let nextBodyId = 0;

function fieldValue(source, key, format) {
    const separator = format === 'toml' ? '=' : ':';
    const match = source.match(new RegExp(`^${key}\\s*${separator}\\s*(.*?)\\s*$`, 'm'));
    if (!match) return '';
    const value = match[1];
    if (value.startsWith('"') && value.endsWith('"')) {
        try { return JSON.parse(value); } catch { return value.slice(1, -1); }
    }
    if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
    return value;
}

function setField(source, key, value, format) {
    const separator = format === 'toml' ? '=' : ':';
    const line = format === 'toml' ? `${key} = ${JSON.stringify(value)}` : `${key}: ${JSON.stringify(value)}`;
    const pattern = new RegExp(`^${key}\\s*${separator}.*(?:\\n|$)`, 'm');
    if (pattern.test(source)) return source.replace(pattern, value ? `${line}\n` : '');
    if (!value) return source;
    if (format === 'toml') {
        const table = source.search(/^\s*\[/m);
        if (table >= 0) return `${source.slice(0, table).replace(/\n*$/, '\n')}${line}\n${source.slice(table)}`;
    }
    return source ? `${source.replace(/\n+$/, '')}\n${line}` : line;
}

/** Authored document front matter carried as an opaque block. */
export const CarveFrontmatter = Node.create({
    name: 'carveFrontmatter',
    group: 'block',
    atom: true,
    addOptions() {
        return { highlight: null };
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

            const fields = document.createElement('div');
            fields.className = 'carve-frontmatter-fields';
            const inputs = new Map();
            for (const key of FIELDS) {
                const label = document.createElement('label');
                label.textContent = key[0].toUpperCase() + key.slice(1);
                const input = key === 'description' ? document.createElement('textarea') : document.createElement('input');
                input.name = key;
                input.autocomplete = 'off';
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
            body.appendChild(fields);
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
                    input.disabled = !editor.isEditable;
                }
            };
            toggle.addEventListener('click', () => {
                body.hidden = !body.hidden;
                toggle.setAttribute('aria-expanded', String(!body.hidden));
                if (!body.hidden) inputs.get('title')?.focus();
            });
            for (const [key, input] of inputs) {
                input.addEventListener('change', () => commit(setField(current.attrs.content || '', key, input.value, current.attrs.format || 'yaml')));
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
