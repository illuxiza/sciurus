import { getCaller, logger } from '@sciurus/utils';
import { Constructor, implTrait, iter, Result, trait } from 'rustable';
import { InsertMode } from '../../bundle/types';
import { Mut } from '../../change_detection/mut';
import { ComponentId } from '../../component';
import { type Entity } from '../../entity/base';
import { type World } from '../../world/base';
import { Command, commandFn } from '../../world/command_queue';
import { type EntityWorld } from '../../world/entity_ref/world';
import { FromWorld } from '../../world/from';
import { IntoObserverSystem } from '../observer';
import { type Commands } from './base';

/**
 * Commands for modifying a specific entity
 */
export class EntityCommands {
  entity: Entity;
  commands: Commands;

  constructor(entity: Entity, commands: Commands) {
    this.entity = entity;
    this.commands = commands;
  }

  /**
   * Gets the entity ID
   */
  id(): Entity {
    return this.entity;
  }

  queue(command: EntityCommand): this {
    this.commands.queue(command.withEntity(this.entity));
    return this;
  }

  entry<T extends object>(component: Constructor<T>): EntityEntryCommands<T> {
    return new EntityEntryCommands<T>(component, this);
  }

  /**
   * Inserts components into the entity
   */
  insert<T extends object>(bundle: T): EntityCommands {
    this.queue(insert(bundle, InsertMode.Replace));
    return this;
  }

  /**
   * Inserts a bundle of components into the entity if the condition is true.
   * @param bundle The bundle to insert
   * @param condition A function that returns true if the bundle should be inserted
   * @returns This EntityCommands instance for chaining
   */
  insertIf<T extends object>(bundle: T, condition: () => boolean): EntityCommands {
    if (condition()) {
      return this.insert(bundle);
    } else {
      return this;
    }
  }

  /**
   * Inserts components into the entity only if they don't already exist
   */
  insertIfNew<T extends object>(bundle: T): EntityCommands {
    this.queue(insert(bundle, InsertMode.Keep));
    return this;
  }

  insertIfNewAnd<T extends object>(bundle: T, condition: () => boolean): EntityCommands {
    if (condition()) {
      return this.insertIfNew(bundle);
    } else {
      return this;
    }
  }

  insertById<T extends object>(componentId: ComponentId, value: T): this {
    const c = getCaller();
    this.queue(
      entityCommandFn((entity: Entity, world: World) => {
        const entityMut = world.fetchEntityMut(entity) as Result<EntityWorld, Error>;
        if (entityMut.isOk()) {
          entityMut.unwrap().insertById(componentId, value);
        } else {
          throw new Error(
            `error[B0003]: ${c}: Could not insert a component ${componentId} (with type ${typeof value}) for entity ${entity}, which does not exist.`,
          );
        }
      }),
    );
    return this;
  }

  tryInsertById<T extends object>(componentId: ComponentId, value: T): this {
    this.queue(
      entityCommandFn((entity: Entity, world: World) => {
        const entityMut = world.fetchEntityMut(entity) as Result<EntityWorld, Error>;
        if (entityMut.isOk()) {
          entityMut.unwrap().insertById(componentId, value);
        }
      }),
    );
    return this;
  }

  tryInsert<T extends object>(bundle: T): this {
    this.queue(tryInsert(bundle, InsertMode.Replace));
    return this;
  }

  tryInsertIf<T extends object, F extends () => boolean>(bundle: T, condition: F): this {
    if (condition()) {
      return this.tryInsert(bundle);
    } else {
      return this;
    }
  }

  tryInsertIfNewAnd<T extends object, F extends () => boolean>(bundle: T, condition: F): this {
    if (condition()) {
      return this.tryInsertIfNew(bundle);
    } else {
      return this;
    }
  }

  tryInsertIfNew<T extends object>(bundle: T): this {
    this.queue(tryInsert(bundle, InsertMode.Keep));
    return this;
  }

  remove<T extends any>(bundle: T): this {
    this.queue(
      entityCommandFn((entity: Entity, world: World) => {
        const entityMut = world.fetchEntityMut(entity);
        if (entityMut.isOk()) {
          entityMut.unwrap().remove(bundle);
        }
      }),
    );
    return this;
  }

  removeWithRequires<T extends Constructor>(bundle: T): this {
    this.queue(
      entityCommandFn((entity: Entity, world: World) => {
        const entityMut = world.fetchEntityMut(entity);
        if (entityMut.isOk()) {
          entityMut.unwrap().removeWithRequires(bundle);
        }
      }),
    );
    return this;
  }

  removeById(componentId: ComponentId): this {
    this.queue(
      entityCommandFn((entity: Entity, world: World) => {
        const entityMut = world.fetchEntityMut(entity);
        if (entityMut.isOk()) {
          entityMut.unwrap().removeById(componentId);
        }
      }),
    );
    return this;
  }
  clear(): this {
    this.queue(
      entityCommandFn((entity: Entity, world: World) => {
        const entityMut = world.fetchEntityMut(entity);
        if (entityMut.isOk()) {
          entityMut.unwrap().clear();
        }
      }),
    );
    return this;
  }
  despawn(): this {
    this.queue(despawn(true));
    return this;
  }
  tryDespawn(): this {
    this.queue(despawn(false));
    return this;
  }
  retain<T extends Constructor>(bundle: T): this {
    this.queue(
      entityCommandFn((entity: Entity, world: World) => {
        const entityMut = world.fetchEntityMut(entity);
        if (entityMut.isOk()) {
          entityMut.unwrap().retain(bundle);
        }
      }),
    );
    return this;
  }
  logComponents(): this {
    this.queue(
      entityCommandFn((entity: Entity, world: World) => {
        const debugInfos = iter(world.inspectEntity(entity)).map((info) => info.name);
        logger.info(`Entity ${entity}: ${JSON.stringify(debugInfos)}`);
      }),
    );
    return this;
  }

  trigger<E extends Event>(event: E): this {
    this.commands.triggerTargets(event, this.entity);
    return this;
  }

  observe(observer: IntoObserverSystem): this {
    this.queue(
      entityCommandFn((entity: Entity, world: World) => {
        const entityMut = world.fetchEntityMut(entity);
        if (entityMut.isOk()) {
          entityMut.unwrap().observe(observer);
        }
      }),
    );
    return this;
  }

  moveComponents(target: Entity): this {
    this.queue(
      entityCommandFn((entity: Entity, world: World) => {
        const entityMut = world.fetchEntityMut(entity);
        if (entityMut.isOk()) {
          entityMut.unwrap().moveComponents(target);
        }
      }),
    );
    return this;
  }
}

@trait
export class EntityCommand {
  apply(_entity: Entity, _world: World): void {
    throw new Error('EntityCommand.apply must be implemented');
  }
  withEntity(entity: Entity): Command {
    return commandFn((world: World) => this.apply(entity, world));
  }
}

class EntityWorldFunctionCommand {
  constructor(public fn: (entity: EntityWorld) => void) {}
  apply(entity: Entity, world: World): void {
    this.fn(world.entity(entity));
  }
}

interface EntityWorldFunctionCommand extends EntityCommand {}

implTrait(EntityWorldFunctionCommand, EntityCommand);

export const entityWorldCommandFn = (command: (entity: EntityWorld) => void) => {
  return new EntityWorldFunctionCommand(command);
};

class EntityFunctionCommand {
  constructor(public fn: (entity: Entity, world: World) => void) {}
  apply(entity: Entity, world: World): void {
    this.fn(entity, world);
  }
}

interface EntityFunctionCommand extends EntityCommand {}

export const entityCommandFn = (command: (entity: Entity, world: World) => void) => {
  return new EntityFunctionCommand(command);
};

implTrait(EntityFunctionCommand, EntityCommand);

export class EntityEntryCommands<T extends object> {
  private entityCommands: EntityCommands;
  private marker: Constructor<T>;

  constructor(marker: Constructor<T>, entityCommands: EntityCommands) {
    this.entityCommands = entityCommands;
    this.marker = marker;
  }

  andModify(modify: (value: Mut<T>) => void): this {
    this.entityCommands.commands.queue(
      commandFn((world: World) => {
        const entity = world.entity(this.entityCommands.entity);
        const value = entity.getMut(this.marker);
        if (value.isSome()) {
          modify(value.unwrap());
        }
      }),
    );
    return this;
  }

  orInsert(def: T): this {
    this.entityCommands.insertIfNew(def);
    return this;
  }

  orTryInsert(def: T): this {
    this.entityCommands.tryInsertIfNew(def);
    return this;
  }

  orInsertWith(defaultFn: () => T): this {
    return this.orInsert(defaultFn());
  }

  orTryInsertWith(defaultFn: () => T): this {
    return this.orTryInsert(defaultFn());
  }

  orDefault(): this {
    return this.orInsert(new this.marker());
  }

  orFromWorld(): this {
    this.entityCommands.commands.queue(
      commandFn((world: World) => {
        const value = FromWorld.staticWrap(this.marker).fromWorld(world);
        const entity = world.entity(this.entityCommands.entity);
        entity.insert(value);
      }),
    );
    return this;
  }
}
function despawn(logWarning: boolean): EntityCommand {
  const caller = getCaller(1);
  return entityCommandFn((entity: Entity, world: World) => {
    world['despawnWithCaller'](entity, caller, logWarning);
  });
}

function insert<T extends object>(bundle: T, mode: InsertMode): EntityCommand {
  const c = getCaller(1);
  return entityCommandFn((entity: Entity, world: World) => {
    const entityRef = world.fetchEntityMut(entity) as Result<EntityWorld, Error>;
    if (entityRef.isOk()) {
      entityRef.unwrap().insertWithCaller(bundle, mode, c);
    } else {
      throw new Error(
        `error[B0003]: ${c}: Could not insert a bundle (of type \`${typeof bundle}\`) for entity ${entity}, which does not exist.`,
      );
    }
  });
}

function tryInsert<T extends object>(bundle: T, mode: InsertMode): EntityCommand {
  const c = getCaller(1);
  return entityCommandFn((entity: Entity, world: World) => {
    const entityRef = world.fetchEntityMut(entity) as Result<EntityWorld, Error>;
    if (entityRef.isOk()) {
      entityRef.unwrap().insertWithCaller(bundle, mode, c);
    }
  });
}
