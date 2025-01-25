import { None, Option, Ptr, Some, Vec } from 'rustable';
import { ComponentTicks, Tick } from '../../change_detection/tick';
import { ComponentId } from '../../component/types';
import { Entity } from '../../entity/base';
import { ImmutableSparseSet } from '../sparse_set';
import { TableRow } from '../types';
import { TableMoveResult } from './move_result';
import { ThinColumn } from './thin_column';

export class Table {
  private __columns: ImmutableSparseSet<ComponentId, ThinColumn>;
  private __entities: Vec<Entity>;

  constructor(
    columns: ImmutableSparseSet<ComponentId, ThinColumn>,
    entities: Vec<Entity> = Vec.new(),
  ) {
    this.__columns = columns;
    this.__entities = entities;
  }

  static new(immutableSparseSet: ImmutableSparseSet<ComponentId, ThinColumn>) {
    return new Table(immutableSparseSet);
  }

  get entities() {
    return this.__entities;
  }

  swapRemove(row: TableRow): Option<Entity> {
    const lastElementIndex = this.entityCount() - 1;
    if (row !== lastElementIndex) {
      for (const col of this.__columns.values()) {
        col.swapRemoveAndDrop(lastElementIndex, row);
      }
    } else {
      for (const col of this.__columns.values()) {
        col.dropLastComponent(lastElementIndex);
      }
    }
    const isLast = row === lastElementIndex;
    this.__entities.swapRemove(row);
    return isLast ? None : Some(this.__entities[row]);
  }

  moveToAndForgetMissing(row: TableRow, newTable: Table) {
    const lastElementIndex = this.entityCount() - 1;
    const isLast = row === lastElementIndex;
    const newRow = newTable.allocate(this.__entities.swapRemove(row));
    for (const [componentId, column] of this.__columns.iter()) {
      const newColumn = newTable.getColumn(componentId);
      if (newColumn.isSome()) {
        newColumn.unwrap().initializeFrom(column, lastElementIndex, row, newRow);
      } else {
        column.swapRemove(lastElementIndex, row);
      }
    }
    return TableMoveResult.new(newRow, isLast ? None : Some(this.__entities[row]));
  }

  moveToAndDropMissing(row: TableRow, newTable: Table): TableMoveResult {
    const lastElementIndex = this.entityCount() - 1;
    const isLast = row === lastElementIndex;
    const newRow = newTable.allocate(this.__entities.swapRemove(row));
    for (const [componentId, column] of this.__columns.iter()) {
      const newColumn = newTable.getColumn(componentId);
      if (newColumn.isSome()) {
        newColumn.unwrap().initializeFrom(column, lastElementIndex, row, newRow);
      } else {
        column.swapRemoveAndDrop(lastElementIndex, row);
      }
    }
    return TableMoveResult.new(newRow, isLast ? None : Some(this.__entities[row]));
  }

  moveToSuperset(row: TableRow, newTable: Table) {
    const lastElementIndex = this.entityCount() - 1;
    const isLast = row === lastElementIndex;
    const newRow = newTable.allocate(this.__entities.swapRemove(row));
    for (const [componentId, column] of this.__columns.iter()) {
      newTable
        .getColumn(componentId)
        .unwrap()
        .initializeFrom(column, lastElementIndex, row, newRow);
    }
    return TableMoveResult.new(newRow, isLast ? None : Some(this.__entities[row]));
  }

  getDataSliceFor<T>(componentId: ComponentId): Option<T[]> {
    return this.getColumn(componentId).map((col) => col.getDataSlice(this.entityCount()));
  }

  getAddedTicksSliceFor(componentId: ComponentId): Option<Tick[]> {
    return this.getColumn(componentId).map((col) => col.getAddedTicksSlice(this.entityCount()));
  }

  getChangedTicksSliceFor(componentId: ComponentId): Option<Tick[]> {
    return this.getColumn(componentId).map((col) => col.getChangedTicksSlice(this.entityCount()));
  }

  getChangedBySliceFor(componentId: ComponentId): Option<string[]> {
    return this.getColumn(componentId).andThen((col) => {
      return col.changedBy ? Some(col.getChangedBySlice(this.entityCount())) : None;
    });
  }

  getChangedTick(componentId: ComponentId, row: TableRow): Option<Tick> {
    return row < this.entityCount()
      ? this.getColumn(componentId).map((col) => col.changedTicks.get(row))
      : None;
  }

  getAddedTick(componentId: ComponentId, row: TableRow): Option<Tick> {
    return row < this.entityCount()
      ? this.getColumn(componentId).map((col) => col.addedTicks.get(row))
      : None;
  }

  getChangedBy(componentId: ComponentId, row: TableRow): Option<string> {
    return row < this.entityCount()
      ? this.getColumn(componentId).andThen((col) => {
          return Some(col.changedBy.get(row));
        })
      : None;
  }

  getChangedByMut(componentId: ComponentId, row: TableRow): Option<Ptr<string>> {
    return row < this.entityCount()
      ? this.getColumn(componentId).andThen((col) => {
          return Some(col.changedBy.getMut(row));
        })
      : None;
  }

  getTicksUnchecked(componentId: ComponentId, row: TableRow): Option<ComponentTicks> {
    return this.getColumn(componentId).map(
      (col) => new ComponentTicks(col.addedTicks.get(row), col.changedTicks.get(row)),
    );
  }

  getColumn(componentId: ComponentId): Option<ThinColumn> {
    return this.__columns.get(componentId);
  }

  getColumnUnchecked(componentId: ComponentId): ThinColumn {
    return this.__columns.getUnchecked(componentId);
  }

  getColumnMut(componentId: ComponentId): Option<Ptr<ThinColumn>> {
    return this.__columns.getMut(componentId);
  }

  hasColumn(componentId: ComponentId) {
    return this.__columns.contains(componentId);
  }

  allocate(entity: Entity): TableRow {
    const len = this.entityCount();
    this.__entities.push(entity);
    for (const col of this.__columns.values()) {
      col.addedTicks.initialize(len, new Tick(0));
      col.changedTicks.initialize(len, new Tick(0));
      col.changedBy?.initialize(len, undefined);
    }
    return len;
  }

  entityCount() {
    return this.__entities.len();
  }

  getDropFor(componentId: ComponentId) {
    return this.getColumn(componentId).andThen((column) => {
      return column.data.dropFn;
    });
  }

  componentCount() {
    return this.__columns.len();
  }

  isEmpty() {
    return this.__entities.len() === 0;
  }

  checkChangeTicks(changeTick: Tick) {
    const len = this.entityCount();
    for (const column of this.__columns.values()) {
      column.checkChangeTicks(len, changeTick);
    }
  }

  iterColumns() {
    return this.__columns.values();
  }

  clear() {
    const len = this.entityCount();
    this.__entities.clear();
    for (const column of this.__columns.values()) {
      column.clear(len);
    }
  }

  takeComponent(componentId: ComponentId, row: TableRow): any {
    const value = this.getColumn(componentId).map((col) => col.data.get(row));
    if (value.isNone() || value.unwrap() === undefined) {
      throw new Error(`No component with id ${componentId} was found on entity ${row}.`);
    }
    return value.unwrap();
  }

  getComponent(componentId: ComponentId, row: TableRow): Option<Ptr<any>> {
    return this.getColumn(componentId).map((col) => col.data.getMut(row));
  }
}
