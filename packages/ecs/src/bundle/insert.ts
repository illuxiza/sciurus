import { Archetype } from '../archetype/base';
import { ArchetypeAfterBundleInsert } from '../archetype/types';
import { Tick } from '../change_detection/tick';
import { ON_ADD, ON_INSERT, ON_REPLACE } from '../world/component_constants';
import { Entity } from '../entity/base';
import { Entities } from '../entity/collection';
import { EntityLocation } from '../entity/location';
import { Table } from '../storage/table/base';
import { World } from '../world/base';
import { BundleInfo } from './info';
import { ArchetypeMoveType, BundleId, InsertMode } from './types';

/**
 * A struct that handles the insertion of bundles into entities
 */
export class BundleInserter {
  constructor(
    public world: World,
    public bundleInfo: BundleInfo,
    public archetypeAfterInsert: ArchetypeAfterBundleInsert,
    public table: Table,
    public archetype: Archetype,
    public archetypeMoveType: ArchetypeMoveType,
    public changeTick: Tick,
  ) {}

  /**
   * Creates a new BundleInserter
   */
  static new<T extends object>(
    bundle: T,
    world: World,
    archetypeId: number,
    changeTick: Tick,
  ): BundleInserter {
    const bundleId = world.bundles.registerInfo(bundle, world.components, world.storages);
    return BundleInserter.newWithId(world, archetypeId, bundleId, changeTick);
  }

  /**
   * Creates a new BundleInserter with a specific bundle ID
   */
  static newWithId(
    world: World,
    archetypeId: number,
    bundleId: BundleId,
    changeTick: Tick,
  ): BundleInserter {
    const bundleInfo = world.bundles.getUnchecked(bundleId);
    const bundleInfoId = bundleInfo.id;

    const newArchetypeId = bundleInfo.insertBundleIntoArchetype(
      world.archetypes,
      world.storages,
      world.components,
      world.observers,
      archetypeId,
    );

    if (newArchetypeId === archetypeId) {
      const archetype = world.archetypes.getUnchecked(archetypeId);
      const archetypeAfterInsert = archetype.edges
        .getArchetypeAfterBundleInsertInternal(bundleInfoId)
        .unwrap();

      const tableId = archetype.tableId;
      const table = world.storages.tables.getUnchecked(tableId);

      return new BundleInserter(
        world,
        bundleInfo,
        archetypeAfterInsert,
        table,
        archetype,
        ArchetypeMoveType.SameArchetype(),
        changeTick,
      );
    } else {
      const [archetype, newArchetype] = world.archetypes.get2(archetypeId, newArchetypeId);
      const archetypeAfterInsert = archetype.edges
        .getArchetypeAfterBundleInsertInternal(bundleInfoId)
        .unwrap();

      const tableId = archetype.tableId;
      const newTableId = newArchetype.tableId;

      if (tableId === newTableId) {
        const table = world.storages.tables.get(tableId).unwrap();
        return new BundleInserter(
          world,
          bundleInfo,
          archetypeAfterInsert,
          table,
          archetype,
          ArchetypeMoveType.NewArchetypeSameTable(newArchetype),
          changeTick,
        );
      } else {
        const [table, newTable] = world.storages.tables.get2Mut(tableId, newTableId);
        return new BundleInserter(
          world,
          bundleInfo,
          archetypeAfterInsert,
          table,
          archetype,
          ArchetypeMoveType.NewArchetypeNewTable(newArchetype, newTable),
          changeTick,
        );
      }
    }
  }

  /**
   * Inserts a bundle into an entity
   */
  insert<T extends object>(
    entity: Entity,
    location: EntityLocation,
    bundle: T,
    insertMode: InsertMode,
    caller?: string,
  ): EntityLocation {
    const bundleInfo = this.bundleInfo;
    const archetypeAfterInsert = this.archetypeAfterInsert;
    const table = this.table;
    const archetype = this.archetype;

    let world = this.world.intoDeferred();

    // Handle replace mode observers
    if (insertMode === InsertMode.Replace) {
      if (archetype.hasReplaceObserver()) {
        world.triggerObservers(ON_REPLACE, entity, archetypeAfterInsert.iterExisting());
      }
      world.triggerOnReplace(archetype, entity, archetypeAfterInsert.iterExisting());
    }

    let [newArchetype, newLocation] = this.archetypeMoveType.match({
      SameArchetype: () => {
        bundleInfo.writeComponents(
          table,
          this.world.storages.sparseSets,
          archetypeAfterInsert,
          archetypeAfterInsert.requiredComponents.iter(),
          entity,
          location.tableRow,
          this.changeTick,
          bundle,
          insertMode,
          caller,
        );

        return [archetype, location];
      },
      NewArchetypeSameTable: (newArchetype) => {
        const newArchetypeMut = newArchetype;

        // Get mutable references to sparse sets and entities
        const [sparseSets, entities] = [this.world.storages.sparseSets, this.world.entities];

        const result = archetype.swapRemove(location.archetypeRow);
        if (result.swappedEntity.isSome()) {
          const swappedLocation = entities.get(result.swappedEntity.unwrap()).unwrap();
          entities.set(
            result.swappedEntity.unwrap().index,
            new EntityLocation(
              swappedLocation.archetypeId,
              location.archetypeRow,
              swappedLocation.tableId,
              swappedLocation.tableRow,
            ),
          );
        }

        const newLocation = newArchetypeMut.allocate(entity, result.tableRow);
        entities.set(entity.index, newLocation);

        bundleInfo.writeComponents(
          table,
          sparseSets,
          archetypeAfterInsert,
          archetypeAfterInsert.requiredComponents.iter(),
          entity,
          result.tableRow,
          this.changeTick,
          bundle,
          insertMode,
          caller,
        );

        return [newArchetypeMut, newLocation];
      },
      NewArchetypeNewTable: (newArchetype, newTable) => {
        const newArchetypeMut = newArchetype;
        const newTableMut = newTable;

        // Get mutable references to sparse sets and entities
        const [sparseSets, entities] = [this.world.storages.sparseSets, this.world.entities];

        const result = archetype.swapRemove(location.archetypeRow);
        if (result.swappedEntity.isSome()) {
          const swappedLocation = entities.get(result.swappedEntity.unwrap()).unwrap();
          entities.set(
            result.swappedEntity.unwrap().index,
            new EntityLocation(
              swappedLocation.archetypeId,
              location.archetypeRow,
              swappedLocation.tableId,
              swappedLocation.tableRow,
            ),
          );
        }

        const moveResult = table.moveToSuperset(result.tableRow, newTableMut);
        const newLocation = newArchetypeMut.allocate(entity, moveResult.newRow);
        entities.set(entity.index, newLocation);

        // If an entity was moved into this entity's table spot, update its table row
        if (moveResult.swappedEntity.isSome()) {
          const swappedEntity = moveResult.swappedEntity.unwrap();
          const swappedLocation = entities.get(swappedEntity).unwrap();

          entities.set(
            swappedEntity.index,
            new EntityLocation(
              swappedLocation.archetypeId,
              swappedLocation.archetypeRow,
              swappedLocation.tableId,
              result.tableRow,
            ),
          );

          if (archetype.id === swappedLocation.archetypeId) {
            archetype.setEntityTableRow(swappedLocation.archetypeRow, result.tableRow);
          } else if (newArchetypeMut.id === swappedLocation.archetypeId) {
            newArchetypeMut.setEntityTableRow(swappedLocation.archetypeRow, result.tableRow);
          } else {
            this.world.archetypes
              .getUnchecked(swappedLocation.archetypeId)
              .setEntityTableRow(swappedLocation.archetypeRow, result.tableRow);
          }
        }

        bundleInfo.writeComponents(
          newTableMut,
          sparseSets,
          archetypeAfterInsert,
          archetypeAfterInsert.requiredComponents.iter(),
          entity,
          moveResult.newRow,
          this.changeTick,
          bundle,
          insertMode,
          caller,
        );

        return [newArchetypeMut, newLocation];
      },
    });

    // Handle add and insert observers
    world.triggerOnAdd(newArchetype, entity, archetypeAfterInsert.iterAdded());

    if (newArchetype.hasAddObserver()) {
      world.triggerObservers(ON_ADD, entity, archetypeAfterInsert.iterAdded());
    }

    if (insertMode === InsertMode.Replace) {
      // Insert triggers for both new and existing components if we're replacing them
      world.triggerOnInsert(newArchetype, entity, archetypeAfterInsert.iterInserted());
      if (newArchetype.hasInsertObserver()) {
        world.triggerObservers(ON_INSERT, entity, archetypeAfterInsert.iterInserted());
      }
    } else {
      // Insert triggers only for new components if we're not replacing them
      world.triggerOnInsert(newArchetype, entity, archetypeAfterInsert.iterAdded());
      if (newArchetype.hasInsertObserver()) {
        world.triggerObservers(ON_INSERT, entity, archetypeAfterInsert.iterAdded());
      }
    }
    return newLocation;
  }

  /**
   * Get mutable access to the entities storage
   * @internal
   */
  entities(): Entities {
    // SAFETY: No outstanding references to world, changes to entities cannot invalidate internal pointers
    return this.world.entities;
  }
}
