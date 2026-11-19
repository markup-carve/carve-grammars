// Load and serialize times of the Tiptap kit at 2k, 8k and 32k of source: `node scripts/tiptap-timing.mjs`.
import * as carve from '@markup-carve/carve'
import { carveToProseMirror, serializeToCarve } from '@markup-carve/carve-grammars/tiptap'

const unit = [
    '::: note "Title"\nA paragraph with *bold*, /em/ and `code`[^n].\n:::\n',
    '- [x] done\n- [?] maybe\n',
    ':: Term\n: Definition.\n',
    '|= a |= b |\n| 1 | 2 |\n',
    '```js\nconst a = 1;\n```\n',
    '[^n]: A note.\n',
].join('\n')

function median(run) {
    const times = []
    for (let index = 0; index < 7; index++) {
        const start = performance.now()
        run()
        times.push(performance.now() - start)
    }
    return times.sort((a, b) => a - b)[3]
}

for (const size of [2048, 8192, 32768]) {
    let source = ''
    while (source.length < size) source += `${unit}\n`
    const json = carveToProseMirror(source, { engine: carve })
    const load = median(() => carveToProseMirror(source, { engine: carve }))
    const edited = JSON.parse(JSON.stringify(json))
    edited.content[0].content[1].content[0].text = 'edited '
    const unchanged = median(() => serializeToCarve(json, { engine: carve, source }))
    const write = median(() => serializeToCarve(edited, { engine: carve, source }))
    console.log(`${String(source.length).padStart(6)} chars: load ${load.toFixed(1)} ms, serialize unedited ${unchanged.toFixed(1)} ms, serialize edited ${write.toFixed(1)} ms`)
}
