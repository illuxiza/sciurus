import { Default, derive, Ok } from 'rustable';
import { Resource } from '../../src/component';
import { World } from '../../src/world/base';
import { commandFn, CommandQueue } from '../../src/world/command_queue';

// Resource class to track command execution order
@derive([Default, Resource])
class OrderResource {
  constructor(public values: number[] = []) {}
}

class SpawnCommand {
  apply(world: World): void {
    world.spawnEmpty();
  }
}

class PanicCommand {
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  apply(_world: World): void {
    throw new Error(this.message);
  }
}

// Command that adds an index to track execution order
class AddIndexCommand {
  constructor(private index: number) {}

  apply(world: World): void {
    const order = world.resource(OrderResource);
    order.values.push(this.index);
    world.insertResource(order);
  }
}

describe('CommandQueue', () => {
  test('command_queue_inner', () => {
    const queue = new CommandQueue();

    queue.push(new SpawnCommand());
    queue.push(new SpawnCommand());

    const world = new World();
    queue.apply(world);

    expect(world.entities.len()).toBe(2);

    // The previous call to apply cleared the queue.
    // This call should do nothing.
    queue.apply(world);
    expect(world.entities.len()).toBe(2);
  });

  test('command_queue_inner_panic_safe', () => {
    const queue = new CommandQueue();
    queue.resume = (_error: Error) => Ok<any, Error>({});

    queue.push(new PanicCommand('I panic!'));
    queue.push(new SpawnCommand());

    const world = new World();

    queue.apply(world);

    // Even though the first command panicked, it's still ok to push
    // more commands
    queue.push(new SpawnCommand());
    queue.push(new SpawnCommand());
    queue.apply(world);
    expect(world.entities.len()).toBe(3);
  });

  test('command_queue_inner_nested_panic_safe', () => {
    const world = new World();
    world.initResource(OrderResource);

    world._command_queue.resume = (_error: Error) => {
      world.flushCommands();
      return Ok<any, Error>({});
    };
    world._command_queue.push(new AddIndexCommand(1));
    world._command_queue.push(
      commandFn((world: World) => {
        world._command_queue.push(new AddIndexCommand(2));
        world._command_queue.push(new PanicCommand('I panic!'));
        world._command_queue.push(new AddIndexCommand(3));
        world.flushCommands();
      }),
    );
    world._command_queue.push(new AddIndexCommand(4));

    world._command_queue.push(new AddIndexCommand(5));
    world.flushCommands();

    const order = world.resource(OrderResource);
    expect(order.values).toEqual([1, 2, 3, 4, 5]);
  });

  test('command_queue_append', () => {
    const queue1 = new CommandQueue();
    const queue2 = new CommandQueue();

    queue1.push(new SpawnCommand());
    queue2.push(new SpawnCommand());
    queue2.push(new SpawnCommand());

    queue1.append(queue2);

    const world = new World();
    queue1.apply(world);

    expect(world.entities.len()).toBe(3);
    expect(queue2.isEmpty()).toBe(true);
  });

  test('command_queue_is_empty', () => {
    const queue = new CommandQueue();
    expect(queue.isEmpty()).toBe(true);

    queue.push(new SpawnCommand());
    expect(queue.isEmpty()).toBe(false);

    const world = new World();
    queue.apply(world);
    expect(queue.isEmpty()).toBe(true);
  });
});
