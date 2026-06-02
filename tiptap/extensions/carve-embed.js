import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Carve Embed node extension for Tiptap
 *
 * Preserves video embeds, iframes, and oEmbed content during round-trips.
 * Stores the original Carve source (e.g., YouTube URL) in data-carve-src.
 *
 * @example
 * ```js
 * import { CarveEmbed } from 'carve-grammars/tiptap'
 *
 * const editor = new Editor({
 *   extensions: [CarveEmbed],
 * })
 *
 * // Insert an embed
 * editor.chain().focus().setCarveEmbed({
 *   src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
 *   html: '<iframe...></iframe>',
 * }).run()
 * ```
 */
export const CarveEmbed = Node.create({
    name: 'carveEmbed',

    group: 'block',

    atom: true,

    addAttributes() {
        return {
            src: {
                default: null,
                parseHTML: element => {
                    // Check for data-carve-src first
                    const carveSrc = element.getAttribute('data-carve-src');
                    if (carveSrc) return carveSrc;
                    // Check for iframe src
                    const iframe = element.querySelector('iframe');
                    if (iframe) return iframe.getAttribute('src');
                    // Check for video source
                    const video = element.querySelector('video source');
                    if (video) return video.getAttribute('src');
                    return null;
                },
                renderHTML: attributes => {
                    if (!attributes.src) return {};
                    return { 'data-carve-src': attributes.src };
                },
            },
            html: {
                default: null,
                parseHTML: element => element.innerHTML,
                renderHTML: () => ({}),
            },
        };
    },

    parseHTML() {
        return [
            // Match WordPress embed wrappers
            { tag: 'figure.wp-block-embed' },
            { tag: 'div.wp-block-embed' },
            // Match wpcarve-embed class
            { tag: 'figure.wpcarve-embed' },
            { tag: 'div.wpcarve-embed' },
            // Match elements with data-carve-src
            { tag: '[data-carve-src]' },
            // Match iframes that look like video embeds
            {
                tag: 'iframe',
                getAttrs: element => {
                    const src = element.getAttribute('src') || '';
                    // Only match video embed iframes
                    if (src.includes('youtube') || src.includes('vimeo') ||
                        src.includes('dailymotion') || src.includes('wistia')) {
                        return {};
                    }
                    return false;
                },
            },
        ];
    },

    renderHTML({ HTMLAttributes, node }) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = node.attrs.html || '';

        return ['figure', mergeAttributes(HTMLAttributes, {
            class: 'wpcarve-embed',
            'data-carve-src': node.attrs.src,
        }), node.attrs.html ? ['div', { innerHTML: node.attrs.html }] : ['p', 'Embedded content']];
    },

    addNodeView() {
        return ({ node }) => {
            const dom = document.createElement('figure');
            dom.classList.add('wpcarve-embed');
            if (node.attrs.src) {
                dom.setAttribute('data-carve-src', node.attrs.src);
            }
            dom.innerHTML = node.attrs.html || `<p>Embedded: ${node.attrs.src || 'unknown'}</p>`;
            return { dom };
        };
    },

    addCommands() {
        return {
            setCarveEmbed: (attributes) => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: attributes,
                });
            },
        };
    },
});

export default CarveEmbed;
