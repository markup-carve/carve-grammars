import type { Extension, JSONContent, Mark, Node } from '@tiptap/core';

// The stock extensions the kit configures, so their commands (toggleBold, setLink, ...) are typed for hosts.
export type {} from '@tiptap/starter-kit';
export type {} from '@tiptap/extension-code-block';
export type {} from '@tiptap/extension-highlight';
export type {} from '@tiptap/extension-image';
export type {} from '@tiptap/extension-link';
export type {} from '@tiptap/extension-subscript';
export type {} from '@tiptap/extension-superscript';
export type {} from '@tiptap/extension-table';
export type {} from '@tiptap/extension-task-item';
export type {} from '@tiptap/extension-task-list';
export type {} from '@tiptap/extension-underline';
export type {} from '@tiptap/extension-bullet-list';
export type {} from '@tiptap/extension-ordered-list';

/** A node of the Carve 0.2 tree, as carve-js `parse` returns it. */
export interface CarveTreeNode {
  type: string;
}

/** The engine's `parse`. Pass the engine module: `import * as carve from '@markup-carve/carve'`. */
export interface CarveParser {
  parse(source: string, options?: object): CarveTreeNode;
}

/** The engine functions `serializeToCarve` calls; `parse` only with `source`. Without `treesEqual` the kit compares trees itself. */
export interface CarveWriter {
  write(tree: never, options?: object): string;
  parse?(source: string, options?: object): CarveTreeNode;
  treesEqual?(a: never, b: never): boolean;
  parseWithLayout?(source: string, options?: object): { document: CarveTreeNode; layout: object };
}

export interface CarveLoadOptions {
  engine: CarveParser;
  /** Passed to the engine's `parse()`. */
  parse?: object;
}

export interface CarveSerializeOptions {
  engine: CarveWriter;
  /** The source the document was loaded from: returned unchanged when nothing was edited, kept per block otherwise. Needs `parse`. */
  source?: string;
  /** Passed to the engine's `parse()`. */
  parse?: object;
  /** Passed to the engine's `write()`. */
  write?: object;
}

export function treeToProseMirror(tree: CarveTreeNode): JSONContent;
export function proseMirrorToTree(doc: JSONContent): CarveTreeNode & Record<string, unknown>;
export function carveToProseMirror(source: string, options: CarveLoadOptions): JSONContent;
/** Throws the engine's `CarveWriteError` when the writer cannot spell the edited tree. */
export function serializeToCarve(doc: JSONContent, options: CarveSerializeOptions): string;

export interface CarveKitOptions {
  starterKit: Record<string, unknown>;
  link: Record<string, unknown>;
  image: Record<string, unknown>;
  table: Record<string, unknown>;
  taskItem: Record<string, unknown>;
  codeBlock: Record<string, unknown>;
}

export const CarveKit: Extension<CarveKitOptions>;
export const CarveAttributes: Extension;
export const CARVE_NODES: Node[];
export const CARVE_MARKS: Mark[];

export const CarveAdmonition: Node;
export const CarveBlock: Node;
export const CarveBlockExtension: Node;
export const CarveCaption: Node;
export const CarveCaptioned: Node;
export const CarveCitationDefinition: Node;
export const CarveComment: Node;
export const CarveDefinitionDescription: Node;
export const CarveDefinitionList: Node;
export const CarveDefinitionTerm: Node;
export const CarveDirective: Node;
export const CarveDiv: Node;
export const CarveFigureGroup: Node;
export const CarveFootnote: Node;
export const CarveFootnoteRef: Node;
export const CarveFrontmatter: Node;
export const CarveInline: Node;
export const CarveLine: Node;
export const CarveLineBlock: Node;
export const CarveMath: Node;
export const CarveRawBlock: Node;
export const CarveSection: Node;
export const CarveTitle: Node;

export const CarveDelete: Mark;
export const CarveInlineExtension: Mark;
export const CarveInlineFootnote: Mark;
export const CarveInsert: Mark;
export const CarveSmallCaps: Mark;
export const CarveSpan: Mark;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    carveAttributes: {
      /** `setContent` that also sets the document's own fields, which `setContent` leaves on the old doc node. */
      setCarveContent: (content: JSONContent, options?: Record<string, unknown>) => ReturnType;
    };
  }
}
