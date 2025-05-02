import { Default, derive, Ptr } from 'rustable';
import { Component, Resource } from '../../src/component';
import { Event } from '../../src/event';
import { Schedule } from '../../src/schedule';
import { system } from '../../src/system';
import {
  anyMatchFilter,
  anyWithComponent,
  not,
  onEvent,
  resourceAdded,
  resourceChanged,
  resourceChangedOrRemoved,
  resourceExists,
  resourceExistsAndChanged,
  resourceRemoved,
  runOnce,
} from '../../src/system/condition/common_conditions';
import { condition } from '../../src/system/function/fn';
import { Local, Res } from '../../src/system/param';
import { World } from '../../src/world';
import { With } from '../../src/query/filter/with';

// Test resources and components
@derive([Resource, Default])
class Counter {
  constructor(public value: number = 0) {}
}

@derive([Component])
class TestComponent {}

@derive([Event])
class TestEvent {}

const incrementCounter = system([Res(Counter)], (counter: Counter) => {
  counter.value += 1;
  return true;
});

const doubleCounter = system([Res(Counter)], (counter: Counter) => {
  counter.value *= 2;
  return true;
});

const everyOtherTime = condition([Local(Boolean)], (hasRun: Ptr<Boolean>) => {
  hasRun[Ptr.ptr] = !hasRun[Ptr.ptr];
  return hasRun[Ptr.ptr];
});

describe('Run conditions', () => {
  test('basic run condition', () => {
    const world = new World();
    world.initResource(Counter);
    const schedule = new Schedule();

    // Run every other cycle
    schedule.addSystems(incrementCounter.runIf(everyOtherTime));

    schedule.run(world);
    schedule.run(world);
    expect(world.resource(Counter).value).toBe(1);

    schedule.run(world);
    schedule.run(world);
    expect(world.resource(Counter).value).toBe(2);

    // Run every other cycle opposite to the last one
    schedule.addSystems(incrementCounter.runIf(not(everyOtherTime)));

    schedule.run(world);
    schedule.run(world);
    expect(world.resource(Counter).value).toBe(4);

    schedule.run(world);
    schedule.run(world);
    expect(world.resource(Counter).value).toBe(6);
  });

  test('run condition combinators', () => {
    const world = new World();
    world.initResource(Counter);
    const schedule = new Schedule();

    schedule.addSystems(
      [
        // Run every odd cycle
        incrementCounter.runIf(everyOtherTime.and(condition([], () => true))),
        // Always run
        incrementCounter.runIf(everyOtherTime.nand(condition([], () => false))),
        // Run every even cycle
        doubleCounter.runIf(everyOtherTime.nor(condition([], () => false))),
        // Always run
        incrementCounter.runIf(everyOtherTime.or(condition([], () => true))),
        // Run every odd cycle
        incrementCounter.runIf(everyOtherTime.xnor(condition([], () => true))),
        // Run every even cycle
        doubleCounter.runIf(everyOtherTime.xnor(condition([], () => false))),
        // Run every odd cycle
        incrementCounter.runIf(everyOtherTime.xor(condition([], () => false))),
        // Run every even cycle
        doubleCounter.runIf(everyOtherTime.xor(condition([], () => true))),
      ].chain(),
    );

    schedule.run(world);
    expect(world.resource(Counter).value).toBe(5);

    schedule.run(world);
    expect(world.resource(Counter).value).toBe(52);
  });

  test('multiple run conditions', () => {
    const world = new World();
    world.initResource(Counter);
    const schedule = new Schedule();

    // Run every other cycle
    schedule.addSystems(incrementCounter.runIf(everyOtherTime).runIf(condition([], () => true)));
    // Never run
    schedule.addSystems(incrementCounter.runIf(everyOtherTime).runIf(condition([], () => false)));

    schedule.run(world);
    expect(world.resource(Counter).value).toBe(1);

    schedule.run(world);
    expect(world.resource(Counter).value).toBe(1);
  });

  test('multiple run conditions is AND operation', () => {
    const world = new World();
    world.initResource(Counter);
    const schedule = new Schedule();

    // This should never run, if multiple run conditions worked
    // like an OR condition then it would always run
    schedule.addSystems(incrementCounter.runIf(everyOtherTime).runIf(not(everyOtherTime)));

    schedule.run(world);
    expect(world.resource(Counter).value).toBe(0);

    schedule.run(world);
    expect(world.resource(Counter).value).toBe(0);
  });

  test('common conditions compilation test', () => {
    // This test just ensures all the common conditions can be used with the distributive_run_if API
    const testSystem = system([], () => {});

    // Just verify these compile without errors
    const schedule = new Schedule();
    schedule.addSystems(
      [testSystem, testSystem]
        .distributiveRunIf(runOnce)
        .distributiveRunIf(resourceExists(Counter))
        .distributiveRunIf(resourceAdded(Counter))
        .distributiveRunIf(resourceChanged(Counter))
        .distributiveRunIf(resourceExistsAndChanged(Counter))
        .distributiveRunIf(resourceChangedOrRemoved(Counter))
        .distributiveRunIf(resourceRemoved(Counter))
        .distributiveRunIf(onEvent(TestEvent))
        .distributiveRunIf(anyWithComponent(TestComponent))
        .distributiveRunIf(anyMatchFilter(With(TestComponent)))
        .distributiveRunIf(not(runOnce)),
    );
  });
});
