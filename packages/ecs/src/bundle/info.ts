import { HashSet, None, Option, RustIter, Some, useTrait, Vec } from 'rustable';
import { Archetypes } from '../archetype/collection';
import { ArchetypeId, BundleComponentStatus, ComponentStatus } from '../archetype/types';
import { Tick } from '../change_detection/tick';
import { Components } from '../component/collection';
import { RequiredComponentConstructor, RequiredComponents } from '../component/required_components';
import { ComponentId } from '../component/types';
import { Entity } from '../entity/base';
import { Observers } from '../observer/collection';
import { SparseSets, Storages, StorageType, Table, TableId, TableRow } from '../storage';
import { DynamicBundle } from './base';
import { BundleId, InsertMode } from './types';

export class BundleInfo {
  constructor(
    public id: BundleId,
    public componentIds: Vec<ComponentId>,
    public requiredComponents: Vec<RequiredComponentConstructor>,
    public explicitComponentsLen: number,
  ) {}

  static new(
    bundleTypeName: string,
    components: Components,
    componentIds: Vec<ComponentId>,
    id: BundleId,
  ) {
    const deduped = componentIds.iter().sort().dedup().collect();

    if (deduped.length !== componentIds.len()) {
      const seen = new HashSet();
      const dups = Vec.new<ComponentId>();
      for (let id of componentIds) {
        if (!seen.insert(id)) {
          dups.push(id);
        }
      }
      const names = dups
        .iter()
        .map((id) => components.getInfoUnchecked(id).name)
        .collect()
        .join(', ');
      throw new Error(`Bundle ${bundleTypeName} has duplicate components: ${names}`);
    }
    let explicitComponentsLen = componentIds.len();
    let requiredComponents = new RequiredComponents();
    for (const componentId of componentIds) {
      const info = components.getInfoUnchecked(componentId);
      requiredComponents.merge(info.requiredComponents);
    }
    requiredComponents.removeExplicitComponents(componentIds);
    const requiredComponentConstructors = requiredComponents.components
      .iter()
      .map(([componentId, v]) => {
        componentIds.push(componentId);
        return v.__constructor;
      })
      .collectInto((value) => Vec.from(value));

    return new BundleInfo(id, componentIds, requiredComponentConstructors, explicitComponentsLen);
  }

  explicitComponentIds(): ComponentId[] {
    return this.componentIds.slice(0, this.explicitComponentsLen);
  }

  requiredComponentIds(): ComponentId[] {
    return this.componentIds.slice(this.explicitComponentsLen);
  }

  contributedComponents(): ComponentId[] {
    return this.componentIds.asSlice();
  }

  iterExplicitComponents(): RustIter<ComponentId> {
    return this.explicitComponentIds().iter().cloned();
  }

  iterContributedComponents(): RustIter<ComponentId> {
    return this.componentIds.iter().cloned();
  }

  iterRequiredComponents(): RustIter<ComponentId> {
    return this.requiredComponentIds().iter().cloned();
  }

  writeComponents<T extends object, S extends BundleComponentStatus>(
    table: Table,
    sparseSets: SparseSets,
    bundleComponentStatus: S,
    requiredComponents: Iterable<RequiredComponentConstructor>,
    entity: Entity,
    tableRow: TableRow,
    changeTick: Tick,
    bundle: T,
    insertMode: InsertMode,
    caller?: string,
  ): void {
    let bundleComponent = 0;
    useTrait(bundle, DynamicBundle).getComponents((storageType, componentPtr) => {
      const componentId = this.componentIds[bundleComponent];
      switch (storageType) {
        case StorageType.Table: {
          const status = bundleComponentStatus.getStatus(bundleComponent);
          const column = table.getColumnUnchecked(componentId)!;
          switch (status) {
            case ComponentStatus.Added:
              column.initialize(tableRow, componentPtr, changeTick, caller);
              break;
            case ComponentStatus.Existing:
              if (insertMode === InsertMode.Replace) {
                column.replace(tableRow, componentPtr, changeTick, caller);
              } else if (insertMode === InsertMode.Keep) {
                const dropFn = table.getDropFor(componentId);
                dropFn.map((fn) => fn(componentPtr));
              }
              break;
          }
          break;
        }
        case StorageType.SparseSet: {
          const sparseSet = sparseSets.get(componentId).unwrap();
          sparseSet.insert(entity, componentPtr, changeTick, caller);
          break;
        }
      }
      bundleComponent++;
    });

    for (const requiredComponent of requiredComponents) {
      requiredComponent(table, sparseSets, changeTick, tableRow, entity, caller);
    }
  }

  public insertBundleIntoArchetype(
    archetypes: Archetypes,
    storages: Storages,
    components: Components,
    observers: Observers,
    archetypeId: ArchetypeId,
  ): ArchetypeId {
    const currentArchetype = archetypes.getUnchecked(archetypeId);
    const existingArchetypeId = currentArchetype.edges.getArchetypeAfterBundleInsert(this.id);
    if (existingArchetypeId.isSome()) {
      return existingArchetypeId.unwrap();
    }

    let newTableComponents = Vec.new<ComponentId>();
    let newSparseSetComponents = Vec.new<ComponentId>();
    const bundleStatus = Vec.new<ComponentStatus>();
    const addedRequiredComponents = Vec.new<RequiredComponentConstructor>();
    const added = Vec.new<ComponentId>();
    const existing = Vec.new<ComponentId>();

    for (const componentId of this.iterExplicitComponents()) {
      if (currentArchetype.contains(componentId)) {
        bundleStatus.push(ComponentStatus.Existing);
        existing.push(componentId);
      } else {
        bundleStatus.push(ComponentStatus.Added);
        added.push(componentId);
        const componentInfo = components.getInfoUnchecked(componentId);
        if (componentInfo.storageType === StorageType.Table) {
          newTableComponents.push(componentId);
        } else {
          newSparseSetComponents.push(componentId);
        }
      }
    }

    for (const [index, componentId] of this.iterRequiredComponents().enumerate()) {
      if (!currentArchetype.contains(componentId)) {
        addedRequiredComponents.push(this.requiredComponents[index]);
        added.push(componentId);
        const componentInfo = components.getInfoUnchecked(componentId);
        if (componentInfo.storageType === StorageType.Table) {
          newTableComponents.push(componentId);
        } else {
          newSparseSetComponents.push(componentId);
        }
      }
    }

    if (newTableComponents.isEmpty() && newSparseSetComponents.isEmpty()) {
      currentArchetype.edges.cacheArchetypeAfterBundleInsert(
        this.id,
        archetypeId,
        bundleStatus,
        addedRequiredComponents,
        added,
        existing,
      );
      return archetypeId;
    } else {
      let tableId: TableId;
      let tableComponents: Vec<ComponentId>;
      let sparseSetComponents: Vec<ComponentId>;

      if (newTableComponents.isEmpty()) {
        tableId = currentArchetype.tableId;
        tableComponents = Vec.from(currentArchetype.tableComponents);
      } else {
        newTableComponents.extend(currentArchetype.tableComponents);
        newTableComponents.sort();
        tableId = storages.tables.getIdOrInsert(newTableComponents, components);
        tableComponents = newTableComponents;
      }

      if (newSparseSetComponents.isEmpty()) {
        sparseSetComponents = Vec.from(currentArchetype.sparseSetComponents);
      } else {
        newSparseSetComponents.extend(currentArchetype.sparseSetComponents);
        newSparseSetComponents.sort();
        sparseSetComponents = newSparseSetComponents;
      }

      const newArchetypeId = archetypes.getIdOrInsert(
        components,
        observers,
        tableId,
        tableComponents,
        sparseSetComponents,
      );

      currentArchetype.edges.cacheArchetypeAfterBundleInsert(
        this.id,
        newArchetypeId,
        bundleStatus,
        addedRequiredComponents,
        added,
        existing,
      );

      return newArchetypeId;
    }
  }
  removeBundleFromArchetype(
    archetypes: Archetypes,
    storages: Storages,
    components: Components,
    observers: Observers,
    archetypeId: ArchetypeId,
    intersection: boolean,
  ): Option<ArchetypeId> {
    const edges = archetypes.get(archetypeId).unwrap().edges;
    const removeBundleResult = intersection
      ? edges.getArchetypeAfterBundleRemove(this.id)
      : edges.getArchetypeAfterBundleTake(this.id);

    const result = removeBundleResult.unwrapOrElse(() => {
      let nextTableComponents: Vec<ComponentId>;
      let nextSparseSetComponents: Vec<ComponentId>;
      let nextTableId: TableId;
      {
        const currentArchetype = archetypes.get(archetypeId).unwrap();
        let removedTableComponents: Vec<ComponentId> = Vec.new();
        let removedSparseSetComponents: Vec<ComponentId> = Vec.new();

        for (const componentId of this.iterExplicitComponents()) {
          if (currentArchetype.contains(componentId)) {
            const componentInfo = components.getInfoUnchecked(componentId);
            if (componentInfo.storageType === StorageType.Table) {
              removedTableComponents.push(componentId);
            } else {
              removedSparseSetComponents.push(componentId);
            }
          } else if (!intersection) {
            currentArchetype.edges.cacheArchetypeAfterBundleTake(this.id, None);
            return None;
          }
        }

        removedTableComponents = removedTableComponents
          .iter()
          .sort()
          .dedup()
          .collectInto((value) => Vec.from(value));
        removedSparseSetComponents = removedSparseSetComponents
          .iter()
          .sort()
          .dedup()
          .collectInto((value) => Vec.from(value));

        nextTableComponents = Vec.from(currentArchetype.tableComponents);
        nextSparseSetComponents = Vec.from(currentArchetype.sparseSetComponents);
        sortedRemove(nextTableComponents, removedTableComponents);
        sortedRemove(nextSparseSetComponents, removedSparseSetComponents);

        nextTableId = removedTableComponents.isEmpty()
          ? currentArchetype.tableId
          : storages.tables.getIdOrInsert(nextTableComponents, components);
      }

      const newArchetypeId = archetypes.getIdOrInsert(
        components,
        observers,
        nextTableId,
        nextTableComponents,
        nextSparseSetComponents,
      );

      return Some(newArchetypeId);
    });

    const currentArchetype = archetypes.getUnchecked(archetypeId);
    if (intersection) {
      currentArchetype.edges.cacheArchetypeAfterBundleRemove(this.id, result);
    } else {
      currentArchetype.edges.cacheArchetypeAfterBundleTake(this.id, result);
    }

    return result;
  }
}

function sortedRemove(source: Vec<number>, remove: Vec<number>): void {
  let removeIndex = 0;
  source.retain((value) => {
    while (removeIndex < remove.len() && value > remove[removeIndex]) {
      removeIndex += 1;
    }
    if (removeIndex < remove.len()) {
      return value !== remove[removeIndex];
    } else {
      return true;
    }
  });
}
