import { FixedBitSet } from '@sciurus/utils';
import { implTrait, None, Ptr, Some } from 'rustable';
import { Components } from '../../component/collection';
import { ComponentId } from '../../component/types';
import { Entity } from '../../entity/base';
import { TableRow } from '../../storage';
import { type World } from '../../world';
import { type WorldCell } from '../../world/cell';
import { FilteredAccess } from '../access';
import { WorldQuery } from '../world_query';
import { QueryFilter } from './base';

export class Or {
  constructor(public filters: QueryFilter[]) {}
  static of(...filters: QueryFilter[]) {
    return new Or(filters);
  }
}

export interface Or extends WorldQuery {}

class OrFetch<T extends WorldQuery> {
  constructor(
    public filter: T,
    public fetch: ReturnType<T['initFetch']>,
    public matches: boolean = false,
  ) {}

  clone(): OrFetch<T> {
    return new OrFetch(this.filter, this.fetch.clone(), this.matches);
  }
}

implTrait(Or, WorldQuery, {
  isDense(this: Or) {
    return this.filters.every((f) => f.isDense());
  },
  shrink(item: boolean) {
    return item;
  },
  shrinkFetch(fetch: OrFetch<any>[]) {
    return fetch.map((f, i) => {
      return new OrFetch(this.filters[i], f.filter.shrinkFetch(f.fetch), f.matches);
    });
  },
  initFetch(world: WorldCell, state: any[], lastRun: any, thisRun: any) {
    return state.map((s, i) => {
      const filter = this.filters[i];
      return new OrFetch(filter, filter.initFetch(world, s, lastRun, thisRun), false);
    });
  },
  setArchetype(fetch: OrFetch<any>[], state: any[], archetype: any, table: any) {
    fetch.forEach((f, i) => {
      const filter = this.filters[i];
      f.matches = filter.matchesComponentSet(state[i], (id) => archetype.hasComponent(id));
      if (f.matches) {
        filter.setArchetype(f.fetch, state[i], archetype, table);
      }
    });
  },
  setTable(fetch: OrFetch<any>[], state: ComponentId[], table: any) {
    fetch.forEach((f, i) => {
      const filter = this.filters[i];
      f.matches = filter.matchesComponentSet(state[i], (id) => table.hasColumn(id));
      if (f.matches) {
        filter.setTable(f.fetch, state[i], table);
      }
    });
  },
  fetch(fetch: OrFetch<any>[], entity: Entity, tableRow: TableRow): boolean {
    return fetch.some((f, i) => {
      const filter = this.filters[i];
      return f.matches && filter.fetch(f.fetch, entity, tableRow);
    });
  },
  updateComponentAccess(state: any[], access: Ptr<FilteredAccess>) {
    const newAccess = FilteredAccess.matchesNothing();
    state.forEach((s, i) => {
      const filter = this.filters[i];
      const intermediate = access.clone();
      filter.updateComponentAccess(s, intermediate);
      newAccess.appendOr(intermediate);
      newAccess.extendAccess(intermediate);
    });
    newAccess.required = access.required;
    access.required = new FixedBitSet();
    access[Ptr.ptr] = newAccess;
  },
  initState(this: Or, world: World) {
    return this.filters.map((f) => f.initState(world));
  },

  getState(this: Or, components: Components) {
    const states = [];
    for (let i = 0; i < this.filters.length; i++) {
      const filter = this.filters[i];
      const state = filter.getState(components);
      if (state.isNone()) {
        return None;
      }
      states.push(state.unwrap());
    }
    return Some(states);
  },

  matchesComponentSet(state: ComponentId[], setContainsId: (componentId: ComponentId) => boolean) {
    return state.some((s, i) => {
      const filter = this.filters[i];
      return filter.matchesComponentSet(s, setContainsId);
    });
  },
});

implTrait(Or, QueryFilter, {
  isArchetypal(this: Or) {
    return this.filters.every((f) => f.isArchetypal());
  },
  filterFetch(fetch: OrFetch<any>[], entity: Entity, tableRow: TableRow) {
    return this.fetch(fetch, entity, tableRow);
  },
});
