import { INVALID_VALUE } from '@sciurus/utils';
import { Clone, derive, EnumInstance, Enums } from 'rustable';
import { type ArchetypeId, type ArchetypeRow } from '../archetype';
import { type TableId, type TableRow } from '../storage';

export type EntityIndex = number;

export class EntityLocation {
  static INVALID = new EntityLocation(INVALID_VALUE, INVALID_VALUE, INVALID_VALUE, INVALID_VALUE);
  archetypeId: ArchetypeId;
  archetypeRow: ArchetypeRow;
  tableId: TableId;
  tableRow: TableRow;

  constructor(
    archetypeId: ArchetypeId,
    archetypeRow: ArchetypeRow,
    tableId: TableId,
    tableRow: TableRow,
  ) {
    this.archetypeId = archetypeId;
    this.archetypeRow = archetypeRow;
    this.tableId = tableId;
    this.tableRow = tableRow;
  }
}

@derive([Clone])
export class EntityMeta {
  static EMPTY = new EntityMeta(EntityLocation.INVALID, 1);
  location: EntityLocation;
  generation: number;
  spawnedOrDespawnedBy?: string;

  constructor(location: EntityLocation, generation: number) {
    this.location = location;
    this.generation = generation;
  }
}

export interface EntityMeta extends Clone {}

const params = {
  Exists: (_location: EntityLocation) => {},
  DidNotExist: () => {},
  ExistsWithWrongGeneration: () => {},
};
export const AllocAtWithoutReplacement = Enums.create('AllocAtWithoutReplacement', params);

export type AllocAtWithoutReplacement = EnumInstance<typeof params>;
