import { MAX_CHANGE_AGE } from './constants';

/**
 * A tick is a monotonically increasing number that can be used to track changes in the world.
 */
export class Tick {
  static MAX: Tick = new Tick(MAX_CHANGE_AGE);

  tick: number;

  constructor(tick: number = 0) {
    this.tick = tick;
  }

  get() {
    return this.tick;
  }

  set(tick: number) {
    this.tick = tick;
  }

  isNewerThan(lastRun: Tick, thisRun: Tick) {
    const ticksSinceInsert = Math.min(thisRun.relativeTo(this).tick, MAX_CHANGE_AGE);
    const ticksSinceSystem = Math.min(thisRun.relativeTo(lastRun).tick, MAX_CHANGE_AGE);
    return ticksSinceInsert < ticksSinceSystem;
  }

  relativeTo(other: Tick) {
    const tick = this.tick - other.tick;
    if (tick < 0) {
      return new Tick(Number.MAX_SAFE_INTEGER - tick);
    }
    return new Tick(tick);
  }

  checkTick(tick: Tick) {
    const age = this.relativeTo(tick);
    if (age.get() > Tick.MAX.get()) {
      this.tick = tick.relativeTo(Tick.MAX).tick;
      return true;
    } else {
      return false;
    }
  }
}

export class ComponentTicks {
  added: Tick;
  changed: Tick;

  constructor(added: Tick, changed: Tick) {
    this.added = added;
    this.changed = changed;
  }

  static new(changeTick: Tick): ComponentTicks;
  static new(added: Tick, changed: Tick): ComponentTicks;
  static new(arg1: Tick, arg2?: Tick): ComponentTicks {
    if (arg2) {
      return new ComponentTicks(arg1, arg2);
    } else {
      return new ComponentTicks(arg1, arg1);
    }
  }

  isAdded(lastRun: Tick, thisRun: Tick): boolean {
    return this.added.isNewerThan(lastRun, thisRun);
  }

  isChanged(lastRun: Tick, thisRun: Tick): boolean {
    return this.isAdded(lastRun, thisRun) || this.changed.isNewerThan(lastRun, thisRun);
  }
}

/**
 * A view into tick cells
 */
export class Ticks {
  added: Tick;
  changed: Tick;
  lastRun: Tick;
  thisRun: Tick;

  constructor(added: Tick, changed: Tick, lastRun: Tick, thisRun: Tick) {
    this.added = added;
    this.changed = changed;
    this.lastRun = lastRun;
    this.thisRun = thisRun;
  }

  static fromTickCells(cells: ComponentTicks, lastRun: Tick, thisRun: Tick) {
    return new Ticks(cells.added, cells.changed, lastRun, thisRun);
  }
}
