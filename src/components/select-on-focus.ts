import type { FocusEvent, PointerEvent, MouseEvent } from "react";

const entering = new WeakSet<HTMLInputElement>();

function select(input: HTMLInputElement) {
  // :disabled includes inputs inside a disabled fieldset. select() also works
  // for number inputs, whose selectionStart/setSelectionRange are unsupported.
  if (!input.readOnly && !input.matches(":disabled")) input.select();
}

/** Opt in only editable numeric and short text inputs; never changes their value. */
export const selectOnFocus = {
  onPointerDown(event: PointerEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (event.button === 0 && input.ownerDocument.activeElement !== input) entering.add(input);
    else {
      entering.delete(input);
      // Mobile Chrome otherwise treats a tap inside selected text as a request
      // for selection handles. Release the selection before native caret placement.
      if (event.pointerType === "touch" && input.ownerDocument.activeElement === input) {
        const selection = input.ownerDocument.getSelection();
        if (selection?.rangeCount) selection.collapseToEnd();
      }
    }
  },
  onFocus(event: FocusEvent<HTMLInputElement>) {
    select(event.currentTarget);
  },
  onClick(event: MouseEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    // The first pointer click can collapse the selection after focus. Restore
    // it only for that click; clicks on an already focused input place a caret.
    if (entering.delete(input)) select(input);
  },
  onBlur(event: FocusEvent<HTMLInputElement>) {
    entering.delete(event.currentTarget);
  },
  onPointerCancel(event: PointerEvent<HTMLInputElement>) {
    entering.delete(event.currentTarget);
  },
};
