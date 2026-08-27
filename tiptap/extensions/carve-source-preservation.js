import { Extension } from '@tiptap/core';

/** Merge base for preserving authored source layout around structured edits. */
export const CarveSourcePreservation = Extension.create({
    name: 'carveSourcePreservation',
    addGlobalAttributes() {
        return [
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
