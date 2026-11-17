import { useEffect, useRef } from "react";
import type { MouseEvent } from "react";

import { createOverlayDismissController } from "./overlayDismiss";
import type { OverlayDismissController } from "./overlayDismiss";

interface OverlayDismissHandlers<T extends HTMLElement> {
  onMouseDown: (event: MouseEvent<T>) => void;
  onMouseUp: (event: MouseEvent<T>) => void;
}

/** Spread onto a `.modal-overlay` element to close the modal on a click outside the dialog. */
export function useOverlayDismiss<T extends HTMLElement>(onDismiss: () => void): OverlayDismissHandlers<T> {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  // The controller lives across renders: a re-render between press and release must not
  // forget where the press started.
  const controllerRef = useRef<OverlayDismissController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createOverlayDismissController(() => dismissRef.current());
  }

  return {
    onMouseDown: controllerRef.current.handlePressStart,
    onMouseUp: controllerRef.current.handlePressEnd,
  };
}
