import { HashMap, Option, Ptr, Vec } from 'rustable';
import { Tick } from '../../change_detection/tick';
import { Components } from '../../component/collection';
import { ComponentId } from '../../component/types';
import { TableId } from '../types';
import { Table } from './base';
import { TableBuilder } from './builder';

export class Tables {
  tables: Vec<Table>;
  tableIds: HashMap<Vec<ComponentId>, TableId>;

  constructor(
    tables: Vec<Table> = Vec.from([TableBuilder.new().build()]),
    tableIds: HashMap<Vec<ComponentId>, TableId> = new HashMap(),
  ) {
    this.tables = tables;
    this.tableIds = tableIds;
  }

  len() {
    return this.tables.len();
  }

  isEmpty() {
    return this.tables.len() === 0;
  }

  get(id: TableId): Option<Table> {
    return this.tables.get(id);
  }

  getUnchecked(id: TableId): Table {
    return this.tables[id];
  }

  get2Mut(a: TableId, b: TableId): Ptr<[Table, Table]> {
    if (a === b) {
      throw new Error('Cannot get mutable references to the same table');
    }
    return Ptr({
      get: () => [this.tables[a], this.tables[b]],
      set: ([tableA, tableB]) => {
        this.tables[a] = tableA;
        this.tables[b] = tableB;
      },
    });
  }

  getIdOrInsert(componentIds: Iterable<ComponentId>, components: Components): number {
    const tables = this.tables;
    let key = Vec.from(componentIds);
    let value = this.tableIds.get(key);
    if (value.isSome()) {
      return value.unwrap();
    }
    let table = TableBuilder.new();
    for (const componentId of componentIds) {
      table.addColumn(components.getInfoUnchecked(componentId));
    }
    tables.push(table.build());
    let tableId = tables.len() - 1;
    this.tableIds.insert(key, tableId);
    return tableId;
  }

  iter() {
    return this.tables.iter();
  }

  clear() {
    for (const table of this.tables) {
      table.clear();
    }
  }

  checkChangeTicks(changeTick: Tick) {
    for (const table of this.tables) {
      table.checkChangeTicks(changeTick);
    }
  }
}
