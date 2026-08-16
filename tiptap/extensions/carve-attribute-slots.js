/**
 * The three attribute slots an authored `{#id .class key=value}` run needs on a
 * node that accepts one.
 *
 * Tiptap keeps only attributes a node DECLARES, so a node without these slots
 * drops the author's attribute run on the way in and the serializer has nothing
 * left to write. `id` and `class` are their own slots because they render as
 * real HTML attributes; everything else travels together in `keyValues`, since
 * the names are the author's and cannot be declared upfront.
 *
 * @param {string[]} own - HTML attribute names this node renders itself, which
 *   are therefore NOT authored key/values on the way back in.
 * @returns {object} Tiptap attribute declarations.
 */
export function attributeSlots(own = []) {
    const reserved = new Set(['id', 'class', ...own]);

    return {
        id: {
            default: null,
            parseHTML: element => element.getAttribute('id'),
            renderHTML: attributes => (attributes.id ? { id: attributes.id } : {}),
        },
        class: {
            default: null,
            parseHTML: element => element.getAttribute('class') || null,
            renderHTML: attributes => (attributes.class ? { class: attributes.class } : {}),
        },
        keyValues: {
            default: null,
            parseHTML: element => {
                const pairs = {};
                for (const attribute of Array.from(element.attributes || [])) {
                    if (!reserved.has(attribute.name)) pairs[attribute.name] = attribute.value;
                }

                return Object.keys(pairs).length ? pairs : null;
            },
            renderHTML: attributes => ({ ...(attributes.keyValues || {}) }),
        },
    };
}

export default attributeSlots;
