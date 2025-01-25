import { Constructor, None, Option, Ptr, Result, RustIter, useTrait, Vec } from 'rustable';
import { Archetype } from '../archetype/base';
import { ComponentId } from '../component/types';
import { Entity } from '../entity/base';
import { Observers } from '../observer/collection';
import { Traversal } from '../traversal';
import { WorldCell } from './cell';
import { EntityWorld } from './entity_ref/world';
import { EntityFetchError, intoEntityFetch } from './entry_fetch';

export class DeferredWorld {
  constructor(public world: WorldCell) {}

  get commands() {
    return this.world.commands;
  }

  resource<R extends object>(R: Constructor<R>): R {
    return this.getResource(R).expect(`Resource ${R.name} does not exist`);
  }

  getResource<R extends object>(R: Constructor<R>): Option<R> {
    return this.world.getResource(R);
  }

  getEntity(entities: any): Result<any, EntityFetchError> {
    const cell = this.world;

    // SAFETY: `this` gives read access to the entire world, and prevents mutable access.
    return intoEntityFetch(entities).fetchRef(cell);
  }

  get<R>(type: Constructor<R>, entity: Entity): Option<R> {
    const r = this.getEntity(entity);
    if (r.isErr()) {
      return None;
    }
    return r.unwrap().get(type);
  }

  entity(entity: Entity): EntityWorld {
    return this.getEntity(entity).unwrap();
  }

  asWorldCell() {
    return this.world;
  }

  triggerOnAdd(archetype: Archetype, entity: Entity, targets: RustIter<ComponentId>) {
    if (archetype.hasAddHook()) {
      for (const componentId of targets) {
        const hooks = this.world.components.getInfoUnchecked(componentId).hooks;
        hooks.onAddHook.map((hook) => hook(new DeferredWorld(this.world), entity, componentId));
      }
    }
  }

  triggerOnInsert(archetype: Archetype, entity: Entity, targets: RustIter<ComponentId>) {
    if (archetype.hasInsertHook()) {
      for (const componentId of targets) {
        const hooks = this.world.components.getInfoUnchecked(componentId).hooks;
        hooks.onInsertHook.map((hook) => hook(new DeferredWorld(this.world), entity, componentId));
      }
    }
  }

  triggerOnReplace(archetype: Archetype, entity: Entity, targets: RustIter<ComponentId>) {
    if (archetype.hasReplaceHook()) {
      for (const componentId of targets) {
        const hooks = this.world.components.getInfoUnchecked(componentId).hooks;
        hooks.onReplaceHook.map((hook) => hook(new DeferredWorld(this.world), entity, componentId));
      }
    }
  }

  triggerOnRemove(archetype: Archetype, entity: Entity, targets: RustIter<ComponentId>) {
    if (archetype.hasRemoveHook()) {
      for (const componentId of targets) {
        const hooks = this.world.components.getInfoUnchecked(componentId).hooks;
        hooks.onRemoveHook.map((hook) => hook(new DeferredWorld(this.world), entity, componentId));
      }
    }
  }

  triggerOnDespawn(archetype: Archetype, entity: Entity, targets: RustIter<ComponentId>) {
    if (archetype.hasDespawnHook()) {
      for (const componentId of targets) {
        const hooks = this.world.components.getInfoUnchecked(componentId).hooks;
        hooks.onDespawnHook.map((hook) => hook(new DeferredWorld(this.world), entity, componentId));
      }
    }
  }

  triggerObservers(event: ComponentId, target: Entity, components: RustIter<ComponentId>): void {
    let p = false;
    Observers.invoke<void>(
      this,
      event,
      target,
      Vec.from(components),
      undefined,
      Ptr({
        get: () => p,
        set: (v) => {
          p = v;
        },
      }),
    );
  }

  triggerObserversWithData<E, T extends object>(
    t: Constructor<T>,
    event: ComponentId,
    target: Entity,
    components: Vec<ComponentId>,
    data: E,
    propagate: boolean,
  ): void {
    while (true) {
      Observers.invoke<E>(
        this,
        event,
        target,
        components,
        data,
        Ptr({
          get: () => propagate,
          set: (p) => {
            propagate = p;
          },
        }),
      );
      if (!propagate) {
        break;
      }
      const op = this.getEntity(target)
        .ok()
        .andThen((entity: EntityWorld) => entity.getComponents(t))
        .andThen((item) => useTrait(t, Traversal).traverse(item, data));
      if (op.isSome()) {
        target = op.unwrap();
      } else {
        break;
      }
    }
  }
}
