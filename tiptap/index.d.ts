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
  urlPolicy?: CarveUrlPolicy;
  mapping?: CarveMapping;
}

/** Converts the content of the host node to tree children, or tree children to its content. */
export interface CarveMappingHelpers {
  /** Where the node stands. */
  position: 'block' | 'inline';
  blocks(content: unknown[]): unknown[];
  inlines(content: unknown[]): unknown[];
}

/**
 * A host node or mark saved as a Carve `span` (inline) or `div` (block) with one class; each listed attribute with a
 * value becomes a key/value pair (strings as they are, other values as JSON) and loads back as a string. Only a node
 * that is exactly that shape loads back as the host type.
 */
export interface CarveDeclaredMapping {
  as: 'span' | 'div';
  class: string;
  attributes?: readonly string[];
  /** A node with content (inlines in a span, blocks in a div); without it the node is an atom. Not for marks. */
  content?: boolean;
  /** The host node type has a `carve` attribute, so a top-level node keeps its place in the loaded source. */
  carve?: boolean;
}

/** A host node or mark converted by the host: `fromTree` returns `null` for a tree node that is not its own. */
export interface CarveCallbackMapping {
  /** The host node type has a `carve` attribute, so a top-level node keeps its place in the loaded source. */
  carve?: boolean;
  toTree?(pm: JSONContent, helpers: CarveMappingHelpers): CarveTreeNode;
  fromTree?(node: CarveTreeNode & Record<string, unknown>, helpers: CarveMappingHelpers): JSONContent | null;
}

/** The host's own ProseMirror nodes and marks by name. A mark maps to a `span` only; its children come from the text it covers. */
export interface CarveMapping {
  nodes?: Record<string, CarveDeclaredMapping | CarveCallbackMapping>;
  marks?: Record<string, (CarveDeclaredMapping & { as: 'span' }) | CarveCallbackMapping>;
}

/** The URL policy of the HTML renderer: a link or image destination it denies is `null` in the editor and kept in `carve`. */
export interface CarveUrlPolicy {
  deny?: readonly string[];
  allow?: readonly string[];
}

export interface CarveTreeLoadOptions {
  urlPolicy?: CarveUrlPolicy;
  mapping?: CarveMapping;
}

export interface CarveTreeSaveOptions {
  mapping?: CarveMapping;
}

export interface CarveSerializeOptions {
  engine: CarveWriter;
  mapping?: CarveMapping;
  /** The source the document was loaded from: returned unchanged when nothing was edited, kept per block otherwise. Needs `parse`. */
  source?: string;
  /** Passed to the engine's `parse()`. */
  parse?: object;
  /** Passed to the engine's `write()`. */
  write?: object;
}

export function treeToProseMirror(tree: CarveTreeNode, options?: CarveTreeLoadOptions): JSONContent;
export function proseMirrorToTree(doc: JSONContent, options?: CarveTreeSaveOptions): CarveTreeNode & Record<string, unknown>;
/** An attribute the save did not read: `path` is the JSON pointer of its node or mark in the saved document. */
export interface CarveIgnoredAttribute {
  path: string;
  type: string;
  attribute: string;
  value: unknown;
}
/**
 * The tree, for each top-level block the index of the loaded block it came from (`undefined` for a new one), the
 * ProseMirror JSON pointer each tree node came from by tree path, and the attributes the save did not read.
 */
export function proseMirrorToTreeWithOrigins(doc: JSONContent, options?: CarveTreeSaveOptions): {
  tree: CarveTreeNode & Record<string, unknown>;
  origins: (number | undefined)[];
  pointers: Record<string, string>;
  ignored: CarveIgnoredAttribute[];
};
/** The pointer of the tree node at `path` (a finding's `path`), or of its nearest ancestor that has one. */
export function proseMirrorPointer(pointers: Record<string, string>, path: string): string | null;
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
export const CarveSoftBreak: Node;
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
      setCarveContent: (content: JSONContent, options?: { emitUpdate?: boolean }) => ReturnType;
    };
  }
}
