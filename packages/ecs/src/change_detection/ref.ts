import { derive } from 'rustable';
import { DetectChanges } from './detect_changes';
import { Tick, Ticks } from './tick';

export interface Ref<T> extends DetectChanges<T> {}
/**
 * Shared borrow of an entity's component with access to change detection.
 */
@derive(DetectChanges)
export class Ref<T> {
  protected __val__: T;
  __ticks__: Ticks;
  protected __changeBy__: string;

  constructor(value: T, ticks: Ticks, changeBy: string) {
    this.__val__ = value;
    this.__ticks__ = ticks;
    this.__changeBy__ = changeBy;
  }

  static new<T>(
    value: T,
    added: Tick,
    lastChanged: Tick,
    lastRun: Tick,
    thisRun: Tick,
    changeBy: string,
  ): Ref<T>;
  static new<T>(value: T, ticks: Ticks, changeBy: string): Ref<T>;
  static new<T>(value: T, arg2: any, arg3?: any, arg4?: any, arg5?: any, arg6?: any) {
    if (arguments.length === 6) {
      const ticks = new Ticks(arg2, arg3, arg4, arg5);
      return new Ref(value, ticks, arg6);
    } else {
      return new Ref(value, arg2, arg3);
    }
  }

  get(): T {
    return this.__val__;
  }

  /**
   * Map Ref to a different type using f
   */
  map<U>(f: (value: T) => U): Ref<U> {
    return new Ref<U>(f(this.__val__), this.__ticks__, this.__changeBy__);
  }
}
