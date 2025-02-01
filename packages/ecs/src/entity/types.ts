import { INVALID_VALUE } from '@sciurus/utils';
import { Clone, derive, EnumInstance, Enums } from 'rustable';
import { type ArchetypeId, type ArchetypeRow } from '../archetype';
import { type TableId, type TableRow } from '../storage';

export type EntityIndex = number;

export class EntityLocation {
  static INVALID = new EntityLocation(INVALID_VALUE, INVALID_VALUE, INVALID_VALUE, INVALID_VALUE);
  constructor(
    public archetypeId: ArchetypeId,
    public archetypeRow: ArchetypeRow,
    public tableId: TableId,
    public tableRow: TableRow,
  ) {}
}

@derive([Clone])
export class EntityMeta {
  static EMPTY = new EntityMeta(EntityLocation.INVALID, 1);
  loc: EntityLocation;
  gen: number;
  changedBy?: string;

  constructor(loc: EntityLocation, gen: number) {
    this.loc = loc;
    this.gen = gen;
  }
}

export interface EntityMeta extends Clone {}

const params = {
  Exists: (_location: EntityLocation) => {},
  DidNotExist: () => {},
  ExistsWithWrongGen: () => {},
};
export const AllocAtWithoutReplacement = Enums.create('AllocAtWithoutReplacement', params);

export type AllocAtWithoutReplacement = EnumInstance<typeof params>;
