export interface CarveEditorInputDetail {
  value: string;
}

export class CarveEditorElement extends HTMLElement {
  value: string;
  focus(options?: FocusOptions): void;
  addEventListener(
    type: 'input',
    listener: (this: CarveEditorElement, event: CustomEvent<CarveEditorInputDetail>) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: HTMLElement, event: HTMLElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
}

export function defineCarveEditor(
  tagName?: `${string}-${string}`,
): typeof CarveEditorElement;

declare global {
  interface HTMLElementTagNameMap {
    'carve-editor': CarveEditorElement;
  }
}
