// Reviewed engine expectations keyed by TextMate selector.
export const ENGINE_SCOPES = {
  "meta.attributes": {
    "prism": [
      [
        "attributes>attr-value>class-name",
        "attributes>attr-value>punctuation"
      ],
      [
        "attributes>attr-value>attr-name"
      ],
      [
        "attributes>attr-value",
        "attributes>attr-value>attr-name",
        "attributes>attr-value>punctuation"
      ],
      [
        "attributes>attr-value>language"
      ],
      [
        "attributes>attr-value>language",
        "attributes>attr-value>punctuation"
      ]
    ],
    "highlightjs": [
      [
        "attr"
      ]
    ]
  },
  "markup.italic": {
    "prism": [
      [
        "italic>italic"
      ],
      [
        "forced-italic>italic"
      ]
    ],
    "highlightjs": [
      [
        "emphasis"
      ]
    ]
  },
  "markup.bold": {
    "prism": [
      [
        "bold>bold"
      ],
      [
        "forced-bold>bold"
      ]
    ],
    "highlightjs": [
      [
        "strong"
      ]
    ]
  },
  "markup.bold.italic": {
    "prism": [
      [
        "bold-italic>important"
      ]
    ],
    "highlightjs": [
      [
        "strong"
      ],
      [
        "emphasis",
        "strong"
      ]
    ]
  },
  "markup.underline": {
    "prism": [
      [
        "underline>underline"
      ],
      [
        "forced-underline>underline"
      ]
    ],
    "highlightjs": [
      [
        "emphasis"
      ]
    ]
  },
  "markup.strikethrough": {
    "prism": [
      [
        "strike>deleted"
      ],
      [
        "forced-strike>deleted"
      ]
    ],
    "highlightjs": [
      [
        "deletion"
      ]
    ]
  },
  "markup.highlight": {
    "prism": [
      [
        "highlight>important"
      ]
    ],
    "highlightjs": [
      [
        "addition"
      ]
    ]
  },
  "markup.raw.inline": {
    "prism": [
      [
        "code"
      ]
    ],
    "highlightjs": [
      [
        "code"
      ]
    ]
  },
  "markup.superscript": {
    "prism": [
      [
        "superscript>important"
      ]
    ],
    "highlightjs": [
      [
        "built_in"
      ]
    ]
  },
  "markup.subscript": {
    "prism": [
      [
        "subscript>important"
      ]
    ],
    "highlightjs": [
      [
        "built_in"
      ]
    ]
  },
  "markup.inserted": {
    "prism": [
      [
        "inserted>inserted"
      ]
    ],
    "highlightjs": [
      [
        "addition"
      ]
    ]
  },
  "markup.deleted": {
    "prism": [
      [
        "deleted>deleted"
      ]
    ],
    "highlightjs": [
      [
        "deletion"
      ]
    ]
  },
  "markup.changed": {
    "prism": [
      [
        "changed>important>deleted"
      ]
    ],
    "highlightjs": [
      [
        "deletion"
      ]
    ]
  },
  "comment": {
    "prism": [
      [
        "critic-comment>comment"
      ],
      [
        "comment"
      ]
    ],
    "highlightjs": [
      [
        "comment"
      ]
    ]
  },
  "attributes": {
    "prism": [
      [
        "attributes>attr-value>class-name"
      ],
      [
        "attributes>attr-value>id",
        "title>important>punctuation"
      ]
    ],
    "highlightjs": [
      [
        "attr"
      ]
    ]
  },
  "tag": {
    "prism": [
      [
        "tag>variable"
      ]
    ],
    "highlightjs": [
      [
        "symbol"
      ]
    ]
  },
  "string.other.link.title": {
    "prism": [
      [
        "url"
      ],
      [
        "url",
        "url>punctuation"
      ],
      [
        "span>string"
      ]
    ],
    "highlightjs": [
      [
        "link"
      ],
      [
        "string"
      ]
    ]
  },
  "markup.underline.link": {
    "prism": [
      [
        "url"
      ],
      [
        "reference-definition>url"
      ]
    ],
    "highlightjs": [
      [
        "link"
      ],
      [
        "link",
        "symbol"
      ]
    ]
  },
  "punctuation.definition.image": {
    "prism": [
      [
        "image>url>punctuation"
      ]
    ],
    "highlightjs": [
      [
        "link"
      ]
    ]
  },
  "string.other.image.alt": {
    "prism": [
      [
        "image>url"
      ],
      [
        "reference-image>url",
        "reference-image>url>punctuation"
      ],
      [
        "reference-image>url"
      ]
    ],
    "highlightjs": [
      [
        "link"
      ]
    ]
  },
  "constant.other.footnote": {
    "prism": [
      [
        "footnote>symbol"
      ]
    ],
    "highlightjs": [
      [
        "symbol"
      ]
    ]
  },
  "mention": {
    "prism": [
      [
        "mention>variable"
      ]
    ],
    "highlightjs": [
      [
        "symbol"
      ]
    ]
  },
  "string.other.link.include": {
    "prism": [
      [
        "include-directive>important>include-path>url"
      ]
    ],
    "highlightjs": [
      [
        "meta",
        "string"
      ]
    ]
  },
  "entity.name.section.include": {
    "prism": [
      [
        "include-directive>important>include-section>symbol"
      ]
    ],
    "highlightjs": [
      [
        "meta",
        "symbol"
      ]
    ]
  },
  "variable.parameter.include": {
    "prism": [
      [
        "include-directive>important>include-option>include-option-name>keyword"
      ]
    ],
    "highlightjs": [
      [
        "keyword",
        "meta"
      ]
    ]
  },
  "constant.other.include": {
    "prism": [
      [
        "include-directive>important>include-option>include-option-value>string"
      ]
    ],
    "highlightjs": [
      [
        "literal",
        "meta"
      ]
    ]
  },
  "markup.math": {
    "prism": [
      [
        "math>string"
      ]
    ],
    "highlightjs": [
      [
        "string"
      ]
    ]
  },
  "markup.raw.inline.content": {
    "prism": [
      [
        "literal>string"
      ]
    ],
    "highlightjs": [
      [
        "string"
      ]
    ]
  },
  "comment.block.inline": {
    "prism": [
      [
        "comment"
      ]
    ],
    "highlightjs": [
      [
        "comment"
      ]
    ]
  },
  "extension": {
    "prism": [
      [
        "extension>function>function"
      ]
    ],
    "highlightjs": [
      [
        "function"
      ]
    ]
  },
  "string.unquoted.extension": {
    "prism": [
      [
        "extension>function"
      ]
    ],
    "highlightjs": [
      [
        "function"
      ]
    ]
  },
  "constant.language.symbol": {
    "prism": [
      [
        "symbol>constant"
      ]
    ],
    "highlightjs": [
      [
        "symbol"
      ]
    ]
  },
  "variable.other.citation.key": {
    "prism": [
      [
        "citation>string>function"
      ]
    ],
    "highlightjs": [
      [
        "symbol"
      ]
    ]
  },
  "constant.numeric.callout": {
    "prism": [
      [
        "code-callout>symbol"
      ],
      [
        "code-block"
      ]
    ],
    "highlightjs": [
      [
        "symbol"
      ],
      [
        "code"
      ]
    ]
  },
  "string.other.footnote.inline": {
    "prism": [
      [
        "inline-footnote>symbol"
      ]
    ],
    "highlightjs": [
      [
        "symbol"
      ]
    ]
  },
  "typography": {
    "prism": [
      [
        "typography>constant"
      ]
    ],
    "highlightjs": [
      [
        "literal"
      ]
    ]
  },
  "hard-break": {
    "prism": [
      [
        "hard-break>constant"
      ]
    ],
    "highlightjs": [
      [
        "meta"
      ]
    ]
  },
  "punctuation.definition.list.numbered": {
    "prism": [
      [
        "list>punctuation"
      ]
    ],
    "highlightjs": [
      [
        "bullet"
      ]
    ]
  },
  "constant.language.checkbox": {
    "prism": [
      [
        "list>punctuation>constant"
      ],
      [
        "list>punctuation",
        "list>punctuation>constant"
      ]
    ],
    "highlightjs": [
      [
        "bullet"
      ]
    ]
  },
  "entity.name.tag.definition.term": {
    "prism": [
      [
        "definition-list>definition-term>title"
      ]
    ],
    "highlightjs": [
      [
        "title"
      ]
    ]
  },
  "keyword.operator.table.continuation": {
    "prism": [
      [
        "table-continuation>table-operator"
      ]
    ],
    "highlightjs": [
      [
        "table-operator"
      ]
    ]
  },
  "list": {
    "prism": [
      [
        "continuation-marker>punctuation"
      ]
    ],
    "highlightjs": [
      [
        "punctuation"
      ]
    ]
  },
  "caption": {
    "prism": [
      [
        "caption>title"
      ]
    ],
    "highlightjs": [
      [
        "title"
      ]
    ]
  },
  "markup.caption": {
    "prism": [
      [
        "caption>title"
      ]
    ],
    "highlightjs": [
      [
        "title"
      ]
    ]
  },
  "heading": {
    "prism": [
      [
        "title>important"
      ]
    ],
    "highlightjs": [
      [
        "section"
      ]
    ]
  },
  "fenced_code.block.language": {
    "prism": [
      [
        "code-block>language>class-name"
      ]
    ],
    "highlightjs": [
      [
        "code",
        "keyword"
      ]
    ]
  },
  "quote": {
    "prism": [
      [
        "blockquote"
      ]
    ],
    "highlightjs": [
      [
        "quote"
      ]
    ]
  },
  "punctuation.definition.list": {
    "prism": [
      [
        "list>punctuation"
      ]
    ],
    "highlightjs": [
      [
        "bullet"
      ]
    ]
  },
  "punctuation.definition.list.unnumbered": {
    "prism": [
      [
        "list>punctuation"
      ]
    ],
    "highlightjs": [
      [
        "bullet"
      ]
    ]
  },
  "keyword.operator.table.header": {
    "prism": [
      [
        "table>table-header"
      ]
    ],
    "highlightjs": [
      [
        "table-operator"
      ]
    ]
  },
  "admonition": {
    "prism": [
      [
        "div>tag>div-delimiter>class-name"
      ]
    ],
    "highlightjs": [
      [
        "keyword"
      ]
    ]
  },
  "punctuation.separator.table": {
    "prism": [
      [
        "table>table-boundary"
      ]
    ],
    "highlightjs": [
      [
        "table-boundary"
      ]
    ]
  },
  "abbreviation": {
    "prism": [
      [
        "abbreviation-definition>symbol"
      ]
    ],
    "highlightjs": [
      [
        "symbol"
      ]
    ]
  },
  "fenced_code": {
    "prism": [
      [
        "code-block"
      ]
    ],
    "highlightjs": [
      [
        "code",
        "keyword"
      ]
    ]
  },
  "markup.heading": {
    "prism": [
      [
        "title>important"
      ]
    ],
    "highlightjs": [
      [
        "section"
      ]
    ]
  },
  "list.unnumbered": {
    "prism": [
      [
        "list>punctuation"
      ]
    ],
    "highlightjs": [
      [
        "bullet"
      ]
    ]
  },
  "punctuation.definition.literal": {
    "prism": [
      [
        "literal>string"
      ]
    ],
    "highlightjs": [
      [
        "string"
      ]
    ]
  },
  "punctuation.definition.link": {
    "prism": [
      [
        "url>punctuation"
      ]
    ],
    "highlightjs": [
      [
        "link"
      ]
    ]
  },
  "markup.underline.link.cross-reference": {
    "prism": [
      [
        "cross-ref>url"
      ]
    ],
    "highlightjs": [
      [
        "link"
      ]
    ]
  },
  "keyword.operator.citation.integral": {
    "prism": [
      [
        "citation>string>operator"
      ]
    ],
    "highlightjs": [
      [
        "symbol"
      ]
    ]
  },
  "punctuation.definition.citation": {
    "prism": [
      [
        "citation>string>punctuation"
      ]
    ],
    "highlightjs": [
      [
        "symbol"
      ]
    ]
  },
  "punctuation.definition.symbol": {
    "prism": [
      [
        "symbol>constant"
      ]
    ],
    "highlightjs": [
      [
        "symbol"
      ]
    ]
  },
  "constant.character.escape": {
    "prism": [
      [
        "escape>constant"
      ]
    ],
    "highlightjs": [
      [
        "symbol"
      ]
    ]
  },
  "raw": {
    "prism": [
      [
        "raw-inline>string"
      ]
    ],
    "highlightjs": [
      [
        "code"
      ]
    ]
  },
  "separator": {
    "prism": [
      [
        "thematic-break>punctuation"
      ]
    ],
    "highlightjs": [
      [
        "meta"
      ]
    ]
  },
  "checkbox": {
    "prism": [
      [
        "list>punctuation>constant"
      ]
    ],
    "highlightjs": [
      [
        "bullet"
      ]
    ]
  },
  "punctuation.definition.fenced": {
    "prism": [
      [
        "code-block>punctuation"
      ]
    ],
    "highlightjs": [
      [
        "code",
        "keyword"
      ]
    ]
  },
  "string.quoted.double.fenced.title": {
    "prism": [
      [
        "code-block"
      ]
    ],
    "highlightjs": [
      [
        "code",
        "keyword"
      ]
    ]
  },
  "string.quoted.double.admonition.title": {
    "prism": [
      [
        "div>tag>div-delimiter>string"
      ]
    ],
    "highlightjs": [
      [
        "keyword"
      ]
    ]
  },
  "constant.other.label.admonition": {
    "prism": [
      [
        "div>tag>div-delimiter>symbol"
      ]
    ],
    "highlightjs": [
      [
        "keyword"
      ]
    ]
  },
  "entity.name.tag.figure-group": {
    "prism": [
      [
        "figure-group>tag>figure-group-delimiter>class-name"
      ]
    ],
    "highlightjs": [
      [
        "section"
      ]
    ]
  },
  "keyword.operator.table.alignment": {
    "prism": [
      [
        "table>table-header"
      ],
      [
        "table>table-operator"
      ],
      [
        "table-separator>table-operator"
      ]
    ],
    "highlightjs": [
      [
        "table-operator"
      ]
    ]
  },
  "keyword.operator.table.rowspan": {
    "prism": [
      [
        "table>table-operator"
      ]
    ],
    "highlightjs": [
      [
        "table-operator"
      ]
    ]
  },
  "keyword.operator.table.colspan": {
    "prism": [
      [
        "table>table-operator"
      ]
    ],
    "highlightjs": [
      [
        "table-operator"
      ]
    ]
  },
  "constant.other.reference.link": {
    "prism": [
      [
        "reference-definition>url",
        "reference-definition>url>constant"
      ]
    ],
    "highlightjs": [
      [
        "link",
        "symbol"
      ]
    ]
  },
  "string.quoted.link.title": {
    "prism": [
      [
        "reference-definition>url>string"
      ]
    ],
    "highlightjs": [
      [
        "string",
        "symbol"
      ]
    ]
  },
  "frontmatter": {
    "prism": [
      [
        "front-matter>key>property"
      ]
    ],
    "highlightjs": [
      [
        "attr",
        "language-yaml"
      ]
    ]
  },
  "meta.link.reference.def": {
    "prism": [
      [
        "reference-definition>url>constant"
      ]
    ],
    "highlightjs": [
      [
        "symbol"
      ]
    ]
  }
};
