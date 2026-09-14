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
                .carve-frontmatter-raw-editor { position: relative; min-height: 7rem; }
                .carve-frontmatter-raw-editor textarea, .carve-frontmatter-highlight { box-sizing: border-box; width: 100%; min-height: 7rem; margin: 0; padding: .5rem; overflow: auto; white-space: pre; font: 400 .875rem/1.5 monospace; tab-size: 2; }
                .carve-frontmatter-highlight { position: absolute; inset: 0; pointer-events: none; }
                .carve-frontmatter-raw-editor textarea { position: relative; background: transparent; color: transparent; caret-color: #20252b; resize: vertical; }
                .ProseMirror table { width: 100%; border-collapse: collapse; outline: 1px solid #d5d9df; }
                .ProseMirror th, .ProseMirror td { border: 1px solid #d5d9df; padding: .5rem; vertical-align: top; }
                .ProseMirror th { background: #f4f5f7; font-weight: 700; }
                .ProseMirror a { color: #1769c2; text-underline-offset: .14em; }
                .ProseMirror blockquote { margin: 0 0 1rem; padding-inline-start: 1rem; border-inline-start: 3px solid #c8ced7; color: #5a626d; }
                .ProseMirror blockquote:focus-within { border-inline-start-color: #1769c2; }
                .ProseMirror blockquote > :first-child { margin-block-start: 0; }
                .ProseMirror blockquote > :last-child { margin-block-end: 0; }
                .ProseMirror ul[data-type="taskList"] { list-style: none; padding-inline-start: 0; }
                .ProseMirror ul[data-type="taskList"] ul[data-type="taskList"] { padding-inline-start: 1.5rem; }
                .ProseMirror ul[data-type="taskList"] > li[data-checked] { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; column-gap: .5rem; }
                .ProseMirror ul[data-type="taskList"] > li[data-checked] > label { margin-block-start: .2em; line-height: inherit; }
                .ProseMirror ul[data-type="taskList"] > li[data-checked] > div > :first-child { margin-block-start: 0; }
                .ProseMirror ul[data-type="taskList"] > li[data-checked] > div > :last-child { margin-block-end: 0; }
                .ProseMirror pre[data-carve-comment] { margin-block: .75rem; border: 1px dashed #7a828c; border-radius: 4px; background: #f4f5f7; color: #5a626d; padding: .55rem .75rem .65rem; white-space: pre-wrap; }
                .ProseMirror pre[data-carve-comment]::before { content: "Comment"; display: block; margin-block-end: .35rem; color: #0e4459; font: 700 .7rem/1.2 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
                .ProseMirror span[data-carve-comment-inline] { border: 1px dashed #7a828c; border-radius: 4px; background: #e6f0f4; color: #5a626d; padding: .05em .3em; }
                .ProseMirror span[data-carve-comment-inline]::before { content: "Comment: "; color: #0e4459; font-size: .78em; font-weight: 700; }
                .ProseMirror [data-carve-extension], .ProseMirror [data-carve-empty-mark-node] { border-radius: 3px; background: #f4f5f7; padding: .05em .3em; }
                .ProseMirror [data-carve-extension]::before { content: ':' attr(data-carve-extension) '['; color: #0e4459; font: 600 .78em/1 monospace; margin-inline-end: .2em; }
                .ProseMirror [data-carve-extension]::after { content: ']'; color: #0e4459; font: 600 .78em/1 monospace; margin-inline-start: .2em; }
                .ProseMirror [data-carve-empty-mark-node]::before { content: 'Empty ' attr(data-carve-empty-mark); color: #5a626d; font: 600 .78em/1 system-ui, sans-serif; }
                .ProseMirror [data-carve-citation-definition], .ProseMirror .carve-footnote-definition, .ProseMirror figcaption[data-carve-caption] { border-inline-start: 3px solid #c8ced7; padding-inline-start: .75rem; }
                .ProseMirror [data-carve-citation-definition]::before, .ProseMirror .carve-footnote-definition::before, .ProseMirror figcaption[data-carve-caption]::before { display: block; color: #5a626d; font: 700 .68rem/1.3 system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
                .ProseMirror [data-carve-citation-definition]::before { content: 'Citation · ' attr(key); }
                .ProseMirror .carve-footnote-definition::before { content: 'Footnote · ' attr(data-footnote-label); }
                .ProseMirror figcaption[data-carve-caption]::before { content: 'Caption'; }
                .ProseMirror .critic-comment { background: #fff6dc; text-decoration: underline dotted #9a6700; text-underline-offset: .2em; }
                .carve-code-block { position: relative; margin-block: .75rem; border: 1px solid #d5d9df; border-radius: 4px; overflow: hidden; }
                .carve-code-block-chrome { display: flex; align-items: center; justify-content: flex-end; padding: .375rem .5rem; border-block-start: 1px solid #d5d9df; background: white; }
                .carve-code-block-chrome > span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
                .carve-code-lang { max-width: 12rem; border: 1px solid #1769c2; border-radius: 3px; background: #1769c2; color: white; font: inherit; font-weight: 600; padding: .3rem .55rem; }
                .carve-code-block > pre { margin: 0; border: 0; border-radius: 0; padding: var(--carve-code-padding, .75rem); }
                .carve-inline-control, .carve-raw-atom-inline { position: relative; display: inline-flex; }
                .carve-inline-control-trigger, .carve-raw-atom-summary { border: 1px solid #c8ced7; border-radius: 999px; background: #f4f5f7; color: inherit; cursor: pointer; font: inherit; padding: .1em .45em; }
                .carve-inline-control-editor, .carve-raw-atom-inline .carve-raw-atom-editor { position: absolute; z-index: 20; inset-block-start: 100%; inset-inline-start: 0; display: grid; grid-template-columns: 1fr auto; gap: .4rem; min-width: min(22rem, 80vw); padding: .5rem; border: 1px solid #c8ced7; background: white; }
                .carve-inline-control-editor[hidden], .carve-raw-atom-editor[hidden] { display: none; }
                .carve-inline-control-editor > input, .carve-inline-choices { grid-column: 1 / -1; }
                .carve-inline-control-editor > .carve-control-primary { justify-self: end; }
                .carve-inline-fields-editor > label { grid-column: 1 / -1; display: grid; gap: .2rem; color: #5a626d; font-size: .8rem; }
                .carve-inline-fields-editor textarea { min-height: 4.5rem; resize: vertical; }
                .carve-inline-fields-editor input, .carve-inline-fields-editor textarea { width: 100%; min-width: 0; font: inherit; }
                .carve-inline-fields-editor input[type="checkbox"] { width: auto; justify-self: start; }
                .carve-inline-field-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: .4rem; }
                .carve-embed-editor { display: grid; grid-template-columns: 1fr auto auto; gap: .4rem; padding: .6rem; border-block-start: 1px solid #c8ced7; background: white; }
                .carve-embed-editor[hidden] { display: none; }
                .carve-embed-editor label { grid-column: 1 / -1; display: grid; gap: .25rem; }
                .carve-embed-editor input { width: 100%; min-width: 0; font: inherit; }
                .carve-inline-choices { display: grid; max-height: 11rem; overflow-y: auto; border: 1px solid #d5d9df; border-radius: 3px; padding: .2rem; }
                .carve-inline-choices[hidden] { display: none; }
                .carve-inline-choice { width: 100%; border: 0; background: transparent; color: inherit; padding: .4rem .5rem; text-align: start; }
                .carve-inline-choice:hover, .carve-inline-choice:focus-visible, .carve-inline-choice[aria-selected="true"] { background: #e6f0f4; color: #0e4459; }
                .carve-definition-card, .carve-raw-atom:not(.carve-raw-atom-inline) { border: 1px solid #d5d9df; border-radius: 4px; margin-block: .75rem; }
                .carve-definition-summary, .carve-raw-atom:not(.carve-raw-atom-inline) > .carve-raw-atom-summary { display: block; width: 100%; border: 0; border-radius: 0; text-align: start; font-weight: 600; padding: .6rem .75rem; }
                .carve-definition-body, .carve-raw-atom:not(.carve-raw-atom-inline) > .carve-raw-atom-editor { padding: .75rem; }
                .carve-definition-body label { display: grid; gap: .25rem; margin-block-end: .6rem; }
                .carve-definition-body input, .carve-definition-body textarea, .carve-raw-atom-editor textarea { box-sizing: border-box; width: 100%; padding: .5rem; }
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
            for (const control of this.shadowRoot.querySelectorAll('.carve-frontmatter-card input, .carve-frontmatter-card textarea, [data-carve-edit-control]')) {
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
