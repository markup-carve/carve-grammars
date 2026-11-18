# Carve Grammars

Editor and highlighting grammars for Carve, with Tiptap, Prism, highlight.js, and TextMate entry points. The package targets Carve 0.1.x and uses @markup-carve/carve 0.1.16 for its editor integration. Read the [Carve documentation](https://markup-carve.github.io/carve/) for the language syntax.

Carve 0.2 highlighting is available from `prism/carve2.js`,
`highlightjs/carve2.mjs`, and `textmate/carve2.tmLanguage.json` on the `next2`
branch. These entries use `carve2` as the language id while retaining the
existing token scopes for constructs that remain in 0.2. The Tiptap editor
and serializer still use the 0.1 engine.

## Install

```sh
npm install @markup-carve/carve-grammars prismjs
```

## Usage

```js
import Prism from 'prismjs'
import '@markup-carve/carve-grammars/prism/carve.js'

Prism.highlight(source, Prism.languages.carve, 'carve')
```

## Documentation

- [Carve documentation](https://markup-carve.github.io/carve/)
- [Documentation index](docs/README.md)
- [Development](docs/development.md)

## License

[MIT](LICENSE)
