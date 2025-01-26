import { NOT_IMPLEMENTED, TraitValid } from '@sciurus/utils';
import { implTrait, None, Option, Ptr, Some, trait } from 'rustable';
import { Archetype } from '../archetype/base';
import { Tick } from '../change_detection/tick';
import { ComponentId, Components } from '../component';
import { Entity } from '../entity';
import { Table, type TableRow } from '../storage';
import { World } from '../world';
import { FilteredAccess } from './access';

/**
 * A query that can be run on a World to get a set of components.
 */
@trait
export class WorldQuery<Item = any, Fetch = any, State = any> extends TraitValid {
  ITEM!: Item;
  FETCH!: Fetch;
  STATE!: State;
  isDense(): boolean {
    return false;
  }
  /**
   * This function manually implements subtyping for the query items.
   */
  shrink(_item: Item): Item {
    throw NOT_IMPLEMENTED;
  }

  /**
   * This function manually implements subtyping for the query fetches.
   */
  shrinkFetch(_fetch: Fetch): Fetch {
    throw NOT_IMPLEMENTED;
  }
  /**
   * Initializes the fetch for the query.
   */
  initFetch(_world: World, _state: State, _lastRun: Tick, _thisRun: Tick): Fetch {
    throw NOT_IMPLEMENTED;
  }
  /**
   * Sets the archetype for the fetch.
   */
  setArchetype(_fetch: Fetch, _state: State, _archetype: Archetype, _table: Table): void {
    throw NOT_IMPLEMENTED;
  }

  /**
   * Sets the table for the fetch.
   */
  setTable(_fetch: Fetch, _state: State, _table: Table): void {
    throw NOT_IMPLEMENTED;
  }

  /**
   * Sets the access for the query.
   */
  setAccess(_state: State, _access: FilteredAccess): void {
    // Implementation not provided
  }

  /**
   * Fetches the query item for the given entity and table row.
   * @param fetch The fetch object.
   * @param entity The entity to fetch for.
   * @param tableRow The table row of the entity.
   * @returns The fetched item.
   */
  fetch(_fetch: Fetch, _entity: Entity, _tableRow: TableRow): Item {
    throw NOT_IMPLEMENTED;
  }

  /**
   * Updates the component access for the given state.
   * @param state The query state.
   * @param access The filtered access to update.
   */
  updateComponentAccess(_state: State, _access: Ptr<FilteredAccess>): void {
    throw NOT_IMPLEMENTED;
  }

  /**
   * Initializes the query state.
   */
  initState(_world: World): State {
    throw NOT_IMPLEMENTED;
  }

  getState(_components: Components): Option<State> {
    throw NOT_IMPLEMENTED;
  }

  matchesComponentSet(
    _state: State,
    _setContainsId: (componentId: ComponentId) => boolean,
  ): boolean {
    throw NOT_IMPLEMENTED;
  }
}

implTrait(Array<WorldQuery>, WorldQuery, {
  shrink(this: Array<WorldQuery>, item: any): any {
    return this.map((q, i) => q.shrink(item[i]));
  },
  shrinkFetch(this: Array<WorldQuery>, fetch: any): any {
    return this.map((q, i) => q.shrinkFetch(fetch[i]));
  },
  initFetch(this: Array<WorldQuery>, world: World, state: any, lastRun: Tick, thisRun: Tick): any {
    return this.map((q, i) => q.initFetch(world, state[i], lastRun, thisRun));
  },
  setArchetype(
    this: Array<WorldQuery>,
    fetch: any,
    state: any,
    archetype: Archetype,
    table: Table,
  ): void {
    this.forEach((q, i) => q.setArchetype(fetch[i], state[i], archetype, table));
  },
  setTable(this: Array<WorldQuery>, fetch: any, state: any, table: Table): void {
    this.forEach((q, i) => q.setTable(fetch[i], state[i], table));
  },
  setAccess(this: Array<WorldQuery>, state: any, access: FilteredAccess): void {
    this.forEach((q, i) => q.setAccess(state[i], access));
  },
  fetch(this: Array<WorldQuery>, fetch: any, entity: Entity, tableRow: TableRow): any {
    return this.map((q, i) => q.fetch(fetch[i], entity, tableRow));
  },
  updateComponentAccess(this: Array<WorldQuery>, state: any, access: Ptr<FilteredAccess>): void {
    this.forEach((q, i) => q.updateComponentAccess(state[i], access));
  },
  initState(this: Array<WorldQuery>, world: World): any {
    return this.map((q) => q.initState(world));
  },
  getState(this: Array<WorldQuery>, components: Components): Option<any> {
    const ret = [];
    for (const q of this) {
      const state = q.getState(components);
      if (state.isNone()) {
        return None;
      }
      ret.push(state.unwrap());
    }
    return Some(ret);
  },
  matchesComponentSet(
    this: Array<WorldQuery>,
    state: any,
    setContainsId: (componentId: ComponentId) => boolean,
  ): boolean {
    if (this.length === 0) {
      return true;
    }
    return this.some((q, i) => q.matchesComponentSet(state[i], setContainsId));
  },
});
