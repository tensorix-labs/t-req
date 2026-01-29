/**
 * Button style utilities
 * Provides consistent button styling variants across the app
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const baseClasses =
  'inline-flex items-center justify-center font-medium rounded-treq transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'text-xs px-2.5 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2 gap-2',
  lg: 'text-base px-6 py-3 gap-2.5'
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-treq-accent text-white hover:bg-treq-accent-light focus:ring-treq-accent dark:focus:ring-offset-treq-dark-bg',
  secondary:
    'bg-treq-bg-card text-treq-text-strong border border-treq-border-light hover:bg-treq-border-light focus:ring-treq-accent dark:bg-treq-dark-bg-card dark:text-treq-dark-text-strong dark:border-treq-dark-border-light dark:hover:bg-treq-dark-border dark:focus:ring-offset-treq-dark-bg',
  ghost:
    'bg-transparent text-treq-text hover:bg-treq-border-light hover:text-treq-text-strong focus:ring-treq-accent dark:text-treq-dark-text dark:hover:bg-treq-dark-border-light dark:hover:text-treq-dark-text-strong dark:focus:ring-offset-treq-dark-bg',
  danger:
    'bg-http-delete text-white hover:bg-http-delete/90 focus:ring-http-delete dark:focus:ring-offset-treq-dark-bg'
};

/**
 * Get Tailwind classes for a button
 * @param variant - Button style variant
 * @param size - Button size
 */
export function getButtonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md'
): string {
  return `${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]}`;
}

/**
 * Get button variant classes only (without base and size)
 */
export function getButtonVariantClasses(variant: ButtonVariant): string {
  return variantClasses[variant];
}

/**
 * Button variants object for direct access
 */
export const buttonVariants = {
  primary: variantClasses.primary,
  secondary: variantClasses.secondary,
  ghost: variantClasses.ghost,
  danger: variantClasses.danger
} as const;
