import { createHighlighter as createShikiHighlighter } from 'shiki';

export function retryTokenizer(operation, warn = message => console.warn(message)) {
    return function (...args) {
        try {
            return operation.apply(this, args);
        } catch (error) {
            if (!(error instanceof TypeError)
                || error.message !== "Cannot read properties of undefined (reading 'startIndex')"
                || !/@shikijs\/(?:primitive|core)\//.test(error.stack ?? '')) {
                throw error;
            }
            warn('Shiki tokenizer exceeded its scope pass time limit (#607); retrying once with the same options.');
            return operation.apply(this, args);
        }
    };
}

export async function createHighlighter(options) {
    const highlighter = await createShikiHighlighter(options);
    for (const method of ['codeToTokens', 'codeToTokensBase', 'codeToHtml', 'codeToHast']) {
        highlighter[method] = retryTokenizer(highlighter[method]);
    }
    return highlighter;
}
