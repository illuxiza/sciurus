import { getCaller, NOT_IMPLEMENTED } from '@sciurus/utils';
import { macroTrait, None, Option, Ptr, Some, stringify, trait } from 'rustable';
import { Tick, Ticks } from './tick';

/**
 * Types that can read change detection information.
 * This change detection is controlled by DetectChangesMut types.
 */
@trait
class DetectChangesTrait<T> {
  protected __val__!: T;
  protected __ticks__!: Ticks;
  protected __changeBy__!: string;
  /**
   * Returns true if this value was added after the system last ran.
   */
  isAdded(): boolean {
    if (!this.__ticks__) {
      return false;
    }
    return this.__ticks__.added.isNewerThan(this.__ticks__.lastRun, this.__ticks__.thisRun);
  }

  /**
   * Returns true if this value was added or mutably dereferenced
   * either since the last time the system ran or, if the system never ran,
   * since the beginning of the program.
   *
   * To check if the value was mutably dereferenced only,
   * use `this.isChanged() && !this.isAdded()`.
   */
  isChanged(): boolean {
    if (!this.__ticks__) {
      return false;
    }
    return this.__ticks__.changed.isNewerThan(this.__ticks__.lastRun, this.__ticks__.thisRun);
  }

  /**
   * Returns the change tick recording the time this data was most recently changed.
   * Note that components and resources are also marked as changed upon insertion.
   */
  lastChanged(): Tick {
    return this.__ticks__ ? this.__ticks__.changed : new Tick(0);
  }

  ticks(): Ticks {
    return this.__ticks__;
  }

  /**
   * The location that last caused this to change.
   */
  changedBy(): string {
    return this.__changeBy__;
  }
}

export const DetectChanges = macroTrait(DetectChangesTrait);

export interface DetectChanges<T> extends DetectChangesTrait<T> {}

/**
 * Types that implement reliable change detection.
 */
@trait
class DetectChangesMutTrait<T> extends DetectChanges<T> {
  /**
   * Flags this value as having been changed.
   *
   * Mutably accessing this smart pointer will automatically flag this value as having been changed.
   * However, mutation through interior mutability requires manual reporting.
   */
  setChanged(): void {
    if (!this.__ticks__) {
      return;
    }
    this.__ticks__.changed.set(this.__ticks__.thisRun.get());
    this.__changeBy__ = getCaller();
  }

  /**
   * Manually sets the change tick recording the time when this data was last mutated.
   *
   * Warning: This is a complex and error-prone operation, primarily intended for use with rollback networking strategies.
   * If you merely want to flag this data as changed, use setChanged instead.
   * If you want to avoid triggering change detection, use bypassChangeDetection instead.
   */
  setLastChanged(lastChanged: Tick): void {
    if (!this.__ticks__) {
      return;
    }
    this.__ticks__.changed.set(lastChanged.get());
    this.__changeBy__ = getCaller();
  }
  /**
   * Manually bypasses change detection, allowing you to mutate the underlying value without updating the change tick.
   *
   * Warning: This is a risky operation, that can have unexpected consequences on any system relying on this code.
   * However, it can be an essential escape hatch when, for example,
   * you are trying to synchronize representations using change detection and need to avoid infinite recursion.
   */
  bypassChangeDetection(): Ptr<T> {
    if (!this.__val__) {
      throw NOT_IMPLEMENTED;
    }
    return Ptr({
      get: () => this.__val__,
      set: (value) => {
        this.__val__ = value;
      },
    });
  }

  /**
   * Overwrites this smart pointer with the given value, if and only if current !== value.
   * Returns true if the value was overwritten, and returns false if it was not.
   *
   * This is useful to ensure change detection is only triggered when the underlying value
   * changes, instead of every time it is mutably accessed.
   */
  setIfNeq(value: T): boolean {
    let old = this.bypassChangeDetection();
    if (stringify(old[Ptr.ptr]) !== stringify(value)) {
      old[Ptr.ptr] = value;
      this.setChanged();
      return true;
    } else {
      return false;
    }
  }

  replaceIfNeq(value: T): Option<T> {
    let old = this.bypassChangeDetection();
    if (stringify(old[Ptr.ptr]) !== stringify(value)) {
      const oldValue = old;
      old[Ptr.ptr] = value;
      this.setChanged();
      return Some(oldValue);
    } else {
      return None;
    }
  }
}

export const DetectChangesMut = macroTrait(DetectChangesMutTrait);

export interface DetectChangesMut<T> extends DetectChangesMutTrait<T> {}

export const proxyValue = (value: any): any => {
  return new Proxy(value, {
    get(target, prop) {
      if (prop in target && typeof (target as any)[prop] === 'function') {
        return (target as any)[prop].bind(target);
      }
      target.setChanged();
      target.__changeBy__ = getCaller();
      return target.get()[prop];
    },
    set(target, prop, value) {
      if (prop in target && typeof (target as any)[prop] === 'function') {
        return true;
      }
      target.get()[prop] = value;
      return true;
    },
  });
};
