import { Constructor, createFactory, Ptr } from 'rustable';
import { Component, ComponentId, Components } from '../../component';
import { StorageType } from '../../storage';
import { World } from '../../world/base';
import { FilteredAccess } from '../access';
import { WorldQuery } from '../world_query';
import { QueryFilter } from './base';

class WithoutFilter {
  __isDense: boolean = false;
  constructor(public value: Constructor<any>) {
    const storageType = Component.wrap(value).storageType();
    this.__isDense = storageType === StorageType.Table;
  }
  static of(value: Constructor<any>) {
    return new WithoutFilter(value);
  }
}

interface WithoutFilter
  extends WorldQuery<void, void, ComponentId>,
    QueryFilter<void, void, ComponentId> {}

export const Without = createFactory(WithoutFilter);

export interface Without extends WithoutFilter {}

WorldQuery.implFor<typeof WorldQuery<void, void, ComponentId>, typeof WithoutFilter>(
  WithoutFilter,
  {
    isDense() {
      return this.__isDense;
    },
    shrink() {},
    shrinkFetch() {},
    initFetch() {},
    setArchetype() {},
    setTable() {},
    fetch() {},
    updateComponentAccess(state: ComponentId, access: Ptr<FilteredAccess>) {
      access.andWithout(state);
    },
    initState(this: WithoutFilter, world: World) {
      return world.registerComponent(this.value);
    },
    getState(this: WithoutFilter, components: Components) {
      return components.componentId(this.value);
    },
    matchesComponentSet(state: ComponentId, setContainsId: (componentId: ComponentId) => boolean) {
      return !setContainsId(state);
    },
  },
);

QueryFilter.implFor(WithoutFilter, {
  isArchetypal() {
    return true;
  },
  filterFetch(_fetch: any, _entity: any, _tableRow: any) {
    return true;
  },
});
