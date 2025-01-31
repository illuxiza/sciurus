import { Constructor, None, Option, Ptr, Result, RustIter, Vec } from 'rustable';
import { Archetype } from '../archetype/base';
import { ComponentHook, ComponentHooks, ComponentId } from '../component';
import { Entity } from '../entity/base';
import { Observers } from '../observer/collection';
import { Traversal } from '../traversal';
import { World } from './base';
import { EntityWorld } from './entity_ref/world';
import { EntityFetchError, intoEntityFetch } from './entry_fetch';

export class DeferredWorld {
  constructor(public world: World) {}

  get commands() {
    return this.world.commands;
  }

  get observers() {
    return this.world.observers;
  }

  incrementTriggerId() {
    this.world._lastTriggerId += 1;
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

  private triggerHook(
    archetype: Archetype,
    entity: Entity,
    targets: RustIter<ComponentId>,
    hasHookFn: (arch: Archetype) => boolean,
    hookSelector: (hooks: ComponentHooks) => Option<ComponentHook>,
  ) {
    if (hasHookFn(archetype)) {
      for (const componentId of targets) {
        const hooks = this.world.components.getInfoUnchecked(componentId).hooks;
        hookSelector(hooks).map((hook) => hook(new DeferredWorld(this.world), entity, componentId));
      }
    }
  }

  triggerOnAdd(archetype: Archetype, entity: Entity, targets: RustIter<ComponentId>) {
    this.triggerHook(
      archetype,
      entity,
      targets,
      (arch) => arch.hasAddHook(),
      (hooks) => hooks.addHook,
    );
  }

  triggerOnInsert(archetype: Archetype, entity: Entity, targets: RustIter<ComponentId>) {
    this.triggerHook(
      archetype,
      entity,
      targets,
      (arch) => arch.hasInsertHook(),
      (hooks) => hooks.insertHook,
    );
  }

  triggerOnReplace(archetype: Archetype, entity: Entity, targets: RustIter<ComponentId>) {
    this.triggerHook(
      archetype,
      entity,
      targets,
      (arch) => arch.hasReplaceHook(),
      (hooks) => hooks.replaceHook,
    );
  }

  triggerOnRemove(archetype: Archetype, entity: Entity, targets: RustIter<ComponentId>) {
    this.triggerHook(
      archetype,
      entity,
      targets,
      (arch) => arch.hasRemoveHook(),
      (hooks) => hooks.removeHook,
    );
  }

  triggerOnDespawn(archetype: Archetype, entity: Entity, targets: RustIter<ComponentId>) {
    this.triggerHook(
      archetype,
      entity,
      targets,
      (arch) => arch.hasDespawnHook(),
      (hooks) => hooks.despawnHook,
    );
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
        .andThen((item) => Traversal.wrap(t).traverse(item, data));
      if (op.isSome()) {
        target = op.unwrap();
      } else {
        break;
      }
    }
  }
}
