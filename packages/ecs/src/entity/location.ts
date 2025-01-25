import { INVALID_VALUE } from '@sciurus/utils';
import { ArchetypeId, ArchetypeRow } from '../archetype';
import { TableId, TableRow } from '../storage';

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
