/**
 * The ledger's second axis on a surface that is not a tokenizer.
 *
 * The Tiptap entry is a SCHEMA BRIDGE: it takes the engine's AST and builds a
 * ProseMirror document. There are no scopes and no source offsets, so
 * `measure` in `payload-inertness.js` - which counts characters into the source
 * - cannot ask it anything, and the twelve Tiptap `payload: "unmeasured"` rows
 * had no instrument at all.
 *
 * The question survives the change of medium. A payload that is not Carve must
 * reach the editor AS ITSELF: one uninterrupted run, carrying no mark that
 * claims it is markup. If the bridge parsed the payload, `*b*` would arrive as
 * a `b` under a `bold` mark and the run would not be in the document at all.
 * So the measurement is: find the payload in the model, and look at what is
 * over it.
 *
 * WHERE A PAYLOAD LIVES. Some payloads are text - a code block's body, a code
 * mark's content - and some are an ATTRIBUTE, because the bridge models the
 * construct as an atom: the braced comment, the raw and literal inlines, both
 * maths. Both are the editor holding the payload, so both count, and a
 * measurement that read only text nodes would report the atoms as lost.
 *
 * @module tests/lib/tiptap-payload
 */
import { carveToProseMirror } from '../../tiptap/carve-to-pm.js';
import { PAYLOAD } from './payload-inertness.js';

/** A mark name that claims its content is emphasis. */
const EMPHASIS_MARK = /\b(bold|strong|italic|emphasis)\b/i;

/**
 * Every string the editor model carries, with the marks in force over it.
 *
 * @param {object} doc - A ProseMirror `doc` node.
 * @returns {Array<{text: string, marks: string[]}>} the carriers.
 */
function carriers(doc) {
    const out = [];
    const walk = (node, marks) => {
        if (!node) return;
        if (Array.isArray(node)) {
            node.forEach((child) => walk(child, marks));

            return;
        }
        const here = [...marks, ...(node.marks ?? []).map((mark) => mark.type)];
        if (node.type === 'text') {
            out.push({ text: node.text ?? '', marks: here });

            return;
        }
        for (const value of Object.values(node.attrs ?? {})) {
            if (typeof value === 'string') out.push({ text: value, marks: here });
        }
        if (node.content) walk(node.content, here);
    };
    walk(doc.content, []);

    return out;
}

/**
 * What the bridge did with the payload of one verbatim construct.
 *
 * `lost` is its own answer rather than a leak: it means the payload is not in
 * the editor model at all, which is a different defect from colouring it, and
 * one the caller has to be able to tell apart. The sweep treats it as a
 * document that is not about a payload only where the ENGINE agrees the payload
 * never existed.
 *
 * @param {string} source - The Carve source.
 * @returns {'inert'|'leaks'|'lost'} what became of the payload.
 */
export function measureModel(source) {
    const doc = carveToProseMirror(source, { unsupported: 'preserve' });
    const holding = carriers(doc).filter((carrier) => carrier.text.includes(PAYLOAD));
    if (holding.length === 0) return 'lost';

    return holding.some((carrier) => !carrier.marks.some((mark) => EMPHASIS_MARK.test(mark)))
        ? 'inert'
        : 'leaks';
}
