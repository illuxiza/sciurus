import {
  Constructor,
  createFactory,
  hasTrait,
  implTrait,
  Ptr,
  Result,
  RustIter,
  TypeId,
  typeId,
  useTrait,
} from 'rustable';
import { Archetype } from '../../archetype/base';
import { Tick } from '../../change_detection/tick';
import { Entity } from '../../entity';
import { FilteredAccess, FilteredAccessSet } from '../../query/access';
import { QueryEntityError } from '../../query/error';
import { IntoFetch, QueryData } from '../../query/fetch';
import { QueryFilter } from '../../query/filter/base';
import { QueryState } from '../../query/state';
import { World } from '../../world';
import { SystemMeta } from '../types';
import { ReadonlySystemParam, SystemParam } from './base';

class QueryParam<D = any> {
  readonly data: QueryData;
  readonly filter: QueryFilter;
  #world?: World;
  #state?: QueryState;
  #lastRun?: Tick;
  #thisRun?: Tick;
  constructor(data: Constructor<D> | QueryData<D>, filter?: QueryFilter) {
    if (hasTrait(data as Constructor<any>, IntoFetch)) {
      this.data = useTrait(data as Constructor<any>, IntoFetch).intoFetch();
    } else {
      this.data = QueryData.wrap(data);
    }
    if (filter) {
      this.filter = QueryFilter.wrap(filter);
    } else {
      this.filter = [];
    }
  }
  init(world: World, state: QueryState, lastRun: Tick, thisRun: Tick): this {
    state.validateWorld(world.id);
    this.#world = world;
    this.#state = state;
    this.#lastRun = lastRun;
    this.#thisRun = thisRun;
    return this;
  }
  clone(hash = new WeakMap<any, any>()): QueryParam<D> {
    const cloned = new QueryParam<D>(this.data as any, this.filter as any);
    if (this.#world) cloned.#world = hash.get(this.#world);
    if (this.#state) cloned.#state = hash.get(this.#state);
    if (this.#lastRun) cloned.#lastRun = hash.get(this.#lastRun);
    if (this.#thisRun) cloned.#thisRun = hash.get(this.#thisRun);
    return cloned;
  }
  iter(): RustIter<D> {
    return this.#state!.iterUncheckedManual(this.#world!, this.#lastRun!, this.#thisRun!).iter();
  }
  single(): D {
    return this.#state!.getSingleUncheckedManual(
      this.#world!,
      this.#lastRun!,
      this.#thisRun!,
    ).unwrap();
  }
  get(entity: Entity): Result<D, QueryEntityError> {
    return this.#state!.getUncheckedManual(this.#world!, entity, this.#lastRun!, this.#thisRun!);
  }
}

type NotArray<T> = T extends any[] ? never : T;

interface QueryParam<D> extends SystemParam<QueryState, QueryParam<D>> {}

type Param<D> = QueryData<NotArray<D>> | Constructor<D>;

export const Query = createFactory(QueryParam) as typeof QueryParam & {
  <D extends readonly any[]>(
    data: { [K in keyof D]: Param<D[K]> },
    filter?: QueryFilter,
  ): QueryParam<D>;
  <D>(data: Param<D>, filter?: QueryFilter): QueryParam<D>;
};

export interface Query<D = any> extends QueryParam<D>, SystemParam<QueryState, Query<D>> {}

implTrait(Query, SystemParam, {
  initParamState(this: Query, world: World, systemMeta: SystemMeta): QueryState {
    const state = QueryState.newWithAccess(
      this.data,
      this.filter,
      world,
      Ptr({
        get: () => systemMeta.archetypeComponentAccess,
        set: (a) => (systemMeta.archetypeComponentAccess = a),
      }),
    );
    initQueryParam(this.data, this.filter, world, systemMeta, state);
    return state;
  },
  newArchetype(state: QueryState, archetype: Archetype, systemMeta: SystemMeta): void {
    state.newArchetype(
      archetype,
      Ptr({
        get: () => systemMeta.archetypeComponentAccess,
        set: (a) => (systemMeta.archetypeComponentAccess = a),
      }),
    );
  },
  getParam(this: Query, state: QueryState, systemMeta: SystemMeta, world: World, changeTick: Tick) {
    return this.init(world, state, systemMeta.lastRun, changeTick);
  },
});

implTrait(Query, ReadonlySystemParam);

export function initQueryParam(
  data: QueryData,
  filter: QueryFilter,
  world: World,
  systemMeta: SystemMeta,
  state: QueryState,
): void {
  assertComponentAccessCompatibility(
    systemMeta.name,
    typeId(data),
    typeId(filter),
    systemMeta.componentAccessSet,
    state.componentAccess,
    world,
  );
  systemMeta.componentAccessSet.add(state.componentAccess.clone());
}

function assertComponentAccessCompatibility(
  systemName: string,
  queryType: TypeId,
  filterType: TypeId,
  systemAccess: FilteredAccessSet,
  current: FilteredAccess,
  world: World,
): void {
  const conflicts = systemAccess.getConflictsSingle(current);
  if (conflicts.isEmpty()) {
    return;
  }
  let accesses = conflicts.formatConflictList(world);
  if (accesses.length !== 0) {
    accesses += ' ';
  }
  throw new Error(
    `error[B0001]: Query<${queryType}, ${filterType}> in system ${systemName} accesses component(s) ${accesses}in a way that conflicts with a previous system parameter. Consider using \`Without<T>\` to create disjoint Queries or merging conflicting Queries into a \`ParamSet\`. See: https://bevyengine.org/learn/errors/b0001`,
  );
}
