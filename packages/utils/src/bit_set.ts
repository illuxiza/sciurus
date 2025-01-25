/**
 * A fixed-size bit set.
 */
export class FixedBitSet {
  private bits: Uint32Array;
  private numBits: number;

  constructor(numBits: number = 0) {
    this.numBits = numBits;
    this.bits = new Uint32Array(Math.ceil(numBits / 32));
  }

  /**
   * Gets a bit from the set.
   */
  get(index: number): boolean {
    return this.contains(index);
  }

  /**
   * Sets a bit in the set to true.
   * @param index The index of the bit to set
   * @returns true if the bit was previously unset, false otherwise
   * @throws Error if index exceeds the bit set size
   */
  put(index: number): boolean {
    if (index >= this.numBits) {
      throw new Error(`put at index ${index} exceeds fixedbitset size ${this.numBits}`);
    }
    // The above check ensures that the block is inside the array's allocation.
    const wordIndex = Math.floor(index / 32);
    const bitIndex = index % 32;
    const word = this.bits[wordIndex];
    const prev = (word & (1 << bitIndex)) !== 0;
    this.bits[wordIndex] = word | (1 << bitIndex);
    return prev;
  }

  /**
   * Toggles a bit in the set.
   * @param index The index of the bit to toggle
   * @throws Error if index exceeds the bit set size
   */
  toggle(index: number): void {
    if (index >= this.numBits) {
      throw new Error(`toggle at index ${index} exceeds fixedbitset size ${this.numBits}`);
    }
    // The above check ensures that the block is inside the array's allocation.
    const wordIndex = Math.floor(index / 32);
    const bitIndex = index % 32;
    this.bits[wordIndex] ^= 1 << bitIndex;
  }

  /**
   * Sets a bit in the set.
   */
  /**
   * Sets a bit in the set to the provided value.
   * @throws Error if index exceeds the bit set size
   */
  set(index: number, enabled: boolean = true): void {
    if (index >= this.numBits) {
      throw new Error(`set at index ${index} exceeds fixedbitset size ${this.numBits}`);
    }
    // The above check ensures that the block is inside the array's allocation.
    const wordIndex = Math.floor(index / 32);
    const bitIndex = index % 32;
    if (enabled) {
      this.bits[wordIndex] |= 1 << bitIndex;
    } else {
      this.bits[wordIndex] &= ~(1 << bitIndex);
    }
  }

  /**
   * Adds a bit to the set.
   * @throws Error if index exceeds the bit set size
   */
  insert(index: number): void {
    if (index >= this.numBits) {
      throw new Error(`insert at index ${index} exceeds fixedbitset size ${this.numBits}`);
    }
    const wordIndex = Math.floor(index / 32);
    const bitIndex = index % 32;
    this.bits[wordIndex] |= 1 << bitIndex;
  }

  /**
   * Adds a bit to the set.
   */
  growAndInsert(index: number): void {
    if (index >= this.numBits) {
      this.grow(index + 1);
    }
    const wordIndex = Math.floor(index / 32);
    const bitIndex = index % 32;
    this.bits[wordIndex] |= 1 << bitIndex;
  }

  /**
   * Removes a bit from the set.
   */
  remove(index: number): void {
    if (index >= this.numBits) return;
    const wordIndex = Math.floor(index / 32);
    const bitIndex = index % 32;
    this.bits[wordIndex] &= ~(1 << bitIndex);
  }

  /**
   * Returns true if the bit is set.
   */
  contains(index: number): boolean {
    if (index >= this.numBits) return false;
    const wordIndex = Math.floor(index / 32);
    const bitIndex = index % 32;
    return (this.bits[wordIndex] & (1 << bitIndex)) !== 0;
  }

  /**
   * Returns true if the bit is set.
   */
  has(index: number): boolean {
    return this.contains(index);
  }

  /**
   * Adds a bit to the set.
   */
  add(index: number): void {
    this.insert(index);
  }

  /**
   * Clears all bits.
   */
  clear(): void {
    this.bits.fill(0);
  }

  /**
   * Returns true if this set intersects with other.
   */
  intersects(other: FixedBitSet): boolean {
    const minLength = Math.min(this.len(), other.len());
    for (let i = 0; i < minLength; i++) {
      if ((this.bits[i] & other.bits[i]) !== 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns true if this set is disjoint from other.
   */
  isDisjoint(other: FixedBitSet): boolean {
    return !this.intersects(other);
  }

  /**
   * Returns true if this set is a subset of other.
   */
  isSubset(other: FixedBitSet): boolean {
    if (this.numBits > other.numBits) return false;
    for (let i = 0; i < this.bits.length; i++) {
      if ((this.bits[i] & other.bits[i]) !== this.bits[i]) {
        return false;
      }
    }
    return true;
  }

  isEmpty(): boolean {
    return this.numBits === 0;
  }

  /**
   * Returns true if this set is empty.
   */
  isClear(): boolean {
    return this.bits.every((word) => word === 0);
  }

  /**
   * Returns the number of bits in the set.
   */
  len(): number {
    return this.numBits;
  }

  /**
   * Grows the set to accommodate more bits.
   */
  grow(newSize: number): void {
    if (newSize <= this.numBits) return;
    const newArray = new Uint32Array(Math.ceil(newSize / 32));
    newArray.set(this.bits);
    this.bits = newArray;
    this.numBits = newSize;
  }

  /**
   * Toggles the bits in the range [start, end).
   */
  toggleRange(start: number, end: number): void {
    for (let i = start; i < end; i++) {
      const wordIndex = Math.floor(i / 32);
      const bitIndex = i % 32;
      this.bits[wordIndex] ^= 1 << bitIndex;
    }
  }

  /**
   * Unions this set with other.
   */
  unionWith(other: FixedBitSet): void {
    const maxLength = Math.max(this.len(), other.len());
    if (maxLength > this.len()) {
      this.grow(maxLength);
    }
    for (let i = 0; i < other.len(); i++) {
      this.bits[i] |= other.bits[i];
    }
  }

  /**
   * Intersects this set with other.
   */
  intersectWith(other: FixedBitSet): void {
    for (let i = 0; i < this.len(); i++) {
      if (i < other.len()) {
        this.bits[i] &= other.bits[i];
      } else {
        this.bits[i] = 0;
      }
    }
  }

  /**
   * Subtracts other set from this set.
   */
  differenceWith(other: FixedBitSet): void {
    const minLength = Math.min(this.len(), other.len());
    for (let i = 0; i < minLength; i++) {
      this.bits[i] &= ~other.bits[i];
    }
  }

  /**
   * Returns a new set with the intersection of this set and other.
   */
  intersection(other: FixedBitSet): FixedBitSet {
    const result = this.clone();
    result.intersectWith(other);
    const ret = new FixedBitSet();
    ret.extend(result.ones());
    return ret;
  }

  /**
   * Returns a new set with the difference of this set and other.
   */
  difference(other: FixedBitSet): FixedBitSet {
    const result = this.clone();
    result.differenceWith(other);
    return result;
  }

  /**
   * Returns a new set with the union of this set and other.
   */
  union(other: FixedBitSet): FixedBitSet {
    const result = this.clone();
    result.unionWith(other);
    return result;
  }

  /**
   * Returns an iterator over the set bits.
   */
  *ones(): Iterable<number> {
    for (let wordIndex = 0; wordIndex < this.bits.length; wordIndex++) {
      const word = this.bits[wordIndex];
      if (word === 0) continue;

      for (let bitIndex = 0; bitIndex < 32; bitIndex++) {
        if ((word & (1 << bitIndex)) !== 0) {
          const index = wordIndex * 32 + bitIndex;
          if (index < this.numBits) {
            yield index;
          }
        }
      }
    }
  }

  /**
   * Extends the set to include the bits in src.
   */
  extend(src: Iterable<number>): void {
    for (const i of src) {
      if (i >= this.len()) {
        this.grow(i + 1);
      }
      this.put(i);
    }
  }

  /**
   * Returns a clone of this set.
   */
  clone(): FixedBitSet {
    const newSet = new FixedBitSet(this.numBits);
    newSet.bits = new Uint32Array(this.bits);
    return newSet;
  }

  eq(other: FixedBitSet): boolean {
    return this.bits.every((word, i) => word === other.bits[i]);
  }
}
