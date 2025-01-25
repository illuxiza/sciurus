import { DetectChanges, DetectChangesMut } from '../../src/change_detection/detect_changes';
import { Tick, Ticks } from '../../src/change_detection/tick';

describe('DetectChanges', () => {
  let detectChanges: DetectChanges<any>;
  let lastRun: Tick;
  let thisRun: Tick;

  beforeEach(() => {
    detectChanges = new DetectChanges();
    lastRun = new Tick(1);
    thisRun = new Tick(2);
  });

  test('isAdded returns false when no ticks are set', () => {
    expect(detectChanges.isAdded()).toBe(false);
  });

  test('isChanged returns false when no ticks are set', () => {
    expect(detectChanges.isChanged()).toBe(false);
  });

  test('lastChanged returns Tick(0) when no ticks are set', () => {
    expect(detectChanges.lastChanged().get()).toBe(0);
  });

  test('isAdded returns true for newly added components', () => {
    detectChanges.__ticks__ = new Ticks(
      new Tick(2), // added tick
      new Tick(2), // changed tick
      lastRun,
      thisRun,
    );
    expect(detectChanges.isAdded()).toBe(true);
  });

  test('isChanged returns true for changed components', () => {
    detectChanges.__ticks__ = new Ticks(
      new Tick(1), // added tick
      new Tick(2), // changed tick
      lastRun,
      thisRun,
    );
    expect(detectChanges.isChanged()).toBe(true);
  });

  test('isChanged returns false for unchanged components', () => {
    detectChanges.__ticks__ = new Ticks(
      new Tick(1), // added tick
      new Tick(1), // changed tick
      lastRun,
      thisRun,
    );
    expect(detectChanges.isChanged()).toBe(false);
  });
});

describe('DetectChangesMut', () => {
  let detectChangesMut: DetectChangesMut<number>;
  let lastRun: Tick;
  let thisRun: Tick;

  beforeEach(() => {
    detectChangesMut = new DetectChangesMut();
    lastRun = new Tick(1);
    thisRun = new Tick(2);
    detectChangesMut.__ticks__ = new Ticks(new Tick(1), new Tick(1), lastRun, thisRun);
  });

  test('setChanged updates the change tick', () => {
    detectChangesMut.setChanged();
    expect(detectChangesMut.__ticks__?.changed.get()).toBe(thisRun.get());
  });

  test('setLastChanged sets specific change tick', () => {
    const newTick = new Tick(5);
    detectChangesMut.setLastChanged(newTick);
    expect(detectChangesMut.__ticks__?.changed.get()).toBe(5);
  });

  test('setChanged has no effect when ticks are not set', () => {
    const detectChangesMutNoTicks = new DetectChangesMut<number>();
    detectChangesMutNoTicks.setChanged();
    expect(detectChangesMutNoTicks.__ticks__).toBeUndefined();
  });

  test('setLastChanged has no effect when ticks are not set', () => {
    const detectChangesMutNoTicks = new DetectChangesMut<number>();
    detectChangesMutNoTicks.setLastChanged(new Tick(5));
    expect(detectChangesMutNoTicks.__ticks__).toBeUndefined();
  });

  test('bypassChangeDetection throws when value is not set', () => {
    expect(() => detectChangesMut.bypassChangeDetection()).toThrow('Not implemented');
  });

  test('setIfNeq updates value and triggers change when values are different', () => {
    const detectChangesMutWithValue = new DetectChangesMut<number>();
    detectChangesMutWithValue.__val__ = 1;
    detectChangesMutWithValue.__ticks__ = new Ticks(new Tick(1), new Tick(1), lastRun, thisRun);

    const result = detectChangesMutWithValue.setIfNeq(2);
    expect(result).toBe(true);
    expect(detectChangesMutWithValue.__val__).toBe(2);
    expect(detectChangesMutWithValue.__ticks__?.changed.get()).toBe(thisRun.get());
  });

  test('setIfNeq does not update or trigger change when values are equal', () => {
    const detectChangesMutWithValue = new DetectChangesMut<number>();
    detectChangesMutWithValue.__val__ = 1;
    detectChangesMutWithValue.__ticks__ = new Ticks(new Tick(1), new Tick(1), lastRun, thisRun);

    const result = detectChangesMutWithValue.setIfNeq(1);
    expect(result).toBe(false);
    expect(detectChangesMutWithValue.__val__).toBe(1);
    expect(detectChangesMutWithValue.__ticks__?.changed.get()).toBe(1);
  });
});
