/**
 * The URL sink test of the carve-js HTML renderer (C2-H-159, C2-H-160, C2-H-173), mirrored because
 * the kit does not import the engine. `tests/tiptap-kit-test.js` checks it against the installed
 * engine's `isUrlAllowed` and `DEFAULT_DENIED_SCHEMES`.
 */

/** carve-js `DEFAULT_DENIED_SCHEMES`. */
export const DEFAULT_DENIED_SCHEMES = Object.freeze([
    'javascript', 'vbscript', 'data', 'file', 'ms-msdt', 'ms-office', 'ms-word', 'ms-excel', 'ms-powerpoint',
    'ms-access', 'ms-visio', 'ms-project', 'ms-publisher', 'ms-infopath', 'ms-spd', 'ms-search', 'search-ms',
    'ms-cxh', 'ms-cxh-full', 'shell', 'vscode', 'vscode-insiders', 'jar',
]);

/** C2-H-159: the code ranges the scheme probe removes. */
const PROBE_REMOVED = [
    [0x0000, 0x0020], [0x007f, 0x00a0], [0x1680, 0x1680], [0x2000, 0x200a], [0x2028, 0x2029], [0x202a, 0x202e],
    [0x202f, 0x202f], [0x205f, 0x205f], [0x2066, 0x2069], [0x3000, 0x3000], [0xfeff, 0xfeff], [0xfffd, 0xfffd],
];

function isProbeRemoved(code) {
    if (code > 0x20 && code < 0x7f) return false;
    return PROBE_REMOVED.some(([from, to]) => code >= from && code <= to);
}

function isAsciiLetter(code) {
    return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

function isSchemeCharacter(code) {
    return isAsciiLetter(code) || (code >= 0x30 && code <= 0x39) || code === 0x2b || code === 0x2d || code === 0x2e;
}

/** The lowercased scheme of `url`, or the empty string when it has none. */
export function urlScheme(url) {
    let scheme = '';
    for (let at = 0; at < url.length; at++) {
        const code = url.charCodeAt(at);
        if (isProbeRemoved(code)) continue;
        if (code === 0x3a) return scheme.toLowerCase();
        if (scheme === '' ? !isAsciiLetter(code) : !isSchemeCharacter(code)) return '';
        scheme += url[at];
    }
    return '';
}

/**
 * Whether `url` passes `policy` (`{ deny }` or `{ allow }`, the default deny list when neither is given).
 *
 * @param {string} url
 * @param {{ deny?: readonly string[], allow?: readonly string[] }} [policy]
 */
export function isUrlAllowed(url, policy = {}) {
    const scheme = urlScheme(url);
    if (scheme === '') return true;
    if (policy.allow !== undefined) return policy.allow.some((allowed) => allowed.toLowerCase() === scheme);
    return !(policy.deny ?? DEFAULT_DENIED_SCHEMES).some((denied) => denied.toLowerCase() === scheme);
}
