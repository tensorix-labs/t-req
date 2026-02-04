/**
 * Gets all keyboard-focusable elements within a container
 * Filters out hidden and disabled elements
 */
export function getKeyboardFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"]):not([disabled])'
  ].join(', ');

  const elements = Array.from(container.querySelectorAll<HTMLElement>(selector));

  return elements.filter((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  });
}

export function findFirstFocusableElement(container: HTMLElement): HTMLElement | null {
  const focusable = getKeyboardFocusableElements(container);
  return focusable[0] ?? null;
}

export function isFocusable(element: Element): boolean {
  const focusableElements = getKeyboardFocusableElements(element.parentElement ?? document.body);
  return focusableElements.includes(element as HTMLElement);
}
