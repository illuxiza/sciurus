import { implTrait, iter, Option, Ptr, Vec } from 'rustable';
import { Bundle, BundleInserter, DynamicBundle, InsertMode } from '../../bundle';
import { ComponentTicks } from '../../change_detection';
import { ComponentId, Components } from '../../component';
import { EntityLocation } from '../../entity';
import { Entity } from '../../entity/base';
import { RemovedComponentEvents } from '../../removal_detection';
import { Storages, StorageType } from '../../storage';
import { World } from '../base';

export function insertDynamicBundle<T>(
  bundleInserter: BundleInserter,
  entity: Entity,
  location: EntityLocation,
  components: Iterable<T>,
  storageTypes: Iterable<StorageType>,
  caller?: string,
): EntityLocation {
  class DynamicInsertBundle {
    components: Vec<[StorageType, T]>;

    constructor(components: Vec<[StorageType, T]>) {
      this.components = components;
    }
  }

  implTrait(DynamicInsertBundle, DynamicBundle, {
    getComponents(
      this: DynamicInsertBundle,
      func: (storageType: StorageType, component: T) => void,
    ): void {
      this.components.iter().forEach(([storageType, component]) => func(storageType, component));
    },
  });
  implTrait(DynamicInsertBundle, Bundle);

  const bundle = new DynamicInsertBundle(
    iter(storageTypes)
      .zip(iter(components))
      .collectInto((v) => Vec.from(v)),
  );

  return bundleInserter.insert(entity, location, bundle, InsertMode.Replace, caller);
}

export function takeComponent(
  storages: Storages,
  components: Components,
  removedComponents: RemovedComponentEvents,
  componentId: ComponentId,
  entity: Entity,
  location: EntityLocation,
) {
  const componentInfo = components.getInfoUnchecked(componentId);
  removedComponents.send(componentId, entity);
  if (componentInfo.storageType === StorageType.Table) {
    const table = storages.tables.getUnchecked(location.tableId);
    return table.takeComponent(componentId, location.tableRow);
  } else {
    return storages.sparseSets.get(componentId).unwrap().removeAndForget(entity).unwrap();
  }
}

export function getComponent<T>(
  world: World,
  componentId: ComponentId,
  storageType: StorageType,
  entity: Entity,
  location: EntityLocation,
): Option<T> {
  if (storageType === StorageType.Table) {
    const table = world.fetchTable(location);
    return table.andThen((t) => t.getComponent(componentId, location.tableRow).map((c) => c as T));
  } else {
    return world.fetchSparseSet(componentId).andThen((s) => s.get(entity));
  }
}

export function getComponentAndTicks(
  world: World,
  componentId: ComponentId,
  storageType: StorageType,
  entity: Entity,
  location: EntityLocation,
): Option<[Ptr<any>, ComponentTicks, Ptr<string>]> {
  if (storageType === StorageType.Table) {
    const table = world.fetchTable(location);
    return table.andThen((t) => {
      const component = t.getComponent(componentId, location.tableRow);
      return component.map((c) => [
        c,
        ComponentTicks.new(
          t.getAddedTick(componentId, location.tableRow).unwrap(),
          t.getChangedTick(componentId, location.tableRow).unwrap(),
        ),
        t.getChangedByMut(componentId, location.tableRow).unwrap(),
      ]);
    });
  } else {
    return world.fetchSparseSet(componentId).andThen((s) => s.getWithTicks(entity));
  }
}

export function getTicks(
  world: World,
  componentId: ComponentId,
  storageType: StorageType,
  entity: Entity,
  location: EntityLocation,
): Option<ComponentTicks> {
  if (storageType === StorageType.Table) {
    const table = world.fetchTable(location);
    return table.andThen((t) => t.getTicksUnchecked(componentId, location.tableRow));
  } else {
    return world.fetchSparseSet(componentId).andThen((s) => s.getTicks(entity));
  }
}
