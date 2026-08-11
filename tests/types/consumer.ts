import { Editor, type JSONContent } from '@tiptap/core';
import {
  CarveKit,
  UnsupportedNodeError,
  astToProseMirror,
  carveToProseMirror,
  serializeToCarve,
} from '@markup-carve/carve-grammars/tiptap';
import {
  CarveEditorElement,
  defineCarveEditor,
} from '@markup-carve/carve-grammars/editor';

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

defineCarveEditor();
const customEditor: CarveEditorElement = document.createElement('carve-editor');
customEditor.value = '# Typed custom element';
customEditor.addEventListener('input', event => {
  const changed: string = event.detail.value;
  void changed;
});
const EditorElement = defineCarveEditor('typed-carve-editor');
const constructed: CarveEditorElement = new EditorElement();
void constructed;

try {
  carveToProseMirror('---\nunsupported: true\n---');
} catch (error) {
  if (error instanceof UnsupportedNodeError) {
    const nodeType: string = error.nodeType;
    void nodeType;
  }
}
