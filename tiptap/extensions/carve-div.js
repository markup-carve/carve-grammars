import { Node, mergeAttributes } from '@tiptap/core';

/**
 * First direct child that carries the admonition-title class (carve-php and
 * carve-js render a quoted container title as such a paragraph).
 */
function findTitleChild(element) {
    for (const child of element.children || []) {
        if (child.classList && child.classList.contains('admonition-title')) {
            return child;
        }
    }
    return null;
}

/** First direct child carrying the carve-div-body class (own editor DOM). */
function findBodyChild(element) {
    for (const child of element.children || []) {
        if (child.classList && child.classList.contains('carve-div-body')) {
            return child;
        }
    }
    return null;
}

/**
 * Content for the node: everything except the title paragraph, which is
 * captured as the `title` attribute instead (else it would duplicate into the
 * body and the quoted summary would be lost on serialization). The editor's
 * own DOM wraps content in .carve-div-body next to the rendered title.
 */
function contentWithoutTitle(element) {
    const body = findBodyChild(element);
    if (body) {
        return body;
    }
    const clone = element.cloneNode(true);
    const title = findTitleChild(clone);
    if (!title) {
        return element;
    }
    title.remove();
    return clone;
}

/**
 * Carve Div container node extension for Tiptap
 *
 * Renders as ::: class in Carve markup, with an optional quoted title
 * (::: note "Custom title") kept in the `title` attribute
 *
 * @example
 * ```js
 * import { CarveDiv } from 'carve-grammars/tiptap'
 *
 * const editor = new Editor({
 *   extensions: [CarveDiv],
 * })
 *
 * // Wrap selection in a div container
 * editor.chain().focus().setCarveDiv({ class: 'warning' }).run()
 * ```
 */
export const CarveDiv = Node.create({
    name: 'carveDiv',

    group: 'block',

    content: 'block+',

    defining: true,

    addAttributes() {
        return {
            id: { default: null },
            carveKeyValues: { default: null },
            label: { default: null },
            class: {
                default: null,
                parseHTML: element => element.getAttribute('data-carve-class')
                    // Drop the framing classes so an <aside class="admonition note">
                    // (carve-php / carve-js output) yields just "note".
                    || element.className.replace(/\b(carve-div|admonition)\b/g, '').replace(/\s+/g, ' ').trim()
                    || null,
                renderHTML: attributes => {
                    if (!attributes.class) return {};
                    return { 'data-carve-class': attributes.class };
                },
            },
            title: {
                default: null,
                // An empty string is meaningful (::: note "" suppresses the
                // default title), so only a missing title maps to null.
                parseHTML: element => {
                    const attr = element.getAttribute('data-carve-title');
                    if (attr !== null) return attr;
                    const child = findTitleChild(element);
                    if (child) return child.textContent.trim();
                    // carve-js renders an authored {title="..."} block attribute
                    // as a literal title attribute on the container (carve-php
                    // promotes it to an admonition-title paragraph instead);
                    // capture it so the title survives that engine's seed too.
                    return element.getAttribute('title');
                },
                renderHTML: attributes => {
                    if (attributes.title == null) return {};
                    return { 'data-carve-title': attributes.title };
                },
            },
        };
    },

    parseHTML() {
        return [
            { tag: 'div.carve-div', contentElement: contentWithoutTitle },
            // Admonitions render as <aside class="admonition TYPE"> (carve-php,
            // carve-js). Match highest so it wins over the generic rules.
            { tag: 'aside.admonition', priority: 60, contentElement: contentWithoutTitle },
            // Also match common container classes rendered by carve-php
            { tag: 'div.note', contentElement: contentWithoutTitle },
            { tag: 'div.tip', contentElement: contentWithoutTitle },
            { tag: 'div.warning', contentElement: contentWithoutTitle },
            { tag: 'div.danger', contentElement: contentWithoutTitle },
            { tag: 'div.info', contentElement: contentWithoutTitle },
            // Match any div with a single class (likely a ::: container)
            {
                tag: 'div[class]',
                contentElement: contentWithoutTitle,
                getAttrs: element => {
                    // Only match divs with a simple class (not complex component divs)
                    const className = element.className;
                    // Skip if it looks like a WordPress/editor component
                    if (className.includes('wp-') || className.includes('block-') ||
                        className.includes('editor-') || className.includes('is-')) {
                        return false;
                    }
                    // Skip Torchlight code block line divs
                    if (className === 'line' || className.includes('line-')) {
                        return false;
                    }
                    // Skip if inside a pre or code element (syntax highlighting)
                    if (element.closest('pre') || element.closest('code')) {
                        return false;
                    }
                    // Accept single-word classes or carve-div
                    if (/^[a-z-]+$/i.test(className) || className.includes('carve-div')) {
                        return {};
                    }
                    return false;
                },
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        const classes = ['carve-div'];
        if (HTMLAttributes['data-carve-class']) {
            classes.push(HTMLAttributes['data-carve-class']);
        }
        const attrs = mergeAttributes(HTMLAttributes, { class: classes.join(' ') });
        const title = HTMLAttributes['data-carve-title'];
        if (title === undefined) {
            return ['div', attrs, 0];
        }
        // Keep the captured title VISIBLE in the editor: a non-editable title
        // element plus a body wrapper carrying the content hole (ProseMirror
        // requires the hole to be its parent's only child). The title itself
        // is edited in source mode; contentWithoutTitle() reads content from
        // .carve-div-body so this shape re-parses without duplication.
        return ['div', attrs,
            ['p', { class: 'admonition-title', contenteditable: 'false' }, title],
            ['div', { class: 'carve-div-body' }, 0],
        ];
    },

    addCommands() {
        return {
            setCarveDiv: (attributes) => ({ commands }) => {
                return commands.wrapIn(this.name, attributes);
            },
            toggleCarveDiv: (attributes) => ({ commands }) => {
                return commands.toggleWrap(this.name, attributes);
            },
            unsetCarveDiv: () => ({ commands }) => {
                return commands.lift(this.name);
            },
        };
    },
});

export default CarveDiv;
