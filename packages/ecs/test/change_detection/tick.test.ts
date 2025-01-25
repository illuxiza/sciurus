import { MAX_CHANGE_AGE } from '../../src/change_detection/constants';
import { ComponentTicks, Tick, Ticks } from '../../src/change_detection/tick';

describe('Tick', () => {
  test('isNewerThan basic functionality', () => {
    const tick1 = new Tick(1);
    const tick2 = new Tick(2);
    const tick3 = new Tick(3);

    // tick2 should be newer than tick1 relative to tick3
    expect(tick2.isNewerThan(tick1, tick3)).toBe(true);
    // tick1 should not be newer than tick2 relative to tick3
    expect(tick1.isNewerThan(tick2, tick3)).toBe(false);
  });

  test('relativeTo calculation', () => {
    const tick1 = new Tick(1);
    const tick2 = new Tick(3);

    const relative = tick2.relativeTo(tick1);
    expect(relative.get()).toBe(2);
  });

  test('checkTick handles age limit', () => {
    const tick = new Tick(1);
    const maxTick = new Tick(MAX_CHANGE_AGE + 1);

    expect(tick.checkTick(maxTick)).toBe(true);
    expect(tick.get()).toBeLessThanOrEqual(MAX_CHANGE_AGE);
  });
});

describe('ComponentTicks', () => {
  test('new creates with same added and changed ticks', () => {
    const changeTick = new Tick(42);
    const ticks = ComponentTicks.new(changeTick);

    expect(ticks.added.get()).toBe(42);
    expect(ticks.changed.get()).toBe(42);
  });

  test('isAdded checks if component was recently added', () => {
    const added = new Tick(2);
    const changed = new Tick(2);
    const lastRun = new Tick(1);
    const thisRun = new Tick(3);

    const ticks = new ComponentTicks(added, changed);
    expect(ticks.isAdded(lastRun, thisRun)).toBe(true);
  });

  test('isChanged checks both added and changed state', () => {
    const added = new Tick(1);
    const changed = new Tick(2);
    const lastRun = new Tick(1);
    const thisRun = new Tick(3);

    const ticks = new ComponentTicks(added, changed);
    expect(ticks.isChanged(lastRun, thisRun)).toBe(true);
  });
});

describe('Ticks', () => {
  test('fromTickCells creates correct Ticks instance', () => {
    const componentTicks = new ComponentTicks(new Tick(1), new Tick(2));
    const lastRun = new Tick(1);
    const thisRun = new Tick(3);

    const ticks = Ticks.fromTickCells(componentTicks, lastRun, thisRun);

    expect(ticks.added.get()).toBe(1);
    expect(ticks.changed.get()).toBe(2);
    expect(ticks.lastRun.get()).toBe(1);
    expect(ticks.thisRun.get()).toBe(3);
  });
});
