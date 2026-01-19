/**
 * A fluent builder for constructing objects with optional properties.
 * Eliminates verbose conditional spread patterns.
 */
export interface OptionalBuilder<T extends object> {
  /**
   * Add properties when a condition is true.
   */
  when<K extends keyof T>(condition: boolean, props: Pick<Required<T>, K>): OptionalBuilder<T>;

  /**
   * Add a property if its value is defined (not undefined).
   */
  ifDefined<K extends keyof T>(key: K, value: T[K] | undefined): OptionalBuilder<T>;

  /**
   * Return the built object.
   */
  build(): T;
}

/**
 * Create a fluent builder for constructing objects with optional properties.
 *
 * @example
 * ```typescript
 * // Instead of:
 * const obj = {
 *   method,
 *   url,
 *   ...(body !== undefined && { body }),
 *   ...(timeout !== undefined && { timeout })
 * };
 *
 * // Use:
 * const obj = setOptional<Request>({ method, url })
 *   .ifDefined('body', body)
 *   .ifDefined('timeout', timeout)
 *   .build();
 * ```
 */
export function setOptional<T extends object>(base: T): OptionalBuilder<T> {
  let result = { ...base };

  const builder: OptionalBuilder<T> = {
    when(condition, props) {
      if (condition) {
        result = { ...result, ...props };
      }
      return builder;
    },

    ifDefined(key, value) {
      if (value !== undefined) {
        result = { ...result, [key]: value };
      }
      return builder;
    },

    build() {
      return result;
    }
  };

  return builder;
}
