import { Default, derive, Type, typeId } from 'rustable';
import { Component, component, Resource } from '../../src/component';
import { QueryData } from '../../src/query/fetch';
import { Commands } from '../../src/system/commands';
import { World } from '../../src/world/base';
import { commandFn, CommandQueue } from '../../src/world/command_queue';
import { FromWorld } from '../../src/world/from';

describe('Commands', () => {
  @derive([Component, Resource])
  class W<T> {
    constructor(public value: T) {}
  }

  const NumberW = Type(W<number>, [Number]);
  const NumberW2 = Type(W<number>, [Number, Number]);
  const NumberW3 = Type(W<number>, [Number, Number, Number]);

  interface NumberW extends W<number> {}
  interface NumberW2 extends W<number> {}
  interface NumberW3 extends W<number> {}

  const simpleCommand = commandFn(function (world: World) {
    world.spawn([new W(0), new W(42)]);
  });
  it('entity_commands_entry', () => {
    const world = new World();
    const queue = new CommandQueue();
    let commands = Commands.new(queue, world);

    const entity = commands.spawnEmpty().id();
    commands
      .entity(entity)
      .entry(W)
      .andModify(() => {
        throw new Error('unreachable!');
      });

    queue.apply(world);
    expect(world.entity(entity).contains(W)).toBe(false);

    commands = Commands.new(queue, world);
    commands
      .entity(entity)
      .entry(W)
      .orInsert(new W(0))
      .andModify((val) => {
        val.value = 21;
      });

    queue.apply(world);
    expect(world.get(W, entity).unwrap().value).toBe(21);

    commands = Commands.new(queue, world);

    commands
      .entity(entity)
      .entry(NumberW)
      .andModify(() => {
        throw new Error('unreachable!');
      })
      .orInsert(new NumberW(42));

    queue.apply(world);
    expect(world.get(NumberW, entity).unwrap().value).toBe(42);

    const StringW = Type(W<String>, [String]);

    FromWorld.implFor(StringW, {
      static: {
        fromWorld(world: World) {
          const v = world.resource(W<number>);
          let value = '';
          for (let i = 0; i < v.value; i++) {
            value += '*';
          }
          return new StringW(value);
        },
      },
    });
    world.insertResource(new W(5));
    commands = Commands.new(queue, world);
    commands.entity(entity).entry(StringW).orFromWorld();
    queue.apply(world);
    expect(world.get(StringW, entity).unwrap().value).toBe('*****');
  });

  test('commands', () => {
    const world = new World();
    const commandQueue = new CommandQueue();

    const entity = Commands.new(commandQueue, world)
      .spawn([new W(1), new NumberW(2)])
      .id();

    commandQueue.apply(world);
    expect(world.entities.len()).toBe(1);

    const results = world
      .query(QueryData.wrap([W, NumberW]) as QueryData<[W<number>, NumberW]>)
      .iter(world)
      .iter()
      .map(([w, b]) => {
        return [w.value, b.value];
      })
      .collect();

    expect(results).toEqual([[1, 2]]);

    // Test entity despawn
    {
      let commands = Commands.new(commandQueue, world);
      commands.entity(entity).despawn();
      commands.entity(entity).despawn(); // double despawn shouldn't throw
    }

    commandQueue.apply(world);
    const results2 = world
      .query(QueryData.wrap([W]) as QueryData<[W<number>]>)
      .iter(world)
      .iter()
      .map(([w]) => w.value)
      .collect();

    expect(results2).toEqual([]);

    // Test adding simple commands
    {
      let commands = Commands.new(commandQueue, world);

      // Set up a simple command using a closure
      commands.queue((world: World) => {
        world.spawn([new W(42), new NumberW(0)]);
      });

      // Set up a simple command using a function
      commands.queue(simpleCommand);
    }

    commandQueue.apply(world);
    const results3 = world
      .query(QueryData.wrap([W, NumberW]) as QueryData<[W<number>, NumberW]>)
      .iter(world)
      .iter()
      .map(([w, b]) => {
        return [w.value, b.value];
      })
      .collect();

    expect(results3).toEqual([
      [42, 0],
      [0, 42],
    ]);
  });

  it('insert_components', () => {
    const world = new World();
    const commandQueue1 = new CommandQueue();

    // Insert components
    const entity = Commands.new(commandQueue1, world)
      .spawnEmpty()
      .insertIf(new NumberW(1), () => true)
      .insertIf(new NumberW(2), () => false)
      .insertIfNew(new NumberW2(1))
      .insertIfNew(new NumberW2(2))
      .insertIfNewAnd(new NumberW3(1), () => false)
      .insertIfNewAnd(new NumberW3(2), () => true)
      .insertIfNewAnd(new NumberW3(3), () => true)
      .id();

    commandQueue1.apply(world);

    const results = world
      .query(
        QueryData.wrap([NumberW, NumberW2, NumberW3]) as QueryData<[NumberW, NumberW2, NumberW3]>,
      )
      .iter(world)
      .iter()
      .map(([a, b, c]) => [a.value, b.value, c.value])
      .collect();
    expect(results).toEqual([[1, 1, 2]]);

    // Try to insert components after despawning entity
    Commands.new(commandQueue1, world)
      .entity(entity)
      .tryInsertIfNewAnd(new W(1), () => true);

    const commandQueue2 = new CommandQueue();
    Commands.new(commandQueue2, world).entity(entity).despawn();
    commandQueue2.apply(world);
    commandQueue1.apply(world);
  });

  it('remove_components', () => {
    const world = new World();
    const commandQueue = new CommandQueue();

    const entity = Commands.new(commandQueue, world)
      .spawn([new NumberW(1), new NumberW2(2)])
      .id();
    commandQueue.apply(world);

    const resultsBefore = world
      .query(QueryData.wrap([NumberW, NumberW2]) as QueryData<[NumberW, NumberW2]>)
      .iter(world)
      .iter()
      .map(([a, b]) => [a.value, b.value])
      .collect();
    expect(resultsBefore).toEqual([[1, 2]]);

    // Test component removal
    Commands.new(commandQueue, world).entity(entity).remove(NumberW).remove([NumberW, NumberW2]);

    commandQueue.apply(world);

    const resultsAfter = world
      .query(QueryData.wrap([NumberW, NumberW2]) as QueryData<[NumberW, NumberW2]>)
      .iter(world)
      .iter()
      .map(([a, b]) => [a.value, b.value])
      .collect();
    expect(resultsAfter).toEqual([]);
    const resultsAfter2 = world
      .query(QueryData.wrap([NumberW2]) as QueryData<[NumberW2]>)
      .iter(world)
      .iter()
      .map(([a]) => [a.value])
      .collect();
    expect(resultsAfter2).toEqual([]);
  });

  it('remove_components_by_id', () => {
    const world = new World();
    const commandQueue = new CommandQueue();

    const entity = Commands.new(commandQueue, world)
      .spawn([new NumberW(1), new NumberW2(2)])
      .id();
    commandQueue.apply(world);

    const resultsBefore = world
      .query(QueryData.wrap([NumberW, NumberW2]) as QueryData<[NumberW, NumberW2]>)
      .iter(world)
      .iter()
      .map(([a, b]) => [a.value, b.value])
      .collect();
    expect(resultsBefore).toEqual([[1, 2]]);

    // Test component removal
    Commands.new(commandQueue, world)
      .entity(entity)
      .removeById(world.components.getId(typeId(NumberW)).unwrap())
      .removeById(world.components.getId(typeId(NumberW2)).unwrap());

    commandQueue.apply(world);

    const resultsAfter = world
      .query(QueryData.wrap([NumberW, NumberW2]) as QueryData<[NumberW, NumberW2]>)
      .iter(world)
      .iter()
      .map(([a, b]) => [a.value, b.value])
      .collect();
    expect(resultsAfter).toEqual([]);

    const resultsAfterBigInt = world
      .query(QueryData.wrap([NumberW2]) as QueryData<[NumberW2]>)
      .iter(world)
      .iter()
      .map(([v]) => v.value)
      .collect();
    expect(resultsAfterBigInt).toEqual([]);
  });

  it('remove_resources', () => {
    const world = new World();
    const queue = new CommandQueue();
    {
      let commands = Commands.new(queue, world);
      commands.insertResource(new W(123));
      commands.insertResource(new W(456));
    }

    queue.apply(world);
    expect(world.containsResource(W)).toBe(true);

    {
      let commands = Commands.new(queue, world);
      commands.removeResource(W);
    }
    queue.apply(world);
    expect(world.containsResource(W)).toBe(false);
  });

  it('remove_component_with_required_components', () => {
    @derive([Component, Default])
    class Y {}

    @derive(Component)
    @component({
      requires: [Y],
    })
    class X {}
    @derive(Component)
    class Z {}

    const world = new World();
    const queue = new CommandQueue();
    const e = Commands.new(queue, world).spawn([new X(), new Z()]).id();
    queue.apply(world);

    expect(world.get(Y, e).isSome()).toBe(true);
    expect(world.get(X, e).isSome()).toBe(true);
    expect(world.get(Z, e).isSome()).toBe(true);

    Commands.new(queue, world).entity(e).removeWithRequires(X);
    queue.apply(world);

    expect(world.get(Y, e).isNone()).toBe(true);
    expect(world.get(X, e).isNone()).toBe(true);
    expect(world.get(Z, e).isSome()).toBe(true);
  });

  it('append', () => {
    const world = new World();
    const queue1 = new CommandQueue();
    {
      const commands = Commands.new(queue1, world);
      commands.insertResource(new W(123));
    }
    const queue2 = new CommandQueue();
    {
      const commands = Commands.new(queue2, world);
      commands.insertResource(new W(456));
    }
    queue1.append(queue2);
    queue1.apply(world);
    expect(world.containsResource(W)).toBe(true);
  });
});
