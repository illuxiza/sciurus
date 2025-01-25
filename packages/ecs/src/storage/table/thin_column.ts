import { Ptr } from 'rustable';
import { Tick } from '../../change_detection/tick';
import { ComponentInfo } from '../../component/info';
import { BlobArray, DataArray } from '../data_array';
import { type TableRow } from '../types';

/**
 * Very similar to a normal Column, but with the capacities and lengths cut out for performance reasons.
 *
 * This type is used by Table, because all of the capacities and lengths of the Table's columns must match.
 */
export class ThinColumn {
  data: BlobArray;
  addedTicks: DataArray<Tick>;
  changedTicks: DataArray<Tick>;
  changedBy: DataArray<string>;

  /**
   * Create a new ThinColumn.
   */
  constructor(componentInfo: ComponentInfo) {
    this.data = new BlobArray(componentInfo.drop);
    this.addedTicks = new DataArray<Tick>();
    this.changedTicks = new DataArray<Tick>();
    this.changedBy = new DataArray<string>();
  }

  /**
   * Swap-remove and drop the removed element.
   */
  swapRemoveAndDrop(lastElementIndex: number, row: TableRow): void {
    this.data.swapRemoveAndDrop(row, lastElementIndex);
    this.addedTicks.swapRemoveAndDrop(row, lastElementIndex);
    this.changedTicks.swapRemoveAndDrop(row, lastElementIndex);
    if (this.changedBy) {
      this.changedBy.swapRemoveAndDrop(row, lastElementIndex);
    }
  }

  /**
   * Swap-remove and forget the removed element.
   */
  swapRemove(lastElementIndex: number, row: TableRow): void {
    this.data.swapRemove(row, lastElementIndex);
    this.addedTicks.swapRemove(row, lastElementIndex);
    this.changedTicks.swapRemove(row, lastElementIndex);
    if (this.changedBy) {
      this.changedBy.swapRemove(row, lastElementIndex);
    }
  }

  initialize(row: TableRow, data: any, tick: Tick, caller?: string): void {
    this.data.initialize(row, data);
    this.addedTicks.get(row).set(tick.get());
    this.changedTicks.get(row).set(tick.get());
    if (this.changedBy && caller) {
      this.changedBy.getMut(row)[Ptr.ptr] = caller;
    }
  }

  /**
   * Replace component data at the given row
   */
  replace(row: TableRow, data: any, changeTick: Tick, caller?: string): void {
    this.data.replace(row, data);
    this.changedTicks.get(row).set(changeTick.get());
    if (this.changedBy && caller) {
      this.changedBy.getMut(row)[Ptr.ptr] = caller;
    }
  }

  /**
   * Initialize from another ThinColumn
   */
  initializeFrom(
    other: ThinColumn,
    otherLastElementIndex: number,
    srcRow: TableRow,
    dstRow: TableRow,
  ): void {
    // Init the data
    const srcVal = other.data.swapRemove(srcRow, otherLastElementIndex);
    this.data.getMut(dstRow)[Ptr.ptr] = srcVal;

    // Init added_ticks
    const addedTick = other.addedTicks.swapRemove(srcRow, otherLastElementIndex);
    this.addedTicks.getMut(dstRow)[Ptr.ptr] = addedTick;

    // Init changed_ticks
    const changedTick = other.changedTicks.swapRemove(srcRow, otherLastElementIndex);
    this.changedTicks.getMut(dstRow)[Ptr.ptr] = changedTick;

    if (this.changedBy && other.changedBy) {
      const changedBy = other.changedBy.swapRemove(srcRow, otherLastElementIndex);
      this.changedBy.getMut(dstRow)[Ptr.ptr] = changedBy;
    }
  }

  /**
   * Check change ticks for all elements in the column
   */
  checkChangeTicks(len: number, changeTick: Tick): void {
    for (let i = 0; i < len; i++) {
      this.addedTicks.get(i).checkTick(changeTick);
      this.changedTicks.get(i).checkTick(changeTick);
    }
  }

  /**
   * Clear all components from this column
   */
  clear(len: number): void {
    this.addedTicks.clear(len);
    this.changedTicks.clear(len);
    this.data.clear(len);
    if (this.changedBy) {
      this.changedBy.clear(len);
    }
  }

  /**
   * Drop the last component in this column
   */
  dropLastComponent(lastElementIndex: number): void {
    this.addedTicks.dropLastElement(lastElementIndex);
    this.changedTicks.dropLastElement(lastElementIndex);
    if (this.changedBy) {
      this.changedBy.dropLastElement(lastElementIndex);
    }
    this.data.dropLastElement(lastElementIndex);
  }

  /**
   * Get data slice
   */
  getDataSlice<T>(len: number): T[] {
    return this.data.asSlice<T>(len);
  }

  /**
   * Get added ticks slice
   */
  getAddedTicksSlice(len: number): Tick[] {
    return this.addedTicks.asSlice(len);
  }

  /**
   * Get changed ticks slice
   */
  getChangedTicksSlice(len: number): Tick[] {
    return this.changedTicks.asSlice(len);
  }

  /**
   * Get changed by slice
   */
  getChangedBySlice(len: number): string[] | null {
    return this.changedBy?.asSlice(len) ?? null;
  }
}
