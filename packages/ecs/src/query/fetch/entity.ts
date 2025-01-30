import { Option, Ptr, Some } from 'rustable';
import { ComponentId, Components } from '../../component';
import { Entities, Entity, EntityLocation } from '../../entity';
import { TableRow } from '../../storage';
import { World } from '../../world';
import { FilteredAccess } from '../access';
import { WorldQuery } from '../world_query';
import { IntoFetch, QueryData, ReadonlyQueryData } from './base';

class EntityFetch {
  constructor() {}
}

interface EntityFetch extends QueryData<Entity> {}

IntoFetch.implFor(Entity, {
  static: {
    intoFetch(this: typeof Entity): EntityFetch {
      return new EntityFetch();
    },
  },
});

WorldQuery.implFor<typeof WorldQuery<Entity>, typeof EntityFetch>(EntityFetch, {
  isDense() {
    return true;
  },
  shrink(item: Entity): Entity {
    return item;
  },
  shrinkFetch(): void {},

  initFetch() {},

  setArchetype() {},

  setTable() {},

  fetch(_fetch: any, entity: Entity, _tableRow: TableRow): Entity {
    return entity;
  },

  updateComponentAccess(_state: void, _access: Ptr<FilteredAccess>): void {},

  initState(_world: World): void {},

  getState(_components: Components): Option<void> {
    return Some(undefined);
  },

  matchesComponentSet(
    _state: void,
    _setContainsId: (componentId: ComponentId) => boolean,
  ): boolean {
    return true;
  },
});

QueryData.implFor(EntityFetch);
ReadonlyQueryData.implFor(EntityFetch);

class EntityLocationFetch {
  constructor() {}
}

interface EntityLocationFetch extends QueryData<EntityLocation> {}

IntoFetch.implFor(EntityLocation, {
  static: {
    intoFetch(this: typeof EntityLocation): EntityLocationFetch {
      return new EntityLocationFetch();
    },
  },
});

WorldQuery.implFor<typeof WorldQuery<EntityLocation, Entities>, typeof EntityLocationFetch>(
  EntityLocationFetch,
  {
    isDense() {
      return true;
    },
    shrink(item: EntityLocation): EntityLocation {
      return item;
    },
    shrinkFetch(fetch: Entities): Entities {
      return fetch;
    },

    initFetch(world: World) {
      return world.entities;
    },

    setArchetype() {},

    setTable() {},

    fetch(fetch: Entities, entity: Entity, _tableRow: TableRow): EntityLocation {
      return fetch.get(entity).unwrap();
    },

    updateComponentAccess(_state: void, _access: Ptr<FilteredAccess>): void {},

    initState(_world: World): void {},

    getState(_components: Components): Option<void> {
      return Some(undefined);
    },

    matchesComponentSet(
      _state: void,
      _setContainsId: (componentId: ComponentId) => boolean,
    ): boolean {
      return true;
    },
  },
);

QueryData.implFor(EntityLocationFetch);

ReadonlyQueryData.implFor(EntityLocationFetch);
