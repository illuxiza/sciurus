import '@rustable/iter/advanced';
import { FixedBitSet, logger } from '@sciurus/utils';
import { Err, iter, None, Ok, Option, Ptr, Result, RustIter, Some, Vec } from 'rustable';
import { Archetype } from '../archetype/base';
import { ArchetypeGeneration, ArchetypeId } from '../archetype/types';
import { Tick } from '../change_detection';
import { ComponentId } from '../component';
import { Entity } from '../entity';
import { TableId } from '../storage';
import { World } from '../world';
import { Access, FilteredAccess } from './access';
import { QueryBuilder } from './builder';
import { QueryEntityError, QuerySingleError } from './error';
import { QueryData } from './fetch';
import { EMPTY_QUERY_FILTER, QueryFilter } from './filter/base';
import { QueryIter } from './iter';

/**
 * An ID for either a table or an archetype. Used for Query iteration.
 *
 * Query iteration is exclusively dense (over tables) or archetypal (over archetypes) based on whether
 * the query filters are dense or not. This is represented by the `QueryState::isDense` field.
 */
export class StorageId {
  constructor(
    public tableId: TableId,
    public archetypeId: ArchetypeId,
  ) {}
}

/**
 * Provides scoped access to a World state according to a given QueryData and QueryFilter.
 */
export class QueryState<D extends QueryData = any, F extends QueryFilter = any> {
  constructor(
    public data: D,
    public filter: F,
    public wId: number,
    public _archetypeGeneration: ArchetypeGeneration,
    public _matchedTables: FixedBitSet,
    public _matchedArchetypes: FixedBitSet,
    public _compAccess: FilteredAccess,
    public matchedStorageIds: Vec<StorageId>,
    public isDense: boolean,
    public fetchState: D['STATE'],
    public filterState: F['STATE'],
  ) {}

  static new(data: QueryData, filter: QueryFilter, world: World): QueryState {
    const state = newUninitialized(data, filter, world);
    state.updateArchetypes(world);
    return state;
  }

  static tryNew(data: QueryData, filter: QueryFilter, world: World): Option<QueryState> {
    const state = tryNewUninitialized(data, filter, world);
    if (state.isSome()) {
      state.unwrap().updateArchetypes(world);
      return state;
    }
    return None;
  }

  static newWithAccess(
    data: QueryData,
    filter: QueryFilter,
    world: World,
    access: Ptr<Access>,
  ): QueryState {
    const state = newUninitialized(data, filter, world);
    for (const archetype of world.archetypes.iter()) {
      if (newArchetypeInternal(state, archetype)) {
        state.updateArchetypeComponentAccess(archetype, access);
      }
    }
    state._archetypeGeneration = world.archetypes.generation();

    if (state._compAccess.access().hasReadAllResources()) {
      access.readAllResources();
    } else {
      for (const componentId of state._compAccess.access().resourceReads()) {
        access.addResourceRead(world.initializeResourceInternal(componentId).id);
      }
    }

    if (state._compAccess.access().hasWriteAllResources()) {
      access.writeAllResources();
    } else {
      for (const componentId of state._compAccess.access().resourceWrites()) {
        access.addResourceWrite(world.initializeResourceInternal(componentId).id);
      }
    }

    return state;
  }

  static fromBuilder(builder: QueryBuilder): QueryState {
    const fetchState = builder.queryData.initState(builder.world);
    const filterState = builder.queryFilter.initState(builder.world);
    builder.queryData.setAccess(fetchState, builder.access());

    const state = new QueryState(
      builder.queryData,
      builder.queryFilter,
      builder.world.id,
      ArchetypeGeneration.initial(),
      new FixedBitSet(),
      new FixedBitSet(),
      builder.access().clone(),
      Vec.new(),
      builder.isDense(),
      fetchState,
      filterState,
    );

    state.updateArchetypes(builder.world);
    return state;
  }

  /**
   * Returns true if the query matches no entities.
   */
  isEmpty(world: World, lastRun: Tick, thisRun: Tick): boolean {
    this.validateWorld(world.id);
    return this.isEmptyUnsafeWorldCell(world, lastRun, thisRun);
  }

  /**
   * Returns true if the given Entity matches the query.
   * This is always guaranteed to run in O(1) time.
   */
  contains(entity: Entity, world: World, lastRun: Tick, thisRun: Tick): boolean {
    return this.getUncheckedManual(world, entity, lastRun, thisRun).isOk();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isEmptyUnsafeWorldCell(world: World, lastRun: Tick, thisRun: Tick): boolean {
    // return this.iterUncheckedManual(world, lastRun, thisRun).next().isNone();
    return false;
  }

  /**
   * Updates the state's internal view of the World's archetypes.
   */
  updateArchetypes(world: World) {
    this.validateWorld(world.id);
    this.updateArchetypesUnsafeWorldCell(world);
  }

  /**
   * Returns the components accessed by this query.
   */
  get componentAccess(): FilteredAccess {
    return this._compAccess;
  }

  /**
   * Returns the tables matched by this query.
   */
  get matchedTables(): RustIter<TableId> {
    return iter(this._matchedTables.ones());
  }

  /**
   * Returns the archetypes matched by this query.
   */
  get matchedArchetypes(): RustIter<ArchetypeId> {
    return iter(this._matchedArchetypes.ones());
  }

  /**
   * Updates the state's internal view of the world's archetypes.
   */
  updateArchetypesUnsafeWorldCell(world: World) {
    this.validateWorld(world.id);
    if (this._compAccess.required.isEmpty()) {
      const archetypes = world.archetypes;
      const oldGeneration = this._archetypeGeneration;
      this._archetypeGeneration = archetypes.generation();

      for (let i = oldGeneration.id; i < archetypes.len(); i++) {
        newArchetypeInternal(this, archetypes.getUnchecked(i));
      }
    } else {
      if (this._archetypeGeneration.id === world.archetypes.generation().id) {
        return;
      }

      const potentialArchetypes = iter(this._compAccess.required.ones())
        .filterMap((componentId) =>
          world.archetypes
            .componentIndex()
            .get(componentId)
            .map((index) => Vec.from(index.keys())),
        )
        .minBy((v) => v.len());

      if (potentialArchetypes.isSome()) {
        for (const archetypeId of potentialArchetypes.unwrap()) {
          if (archetypeId < this._archetypeGeneration.id) {
            continue;
          }
          const archetype = world.archetypes.getUnchecked(archetypeId);
          newArchetypeInternal(this, archetype);
        }
      }
      this._archetypeGeneration = world.archetypes.generation();
    }
  }

  /**
   * Validates that the given WorldId matches the World used to create this QueryState.
   */
  validateWorld(worldId: number) {
    if (this.wId !== worldId) {
      throw new Error(
        `Encountered a mismatched World. This QueryState was created from ${this.wId}, but a method was called using ${worldId}.`,
      );
    }
  }

  /**
   * Processes a new archetype and updates the internal state.
   * @param archetype The archetype to process.
   * @param access The access to update.
   * @returns void
   */
  newArchetype(archetype: Archetype, access: Ptr<Access>): void {
    // SAFETY: The caller ensures that `archetype` is from the World the state was initialized from.
    const matches = newArchetypeInternal(this, archetype);
    if (matches) {
      // SAFETY: The caller ensures that `archetype` is from the World the state was initialized from.
      this.updateArchetypeComponentAccess(archetype, access);
    }
  }

  /**
   * Returns true if this query matches a set of components.
   */
  matchesComponentSet(setContainsId: (componentId: ComponentId) => boolean): boolean {
    return this._compAccess.filterSets
      .iter()
      .any(
        (set) =>
          iter(set.with.ones()).all((index) => setContainsId(index)) &&
          iter(set.without.ones()).all((index) => !setContainsId(index)),
      );
  }

  updateArchetypeComponentAccess(archetype: Archetype, access: Ptr<Access>): void {
    const [componentReadsAndWrites, componentReadsAndWritesInverted] = this.componentAccess
      .access()
      .componentReadsAndWrites();
    const [componentWrites, componentWritesInverted] = this.componentAccess
      .access()
      .componentWrites();

    if (!componentReadsAndWritesInverted && !componentWritesInverted) {
      iter(componentReadsAndWrites).forEach((id) => {
        const archetypeComponentId = archetype.getArchetypeComponentId(id);
        if (archetypeComponentId.isSome()) {
          access.addComponentRead(archetypeComponentId.unwrap());
        }
      });
      iter(componentWrites).forEach((id) => {
        const archetypeComponentId = archetype.getArchetypeComponentId(id);
        if (archetypeComponentId.isSome()) {
          access.addComponentWrite(archetypeComponentId.unwrap());
        }
      });
      return;
    }

    for (const [
      componentId,
      archetypeComponentId,
    ] of archetype.componentsWithArchetypeComponentId()) {
      if (this.componentAccess.access().hasComponentRead(componentId)) {
        access.addComponentRead(archetypeComponentId);
      }
      if (this.componentAccess.access().hasComponentWrite(componentId)) {
        access.addComponentWrite(archetypeComponentId);
      }
    }
  }

  transmute(newD: QueryData, world: World): QueryState {
    return this.transmuteFiltered(newD, EMPTY_QUERY_FILTER, world);
  }

  transmuteFiltered<NewD extends QueryData, NewF extends QueryFilter>(
    newD: NewD,
    newF: NewF,
    world: World,
  ): QueryState {
    this.validateWorld(world.id);

    let componentAccess = new FilteredAccess();
    const fetchState = newD.getState(world.components);
    const filterState = newF.getState(world.components);

    newD.setAccess(fetchState, this._compAccess);
    newD.updateComponentAccess(
      fetchState,
      Ptr({
        get: () => componentAccess,
        set: (a) => (componentAccess = a),
      }),
    );

    let filterComponentAccess = new FilteredAccess();
    newF.updateComponentAccess(
      filterState,
      Ptr({
        get: () => filterComponentAccess,
        set: (a) => (filterComponentAccess = a),
      }),
    );

    componentAccess.extend(filterComponentAccess);

    if (!componentAccess.isSubset(this._compAccess)) {
      throw new Error(
        `Transmuted state for ${newD.constructor.name}, ${newF.constructor.name} attempts to access terms that are not allowed by original state ${this.data.constructor.name}, ${this.filter.constructor.name}.`,
      );
    }

    return new QueryState(
      newD,
      newF,
      this.wId,
      this._archetypeGeneration,
      this._matchedTables.clone(),
      this._matchedArchetypes.clone(),
      this._compAccess.clone(),
      this.matchedStorageIds.clone(),
      this.isDense,
      fetchState,
      filterState,
    );
  }

  join(orderD: QueryData, newD: QueryData, world: World, other: QueryState): QueryState {
    return this.joinFiltered(orderD, EMPTY_QUERY_FILTER, newD, EMPTY_QUERY_FILTER, world, other);
  }

  joinFiltered<
    OtherD extends QueryData,
    OtherF extends QueryFilter,
    NewD extends QueryData,
    NewF extends QueryFilter,
  >(
    orderD: OtherD,
    orderF: OtherF,
    newD: NewD,
    newF: NewF,
    world: World,
    other: QueryState,
  ): QueryState {
    if (this.wId !== other.wId) {
      throw new Error('Joining queries initialized on different worlds is not allowed.');
    }
    this.validateWorld(world.id);

    let componentAccess = new FilteredAccess();
    const newFetchState = newD.getState(world.components);
    const newFilterState = newF.getState(world.components);

    newD.setAccess(newFetchState, this._compAccess);
    newD.updateComponentAccess(
      newFetchState,
      Ptr({
        get: () => componentAccess,
        set: (a) => (componentAccess = a),
      }),
    );

    let newFilterComponentAccess = new FilteredAccess();
    newF.updateComponentAccess(
      newFilterState,
      Ptr({
        get: () => newFilterComponentAccess,
        set: (a) => (newFilterComponentAccess = a),
      }),
    );

    componentAccess.extend(newFilterComponentAccess);

    let joinedComponentAccess = this._compAccess.clone();
    joinedComponentAccess.extend(other._compAccess);

    if (!componentAccess.isSubset(joinedComponentAccess)) {
      throw new Error(
        `Joined state for ${newD.constructor.name}, ${newF.constructor.name} attempts to access terms that are not allowed by state ${this.data.constructor.name}, ${this.filter.constructor.name} joined with ${orderD.constructor.name}, ${orderF.constructor.name}.`,
      );
    }

    if (this._archetypeGeneration !== other._archetypeGeneration) {
      logger.warn(
        'You have tried to join queries with different archetype_generations. This could lead to unpredictable results.',
      );
    }

    const isDense = this.isDense && other.isDense;

    let matchedTables = this._matchedTables.clone();
    let matchedArchetypes = this._matchedArchetypes.clone();
    matchedTables.intersectWith(other._matchedTables);
    matchedArchetypes.intersectWith(other._matchedArchetypes);

    const matchedStorageIds = isDense
      ? iter(matchedTables.ones())
          .map((id) => new StorageId(id, 0))
          .collectInto((v) => Vec.from(v))
      : iter(matchedArchetypes.ones())
          .map((id) => new StorageId(0, id))
          .collectInto((v) => Vec.from(v));

    return new QueryState(
      newD,
      newF,
      this.wId,
      this._archetypeGeneration,
      matchedTables,
      matchedArchetypes,
      joinedComponentAccess,
      matchedStorageIds,
      isDense,
      newFetchState,
      newFilterState,
    );
  }

  /**
   * Gets the query result for the given World and Entity.
   */
  get(world: World, entity: Entity): Result<any, QueryEntityError> {
    this.updateArchetypes(world);
    return this.getUncheckedManual(world, entity, world.lastChangeTick, world.changeTick);
  }

  getMany(world: World, entities: Entity[]): Result<any[], QueryEntityError> {
    this.updateArchetypes(world);
    return this.getManyReadonlyManual(world, entities, world.lastChangeTick, world.changeTick);
  }

  getMut(world: World, entity: Entity): Result<any, QueryEntityError> {
    this.updateArchetypes(world);
    const changeTick = world.changeTick;
    const lastChangeTick = world.lastChangeTick;
    return this.getUncheckedManual(world, entity, lastChangeTick, changeTick);
  }

  getManyMut(world: World, entities: Entity[]): Result<any[], QueryEntityError> {
    this.updateArchetypes(world);
    const changeTick = world.changeTick;
    const lastChangeTick = world.lastChangeTick;
    return this.getManyUncheckedManual(world, entities, lastChangeTick, changeTick);
  }

  getUnchecked(world: World, entity: Entity): Result<any, QueryEntityError> {
    this.updateArchetypesUnsafeWorldCell(world);
    return this.getUncheckedManual(world, entity, world.lastChangeTick, world.changeTick);
  }

  getUncheckedManual(
    world: World,
    entity: Entity,
    lastRun: Tick,
    thisRun: Tick,
  ): Result<any, QueryEntityError> {
    const locationOp = world.entities.get(entity);
    if (locationOp.isNone()) {
      return Err(QueryEntityError.NoSuchEntity(entity, world));
    }

    const location = locationOp.unwrap();
    if (!this._matchedArchetypes.contains(location.archetypeId)) {
      return Err(QueryEntityError.QueryDoesNotMatch(entity, world));
    }

    const archetype = world.archetypes.getUnchecked(location.archetypeId);
    let fetch = this.data.initFetch(world, this.fetchState, lastRun, thisRun);
    let filter = this.filter.initFetch(world, this.filterState, lastRun, thisRun);
    const table = world.storages.tables.getUnchecked(location.tableId);

    this.data.setArchetype(fetch, this.fetchState, archetype, table);
    this.filter.setArchetype(filter, this.filterState, archetype, table);

    if (this.filter.filterFetch(filter, entity, location.tableRow)) {
      return Ok(this.data.fetch(fetch, entity, location.tableRow));
    } else {
      return Err(QueryEntityError.QueryDoesNotMatch(entity, world));
    }
  }

  getManyReadonlyManual(
    world: World,
    entities: Entity[],
    lastRun: Tick,
    thisRun: Tick,
  ): Result<any[], QueryEntityError> {
    const values: any[] = new Array(entities.length);
    for (let i = 0; i < entities.length; i++) {
      const result = this.getUncheckedManual(world, entities[i], lastRun, thisRun);
      if (result.isErr()) {
        return Err(result.unwrapErr());
      }
      values[i] = result.unwrap();
    }
    return Ok(values);
  }

  getManyUncheckedManual(
    world: World,
    entities: Entity[],
    lastRun: Tick,
    thisRun: Tick,
  ): Result<any[], QueryEntityError> {
    // Verify that all entities are unique
    for (let i = 0; i < entities.length; i++) {
      for (let j = 0; j < i; j++) {
        if (entities[i] === entities[j]) {
          return Err(QueryEntityError.AliasedMutability(entities[i]));
        }
      }
    }

    const values: any[] = new Array(entities.length);
    for (let i = 0; i < entities.length; i++) {
      const result = this.getUncheckedManual(world, entities[i], lastRun, thisRun);
      if (result.isErr()) {
        return Err(result.unwrapErr());
      }
      values[i] = result.unwrap();
    }

    return Ok(values);
  }

  iter(world: World): QueryIter<D, F> {
    this.updateArchetypes(world);
    // SAFETY: query is read only
    return this.iterUncheckedManual(world, world.lastChangeTick, world.changeTick);
  }

  iterManual(world: World): QueryIter<D, F> {
    this.validateWorld(world.id);
    // SAFETY: query is read only and world is validated
    return this.iterUncheckedManual(world, world.lastChangeTick, world.changeTick);
  }

  iterUnchecked(world: World): QueryIter<D, F> {
    this.updateArchetypesUnsafeWorldCell(world);
    return this.iterUncheckedManual(world, world.lastChangeTick, world.changeTick);
  }

  iterUncheckedManual(world: World, lastRun: Tick, thisRun: Tick): QueryIter<D, F> {
    return QueryIter.new(world, this, lastRun, thisRun);
  }

  single(world: World): D['ITEM'] {
    const result = this.getSingle(world);
    if (result.isOk()) {
      return result.unwrap();
    } else {
      throw new Error(`Cannot get single query result: ${result.unwrapErr()}`);
    }
  }

  getSingle(world: World): Result<D['ITEM'], QuerySingleError> {
    this.updateArchetypes(world);
    // SAFETY: query is read only
    return this.getSingleUncheckedManual(world, world.lastChangeTick, world.changeTick);
  }

  singleMut(world: World): D['ITEM'] {
    const result = this.getSingleMut(world);
    if (result.isOk()) {
      return result.unwrap();
    } else {
      throw new Error(`Cannot get single query result: ${result.unwrapErr()}`);
    }
  }

  getSingleMut(world: World): Result<D['ITEM'], QuerySingleError> {
    this.updateArchetypes(world);
    const changeTick = world.changeTick;
    const lastChangeTick = world.lastChangeTick;
    // SAFETY: query has unique world access
    return this.getSingleUncheckedManual(world, lastChangeTick, changeTick);
  }

  getSingleUnchecked(world: World): Result<D['ITEM'], QuerySingleError> {
    this.updateArchetypesUnsafeWorldCell(world);
    return this.getSingleUncheckedManual(world, world.lastChangeTick, world.changeTick);
  }

  getSingleUncheckedManual(
    world: World,
    lastRun: Tick,
    thisRun: Tick,
  ): Result<D['ITEM'], QuerySingleError> {
    const query = this.iterUncheckedManual(world, lastRun, thisRun);
    const first = query.next();
    const extra = query.next().isSome();

    if (first.isSome() && !extra) {
      return Ok(first.unwrap());
    } else if (first.isNone()) {
      return Err(QuerySingleError.NoEntities(this.constructor.name));
    } else {
      return Err(QuerySingleError.MultipleEntities(this.constructor.name));
    }
  }
}

function newUninitialized(data: QueryData, filter: QueryFilter, world: World): QueryState {
  const fetchState = data.initState(world);
  const filterState = filter.initState(world);
  return fromStatesUninitialized(data, filter, world.id, fetchState, filterState);
}

function tryNewUninitialized(
  data: QueryData,
  filter: QueryFilter,
  world: World,
): Option<QueryState> {
  const fetchState = data.getState(world.components);
  if (fetchState.isNone()) {
    return None;
  }

  const filterState = filter.getState(world.components);
  if (filterState.isNone()) {
    return None;
  }

  return Some(
    fromStatesUninitialized(data, filter, world.id, fetchState.unwrap(), filterState.unwrap()),
  );
}

function fromStatesUninitialized(
  data: QueryData,
  filter: QueryFilter,
  worldId: number,
  fetchState: any,
  filterState: any,
): QueryState {
  let componentAccess = new FilteredAccess();
  data.updateComponentAccess(
    fetchState,
    Ptr({
      get: () => componentAccess,
      set: (a) => (componentAccess = a),
    }),
  );

  let filterComponentAccess = new FilteredAccess();
  filter.updateComponentAccess(
    filterState,
    Ptr({
      get: () => filterComponentAccess,
      set: (a) => (filterComponentAccess = a),
    }),
  );

  componentAccess.extend(filterComponentAccess);

  const isDense = data.isDense() && filter.isDense();

  return new QueryState(
    data,
    filter,
    worldId,
    ArchetypeGeneration.initial(),
    new FixedBitSet(),
    new FixedBitSet(),
    componentAccess,
    Vec.new(),
    isDense,
    fetchState,
    filterState,
  );
}

/**
 * Process the given Archetype to update internal metadata about the Tables and Archetypes that are matched by this query.
 */
function newArchetypeInternal<D extends QueryData = any, F extends QueryFilter = any>(
  self: QueryState<D, F>,
  archetype: Archetype,
): boolean {
  if (
    self.data.matchesComponentSet(self.fetchState, (id) => archetype.contains(id)) &&
    self.filter.matchesComponentSet(self.filterState, (id) => archetype.contains(id)) &&
    self.matchesComponentSet((id) => archetype.contains(id))
  ) {
    const archetypeIndex = archetype.id;
    if (!self._matchedArchetypes.contains(archetypeIndex)) {
      self._matchedArchetypes.growAndInsert(archetypeIndex);
      if (!self.isDense) {
        self.matchedStorageIds.push(new StorageId(0, archetype.id));
      }
    }

    const tableIndex = archetype.tableId;
    if (!self._matchedTables.contains(tableIndex)) {
      self._matchedTables.growAndInsert(tableIndex);
      if (self.isDense) {
        self.matchedStorageIds.push(new StorageId(archetype.tableId, 0));
      }
    }
    return true;
  }
  return false;
}
