# Carve Grammars

Editor and highlighting grammars for Carve, with Tiptap, Prism, highlight.js, and TextMate entry points. The package targets Carve 0.1.x and uses @markup-carve/carve 0.1.15 for its editor integration. Read the [Carve documentation](https://markup-carve.github.io/carve/) for the language syntax.

## Install

```sh
npm install @markup-carve/carve-grammars
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
