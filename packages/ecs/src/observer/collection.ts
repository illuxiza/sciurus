import { HashMap, None, Option, Ptr, Some, Vec } from 'rustable';
import { ArchetypeFlags } from '../archetype';
import { type ComponentId } from '../component';
import { Entity } from '../entity/base';
import { ON_ADD, ON_DESPAWN, ON_INSERT, ON_REMOVE, ON_REPLACE } from '../world/component_constants';
import { DeferredWorld } from '../world/deferred';
import { CachedObservers, ObserverRunner, ObserverTrigger } from './types';

export class Observers {
  constructor(
    // Cached ECS observers to save a lookup most common triggers.
    public onAdd: CachedObservers = new CachedObservers(),
    public onInsert: CachedObservers = new CachedObservers(),
    public onReplace: CachedObservers = new CachedObservers(),
    public onRemove: CachedObservers = new CachedObservers(),
    public onDespawn: CachedObservers = new CachedObservers(),
    // Map from trigger type to set of observers
    public cache: HashMap<ComponentId, CachedObservers> = new HashMap(),
  ) {}

  getObservers(eventType: ComponentId): CachedObservers {
    switch (eventType) {
      case ON_ADD:
        return this.onAdd;
      case ON_INSERT:
        return this.onInsert;
      case ON_REPLACE:
        return this.onReplace;
      case ON_REMOVE:
        return this.onRemove;
      case ON_DESPAWN:
        return this.onDespawn;
      default:
        return this.cache.get(eventType).unwrapOrElse(() => {
          const observers = new CachedObservers();
          this.cache.insert(eventType, observers);
          return observers;
        });
    }
  }

  tryGetObservers(eventType: ComponentId): Option<CachedObservers> {
    switch (eventType) {
      case ON_ADD:
        return Some(this.onAdd);
      case ON_INSERT:
        return Some(this.onInsert);
      case ON_REPLACE:
        return Some(this.onReplace);
      case ON_REMOVE:
        return Some(this.onRemove);
      case ON_DESPAWN:
        return Some(this.onDespawn);
      default:
        return this.cache.get(eventType);
    }
  }

  static invoke<T>(
    world: DeferredWorld,
    eventType: ComponentId,
    target: Entity,
    components: Vec<ComponentId>,
    data: T,
    propagate: Ptr<boolean>,
  ): void {
    world.incrementTriggerId();
    const observersSource = world.observers;

    const observersOp = observersSource.tryGetObservers(eventType);
    if (observersOp.isNone()) {
      return;
    }
    const observers = observersOp.unwrap();

    const triggerForComponents = components;
    const triggerObserver = ([observer, runner]: [Entity, ObserverRunner]) => {
      runner(
        world,
        new ObserverTrigger(observer, eventType, Vec.from([...components]), target),
        data,
        propagate,
      );
    };

    // Trigger observers listening for any kind of this trigger
    observers.map.iter().forEach(triggerObserver);

    // Trigger entity observers listening for this kind of trigger
    if (target !== Entity.PLACEHOLDER) {
      const map = observers.entityObservers.get(target);
      if (map.isSome()) {
        map.unwrap().iter().forEach(triggerObserver);
      }
    }

    // Trigger observers listening to this trigger targeting a specific component
    triggerForComponents.iter().forEach((id) => {
      const componentObservers = observers.componentObservers.get(id);
      if (componentObservers.isSome()) {
        componentObservers.unwrap().map.iter().forEach(triggerObserver);
        if (target !== Entity.PLACEHOLDER) {
          const map = componentObservers.unwrap().entityMap.get(target);
          if (map.isSome()) {
            map.unwrap().iter().forEach(triggerObserver);
          }
        }
      }
    });
  }

  static isArchetypeCached(eventType: ComponentId): Option<ArchetypeFlags> {
    switch (eventType) {
      case ON_ADD:
        return Some(ArchetypeFlags.ON_ADD_OBSERVER);
      case ON_INSERT:
        return Some(ArchetypeFlags.ON_INSERT_OBSERVER);
      case ON_REPLACE:
        return Some(ArchetypeFlags.ON_REPLACE_OBSERVER);
      case ON_REMOVE:
        return Some(ArchetypeFlags.ON_REMOVE_OBSERVER);
      case ON_DESPAWN:
        return Some(ArchetypeFlags.ON_DESPAWN_OBSERVER);
      default:
        return None;
    }
  }

  updateArchetypeFlags(componentId: ComponentId, flags: ArchetypeFlags): void {
    if (this.onAdd.componentObservers.containsKey(componentId)) {
      flags.insert(ArchetypeFlags.ON_ADD_OBSERVER);
    }
    if (this.onInsert.componentObservers.containsKey(componentId)) {
      flags.insert(ArchetypeFlags.ON_INSERT_OBSERVER);
    }
    if (this.onReplace.componentObservers.containsKey(componentId)) {
      flags.insert(ArchetypeFlags.ON_REPLACE_OBSERVER);
    }
    if (this.onRemove.componentObservers.containsKey(componentId)) {
      flags.insert(ArchetypeFlags.ON_REMOVE_OBSERVER);
    }
    if (this.onDespawn.componentObservers.containsKey(componentId)) {
      flags.insert(ArchetypeFlags.ON_DESPAWN_OBSERVER);
    }
  }
}
