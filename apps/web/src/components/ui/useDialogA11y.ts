import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = 'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';

/**
 * Shared accessibility wiring for hand-rolled slide-over sheets that are
 * exposed as modal dialogs: Escape-to-close, initial focus, and a Tab focus
 * trap contained inside the sheet. Pass `active=false` when the sheet is
 * hidden so the listener is not left attached to a detached node.
 */
export function useDialogA11y<T extends HTMLElement>(active: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
      );

    focusables()[0]?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const activeElement = document.activeElement;
      if (event.shiftKey) {
        if (activeElement === first || !node.contains(activeElement)) {
          last.focus();
          event.preventDefault();
        }
      } else if (activeElement === last || !node.contains(activeElement)) {
        first.focus();
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [active, onClose]);

  return ref;
}
