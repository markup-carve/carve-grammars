import { Editor } from '@tiptap/core';
import { CarveKit } from './carve-kit.js';
import { carveToProseMirror } from './carve-to-pm.js';
import { serializeToCarve } from './serializer.js';

const HTMLElementBase = globalThis.HTMLElement ?? class {};

/** Framework-independent Carve editor backed by the shared Tiptap bridge. */
export class CarveEditorElement extends HTMLElementBase {
    static get observedAttributes() {
        return ['readonly'];
    }

    constructor() {
        super();
        this._editor = null;
        this._value = '';
        this._valueSet = false;
        this._loading = false;
    }

    connectedCallback() {
        if (this._editor) return;
        if (!this._valueSet) this._value = this.textContent ?? '';
        this._valueSet = true;
        this.textContent = '';

        const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
        root.innerHTML = `
            <style>
                :host { display: block; }
                [part="editor"] { min-height: 8rem; }
                .ProseMirror { min-height: inherit; outline: none; }
                .ProseMirror:focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
                .carve-frontmatter-card { border: 1px solid #d5d9df; border-radius: 4px; margin-block-end: 1rem; }
                .carve-frontmatter-summary { width: 100%; border: 0; background: #f4f5f7; color: inherit; cursor: pointer; font: inherit; font-weight: 600; padding: .65rem .8rem; text-align: start; }
                .carve-frontmatter-summary::before { content: '▸'; display: inline-block; margin-inline-end: .5rem; }
                .carve-frontmatter-summary[aria-expanded="true"]::before { transform: rotate(90deg); }
                .carve-frontmatter-body { padding: .8rem; }
                .carve-frontmatter-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: .75rem; }
                .carve-frontmatter-card label { display: grid; gap: .25rem; font-size: .875rem; font-weight: 600; }
                .carve-frontmatter-card input, .carve-frontmatter-card textarea { box-sizing: border-box; width: 100%; border: 1px solid #b9c0ca; border-radius: 3px; font: inherit; padding: .5rem; }
                .carve-frontmatter-raw { margin-block-start: .75rem; }
                .carve-frontmatter-raw textarea { min-height: 7rem; font-family: monospace; font-weight: 400; }
            </style>
            <div part="editor"></div>
        `;
        const surface = root.querySelector('[part="editor"]');
        this._editor = new Editor({
            element: surface,
            extensions: [CarveKit],
            content: this._document(this._value),
            editable: !this.hasAttribute('readonly'),
            onUpdate: ({ editor }) => {
                if (this._loading) return;
                this._value = serializeToCarve(editor.getJSON());
                const CustomEventConstructor = this.ownerDocument?.defaultView?.CustomEvent ?? CustomEvent;
                this.dispatchEvent(new CustomEventConstructor('input', {
                    bubbles: true,
                    composed: true,
                    detail: { value: this._value },
                }));
            },
        });
    }

    disconnectedCallback() {
        this._editor?.destroy();
        this._editor = null;
    }

    attributeChangedCallback(name) {
        if (name === 'readonly' && this._editor) {
            this._editor.setEditable(!this.hasAttribute('readonly'));
            for (const control of this.shadowRoot.querySelectorAll('.carve-frontmatter-card input, .carve-frontmatter-card textarea')) {
                control.disabled = this.hasAttribute('readonly');
            }
        }
    }

    get value() {
        return this._editor ? serializeToCarve(this._editor.getJSON()) : this._value;
    }

    set value(source) {
        this._value = String(source ?? '');
        this._valueSet = true;
        if (!this._editor) return;
        this._loading = true;
        try {
            // Omitting the second argument works on Tiptap 2 and 3. Their
            // no-update option shapes differ; `_loading` suppresses the event.
            this._editor.commands.setContent(this._document(this._value));
        } finally {
            this._loading = false;
        }
    }

    focus(options) {
        if (this._editor) {
            this._editor.commands.focus(undefined, {
                scrollIntoView: !options?.preventScroll,
            });
        }
        else super.focus?.(options);
    }

    _document(source) {
        return carveToProseMirror(source, { unsupported: 'preserve' });
    }
}

/** Define `<carve-editor>` (or a caller-selected tag) once and return its class. */
export function defineCarveEditor(tagName = 'carve-editor') {
    if (!globalThis.customElements) {
        throw new Error('defineCarveEditor requires a browser CustomElementRegistry');
    }
    const registered = globalThis.customElements.get(tagName);
    if (registered) return registered;
    globalThis.customElements.define(tagName, CarveEditorElement);
    return CarveEditorElement;
}
