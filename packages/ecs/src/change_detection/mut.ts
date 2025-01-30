import { derive, From, Into, Location, Option, Ptr } from 'rustable';
import { DetectChanges, DetectChangesMut, proxyValue } from './detect_changes';
import { Ref } from './ref';
import { Tick, Ticks } from './tick';

interface MutValue<T> extends DetectChangesMut<T>, DetectChanges<T> {}

/**
 * Unique mutable borrow of an entity's component or resource
 */
@derive([DetectChangesMut])
class MutValue<T> {
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
    changeBy: Ptr<string>,
  ): MutValue<T>;
  static new<T>(value: Ptr<T>, ticks: Ticks, changeBy: Ptr<string>): MutValue<T>;
  static new<T>(value: Ptr<T>, arg2: any, arg3?: any, arg4?: any, arg5?: any, arg6?: any) {
    if (arguments.length === 6) {
      const ticks = new Ticks(arg2, arg3, arg4, arg5);
      return proxyValue(new MutValue(value, ticks, arg6));
    } else {
      return proxyValue(new MutValue(value, arg2, arg3));
    }
  }

  get() {
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

  /**
   * Convert to a Ref, losing mutable access
   */
  asRef(): Ref<T> {
    return Ref.new(
      this.__value[Ptr.ptr],
      this.__ticks.added,
      this.__ticks.changed,
      this.__ticks.lastRun,
      this.__ticks.thisRun,
      this.__changeBy[Ptr.ptr],
    );
  }

  reborrow(): MutValue<T> {
    return MutValue.new(
      this.__value,
      this.__ticks.added,
      this.__ticks.changed,
      this.__ticks.lastRun,
      this.__ticks.thisRun,
      this.__changeBy,
    );
  }

  filterMapUnchanged<U>(f: (value: Ptr<T>) => Option<Ptr<U>>): Option<MutValue<U>> {
    return f(this.__value).map((value) => {
      return MutValue.new(
        value,
        this.__ticks.added,
        this.__ticks.changed,
        this.__ticks.lastRun,
        this.__ticks.thisRun,
        this.__changeBy,
      );
    });
  }

  mapUnchanged<U>(f: (value: Ptr<T>) => Ptr<U>): MutValue<U> {
    return MutValue.new(
      f(this.__value),
      this.__ticks.added,
      this.__ticks.changed,
      this.__ticks.lastRun,
      this.__ticks.thisRun,
      this.__changeBy,
    );
  }
}

export interface MutUntyped extends DetectChangesMut<unknown>, DetectChanges<unknown> {}

/**
 * Unique mutable borrow of resources or an entity's component.
 * Similar to Ptr, but not generic over the component type
 */
@derive([DetectChangesMut])
export class MutUntyped {
  private __value: Ptr<unknown>;
  private __ticks: Ticks;
  private __changeBy: Ptr<string>;

  constructor(value: Ptr<unknown>, ticks: Ticks, changeBy: Ptr<string>) {
    this.__value = value;
    this.__ticks = ticks;
    this.__changeBy = changeBy;
  }

  static new(
    value: Ptr<unknown>,
    added: Tick,
    lastChanged: Tick,
    lastRun: Tick,
    thisRun: Tick,
    changeBy: Ptr<string>,
  ): MutUntyped;
  static new(value: Ptr<unknown>, ticks: Ticks, changeBy: Ptr<string>): MutUntyped;
  static new(value: Ptr<unknown>, arg2: any, arg3?: any, arg4?: any, arg5?: any, arg6?: any) {
    if (arguments.length === 6) {
      const ticks = new Ticks(arg2, arg3, arg4, arg5);
      return new MutUntyped(value, ticks, arg6);
    } else {
      return new MutUntyped(value, arg2, arg3);
    }
  }

  get __ticks__(): Ticks {
    return this.__ticks;
  }

  protected get __val__(): unknown {
    return this.__value[Ptr.ptr];
  }

  protected set __val__(value: unknown) {
    this.setChanged();
    this.__changeBy[Ptr.ptr] = new Location().caller()!.name;
    this.__value[Ptr.ptr] = value;
  }

  protected get __changeBy__(): string {
    return this.__changeBy[Ptr.ptr];
  }

  protected set __changeBy__(value: string) {
    this.__changeBy[Ptr.ptr] = value;
  }

  /**
   * Returns a MutUntyped with a smaller lifetime
   */
  reborrow(): MutUntyped {
    return MutUntyped.new(this.__value, this.__ticks, this.__changeBy);
  }

  /**
   * Check if the value has changed since a given tick
   */
  hasChangedSince(tick: Tick): boolean {
    return this.__ticks.changed.isNewerThan(tick, this.__ticks.thisRun);
  }

  /**
   * Turn this MutUntyped into a Ptr by mapping the inner pointer to another value,
   * without flagging a change
   */
  mapUnchanged<T>(f: (ptr: Ptr<unknown>) => Ptr<T>): MutValue<T> {
    return MutValue.new(
      f(this.__value),
      this.__ticks.added,
      this.__ticks.changed,
      this.__ticks.lastRun,
      this.__ticks.thisRun,
      this.__changeBy,
    );
  }

  /**
   * Transforms this MutUntyped into a Ptr<T> with the same lifetime
   */
  withType<T>(): Mut<T> {
    return MutValue.new(
      this.__value as Ptr<T>,
      this.__ticks.added,
      this.__ticks.changed,
      this.__ticks.lastRun,
      this.__ticks.thisRun,
      this.__changeBy,
    ) as Mut<T>;
  }
}

From(MutValue).implInto(MutUntyped, {
  from(source: MutValue<any>): MutUntyped {
    return MutUntyped.new(
      source['__value'],
      source['__ticks'].added,
      source['__ticks'].changed,
      source['__ticks'].lastRun,
      source['__ticks'].thisRun,
      source['__changeBy'],
    );
  },
});

interface MutValue<T> extends Into<MutValue<T>> {}

export const Mut = MutValue;

export type Mut<T> = MutValue<T> & T;
