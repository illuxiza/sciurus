import { Constructor, implTrait, trait } from 'rustable';
import { WorldQuery } from '../world_query';
import { ComponentId } from '../../component';

@trait
export class QueryData<Item = any, Fetch = any, State = any> extends WorldQuery<
  Item,
  Fetch,
  State
> {}

@trait
export class ReadonlyQueryData<Item = any, Fetch = any, State = any> extends QueryData<
  Item,
  Fetch,
  State
> {}

@trait
export class IntoFetch<D> {
  DATA!: QueryData<D>;
  static intoFetch<D extends object>(): QueryData<D> {
    throw new Error('Not implemented');
  }
  static shrink(item: any): any {
    return this.intoFetch().shrink(item);
  }
  static shrinkFetch(fetch: any): any {
    return this.intoFetch().shrinkFetch(fetch);
  }
  static initFetch(world: any, state: any, lastRun: any, thisRun: any): any {
    return this.intoFetch().initFetch(world, state, lastRun, thisRun);
  }
  static setArchetype(fetch: any, state: any, archetype: any, table: any): void {
    this.intoFetch().setArchetype(fetch, state, archetype, table);
  }
  static setTable(fetch: any, state: any, table: any): void {
    this.intoFetch().setTable(fetch, state, table);
  }
  static setAccess(state: any, access: any): void {
    this.intoFetch().setAccess(state, access);
  }
  static fetch(fetch: any, entity: any, tableRow: any): any {
    return this.intoFetch().fetch(fetch, entity, tableRow);
  }
  static updateComponentAccess(state: any, access: any): void {
    this.intoFetch().updateComponentAccess(state, access);
  }
  static isDense(): boolean {
    return this.intoFetch().isDense();
  }
  static initState(world: any): any {
    return this.intoFetch().initState(world);
  }
  static getState(state: any): any {
    return this.intoFetch().getState(state);
  }
  static matchesComponentSet(
    state: any,
    setContainsId: (componentId: ComponentId) => boolean,
  ): boolean {
    return this.intoFetch().matchesComponentSet(state, setContainsId);
  }
}

implTrait(Array, QueryData);

type Item<D> = D extends QueryData<infer I> ? I : D extends Constructor<infer I> ? I : never;

declare global {
  interface Array<T> extends QueryData<Item<T>[]> {}
}
