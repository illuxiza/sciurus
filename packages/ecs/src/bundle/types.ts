import { EnumInstance, Enums } from 'rustable';
import { Archetype } from '../archetype/base';
import { Table } from '../storage/table/base';

export type BundleId = number;

export enum InsertMode {
  /** Any existing components of a matching type will be overwritten. */
  Replace,
  /** Any existing components of a matching type will kept unchanged. */
  Keep,
}

const params = {
  SameArchetype: () => {},
  NewArchetypeSameTable: (_newArchetype: Archetype) => {},
  NewArchetypeNewTable: (_newArchetype: Archetype, _newTable: Table) => {},
};
export const ArchetypeMoveType = Enums.create('ArchetypeMoveType', params);

export type ArchetypeMoveType = EnumInstance<typeof params>;
