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

    const isDisplayed = style.display !== 'none';
    if (!isDisplayed) return false;

    const isVisible = style.visibility !== 'hidden';
    if (!isVisible) return false;

    const hasOpacity = parseFloat(style.opacity) > 0;
    return hasOpacity;
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
