import { None, Option, Ptr, Some } from 'rustable';

/**
 * DataArray<T> is a type-safe array implementation optimized for component storage.
 * It provides efficient memory management and type-safe operations with support for custom cleanup functions.
 *
 * Key features:
 * - Generic type support for type safety
 * - Optional element cleanup function
 * - Efficient swap-remove operations
 * - Flexible slice and clear operations
 *
 * @template T The type of elements stored in the array
 */
export class DataArray<T> {
  /** Internal array for data storage */
  private __values: T[];
  /** Optional cleanup function for elements */
  private __dropFn: Option<(data: T) => void>;

  /**
   * Creates a new DataArray instance
   * @param dropFn Optional cleanup function called when elements are removed
   */
  constructor(dropFn: Option<(data: T) => void> = None) {
    this.__values = [];
    this.__dropFn = dropFn;
  }

  get dropFn(): Option<(data: T) => void> {
    return this.__dropFn;
  }

  /**
   * Gets the number of elements in the array
   * @returns The length of the array
   */
  get len(): number {
    return this.__values.length;
  }

  /**
   * Checks if the array is empty
   * @returns true if the array contains no elements
   */
  isEmpty(): boolean {
    return this.len === 0;
  }

  /**
   * Gets the element at the specified index
   * @param index The index of the element to retrieve
   * @returns The element at the specified index
   */
  get(index: number): T {
    return this.__values[index];
  }

  /**
   * Gets a mutable reference to the element at the specified index
   * @param index The index of the element to retrieve
   * @returns A mutable reference to the element at the specified index
   */
  getMut(index: number): Ptr<T> {
    return Ptr({
      get: () => this.__values[index],
      set: (value) => (this.__values[index] = value),
    });
  }

  /**
   * Initializes an element at the specified index
   * @param row The index of the element to initialize
   * @param data The data to initialize the element with
   */
  initialize(row: number, data: any): void {
    this.__values[row] = data;
  }

  /**
   * Replaces an element at the specified index, calling dropFn on the old value if it exists
   * @param index The position to replace
   *param value The new value
   */
  replace(index: number, value: T): void {
    const oldValue = this.__values[index];
    if (this.__dropFn.isSome() && oldValue !== undefined) {
      const dropFn = this.__dropFn.unwrap();
      this.__dropFn = None;
      dropFn(oldValue);
      this.__dropFn = Some(dropFn);
    }
    this.__values[index] = value;
  }

  /**
   * Adds a new element to the end of the array
   * @param value The value to add
   */
  push(value: T): void {
    this.__values.push(value);
  }

  /**
   * Performs a swap-remove operation: swaps the element at the specified index with the last element,
   * then removes the last element. This is an O(1) removal operation that doesn't preserve element order.
   * @param index The index of the element to remove
   * @param lastElementIndex The index of the last element (defaults to array length - 1)
   * @returns The removed element
   */
  swapRemove(index: number, lastElementIndex = this.len - 1): T {
    const newLen = lastElementIndex;
    if (index !== lastElementIndex) {
      // Swap with last element if not removing the last element
      const temp = this.__values[index];
      this.__values[index] = this.__values[newLen];
      this.__values[newLen] = temp;
    }
    return this.__values.pop()!;
  }

  /**
   * Performs a swap-remove operation and calls dropFn on the removed element if it exists
   * @param index The index of the element to remove
   * @param lastElementIndex The index of the last element (defaults to array length - 1)
   */
  swapRemoveAndDrop(index: number, lastElementIndex = this.len - 1): void {
    const value = this.swapRemove(index, lastElementIndex);
    if (this.__dropFn.isSome() && value !== undefined) {
      const dropFn = this.__dropFn.unwrap();
      this.__dropFn = None;
      dropFn(value);
      this.__dropFn = Some(dropFn);
    }
  }

  /**
   * Removes and cleans up the last element
   * @param lastElementIndex The index of the last element (defaults to array length - 1)
   */
  dropLastElement(lastElementIndex = this.len - 1): void {
    const value = this.__values[lastElementIndex];
    if (this.__dropFn.isSome() && value !== undefined) {
      const dropFn = this.__dropFn.unwrap();
      this.__dropFn = None;
      dropFn(value);
      this.__dropFn = Some(dropFn);
    }
    this.__values[lastElementIndex] = undefined as any;
  }

  /**
   * Gets a slice of the array
   * @param len The length of the slice (defaults to entire array length)
   * @returns A new array containing the specified number of elements
   */
  asSlice(len = this.len): T[] {
    return this.__values.slice(0, len);
  }

  /**
   * Clears the array, calling dropFn on each element if it exists
   * @param len The length to clear up to (defaults to entire array length)
   */
  clear(len = this.len): void {
    if (this.__dropFn) {
      // Call dropFn before clearing
      for (let i = 0; i < len; i++) {
        const value = this.__values[i];
        if (this.__dropFn.isSome() && value !== undefined) {
          const dropFn = this.__dropFn.unwrap();
          this.__dropFn = None;
          dropFn(value);
          this.__dropFn = Some(dropFn);
        }
      }
    }
    // Clear elements up to the specified length
    if (len < this.len) {
      this.__values.fill(undefined as any, 0, len);
    } else {
      this.__values = [];
    }
  }

  /**
   * Makes DataArray iterable, allowing it to be used in for...of loops
   * @returns An iterator over the array elements
   *
   * @example
   * ```typescript
   * const array = new DataArray<number>();
   * array.push(1);
   * array.push(2);
   *
   * for (const value of array) {
   *   console.log(value); // Prints 1, then 2
   * }
   * ```
   */
  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this.len; i++) {
      yield this.__values[i];
    }
  }
}

/**
 * BlobArray is a type-erased version of DataArray, designed for scenarios where type information
 * is not known at compile time or when dealing with heterogeneous data.
 *
 * Key differences from DataArray:
 * - No generic type parameter
 * - Accepts any type of data
 * - Maintains compatibility with legacy code
 *
 * Use this class when:
 * - Working with dynamic or unknown types
 * - Migrating from older type-erased implementations
 * - Dealing with mixed-type storage requirements
 *
 * Note: Prefer DataArray<T> when possible for better type safety
 */
export class BlobArray extends DataArray<any> {
  /**
   * Creates a new BlobArray instance
   * @param dropFn Optional cleanup function called when elements are removed
   */
  constructor(dropFn: Option<(data: any) => void> = None) {
    super(dropFn);
  }

  /**
   * Gets the element at the specified index with type assertion
   * @param index The index of the element to retrieve
   * @returns The element at the specified index cast to type T
   */
  getAs<T>(index: number): T {
    return this.get(index) as T;
  }

  /**
   * Gets a slice of the array with type assertion
   * @param len The length of the slice (defaults to entire array length)
   * @returns A new array containing the specified number of elements cast to type T
   */
  asSlice<T = any>(len = this.len): T[] {
    return super.asSlice(len) as T[];
  }
}
