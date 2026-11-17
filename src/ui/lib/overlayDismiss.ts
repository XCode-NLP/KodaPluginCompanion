interface OverlayPointerEvent {
  button: number;
  target: EventTarget | null;
  currentTarget: EventTarget | null;
}

export interface OverlayDismissController {
  handlePressStart: (event: OverlayPointerEvent) => void;
  handlePressEnd: (event: OverlayPointerEvent) => void;
}

function isOverlayPress(event: OverlayPointerEvent): boolean {
  return event.button === 0 && event.target === event.currentTarget;
}

/**
 * Dismisses a modal only when a left-button press both starts and ends on the overlay itself.
 * A selection dragged out of the dialog releases over the overlay — the pointer is clamped onto
 * it even when the mouse leaves the window — and a plain click handler reads that as a dismiss,
 * closing the dialog and dropping the draft.
 */
export function createOverlayDismissController(onDismiss: () => void): OverlayDismissController {
  let pressStartedOnOverlay = false;

  return {
    handlePressStart(event) {
      pressStartedOnOverlay = isOverlayPress(event);
    },
    handlePressEnd(event) {
      const startedOnOverlay = pressStartedOnOverlay;
      pressStartedOnOverlay = false;
      if (startedOnOverlay && isOverlayPress(event)) onDismiss();
    },
  };
}
