import { None, Option, Ptr, Some } from 'rustable';
import { ComponentTicks, type Tick } from '../../change_detection/tick';
import { type ComponentInfo } from '../../component';
import { BlobArray, DataArray } from '../data_array';
import { type TableRow } from '../types';

/**
 * A type-erased contiguous container for data of a homogeneous type.
 *
 * Conceptually, a Column is very similar to a type-erased array.
 * It stores the change detection ticks for its components, kept in two separate
 * contiguous buffers internally. An element shares its data across these buffers by using the
 * same index.
 */
export class Column {
  private __data: BlobArray;
  private __addedTicks: DataArray<Tick>;
  private __changedTicks: DataArray<Tick>;
  private __changedBy: DataArray<string>;

  /**
   * Constructs a new Column, configured with a component's info.
   */
  constructor(componentInfo: ComponentInfo) {
    this.__data = new BlobArray(componentInfo.drop);
    this.__addedTicks = new DataArray();
    this.__changedTicks = new DataArray();
    this.__changedBy = new DataArray();
  }

  /**
   * Gets the current number of elements stored in the column.
   */
  len(): number {
    return this.__data.len;
  }

  /**
   * Checks if the column is empty
   */
  isEmpty(): boolean {
    return this.__data.isEmpty();
  }

  /**
   * Writes component data to the column at given row.
   * Assumes the slot is initialized and calls drop if needed.
   */
  replace(row: TableRow, data: any, changeTick: Tick, caller?: string): void {
    if (row >= this.len()) {
      throw new Error('Row index out of bounds');
    }
    this.__data.replace(row, data);
    this.__changedTicks.get(row).set(changeTick.get());
    if (this.__changedBy && caller) {
      this.__changedBy.getMut(row)[Ptr.ptr] = caller;
    }
  }

  /**
   * Removes an element from the Column.
   * This does not preserve ordering, but is O(1).
   * The element is replaced with the last element in the Column.
   */
  swapRemove(row: TableRow): void {
    if (row >= this.len()) {
      throw new Error('Row index out of bounds');
    }
    this.__data.swapRemoveAndDrop(row);
    this.__addedTicks.swapRemove(row);
    this.__changedTicks.swapRemove(row);
    if (this.__changedBy) {
      this.__changedBy.swapRemove(row);
    }
  }

  /**
   * Removes an element from the Column and returns it along with its change detection ticks.
   * This does not preserve ordering, but is O(1).
   */
  swapRemoveAndForget(row: TableRow): [any, ComponentTicks, string | undefined] {
    if (row >= this.len()) {
      throw new Error('Row index out of bounds');
    }
    const data = this.__data.swapRemove(row);
    const added = this.__addedTicks.swapRemove(row);
    const changed = this.__changedTicks.swapRemove(row);
    const caller = this.__changedBy ? this.__changedBy.swapRemove(row) : undefined;
    return [data, ComponentTicks.new(added, changed), caller];
  }

  /**
   * Pushes a new value onto the end of the Column.
   */
  push(data: any, ticks: ComponentTicks, caller?: string): void {
    this.__data.push(data);
    this.__addedTicks.push(ticks.added);
    this.__changedTicks.push(ticks.changed);
    if (this.__changedBy && caller) {
      this.__changedBy.push(caller);
    }
  }

  /**
   * Gets the data at the specified row
   */
  getData(row: TableRow): Option<any> {
    if (row < this.len()) {
      return Some(this.__data.get(row));
    }
    return None;
  }

  getDataUnchecked(row: TableRow): any {
    return this.__data.get(row);
  }

  /**
   * Gets a mutable reference to the data at the specified row
   */
  getDataMut(row: TableRow): Option<Ptr<any>> {
    if (row < this.len()) {
      return Some(this.__data.getMut(row));
    }
    return None;
  }

  /**
   * Gets a slice of the data
   */
  getDataSlice<T>(): T[] {
    return this.__data.asSlice<T>();
  }

  getAddedTicksSlice(): Tick[] {
    return this.__addedTicks.asSlice();
  }

  getChangedTicksSlice(): Tick[] {
    return this.__changedTicks.asSlice();
  }

  get(row: TableRow): Option<any> {
    if (row >= this.len()) return None;
    return Some([
      this.__data.get(row),
      ComponentTicks.new(this.__addedTicks.get(row), this.__changedTicks.get(row)),
    ]);
  }

  /**
   * Gets the "added" change detection tick for the value at row
   */
  getAddedTick(row: TableRow): Option<Tick> {
    if (row >= this.len()) return None;
    return Some(this.__addedTicks.get(row));
  }

  getAddedTickUnchecked(row: TableRow): Tick {
    return this.__addedTicks.get(row);
  }

  /**
   * Gets the "changed" change detection tick for the value at row
   */
  getChangedTick(row: TableRow): Option<Tick> {
    if (row >= this.len()) return None;
    return Some(this.__changedTicks.get(row));
  }

  getChangedTickUnchecked(row: TableRow): Tick {
    return this.__changedTicks.get(row);
  }

  /**
   * Gets the change detection ticks for the value at row
   */
  getTicks(row: TableRow): Option<ComponentTicks> {
    if (row >= this.len()) return None;
    return Some(ComponentTicks.new(this.__addedTicks.get(row), this.__changedTicks.get(row)));
  }

  getTicksUnchecked(row: TableRow): ComponentTicks {
    return ComponentTicks.new(this.__addedTicks.get(row), this.__changedTicks.get(row));
  }

  /**
   * Clears the column, removing all values
   */
  clear(): void {
    this.__data.clear();
    this.__addedTicks.clear();
    this.__changedTicks.clear();
    if (this.__changedBy) {
      this.__changedBy.clear();
    }
  }

  /**
   * Updates the change ticks
   */
  checkChangeTicks(changeTick: Tick): void {
    for (let componentTick of this.__addedTicks) {
      componentTick.checkTick(changeTick);
    }
    for (let componentTick of this.__changedTicks) {
      componentTick.checkTick(changeTick);
    }
  }

  /**
   * Gets the calling location that last changed the value at row
   */
  getChangedBy(row: TableRow): Option<string> {
    if (row >= this.len()) return None;
    return Some(this.__changedBy.get(row));
  }

  getChangedByUnchecked(row: TableRow): string {
    return this.__changedBy.get(row);
  }

  getChangedByMut(row: TableRow): Option<Ptr<string>> {
    if (row >= this.len()) return None;
    return Some(this.__changedBy.getMut(row));
  }
}
