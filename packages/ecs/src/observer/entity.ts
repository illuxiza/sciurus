import { Default, derive, Vec } from 'rustable';
import { Component } from '../component';
import { ComponentCloneHandler } from '../component/clone_handler';
import { ComponentHooks } from '../component/hooks';
import { Entity } from '../entity';
import { StorageType } from '../storage';
import { DeferredWorld } from '../world/deferred';
import { ObserverState } from './runner';

@derive([Component, Default])
export class ObservedBy {
  constructor(public entities = Vec.new<Entity>()) {}

  static storageType() {
    return StorageType.SparseSet;
  }

  static registerComponentHooks(hooks: ComponentHooks): void {
    hooks.onRemove((world: DeferredWorld, entity: Entity) => {
      const observedBy = world.get<ObservedBy>(ObservedBy, entity).unwrap();
      const entities = observedBy.entities;
      observedBy.entities = Vec.new();

      for (const e of entities) {
        const entityMut = world.getEntity(e);
        if (entityMut.isErr()) continue;

        const state = entityMut.unwrap().getMut(ObserverState);
        if (state.isNone()) continue;

        state.unwrap().despawnedWatchedEntities += 1;
        const totalEntities = state.unwrap().descriptor.entities.length;
        const despawnedWatchedEntities = state.unwrap().despawnedWatchedEntities;

        if (totalEntities === despawnedWatchedEntities) {
          world.commands.entity(e).despawn();
        }
      }
    });
  }

  static getComponentCloneHandler(): ComponentCloneHandler {
    return ComponentCloneHandler.Ignore();
  }
}
