import { Option } from 'rustable';
import { Entity } from '../../entity/base';
import { TableRow } from '../types';

export class TableMoveResult {
  swappedEntity: Option<Entity>;
  newRow: TableRow;

  constructor(newRow: TableRow, swappedEntity: Option<Entity>) {
    this.newRow = newRow;
    this.swappedEntity = swappedEntity;
  }

  static new(newRow: TableRow, swappedEntity: Option<Entity>) {
    return new TableMoveResult(newRow, swappedEntity);
  }
}
