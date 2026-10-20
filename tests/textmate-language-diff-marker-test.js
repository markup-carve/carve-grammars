import assert from 'node:assert/strict'
import { createHighlighter } from 'shiki'
import carveGrammar from '../textmate/carve.tmLanguage.json' with { type: 'json' }

const highlighter = await createHighlighter({
    themes: ['github-light', 'github-dark'],
    langs: ['diff', 'javascript', 'python', 'cpp', 'html', carveGrammar],
})

function tokens(source) {
    return highlighter.codeToTokens(source, {
        lang: 'carve',
        themes: { light: 'github-light', dark: 'github-dark' },
        includeExplanation: 'scopeName',
    }).tokens.flat()
}

function scopes(token) {
    return token.explanation.flatMap((part) => part.scopes.map((scope) => scope.scopeName))
}

try {
    for (const lang of ['js', 'python']) {
        const source = `{.diff}\n\`\`\`${lang}\n- old()\n+ new()\n\`\`\``
        const highlighted = tokens(source)
        const removed = highlighted.find((token) => token.content === '-')
        const added = highlighted.find((token) => token.content === '+')
        assert.ok(removed, `${lang}: missing removal marker`)
        assert.ok(added, `${lang}: missing addition marker`)
        assert.ok(scopes(removed).includes('markup.deleted.diff.carve'))
        assert.ok(scopes(added).includes('markup.inserted.diff.carve'))
        assert.equal(removed.htmlStyle.color.toLowerCase(), '#b31d28')
        assert.equal(added.htmlStyle.color.toLowerCase(), '#22863a')
        assert.ok(scopes(highlighted.find((token) => token.content.includes('old'))).some((scope) => scope.includes(lang === 'js' ? '.js' : '.python')))
    }

    const context = tokens('{.diff}\n```js\n   - unchanged\n   + unchanged\n```')
    assert.ok(!context.some((token) => scopes(token).includes('markup.deleted.diff.carve') || scopes(token).includes('markup.inserted.diff.carve')))

    const unknown = tokens('{.diff}\n```unknown\n+ text\n```')
    assert.ok(scopes(unknown.find((token) => token.content === '+')).includes('markup.inserted.diff.carve'))

    const multiline = tokens('{.diff}\n```js\n+ /* starts\n+ ends */\n```')
    assert.equal(multiline.filter((token) => token.content === '+' && scopes(token).includes('markup.inserted.diff.carve')).length, 2)
    const template = tokens('{.diff}\n```js\n+ `starts\n+ ends`\n```')
    assert.equal(template.filter((token) => token.content === '+' && scopes(token).includes('markup.inserted.diff.carve')).length, 2)

    for (const opener of ['```js "example.js"', '```js [example]', '```c++', '```C++', '```C#']) {
        const titled = tokens(`{.diff}\n${opener}\n+ added\n\`\`\``)
        assert.ok(scopes(titled.find((token) => token.content === '+')).includes('markup.inserted.diff.carve'), opener)
    }

    const plain = tokens('```js\n+ ordinaryOperator\n```')
    const operator = plain.find((token) => token.content === '+')
    assert.ok(operator)
    assert.ok(!scopes(operator).includes('markup.inserted.diff.carve'))

    const detached = tokens('{.diff}\nNot a fence\n```js\n+ ordinaryOperator\n```')
    const detachedOperator = detached.find((token) => token.content === '+')
    assert.ok(detachedOperator)
    assert.ok(!scopes(detachedOperator).includes('markup.inserted.diff.carve'))

    const unlisted = tokens('{.diff}\n```foo+bar\n+ text\n```\nafter *strong*')
    assert.ok(scopes(unlisted.find((token) => token.content === 'strong')).includes('markup.bold.carve'))

    const raw = tokens('{.diff}\n```=html\n+ <b>x</b>\n```')
    assert.ok(scopes(raw.find((token) => token.content === 'b')).includes('entity.name.tag.html'))
} finally {
    highlighter.dispose()
}

console.log('TextMate language-diff marker scopes passed')
