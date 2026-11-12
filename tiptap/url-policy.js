/**
 * The URL sink policy of carve-js's HTML renderer (PART 9 §25), for the places
 * this package writes a destination or an authored attribute.
 *
 * carve-js does not export these from its public entry, so they are mirrored
 * here. `tests/url-policy-test.js` imports the renderer's own definitions from
 * the installed engine and fails when the two differ.
 */

/** carve-js `DANGEROUS_URL_SCHEMES`. */
export const DENIED_URL_SCHEMES = Object.freeze([
    'javascript',
    'vbscript',
    'data',
    'file',
    'ms-msdt',
    'ms-office',
    'ms-word',
    'ms-excel',
    'ms-powerpoint',
    'ms-access',
    'ms-visio',
    'ms-project',
    'ms-publisher',
    'ms-infopath',
    'ms-spd',
    'ms-search',
    'search-ms',
    'ms-cxh',
    'ms-cxh-full',
    'shell',
    'vscode',
    'vscode-insiders',
    'jar',
]);

/** carve-js `SCHEME_PROBE_STRIP_RE`: every control and whitespace character. */
export const SCHEME_PROBE_STRIP_RE = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f\s]+/gu;

const DENIED = new Set(DENIED_URL_SCHEMES);

/**
 * Whether the renderer blanks `url` as a link, autolink or image destination
 * (carve-js `sanitizeUrl` under its default policy).
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isDeniedDestination(url) {
    if (typeof url !== 'string' || url === '') return false;
    const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url.replace(SCHEME_PROBE_STRIP_RE, ''));

    return scheme !== null && DENIED.has(scheme[1].toLowerCase());
}

const ASCII_WHITESPACE = '\\t\\n\\f\\r ';
const URL_LIST_SEPARATORS = new Map([
    ['srcset', new RegExp(`[,${ASCII_WHITESPACE}]+`)],
    ['imagesrcset', new RegExp(`[,${ASCII_WHITESPACE}]+`)],
    ['ping', new RegExp(`[${ASCII_WHITESPACE}]+`)],
    ['attributionsrc', new RegExp(`[${ASCII_WHITESPACE}]+`)],
]);

function hasDeniedValueScheme(value) {
    const colon = value.indexOf(':');
    if (colon === -1) return false;

    return DENIED.has(value.slice(0, colon).replace(SCHEME_PROBE_STRIP_RE, '').toLowerCase());
}

/**
 * Whether the renderer drops or blanks an authored `name="value"` pair: an
 * event handler or other script-sink name, a denied scheme at the head of the
 * value or of any URL-list candidate, or a script-bearing `style`.
 *
 * The `style` test is wider than the renderer's: any backslash counts, since
 * this side does not decode CSS escapes. Callers shadow a refused pair rather
 * than drop it, so the wider test costs only the editor's styling.
 *
 * @param {string} name
 * @param {unknown} value
 * @returns {boolean}
 */
export function refusedAttribute(name, value) {
    const n = String(name).toLowerCase();
    if (n.startsWith('on') || n === 'srcdoc' || n === 'formaction') return true;
    if (typeof value !== 'string') return false;
    if (hasDeniedValueScheme(value)) return true;
    const separator = URL_LIST_SEPARATORS.get(n);
    if (separator && value.split(separator).some((token) => token !== '' && hasDeniedValueScheme(token))) {
        return true;
    }
    if (n === 'style') {
        const compact = value.replace(/\/\*[\s\S]*?\*\//g, '').toLowerCase().replace(/\s+/g, '');

        return compact.includes('\\') || ['expression(', 'url(', '@import', 'behavior:', '-moz-binding']
            .some((needle) => compact.includes(needle));
    }

    return false;
}
