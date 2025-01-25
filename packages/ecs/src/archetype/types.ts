import { EMPTY_VALUE } from '@sciurus/utils';
import { HashMap, Option, RustIter, Vec } from 'rustable';
import { type RequiredComponentConstructor } from '../component/required_components';
import { type ComponentId } from '../component/types';
import { type Entity } from '../entity/base';
import { type StorageType, type TableRow } from '../storage';

export type ArchetypeRow = number;

export type ArchetypeId = number;

export type ArchetypeComponentId = number;

export type ComponentIndex = HashMap<ComponentId, HashMap<ArchetypeId, ArchetypeRecord>>;

export class ArchetypeFlags {
  static readonly ON_ADD_HOOK = new ArchetypeFlags(1 << 0);
  static readonly ON_INSERT_HOOK = new ArchetypeFlags(1 << 1);
  static readonly ON_REPLACE_HOOK = new ArchetypeFlags(1 << 2);
  static readonly ON_REMOVE_HOOK = new ArchetypeFlags(1 << 3);
  static readonly ON_DESPAWN_HOOK = new ArchetypeFlags(1 << 4);
  static readonly ON_ADD_OBSERVER = new ArchetypeFlags(1 << 5);
  static readonly ON_INSERT_OBSERVER = new ArchetypeFlags(1 << 6);
  static readonly ON_REPLACE_OBSERVER = new ArchetypeFlags(1 << 7);
  static readonly ON_REMOVE_OBSERVER = new ArchetypeFlags(1 << 8);
  static readonly ON_DESPAWN_OBSERVER = new ArchetypeFlags(1 << 9);

  value: number;

  static empty() {
    return new ArchetypeFlags(0);
  }

  constructor(value: number) {
    this.value = value;
  }

  insert(flag: ArchetypeFlags) {
    this.value |= flag.value;
  }

  remove(flag: ArchetypeFlags) {
    this.value &= ~flag.value;
  }

  equals(value: ArchetypeFlags) {
    return this.value === value.value;
  }

  contains(flag: ArchetypeFlags) {
    return (this.value & flag.value) !== 0;
  }

  set(flag: ArchetypeFlags, set: boolean) {
    if (set) {
      this.insert(flag);
    } else {
      this.remove(flag);
    }
  }
}

export enum ComponentStatus {
  Added,
  Existing,
}

export interface BundleComponentStatus {
  getStatus(index: number): ComponentStatus;
}
export class ArchetypeAfterBundleInsert implements BundleComponentStatus {
  constructor(
    public archetypeId: ArchetypeId,
    public bundleStatus: Vec<ComponentStatus>,
    public requiredComponents: Vec<RequiredComponentConstructor>,
    public added: Vec<ComponentId>,
    public existing: Vec<ComponentId>,
  ) {}

  getStatus(index: number): ComponentStatus {
    return this.bundleStatus[index];
  }

  iterInserted(): RustIter<ComponentId> {
    return this.added.iter().chain(this.existing.iter());
  }

  iterAdded(): RustIter<ComponentId> {
    return this.added.iter();
  }

  iterExisting(): RustIter<ComponentId> {
    return this.existing.iter();
  }
}

export class SpawnBundleStatus implements BundleComponentStatus {
  getStatus(_: number): ComponentStatus {
    return ComponentStatus.Added;
  }
}

export class ArchetypeSwapRemoveResult {
  constructor(
    public swappedEntity: Option<Entity>,
    public tableRow: TableRow,
  ) {}
}

export class ArchetypeRecord {
  constructor(
    /**
     * Index of the component in the archetype's Table,
     * or None if the component is a sparse set component.
     */
    public column: Option<number>,
  ) {}
}

export class ArchetypeEntity {
  constructor(
    public entity: Entity,
    public tableRow: TableRow,
  ) {}

  get id() {
    return this.entity;
  }
}

export class ArchetypeComponentInfo {
  constructor(
    public storageType: StorageType,
    public archetypeComponentId: ArchetypeComponentId,
  ) {}
}

export class ArchetypeGeneration {
  constructor(public id: ArchetypeId) {}

  static initial() {
    return new ArchetypeGeneration(EMPTY_VALUE);
  }
}

export class ArchetypeComponents {
  constructor(
    public tableComponents: Vec<ComponentId>,
    public sparseSetComponents: Vec<ComponentId>,
  ) {}
}
