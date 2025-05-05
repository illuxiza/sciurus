// Store executed functions globally
const executedFunctions = new WeakMap<Function, boolean>();

/**
 * Creates a function that is restricted to be called only once globally.
 * If the same function is passed to once multiple times, it will only be executed once.
 *
 * @param fn - The function to restrict to a single global execution
 * @returns A new function that will only be executed once globally
 */
export function once<T extends (...args: any[]) => any>(fn: T): T {
  // Using function instead of arrow function to preserve the 'this' context
  return function (this: any, ...args: Parameters<T>): ReturnType<T> {
    if (!executedFunctions.has(fn)) {
      executedFunctions.set(fn, true);
      return fn.apply(this, args);
    }
    // Return undefined as the default value
    // Note: This means the return type isn't strictly accurate for non-void functions
    // that are called after the first time
    return undefined as unknown as ReturnType<T>;
  } as T;
}
