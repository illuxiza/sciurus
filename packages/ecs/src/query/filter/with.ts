import { Constructor, createFactory, Ptr } from 'rustable';
import { Component, ComponentId, Components } from '../../component';
import { StorageType } from '../../storage';
import { World } from '../../world/base';
import { FilteredAccess } from '../access';
import { WorldQuery } from '../world_query';
import { QueryFilter } from './base';

class WithFilter {
  __isDense: boolean = false;
  constructor(public value: Constructor<any>) {
    const storageType = Component.wrap(value).storageType();
    this.__isDense = storageType === StorageType.Table;
  }
}

interface WithFilter
  extends WorldQuery<void, void, ComponentId>,
    QueryFilter<void, void, ComponentId> {}

export const With = createFactory(WithFilter);

export interface With extends WithFilter {}

WorldQuery.implFor<typeof WorldQuery<void, void, ComponentId>, typeof WithFilter>(WithFilter, {
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
    access.andWith(state);
  },
  initState(this: WithFilter, world: World) {
    return world.registerComponent(this.value);
  },
  getState(this: WithFilter, components: Components) {
    return components.componentId(this.value);
  },
  matchesComponentSet(state: ComponentId, setContainsId: (componentId: ComponentId) => boolean) {
    return setContainsId(state);
  },
});

QueryFilter.implFor(WithFilter, {
  isArchetypal() {
    return true;
  },
  filterFetch(_fetch: any, _entity: any, _tableRow: any) {
    return true;
  },
});
