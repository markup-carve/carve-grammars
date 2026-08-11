import { Editor, type JSONContent } from '@tiptap/core';
import {
  CarveKit,
  UnsupportedNodeError,
  astToProseMirror,
  carveToProseMirror,
  serializeToCarve,
} from '@markup-carve/carve-grammars/tiptap';

const loaded: JSONContent = carveToProseMirror('# Typed', {
  unsupported: 'preserve',
});
const fromAst: JSONContent = astToProseMirror({
  type: 'document',
  children: [],
});

const editor = new Editor({ extensions: [CarveKit], content: loaded });
const source: string = serializeToCarve(editor.getJSON());

void fromAst;
void source;

try {
  carveToProseMirror('---\nunsupported: true\n---');
} catch (error) {
  if (error instanceof UnsupportedNodeError) {
    const nodeType: string = error.nodeType;
    void nodeType;
  }
}
