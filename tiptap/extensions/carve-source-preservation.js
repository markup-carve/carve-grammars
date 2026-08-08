import { Extension } from '@tiptap/core';

/** Lossless source envelope for a structured document that has not been edited. */
export const CarveSourcePreservation = Extension.create({
    name: 'carveSourcePreservation',
    addGlobalAttributes() {
        return [
            {
                types: ['doc'],
                attributes: {
                carveSource: { default: null, rendered: false },
                carveFingerprint: { default: null, rendered: false },
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
