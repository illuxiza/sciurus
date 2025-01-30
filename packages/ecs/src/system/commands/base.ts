import { logger } from '@sciurus/utils';
import { Constructor, Default, derive, Location, None, Option, Some } from 'rustable';
import { InsertMode } from '../../bundle/types';
import { Resource } from '../../component';
import { Entity } from '../../entity/base';
import { Entities } from '../../entity/collection';
import { Events } from '../../event';
import { Observer } from '../../observer/runner';
import { World } from '../../world/base';
import { Command, commandFn, CommandQueue } from '../../world/command_queue';
import { SpawnBatchIter } from '../../world/spawn_batch';
import { IntoSystem } from '../into';
import { IntoObserverSystem } from '../observer';
import { IntoSystemParam, SystemParam } from '../param/base';
import { Deferred } from '../param/deferred';
import { RegisteredSystem, SystemId } from '../registry';
import { EntityCommands } from './entity';

@derive([SystemParam])
class CommandsSystemParam {
  getOptions() {
    return {
      commandQueue: Deferred(CommandQueue),
      entities: Entities,
    };
  }

  static getTargetType() {
    return Commands;
  }
}

interface CommandsSystemParam extends SystemParam<void, Commands> {}

/**
 * Commands provide a way to queue up changes to the World that will be applied at a later point.
 */
@derive([Default])
export class Commands {
  private commandQueue: CommandQueue;
  private entities: Entities;

  /**
   * Creates a new Commands instance from a CommandQueue and World
   */
  static new(commandQueue: CommandQueue, world: World): Commands {
    return new Commands(commandQueue, world.entities);
  }

  /**
   * Creates a new Commands instance from a CommandQueue and Entities
   */
  constructor(commandQueue: CommandQueue, entities: Entities) {
    this.commandQueue = commandQueue;
    this.entities = entities;
  }

  /**
   * Take all commands from other and append them to self
   */
  append(other: CommandQueue): void {
    this.commandQueue.append(other);
  }

  /**
   * Spawns a new empty entity and returns its EntityCommands
   */
  spawnEmpty(): EntityCommands {
    const entity = this.entities.reserveEntity();
    return new EntityCommands(entity, this);
  }

  /**
   * Gets EntityCommands for an existing entity, or spawns a new one if it doesn't exist
   */
  getOrSpawn(entity: Entity, caller?: string): EntityCommands {
    this.queue(
      commandFn((world: World) => {
        world.getOrSpawn(entity, caller || new Location().caller()!.name);
      }),
    );
    return new EntityCommands(entity, this);
  }

  /**
   * Spawns a new entity with the given components
   */
  spawn<T extends object>(components: T): EntityCommands {
    const entity = this.spawnEmpty();
    entity.insert(components);
    return entity;
  }

  /**
   * Gets EntityCommands for an existing entity
   */
  entity(entity: Entity): EntityCommands {
    if (this.getEntity(entity).isSome()) {
      return new EntityCommands(entity, this);
    }
    throw new Error(`Entity ${entity} does not exist`);
  }

  /**
   * Gets EntityCommands for an existing entity if it exists
   */
  getEntity(entity: Entity): Option<EntityCommands> {
    return this.entities.contains(entity) ? Some(new EntityCommands(entity, this)) : None;
  }

  /**
   * Spawns multiple entities with components
   */
  spawnBatch<T extends object>(components: IterableIterator<T>): void {
    this.queue(
      commandFn((world: World) => {
        SpawnBatchIter.new(world, components, new Location().caller(1)!.name).flush();
      }),
    );
  }

  /**
   * Queues a command to be executed later
   */
  queue<C extends Command>(command: C): void {
    if (typeof command === 'function') {
      this.commandQueue.push(commandFn(command));
    } else {
      this.commandQueue.push(command);
    }
  }

  /**
   * Inserts or spawns a batch of entities with bundles
   */
  insertOrSpawnBatch<I extends IterableIterator<[Entity, B]>, B extends object>(
    bundlesIter: I,
    caller?: string,
  ): void {
    this.queue(
      commandFn((world: World) => {
        const result = world.insertOrSpawnBatch(bundlesIter, caller);
        if (result.isErr()) {
          const invalidEntities = result.unwrapErr();
          logger.error(
            `Failed to 'insert or spawn' bundle into the following invalid entities: ${JSON.stringify(invalidEntities)}`,
          );
        }
      }),
    );
  }

  /**
   * Inserts a batch of entities with bundles
   */
  insertBatch<I extends IterableIterator<[Entity, B]>, B extends object>(
    batch: I,
    caller?: string,
  ): void {
    this.queue(insertBatch(batch, InsertMode.Replace, caller));
  }

  /**
   * Inserts a batch of entities with bundles if they don't already exist
   */
  insertBatchIfNew<I extends IterableIterator<[Entity, B]>, B extends object>(
    batch: I,
    caller?: string,
  ): void {
    this.queue(insertBatch(batch, InsertMode.Keep, caller));
  }

  tryInsertBatch<I extends IterableIterator<[Entity, B]>, B extends object>(
    batch: I,
    caller?: string,
  ): void {
    this.queue(tryInsertBatch(batch, InsertMode.Replace, caller));
  }

  tryInsertBatchIfNew<I extends IterableIterator<[Entity, B]>, B extends object>(
    batch: I,
    caller?: string,
  ): void {
    this.queue(tryInsertBatch(batch, InsertMode.Keep, caller));
  }

  /**
   * Initializes a resource of type R
   */
  initResource<R extends Resource>(resource: Constructor<R>): void {
    this.commandQueue.push(
      commandFn((world: World) => {
        world.initResource(resource);
      }),
    );
  }

  /**
   * Inserts a resource into the World
   */
  insertResource<R extends Resource>(resource: R, caller?: string): void {
    this.commandQueue.push(
      commandFn((world: World) => {
        world.insertResource(resource, caller);
      }),
    );
  }

  /**
   * Removes a resource from the World
   */
  removeResource<R extends Resource>(resource: Constructor<R>): void {
    this.commandQueue.push(
      commandFn((world: World) => {
        world.removeResource(resource);
      }),
    );
  }

  runSystem(id: SystemId): void {
    this.queue((world: World) => {
      try {
        world.runSystemWith(id, undefined);
      } catch (error) {
        logger.warn(`Error running system: ${error}`);
      }
    });
  }

  runSystemWith(id: SystemId, input: any): void {
    this.queue((world: World) => {
      try {
        world.runSystemWith(id, input);
      } catch (error) {
        logger.warn(`${error}`);
      }
    });
  }

  registerSystem<I, O>(system: IntoSystem<I, O>): SystemId<I, O> {
    const entity = this.spawnEmpty().id();
    const registeredSystem = new RegisteredSystem(system.intoSystem());
    this.queue((world: World) => {
      const entityMut = world.fetchEntityMut(entity);
      if (entityMut.isOk()) {
        entityMut.unwrap().insert(registeredSystem);
      }
    });
    return new SystemId(entity);
  }

  unregisterSystem(systemId: SystemId): void {
    this.queue((world: World) => {
      try {
        world.unregisterSystem(systemId);
      } catch (error) {
        logger.warn(`${error}`);
      }
    });
  }

  unregisterSystemCached(system: IntoSystem): void {
    this.queue((world: World) => {
      try {
        world.unregisterSystemCached(system);
      } catch (error) {
        logger.warn(`${error}`);
      }
    });
  }

  runSystemCached(system: IntoSystem): void {
    this.runSystemCachedWith(system, undefined);
  }

  runSystemCachedWith(system: IntoSystem, input: any): void {
    this.queue((world: World) => {
      try {
        world.runSystemCachedWith(system, input);
      } catch (error) {
        logger.warn(`${error}`);
      }
    });
  }

  trigger<E extends Event>(event: E): void {
    this.queue((world: World) => {
      world.trigger(event);
    });
  }

  triggerTargets<E extends Event, T extends object>(event: E, targets: T): void {
    this.queue((world: World) => {
      world.triggerTargets(event, targets);
    });
  }

  addObserver<E extends object, B extends object>(
    eventType: Constructor<E>,
    bundleType: Constructor<B>,
    observer: IntoObserverSystem,
  ): EntityCommands {
    return this.spawn(new Observer(eventType, bundleType, observer));
  }

  sendEvent<E extends object>(event: E): this {
    this.queue((world: World) => {
      const events = world.resource(Events(event.constructor as Constructor));
      events.send(event);
    });
    return this;
  }

  runSchedule(label: any): void {
    this.queue((world: World) => {
      const ret = world.tryRunSchedule(label);
      if (ret.isErr()) {
        throw new Error(`Failed to run schedule: ${ret.unwrapErr()}`);
      }
    });
  }
}

IntoSystemParam.implFor(Commands, {
  static: {
    intoSystemParam(): CommandsSystemParam {
      return new CommandsSystemParam();
    },
  },
});

export interface Commands extends IntoSystemParam<Commands> {}

function insertBatch<I extends IterableIterator<[Entity, B]>, B extends object>(
  batch: I,
  mode: InsertMode,
  caller?: string,
): Command {
  return commandFn((world: World) => {
    world.insertBatchWithCaller(batch, mode, caller);
  });
}

function tryInsertBatch<I extends IterableIterator<[Entity, B]>, B extends object>(
  batch: I,
  mode: InsertMode,
  caller?: string,
): Command {
  return commandFn((world: World) => {
    world.tryInsertBatchWithCaller(batch, mode, caller);
  });
}
