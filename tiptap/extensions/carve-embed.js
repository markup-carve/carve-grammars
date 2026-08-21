import { Node, mergeAttributes } from '@tiptap/core';
import { carveMediaDirective } from '../serializer.js';

/**
 * A preview iframe URL for the node view. Prefer an explicit embed src captured
 * from the render; otherwise derive one from the Carve source directive so the
 * player still shows after an inline edit.
 *
 * @param {object} attrs - carveEmbed node attrs.
 * @returns {string} An https URL to embed, or '' if none can be derived.
 */
function embedPreviewSrc(attrs) {
    if (attrs.src) {
        return attrs.src.startsWith('//') ? `https:${attrs.src}` : attrs.src;
    }
    const source = attrs.carveSource || '';
    let m = source.match(/^:youtube\[([\w-]+)\]/i);
    if (m) return `https://www.youtube.com/embed/${m[1]}`;
    m = source.match(/^:vimeo\[(\d+)\]/i);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
    m = source.match(/^:media\[([^\]]+)\]/i);
    if (m) return m[1].startsWith('//') ? `https:${m[1]}` : m[1];
    return '';
}

/**
 * Carve Embed node extension for Tiptap
 *
 * Preserves video embeds, iframes, and oEmbed content during round-trips.
 * Stores the original Carve source (e.g., YouTube URL) in data-carve-src.
 *
 * @example
 * ```js
 * import { CarveEmbed } from '@markup-carve/carve-grammars/tiptap'
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
            // The exact Carve source stamped by the renderer (data-carve-source),
            // e.g. ":youtube[id]" or ":media[url]". When present it is emitted
            // verbatim on serialize - lossless for every provider, no guessing.
            carveSource: {
                default: null,
                parseHTML: element => element.getAttribute('data-carve-source')
                    || element.querySelector('[data-carve-source]')?.getAttribute('data-carve-source')
                    || null,
                renderHTML: attributes => {
                    if (!attributes.carveSource) return {};
                    return { 'data-carve-source': attributes.carveSource };
                },
            },
            src: {
                default: null,
                parseHTML: element => {
                    // Check for data-carve-src first
                    const carveSrc = element.getAttribute('data-carve-src');
                    if (carveSrc) return carveSrc;
                    // The element may BE the iframe (matched by the tag rule) or
                    // wrap one.
                    if (element.tagName === 'IFRAME') return element.getAttribute('src');
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
                // Keep the full original embed markup so the editor previews the
                // real player (all iframe attributes: allow, referrerpolicy, ...),
                // not a stripped-down reconstruction.
                parseHTML: element => {
                    if (element.tagName === 'IFRAME') return element.outerHTML;
                    const iframe = element.querySelector('iframe');
                    if (iframe) return iframe.outerHTML;
                    return element.innerHTML || null;
                },
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
            // A source-stamped element round-trips exactly - match it first.
            { tag: '[data-carve-source]', priority: 60 },
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
        return ({ node, editor, getPos }) => {
            let current = node;
            const dom = document.createElement('figure');
            dom.classList.add('wpcarve-embed');
            dom.contentEditable = 'false';

            const media = document.createElement('div');
            media.className = 'wpcarve-embed-media';

            // Inline edit affordance: change the media URL / video id in place.
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'carve-embed-edit';
            editBtn.textContent = 'Edit';
            editBtn.contentEditable = 'false';
            editBtn.setAttribute('aria-label', 'Edit media URL');
            editBtn.addEventListener('mousedown', e => e.stopPropagation());
            editBtn.addEventListener('click', () => {
                if (typeof getPos !== 'function') return;
                const shown = current.attrs.carveSource || current.attrs.src || '';
                const val = window.prompt('Media URL or video id', shown);
                if (val === null) return;
                const input = val.trim();
                if (!input) return;
                // A `:name[...]` directive is kept as-is; a URL/id becomes one
                // (a bare id is assumed to be YouTube).
                const directive = input.startsWith(':')
                    ? input
                    : carveMediaDirective(/^https?:|^\/\//.test(input) ? input : `https://www.youtube.com/watch?v=${input}`);
                editor.chain().focus().command(({ tr }) => {
                    tr.setNodeMarkup(getPos(), undefined, {
                        ...current.attrs,
                        carveSource: directive,
                        src: null,
                        html: null,
                    });
                    return true;
                }).run();
            });

            const paint = (n) => {
                media.innerHTML = '';
                const src = embedPreviewSrc(n.attrs);
                if (n.attrs.html) {
                    media.innerHTML = n.attrs.html;
                } else if (src) {
                    const iframe = document.createElement('iframe');
                    iframe.src = src;
                    iframe.setAttribute('loading', 'lazy');
                    iframe.setAttribute('allowfullscreen', '');
                    iframe.setAttribute('frameborder', '0');
                    iframe.width = '480';
                    iframe.height = '270';
                    media.appendChild(iframe);
                } else {
                    const p = document.createElement('p');
                    p.textContent = `Embedded: ${n.attrs.carveSource || 'unknown'}`;
                    media.appendChild(p);
                }
                if (n.attrs.src) {
                    dom.setAttribute('data-carve-src', n.attrs.src);
                } else {
                    dom.removeAttribute('data-carve-src');
                }
                if (n.attrs.carveSource) {
                    dom.setAttribute('data-carve-source', n.attrs.carveSource);
                } else {
                    dom.removeAttribute('data-carve-source');
                }
            };

            dom.appendChild(media);
            dom.appendChild(editBtn);
            paint(node);

            return {
                dom,
                update: (updated) => {
                    if (updated.type !== current.type) {
                        return false;
                    }
                    current = updated;
                    paint(updated);
                    return true;
                },
                // Atom chrome: never let ProseMirror re-read our internal DOM.
                ignoreMutation: () => true,
            };
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
