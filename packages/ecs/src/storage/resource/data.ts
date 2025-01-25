import { None, Option, Ptr, Some } from 'rustable';
import { ArchetypeComponentId } from '../../archetype/types';
import { MutUntyped } from '../../change_detection/mut';
import { ComponentTicks, Tick, Ticks } from '../../change_detection/tick';
import { BlobArray } from '../data_array';
import { getCaller } from '@sciurus/utils';

export class ResourceData {
  private __data: BlobArray;
  private __addedTicks: Tick;
  private __changedTicks: Tick;
  private __typeName: string;
  private __id: ArchetypeComponentId;
  private __changedBy: string;
  constructor(
    data: BlobArray,
    addedTicks: Tick,
    changedTicks: Tick,
    typeName: string,
    id: ArchetypeComponentId,
    caller = 'unknown',
  ) {
    this.__data = data;
    this.__addedTicks = addedTicks;
    this.__changedTicks = changedTicks;
    this.__typeName = typeName;
    this.__id = id;
    this.__changedBy = caller;
  }

  isPresent(): boolean {
    return !this.__data.isEmpty();
  }

  get id(): ArchetypeComponentId {
    return this.__id;
  }

  getData(): Option<any> {
    if (this.isPresent()) {
      return Some(this.__data.get(0));
    }
    return None;
  }

  getTicks(): Option<ComponentTicks> {
    if (this.isPresent()) {
      return Some(new ComponentTicks(this.__addedTicks, this.__changedTicks));
    }
    return None;
  }

  getWithTicks(): Option<[any, ComponentTicks, Ptr<string>]> {
    if (this.isPresent()) {
      return Some([
        this.__data.getMut(0),
        new ComponentTicks(this.__addedTicks, this.__changedTicks),
        Ptr({
          get: () => this.__changedBy,
          set: (value) => (this.__changedBy = value),
        }),
      ]);
    }
    return None;
  }

  getMut(lastRun: Tick, thisRun: Tick): Option<MutUntyped> {
    const result = this.getWithTicks();
    if (result.isSome()) {
      const [ptr, ticks, caller] = result.unwrap();
      return Some(new MutUntyped(ptr, Ticks.fromTickCells(ticks, lastRun, thisRun), caller));
    }
    return None;
  }

  insert(value: any, changeTick: Tick, caller?: string): void {
    if (this.isPresent()) {
      this.__data.replace(0, value);
    } else {
      this.__data.push(value);
      this.__addedTicks.set(changeTick.get());
    }
    this.__changedTicks.set(changeTick.get());
    this.__changedBy = caller ?? getCaller();
  }

  insertWithTicks(value: any, changeTicks: ComponentTicks, caller?: string): void {
    if (this.isPresent()) {
      this.__data.replace(0, value);
    } else {
      this.__data.push(value);
    }
    this.__addedTicks.set(changeTicks.added.get());
    this.__changedTicks.set(changeTicks.changed.get());
    this.__changedBy = caller ?? getCaller();
  }

  remove(): Option<[any, ComponentTicks, Ptr<string>]> {
    if (!this.isPresent()) {
      return None;
    }
    const res = this.__data.swapRemove(0);
    return Some([
      res,
      new ComponentTicks(this.__addedTicks, this.__changedTicks),
      Ptr({
        get: () => this.__changedBy,
        set: (value) => (this.__changedBy = value),
      }),
    ]);
  }

  removeAndDrop(): void {
    if (this.isPresent()) {
      this.__data.clear();
    }
  }

  checkChangeTicks(changeTick: Tick): void {
    this.__addedTicks.checkTick(changeTick);
    this.__changedTicks.checkTick(changeTick);
  }
}
