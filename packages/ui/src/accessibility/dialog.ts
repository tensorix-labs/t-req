export type SetupDialogFocusTrapOptions = {
  onRequestClose?: () => void;
  lockBodyScroll?: boolean;
  restoreFocusOnClose?: boolean;
  initialFocus?: HTMLElement | null;
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

function getActiveElement(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return nodes.filter((node) => !node.hasAttribute('disabled') && node.tabIndex !== -1);
}

export function setupDialogFocusTrap(
  dialogElement: HTMLElement,
  options: SetupDialogFocusTrapOptions = {}
): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const {
    onRequestClose,
    lockBodyScroll = true,
    restoreFocusOnClose = true,
    initialFocus
  } = options;

  const previousOverflow = document.body.style.overflow;
  const previouslyFocusedElement = getActiveElement();

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onRequestClose?.();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getFocusableElements(dialogElement);
    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogElement.focus();
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    if (!first || !last) {
      event.preventDefault();
      dialogElement.focus();
      return;
    }
    const activeElement = getActiveElement();
    const isInsideDialog = activeElement ? dialogElement.contains(activeElement) : false;

    if (event.shiftKey) {
      if (!isInsideDialog || activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (!isInsideDialog || activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (lockBodyScroll) {
    document.body.style.overflow = 'hidden';
  }
  window.addEventListener('keydown', onKeyDown);

  queueMicrotask(() => {
    const target = initialFocus?.isConnected ? initialFocus : undefined;
    const fallback = getFocusableElements(dialogElement)[0] ?? dialogElement;
    (target ?? fallback).focus();
  });

  return () => {
    window.removeEventListener('keydown', onKeyDown);

    if (lockBodyScroll) {
      document.body.style.overflow = previousOverflow;
    }

    if (restoreFocusOnClose && previouslyFocusedElement?.isConnected) {
      previouslyFocusedElement.focus();
    }
  };
}
