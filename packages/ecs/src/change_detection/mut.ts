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
  private _val: Ptr<T>;
  private _ticks: Ticks;
  private _changeBy: Ptr<string>;

  constructor(value: Ptr<T>, ticks: Ticks, changeBy: Ptr<string>) {
    this._val = value;
    this._ticks = ticks;
    this._changeBy = changeBy;
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
    return this._val[Ptr.ptr];
  }

  get __ticks__(): Ticks {
    return this._ticks;
  }

  protected set __val__(value: T) {
    this.setChanged();
    this.__changeBy__ = new Location().caller()!.name;
    this._val[Ptr.ptr] = value;
  }

  protected get __changeBy__(): string {
    return this._changeBy[Ptr.ptr];
  }

  protected set __changeBy__(value: string) {
    this._changeBy[Ptr.ptr] = value;
  }

  /**
   * Convert to a Ref, losing mutable access
   */
  asRef(): Ref<T> {
    return Ref.new(
      this._val[Ptr.ptr],
      this._ticks.added,
      this._ticks.changed,
      this._ticks.lastRun,
      this._ticks.thisRun,
      this._changeBy[Ptr.ptr],
    );
  }

  reborrow(): MutValue<T> {
    return MutValue.new(
      this._val,
      this._ticks.added,
      this._ticks.changed,
      this._ticks.lastRun,
      this._ticks.thisRun,
      this._changeBy,
    );
  }

  filterMapUnchanged<U>(f: (value: Ptr<T>) => Option<Ptr<U>>): Option<MutValue<U>> {
    return f(this._val).map((value) => {
      return MutValue.new(
        value,
        this._ticks.added,
        this._ticks.changed,
        this._ticks.lastRun,
        this._ticks.thisRun,
        this._changeBy,
      );
    });
  }

  mapUnchanged<U>(f: (value: Ptr<T>) => Ptr<U>): MutValue<U> {
    return MutValue.new(
      f(this._val),
      this._ticks.added,
      this._ticks.changed,
      this._ticks.lastRun,
      this._ticks.thisRun,
      this._changeBy,
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
  private _val: Ptr<unknown>;
  private _ticks: Ticks;
  private _changeBy: Ptr<string>;

  constructor(value: Ptr<unknown>, ticks: Ticks, changeBy: Ptr<string>) {
    this._val = value;
    this._ticks = ticks;
    this._changeBy = changeBy;
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
    return this._ticks;
  }

  protected get __val__(): unknown {
    return this._val[Ptr.ptr];
  }

  protected set __val__(value: unknown) {
    this.setChanged();
    this._changeBy[Ptr.ptr] = new Location().caller()!.name;
    this._val[Ptr.ptr] = value;
  }

  protected get __changeBy__(): string {
    return this._changeBy[Ptr.ptr];
  }

  protected set __changeBy__(value: string) {
    this._changeBy[Ptr.ptr] = value;
  }

  /**
   * Returns a MutUntyped with a smaller lifetime
   */
  reborrow(): MutUntyped {
    return MutUntyped.new(this._val, this._ticks, this._changeBy);
  }

  /**
   * Check if the value has changed since a given tick
   */
  hasChangedSince(tick: Tick): boolean {
    return this._ticks.changed.isNewerThan(tick, this._ticks.thisRun);
  }

  /**
   * Turn this MutUntyped into a Ptr by mapping the inner pointer to another value,
   * without flagging a change
   */
  mapUnchanged<T>(f: (ptr: Ptr<unknown>) => Ptr<T>): MutValue<T> {
    return MutValue.new(
      f(this._val),
      this._ticks.added,
      this._ticks.changed,
      this._ticks.lastRun,
      this._ticks.thisRun,
      this._changeBy,
    );
  }

  /**
   * Transforms this MutUntyped into a Ptr<T> with the same lifetime
   */
  withType<T>(): Mut<T> {
    return MutValue.new(
      this._val as Ptr<T>,
      this._ticks.added,
      this._ticks.changed,
      this._ticks.lastRun,
      this._ticks.thisRun,
      this._changeBy,
    ) as Mut<T>;
  }
}

From(MutValue).implInto(MutUntyped, {
  from(source: MutValue<any>): MutUntyped {
    return MutUntyped.new(
      source['_val'],
      source['_ticks'].added,
      source['_ticks'].changed,
      source['_ticks'].lastRun,
      source['_ticks'].thisRun,
      source['_changeBy'],
    );
  },
});

interface MutValue<T> extends Into<MutValue<T>> {}

export const Mut = MutValue;

export type Mut<T> = MutValue<T> & T;
