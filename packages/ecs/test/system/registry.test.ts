import { Default, derive } from 'rustable';
import { World } from '../../../ecs/src';
import { Component, Resource } from '../../../ecs/src/component';
import { system } from '../../../ecs/src/system';
import { Commands } from '../../../ecs/src/system/commands';
import { In, Local, Res } from '../../../ecs/src/system/param';
import { Query } from '../../../ecs/src/system/param/query';
import { RegisteredSystemError, SystemId } from '../../../ecs/src/system/registry';

describe('System Registry Tests', () => {
  test('change detection', () => {
    @derive([Resource, Default])
    class Counter {
      value: number = 0;
    }

    @derive([Resource])
    class ChangeDetector {}

    const countUpIfChanged = system(
      [Res(Counter), Res(ChangeDetector)],
      function (counter, changeDetector) {
        if (changeDetector.isChanged()) {
          counter.value += 1;
        }
      },
    );

    const world = new World();
    world.insertResource(new ChangeDetector());
    world.insertResource(new Counter());

    expect(world.resource(Counter).value).toBe(0);

    const id = world.registerSystem(countUpIfChanged);
    world.runSystem(id).expect('system runs successfully');
    expect(world.resource(Counter).value).toBe(1);

    world.runSystem(id).expect('system runs successfully');
    expect(world.resource(Counter).value).toBe(1);

    world.resourceMut(ChangeDetector).setChanged();
    world.runSystem(id).expect('system runs successfully');
    expect(world.resource(Counter).value).toBe(2);
  });

  test('local variables', () => {
    @derive([Resource, Default])
    class Counter {
      value: number = 0;
    }

    const doubling = system([Local(Counter), Res(Counter)], function (lastCounter, counter) {
      counter.value += lastCounter.value;
      lastCounter.value = counter.value;
    });

    const world = new World();
    world.insertResource(new Counter());
    world.resource(Counter).value = 1;

    const id = world.registerSystem(doubling);
    world.runSystem(id).expect('system runs successfully');
    expect(world.resource(Counter).value).toBe(1);

    world.runSystem(id).expect('system runs successfully');
    expect(world.resource(Counter).value).toBe(2);

    world.runSystem(id).expect('system runs successfully');
    expect(world.resource(Counter).value).toBe(4);

    world.runSystem(id).expect('system runs successfully');
    expect(world.resource(Counter).value).toBe(8);
  });

  test('input values', () => {
    @derive([Resource])
    class Counter {
      value: number = 0;
    }

    class NonCopy {
      constructor(public value: number) {}
    }

    const incrementSys = system([In(NonCopy), Res(Counter)], function (input, counter) {
      counter.get().value += input.value;
    });

    const world = new World();
    const id = world.registerSystem(incrementSys);

    world.insertResource(new Counter());
    world.resource(Counter).value = 1;
    expect(world.resource(Counter).value).toBe(1);

    world.runSystemWith(id, new NonCopy(1)).expect('system runs successfully');
    expect(world.resource(Counter).value).toBe(2);

    world.runSystemWith(id, new NonCopy(1)).expect('system runs successfully');
    expect(world.resource(Counter).value).toBe(3);

    world.runSystemWith(id, new NonCopy(20)).expect('system runs successfully');
    expect(world.resource(Counter).value).toBe(23);

    world.runSystemWith(id, new NonCopy(1)).expect('system runs successfully');
    expect(world.resource(Counter).value).toBe(24);
  });

  test('output values', () => {
    @derive([Resource])
    class Counter {
      value: number = 0;
    }

    class NonCopy {
      constructor(public value: number) {}
    }

    const incrementSys = system([Res(Counter)], function (counter): NonCopy {
      counter.value += 1;
      return new NonCopy(counter.value);
    });

    const world = new World();
    const id = world.registerSystem(incrementSys);

    world.insertResource(new Counter());
    world.resource(Counter).value = 1;
    expect(world.resource(Counter).value).toBe(1);

    const output1 = world.runSystem(id).expect('system runs successfully');
    expect(world.resource(Counter).value).toBe(2);
    expect(output1).toEqual(new NonCopy(2));

    const output2 = world.runSystem(id).expect('system runs successfully');
    expect(world.resource(Counter).value).toBe(3);
    expect(output2).toEqual(new NonCopy(3));
  });

  test('exclusive system', () => {
    const world = new World();
    const exclusiveSystemId = world.registerSystem(
      system([World], function (world: World) {
        world.spawnEmpty();
      }),
    );

    const entityCount = world.entities.length;
    world.runSystem(exclusiveSystemId);
    expect(world.entities.length).toBe(entityCount + 1);
  });

  test('nested systems', () => {
    @derive([Resource])
    class Counter {
      value: number = 0;
    }

    @derive([Component])
    class Callback {
      constructor(public systemId: SystemId) {}
    }

    const nested = system([Query(Callback), Commands], function (query, commands) {
      for (const callback of query.iter()) {
        commands.runSystem(callback.systemId);
      }
    });

    const world = new World();
    world.insertResource(new Counter());

    const incrementTwo = world.registerSystem(
      system([Res(Counter)], function (counter) {
        counter.value += 2;
      }),
    );

    const incrementThree = world.registerSystem(
      system([Res(Counter)], function (counter) {
        counter.value += 3;
      }),
    );

    const nestedId = world.registerSystem(nested);

    world.spawn(new Callback(incrementTwo));
    world.spawn(new Callback(incrementThree));
    world.runSystem(nestedId);
    expect(world.resource(Counter).value).toBe(5);
  });

  test('nested systems with inputs', () => {
    @derive([Resource])
    class Counter {
      value: number = 0;
    }

    @derive([Component])
    class Callback {
      constructor(
        public systemId: SystemId<number>,
        public amount: number,
      ) {}
    }

    const nested = system([Query(Callback), Commands], function (query, commands) {
      for (const callback of query.iter()) {
        commands.runSystemWith(callback.systemId, callback.amount);
      }
    });

    const world = new World();
    world.insertResource(new Counter());

    const incrementBy = world.registerSystem(
      system([In(Number), Res(Counter)], function (amount, counter) {
        counter.value += amount.valueOf();
      }),
    );

    const nestedId = world.registerSystem(nested);

    world.spawn(new Callback(incrementBy, 2));
    world.spawn(new Callback(incrementBy, 3));
    world.runSystem(nestedId);
    expect(world.resource(Counter).value).toBe(5);
  });

  test('cached system', () => {
    const four = system([], function (): number {
      return 4;
    });

    const world = new World();
    const old = world.registerSystemCached(four);
    const new_ = world.registerSystemCached(four);
    expect(old).toEqual(new_);

    const result = world.unregisterSystemCached(four);
    expect(result.isOk()).toBe(true);

    const new2 = world.registerSystemCached(four);
    expect(old).not.toEqual(new2);

    const output1 = world.runSystem(old);
    expect(output1.isErr()).toBe(true);
    expect(output1.unwrapErr()).toBeInstanceOf(RegisteredSystemError);

    const output2 = world.runSystem(new2);
    expect(output2.isOk()).toBe(true);
    expect(output2.unwrap()).toBe(4);

    const output3 = world.runSystemCached(four);
    expect(output3.isOk()).toBe(true);
    expect(output3.unwrap()).toBe(4);

    const output4 = world.runSystemCachedWith(four, undefined);
    expect(output4.isOk()).toBe(true);
    expect(output4.unwrap()).toBe(4);
  });

  test('cached system commands', () => {
    @derive([Resource])
    class Counter {
      value: number = 0;
    }

    const sys = system([Res(Counter)], function (counter) {
      counter.value = 1;
    });

    const world = new World();
    world.insertResource(new Counter());

    world.commands.runSystemCached(sys);
    world.flushCommands();

    expect(world.resource(Counter).value).toBe(1);
  });

  test('cached system adapters', () => {
    const four = system([], function (): number {
      return 4;
    });

    const double = system([In(Number)], function (input): number {
      return input.valueOf() * 3;
    });

    const world = new World();

    const output1 = world.runSystemCached(four.pipe(double));
    expect(output1.isOk()).toBe(true);
    expect(output1.unwrap()).toBe(12);

    const output2 = world.runSystemCached(four.map((i) => i * 2));
    expect(output2.isOk()).toBe(true);
    expect(output2.unwrap()).toBe(8);
  });

  test('system with input ref', () => {
    @derive([Resource])
    class Counter {
      value: number = 0;
    }

    const withRef = system([In(Number), Res(Counter)], function (input, counter) {
      counter.value += input.valueOf();
    });

    const world = new World();
    world.insertResource(new Counter());

    const id = world.registerSystem(withRef);
    world.runSystemWith(id, 2);
    expect(world.resource(Counter).value).toBe(2);
  });

  test('system with input mut', () => {
    @derive([Resource])
    class Counter {
      value: number = 0;
    }

    class MyEvent {
      constructor(public cancelled: boolean = false) {}
    }

    const post = system([In(MyEvent), Res(Counter)], function (event, counter) {
      if (counter.value > 0) {
        event.cancelled = true;
      }
    });

    const world = new World();
    world.insertResource(new Counter());
    const postSystem = world.registerSystem(post);

    const event = new MyEvent();
    world.runSystemWith(postSystem, event);
    expect(event.cancelled).toBe(false);

    world.resource(Counter).value = 1;
    world.runSystemWith(postSystem, event);
    expect(event.cancelled).toBe(true);
  });

  test('run system invalid params', () => {
    @derive([Resource])
    class T {}

    const invalidSystem = system([Res(T)], function (_t) {});

    const world = new World();
    const id = world.registerSystem(invalidSystem.warnParamMissing());
    const result = world.runSystem(id);

    expect(result.isErr()).toBe(true);
    expect(result.unwrapErr()).toBeInstanceOf(RegisteredSystemError);
  });
});
