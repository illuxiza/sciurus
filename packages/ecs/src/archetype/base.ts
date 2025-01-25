import { HashMap, None, Option, RustIter, Some, Vec } from 'rustable';
import { type Components } from '../component/collection';
import { type ComponentId } from '../component/types';
import { type Entity } from '../entity/base';
import { type EntityLocation } from '../entity/location';
import { type Observers } from '../observer/collection';
import {
  type ImmutableSparseSet,
  SparseSet,
  StorageType,
  type TableId,
  type TableRow,
} from '../storage';
import { Edges } from './edges';
import {
  ArchetypeComponentId,
  ArchetypeComponentInfo,
  ArchetypeEntity,
  ArchetypeFlags,
  ArchetypeId,
  ArchetypeRecord,
  ArchetypeRow,
  ArchetypeSwapRemoveResult,
  ComponentIndex,
} from './types';

export class Archetype {
  constructor(
    private __id: ArchetypeId,
    private __tableId: TableId,
    public edges: Edges,
    private __entities: Vec<ArchetypeEntity>,
    private __components: ImmutableSparseSet<ComponentId, ArchetypeComponentInfo>,
    private __flags: ArchetypeFlags,
  ) {}

  static new(
    components: Components,
    componentIndex: ComponentIndex,
    observers: Observers,
    id: ArchetypeId,
    tableId: TableId,
    tableComponents: RustIter<[ComponentId, ArchetypeComponentId]>,
    sparseSetComponents: RustIter<[ComponentId, ArchetypeComponentId]>,
  ) {
    let flags = ArchetypeFlags.empty();
    const archetypeComponents = new SparseSet<ComponentId, ArchetypeComponentInfo>();
    for (const [idx, [componentId, archetypeComponentId]] of tableComponents.enumerate()) {
      const info = components.getInfoUnchecked(componentId);
      info.updateArchetypeFlags(flags);
      observers.updateArchetypeFlags(componentId, flags);
      archetypeComponents.insert(
        componentId,
        new ArchetypeComponentInfo(StorageType.Table, archetypeComponentId),
      );
      componentIndex
        .get(componentId)
        .unwrapOrElse(() => {
          const map = new HashMap<ArchetypeId, ArchetypeRecord>();
          componentIndex.insert(componentId, map);
          return map;
        })
        .insert(id, new ArchetypeRecord(Some(idx)));
    }
    for (const [componentId, archetypeComponentId] of sparseSetComponents) {
      const info = components.getInfoUnchecked(componentId);
      info.updateArchetypeFlags(flags);
      observers.updateArchetypeFlags(componentId, flags);
      archetypeComponents.insert(
        componentId,
        new ArchetypeComponentInfo(StorageType.SparseSet, archetypeComponentId),
      );
      componentIndex
        .get(componentId)
        .unwrapOrElse(() => {
          const map = new HashMap<ArchetypeId, ArchetypeRecord>();
          componentIndex.insert(componentId, map);
          return map;
        })
        .insert(id, new ArchetypeRecord(None));
    }
    return new Archetype(
      id,
      tableId,
      new Edges(),
      Vec.new(),
      archetypeComponents.intoImmutable(),
      flags,
    );
  }

  get id() {
    return this.__id;
  }

  get flags() {
    return this.__flags;
  }

  get tableId() {
    return this.__tableId;
  }

  get entities() {
    return this.__entities;
  }

  get tableComponents(): RustIter<ComponentId> {
    return this.__components
      .iter()
      .filter(([, info]) => info.storageType === StorageType.Table)
      .map(([id]) => id);
  }

  get sparseSetComponents(): RustIter<ComponentId> {
    return this.__components
      .iter()
      .filter(([, info]) => info.storageType === StorageType.SparseSet)
      .map(([id]) => id);
  }

  get components() {
    return this.__components.indices();
  }

  componentCount() {
    return this.__components.len();
  }

  componentsWithArchetypeComponentId(): RustIter<[ComponentId, ArchetypeComponentId]> {
    return this.__components
      .iter()
      .map(([componentId, info]) => [componentId, info.archetypeComponentId]);
  }

  entityTableRow(row: ArchetypeRow): TableRow {
    return this.__entities[row].tableRow;
  }

  setEntityTableRow(row: ArchetypeRow, tableRow: TableRow): void {
    this.__entities[row].tableRow = tableRow;
  }

  allocate(entity: Entity, tableRow: TableRow): EntityLocation {
    const archetypeRow = this.__entities.len();
    this.__entities.push(new ArchetypeEntity(entity, tableRow));
    return {
      archetypeId: this.__id,
      archetypeRow,
      tableId: this.__tableId,
      tableRow,
    };
  }

  swapRemove(row: ArchetypeRow): ArchetypeSwapRemoveResult {
    const isLast = row === this.__entities.len() - 1;
    const entity = this.__entities.swapRemove(row);
    return new ArchetypeSwapRemoveResult(
      isLast ? None : Some(this.__entities[row].entity),
      entity.tableRow,
    );
  }

  len(): number {
    return this.__entities.len();
  }

  isEmpty(): boolean {
    return this.__entities.len() === 0;
  }

  contains(componentId: ComponentId): boolean {
    return this.__components.contains(componentId);
  }

  getStorageType(componentId: ComponentId): Option<StorageType> {
    return this.__components.get(componentId).map((info) => info.storageType);
  }

  getArchetypeComponentId(componentId: ComponentId): Option<ArchetypeComponentId> {
    return this.__components.get(componentId).map((info) => info.archetypeComponentId);
  }

  clearEntities(): void {
    this.__entities.clear();
  }

  hasAddHook(): boolean {
    return this.__flags.contains(ArchetypeFlags.ON_ADD_HOOK);
  }

  hasInsertHook(): boolean {
    return this.__flags.contains(ArchetypeFlags.ON_INSERT_HOOK);
  }

  hasReplaceHook(): boolean {
    return this.__flags.contains(ArchetypeFlags.ON_REPLACE_HOOK);
  }

  hasRemoveHook(): boolean {
    return this.__flags.contains(ArchetypeFlags.ON_REMOVE_HOOK);
  }

  hasDespawnHook(): boolean {
    return this.__flags.contains(ArchetypeFlags.ON_DESPAWN_HOOK);
  }

  hasAddObserver(): boolean {
    return this.__flags.contains(ArchetypeFlags.ON_ADD_OBSERVER);
  }

  hasInsertObserver(): boolean {
    return this.__flags.contains(ArchetypeFlags.ON_INSERT_OBSERVER);
  }

  hasReplaceObserver(): boolean {
    return this.__flags.contains(ArchetypeFlags.ON_REPLACE_OBSERVER);
  }

  hasRemoveObserver(): boolean {
    return this.__flags.contains(ArchetypeFlags.ON_REMOVE_OBSERVER);
  }

  hasDespawnObserver(): boolean {
    return this.__flags.contains(ArchetypeFlags.ON_DESPAWN_OBSERVER);
  }
}
