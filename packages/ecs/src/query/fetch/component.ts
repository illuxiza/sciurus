import { Constructor, None, Option, Ptr, Some } from 'rustable';
import { Archetype } from '../../archetype';
import { Component, ComponentId, Components } from '../../component';
import { Entity } from '../../entity/base';
import { ComponentSparseSet, StorageType, Table, TableRow } from '../../storage';
import { World } from '../../world';
import { FilteredAccess } from '../access';
import { WorldQuery } from '../world_query';
import { IntoFetch, QueryData } from './base';

export class StorageSwitch<C extends object, T, S> {
  private readonly component: Constructor<C>;
  private table!: T;
  private sparseSet!: S;

  constructor(component: Constructor<C>, table: () => T, sparseSet: () => S) {
    this.component = component;
    if (Component.wrap(component).storageType() === StorageType.Table) {
      this.table = table();
    } else {
      this.sparseSet = sparseSet();
    }
  }

  setTable(table: T): void {
    if (Component.wrap(this.component).storageType() !== StorageType.Table) {
      throw new Error('Component must be a table component');
    }
    this.table = table;
  }

  extract<R>(table: (t: T) => R, sparseSet: (s: S) => R): R {
    if (Component.wrap(this.component).storageType() === StorageType.Table) {
      return table(this.table);
    } else {
      return sparseSet(this.sparseSet);
    }
  }
}

export class ReadFetch<C extends object> {
  component: Constructor<C>;
  components: StorageSwitch<C, Option<any[]>, ComponentSparseSet>;

  constructor(
    component: Constructor<C>,
    components: StorageSwitch<C, Option<any[]>, ComponentSparseSet>,
  ) {
    this.component = component;
    this.components = components;
  }
}

export class ComponentFetch<C extends object> {
  constructor(public component: Constructor<C>) {}
}

export interface ComponentFetch<C extends object> extends QueryData<C> {}

IntoFetch.implFor(Component, {
  static: {
    intoFetch<C extends object>(this: Constructor<C>): ComponentFetch<C> {
      return new ComponentFetch<C>(this);
    },
  },
});

WorldQuery.implFor<typeof WorldQuery<ComponentId>, typeof ComponentFetch>(ComponentFetch, {
  shrink(item: any): any {
    return item;
  },
  shrinkFetch(fetch: any): any {
    return fetch;
  },
  initFetch(this: ComponentFetch<any>, world: World, state: ComponentId): ReadFetch<any> {
    return new ReadFetch<any>(
      this.component,
      new StorageSwitch(
        this.component,
        () => None,
        () => world.storages.sparseSets.get(state).unwrap(),
      ),
    );
  },
  isDense(this: ComponentFetch<any>): boolean {
    if (Component.wrap(this.component).storageType() === StorageType.Table) {
      return true;
    }
    return false;
  },
  setArchetype(
    this: ComponentFetch<any>,
    fetch: ReadFetch<any>,
    state: ComponentId,
    _archetype: Archetype,
    table: any,
  ): void {
    if (this.isDense()) {
      this.setTable(fetch, state, table);
    }
  },
  setTable(fetch: ReadFetch<any>, state: ComponentId, table: Table): void {
    const tableData = Some(table.getDataSliceFor(state).unwrap());
    fetch.components.setTable(tableData);
  },
  fetch(fetch: ReadFetch<any>, entity: Entity, tableRow: TableRow): any {
    return fetch.components.extract(
      (table) => table.unwrap()[tableRow],
      (sparseSet) => sparseSet.get(entity).unwrap(),
    );
  },

  updateComponentAccess(state: ComponentId, access: Ptr<FilteredAccess>): void {
    access.addComponentRead(state);
  },
  initState(this: ComponentFetch<any>, world: World): ComponentId {
    return world.registerComponent(this.component);
  },
  getState(this: ComponentFetch<any>, components: Components): Option<ComponentId> {
    return components.componentId(this.component);
  },
  matchesComponentSet(
    state: ComponentId,
    setContainsId: (componentId: ComponentId) => boolean,
  ): boolean {
    return setContainsId(state);
  },
});

QueryData.implFor(ComponentFetch);
