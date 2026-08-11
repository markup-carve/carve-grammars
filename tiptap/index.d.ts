import type { Extension, JSONContent, Mark, Node } from '@tiptap/core';

export interface CarveLoaderOptions {
  unsupported?: 'throw' | 'preserve';
}

export interface CarveAstNode {
  type: string;
  [property: string]: unknown;
}

export class UnsupportedNodeError extends Error {
  readonly nodeType: string;
  readonly node: unknown;
}

export const CarveKit: Extension;

export const CarveInsert: Mark;
export const CarveDelete: Mark;
export const CarveCriticComment: Mark;

export const CarveDiv: Node;
export const CarveMath: Node;
export const CarveFootnoteDefinition: Node;
export const CarveMention: Node;
export const CarveTag: Node;
export const CarveUnsupported: Node;
export const CarveUnsupportedInline: Node;
export const CarveFigure: Node;
export const CarveCaption: Node;
export const CarveRawBlock: Node;
export const CarveComment: Node;
export const CarveCommentInline: Node;
export const CarveLineBlock: Node;
export const CarveHeading: Node;

export const CarveKeymap: Extension;
export const CarveSourcePreservation: Extension;

export function carveToProseMirror(
  source: string,
  options?: CarveLoaderOptions,
): JSONContent;

export function astToProseMirror(
  ast: CarveAstNode,
  options?: CarveLoaderOptions & { source?: string },
): JSONContent;

export function serializeToCarve(document: JSONContent): string;
export function escapeCarve(text: string, trailingSafe?: boolean): string;
export function carveMediaDirective(source: string): string;
