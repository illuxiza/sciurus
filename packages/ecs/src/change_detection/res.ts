import { derive, Location, Option, Ptr } from 'rustable';
import { DetectChanges, DetectChangesMut, proxyValue } from './detect_changes';
import { Tick, Ticks } from './tick';

export interface Res<T> extends DetectChangesMut<T>, DetectChanges<T> {}

/**
 * Unique mutable borrow of an entity's component or resource
 */
@derive([DetectChangesMut])
export class Res<T> {
  private __value: Ptr<T>;
  private __ticks: Ticks;
  private __changeBy: Ptr<string>;

  constructor(value: Ptr<T>, ticks: Ticks, changeBy: Ptr<string>) {
    this.__value = value;
    this.__ticks = ticks;
    this.__changeBy = changeBy;
  }

  static new<T>(
    value: Ptr<T>,
    added: Tick,
    lastChanged: Tick,
    lastRun: Tick,
    thisRun: Tick,
    changeBy?: string,
  ): Res<T>;
  static new<T>(value: Ptr<T>, ticks: Ticks, changeBy?: string): Res<T>;
  static new<T>(value: Ptr<T>, arg2: any, arg3?: any, arg4?: any, arg5?: any, arg6?: any) {
    if (arguments.length === 6) {
      const ticks = new Ticks(arg2, arg3, arg4, arg5);
      return proxyValue(new Res(value, ticks, arg6));
    } else {
      return proxyValue(new Res(value, arg2, arg3));
    }
  }

  get(): T {
    return this.__val__;
  }

  set(value: T) {
    this.__val__ = value;
  }

  protected get __val__(): T {
    return this.__value[Ptr.ptr];
  }

  get __ticks__(): Ticks {
    return this.__ticks;
  }

  protected set __val__(value: T) {
    this.setChanged();
    this.__changeBy__ = new Location().caller()!.name;
    this.__value[Ptr.ptr] = value;
  }

  protected get __changeBy__(): string {
    return this.__changeBy[Ptr.ptr];
  }

  protected set __changeBy__(value: string) {
    this.__changeBy[Ptr.ptr] = value;
  }

  filterMapUnchanged<U>(f: (value: Ptr<T>) => Option<Ptr<U>>): Option<Res<U>> {
    return f(this.__value).map((value) => {
      return Res.new(
        value,
        this.__ticks.added,
        this.__ticks.changed,
        this.__ticks.lastRun,
        this.__ticks.thisRun,
      );
    });
  }

  mapUnchanged<U>(f: (value: Ptr<T>) => Ptr<U>): Res<U> {
    return Res.new(
      f(this.__value),
      this.__ticks.added,
      this.__ticks.changed,
      this.__ticks.lastRun,
      this.__ticks.thisRun,
    );
  }
}
