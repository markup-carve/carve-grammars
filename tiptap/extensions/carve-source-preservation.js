import { Extension } from '@tiptap/core';

const positionedBlocks = [
    'paragraph', 'heading', 'codeBlock', 'bulletList', 'orderedList', 'taskList',
    'listItem', 'taskItem', 'blockquote', 'table', 'tableRow', 'tableCell',
    'tableHeader', 'horizontalRule', 'definitionList', 'definitionTerm',
    'definitionDescription', 'carveDiv', 'carveTabSet', 'carveTab',
    'carveLineBlock', 'carveFigure', 'carveFigureGroup', 'carveCaption', 'carveSection',
    'carveRawBlock', 'carveComment', 'carveFrontmatter', 'carveLinkRefDef',
    'carveFootnoteDefinition', 'carveCitationDefinition',
    'carveAbbreviationDefinition', 'carveEmbed', 'carveUnsupported',
    'carveDirective', 'carveBlockExtension',
];

/** Merge base for preserving authored source layout around structured edits. */
export const CarveSourcePreservation = Extension.create({
    name: 'carveSourcePreservation',
    addGlobalAttributes() {
        return [
            {
                types: positionedBlocks,
                attributes: {
                    carvePos: { default: null, rendered: false, keepOnSplit: false },
                },
            },
            {
                types: ['doc'],
                attributes: {
                    carveSource: { default: null, rendered: false },
                    carveFingerprint: { default: null, rendered: false },
                    carveSourceLayout: { default: null, rendered: false },
                    carveProjectedSource: { default: null, rendered: false },
                },
            },
            {
                types: ['tableCell', 'tableHeader'],
                attributes: { carveSpanMarker: { default: null, rendered: false } },
            },
        ];
    },
});

export default CarveSourcePreservation;
