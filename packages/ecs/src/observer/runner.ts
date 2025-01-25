import { Constructor, implTrait, Ptr, useTrait, Vec } from 'rustable';
import { Bundle } from '../bundle/base';
import { Component, ComponentId } from '../component';
import { ComponentHook, ComponentHooks } from '../component/hooks';
import { Entity } from '../entity';
import { Event } from '../event';
import { StorageType } from '../storage';
import { IntoObserverSystem, ObserverSystem } from '../system/observer';
import { World } from '../world';
import { DeferredWorld } from '../world/deferred';
import { ObserverDescriptor, ObserverRunner, ObserverTrigger, Trigger } from './types';

export class ObserverState {
  descriptor: ObserverDescriptor;
  runner: ObserverRunner;
  lastTriggerId: number;
  despawnedWatchedEntities: number;

  constructor(
    runner: ObserverRunner = () => {},
    descriptor: ObserverDescriptor = new ObserverDescriptor(),
  ) {
    this.runner = runner;
    this.lastTriggerId = 0;
    this.despawnedWatchedEntities = 0;
    this.descriptor = descriptor;
  }

  withEvent(event: ComponentId): ObserverState {
    this.descriptor.events.push(event);
    return this;
  }

  withEvents(events: Iterable<ComponentId>): ObserverState {
    this.descriptor.events.extend(events);
    return this;
  }

  withEntities(entities: Iterable<Entity>): ObserverState {
    this.descriptor.entities.extend(entities);
    return this;
  }

  withComponents(components: Iterable<ComponentId>): ObserverState {
    this.descriptor.components.extend(components);
    return this;
  }
}

implTrait(ObserverState, Component, {
  static: {
    storageType(): StorageType {
      return StorageType.SparseSet;
    },

    registerComponentHooks(hooks: ComponentHooks): void {
      hooks.onAdd((world: DeferredWorld, entity: Entity) => {
        world.commands.queue((world: World) => {
          world.registerObserver(entity);
        });
      });

      hooks.onRemove((world: DeferredWorld, entity: Entity) => {
        const descriptor = world.entity(entity).get(ObserverState).unwrap().descriptor;
        world.commands.queue((world: World) => {
          world.unregisterObserver(entity, descriptor);
        });
      });
    },
  },
});

export class Observer {
  public system: any;
  public descriptor: ObserverDescriptor;
  public hookOnAdd: ComponentHook;

  constructor(eventType: Constructor, bundleType: any, system: any) {
    this.system = IntoObserverSystem.wrap(system).intoSystem();
    this.descriptor = new ObserverDescriptor();
    this.hookOnAdd = hookOnAdd(eventType, bundleType);
  }

  withEntity(entity: Entity): Observer {
    this.descriptor.entities.push(entity);
    return this;
  }

  watchEntity(entity: Entity): void {
    this.descriptor.entities.push(entity);
  }

  withComponent(component: ComponentId): Observer {
    this.descriptor.components.push(component);
    return this;
  }

  withEvent(event: ComponentId): Observer {
    this.descriptor.events.push(event);
    return this;
  }
}

implTrait(Observer, Component, {
  static: {
    storageType(): StorageType {
      return StorageType.SparseSet;
    },

    registerComponentHooks(hooks: ComponentHooks): void {
      hooks.onAdd((world: DeferredWorld, entity: Entity, id: ComponentId) => {
        const observe = world.get(Observer, entity);
        if (observe.isSome()) {
          observe.unwrap().hookOnAdd(world, entity, id);
        }
      });
    },
  },
});

function observerSystemRunner<E extends Event, B extends Bundle, S extends ObserverSystem<E, B>>(
  eventType: Constructor<E>,
  bundleType: Constructor<B>,
) {
  return function (
    world: DeferredWorld,
    observerTrigger: ObserverTrigger,
    ptr: any,
    propagate: Ptr<boolean>,
  ) {
    const worldCell = world.asWorldCell();
    const observerCell = worldCell.getEntity(observerTrigger.observer).unwrap();
    const state = observerCell.getMut(ObserverState).unwrap();

    const lastTrigger = worldCell.lastTriggerId();
    if (state.lastTriggerId === lastTrigger) {
      return;
    }
    state.lastTriggerId = lastTrigger;

    const trigger = new Trigger(ptr, propagate, observerTrigger, bundleType);
    const system = observerCell.getMut(Observer).unwrap().system as S;

    system.updateArchetypeComponentAccess(worldCell);
    if (system.validateParamUnsafe(worldCell)) {
      system.runUnsafe(trigger, worldCell);
      system.queueDeferred(world);
    }
  };
}

function hookOnAdd<E extends Event, B extends Bundle, S extends ObserverSystem<E, B>>(
  eventType: Constructor<E>,
  bundleType: Constructor<B>,
): ComponentHook {
  return (world: DeferredWorld, entity: Entity, _: ComponentId) => {
    world.commands.queue((world: World) => {
      const eventId = useTrait(eventType, Event).registerComponentId(world);
      const components = Vec.new<ComponentId>();
      useTrait(bundleType, Bundle).componentIds(
        world.components,
        world.storages,
        (id: ComponentId) => {
          components.push(id);
        },
      );
      const descriptor = new ObserverDescriptor(Vec.from([eventId]), Vec.from(components));

      // Initialize System
      let system: S;
      const observe = world.get(Observer, entity);
      if (observe.isSome()) {
        descriptor.merge(observe.unwrap().descriptor);
        system = observe.unwrap().system as S;
      } else {
        return;
      }

      // SAFETY: World reference is exclusive and initialize does not touch system, so references do not alias
      system.initialize(world);

      const entityMut = world.entity(entity);
      if (entityMut.entry(ObserverState).isVacant()) {
        entityMut.insert(
          new ObserverState(observerSystemRunner(eventType, bundleType), descriptor),
        );
      }
    });
  };
}
