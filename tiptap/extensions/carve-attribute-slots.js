/**
 * The attribute slots an authored `{#id .class key=value}` run needs on a node
 * that accepts one.
 *
 * Tiptap keeps only attributes a node DECLARES, so a node without these slots
 * drops the author's attribute run on the way in and the serializer has nothing
 * left to write. `id` and `class` are their own slots because they render as
 * real HTML attributes; everything else travels together in `carveKeyValues`, since
 * the names are the author's and cannot be declared upfront.
 *
 * `carveAttrOrder` carries the ORDER the run was written in. Splitting a run
 * into three slots is what loses it: a ProseMirror attribute set is an unordered
 * map, so `{key=c .a #b}` came back `{#b .a key="c"}` - the same document with a
 * different spelling, which makes a formatter's contract unmeetable. The AST
 * keeps an `order` field for exactly this, and the value here is that field,
 * unchanged (markup-carve/carve-grammars#240).
 *
 * @param {string[]} own - HTML attribute names this node renders itself, which
 *   are therefore NOT authored key/values on the way back in. Matched without
 *   regard to case, because the DOM lowercases an attribute name while a slot
 *   rendered from a camelCase schema attribute keeps its spelling here.
 * @returns {object} Tiptap attribute declarations.
 */
export function attributeSlots(own = []) {
    const reserved = new Set(
        ['id', 'class', 'data-carve-attr-order', ...own].map(name => name.toLowerCase()),
    );

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
        carveKeyValues: {
            default: null,
            parseHTML: element => {
                const pairs = {};
                for (const attribute of Array.from(element.attributes || [])) {
                    if (!reserved.has(attribute.name)) pairs[attribute.name] = attribute.value;
                }

                return Object.keys(pairs).length ? pairs : null;
            },
            renderHTML: attributes => ({ ...(attributes.carveKeyValues || {}) }),
        },
        ...attributeOrderSlot(),
    };
}

/**
 * The one slot that carries an attribute run's WRITTEN ORDER.
 *
 * Separate from `attributeSlots` because `carveSpan` keeps the author's pairs
 * as JSON text in one `data-carve-key-values` attribute rather than as real
 * HTML attributes, and still needs the order - a node that carries the run but
 * not its order respells it.
 *
 * @returns {object} Tiptap attribute declaration for `carveAttrOrder`.
 */
export function attributeOrderSlot() {
    return {
        carveAttrOrder: {
            default: null,
            parseHTML: (element) => {
                const raw = element.getAttribute?.('data-carve-attr-order');
                if (!raw) return null;
                const slots = raw.split(/\s+/).filter(Boolean);

                return slots.length ? slots : null;
            },
            renderHTML: (attributes) => (Array.isArray(attributes.carveAttrOrder) && attributes.carveAttrOrder.length
                ? { 'data-carve-attr-order': attributes.carveAttrOrder.join(' ') }
                : {}),
        },
    };
}

export default attributeSlots;
