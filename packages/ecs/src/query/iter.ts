import { deepClone, iter, None, Option, RustIter, Some, Vec } from 'rustable';
import { Archetype, ArchetypeEntity, Archetypes } from '../archetype';
import { Tick } from '../change_detection';
import { Entity } from '../entity';
import { Table, Tables } from '../storage';
import { World } from '../world';
import { QueryData } from './fetch';
import { QueryFilter } from './filter/base';
import { QueryState, StorageId } from './state';

export class QueryIter<D extends QueryData, F extends QueryFilter> {
  constructor(
    public world: World,
    public tables: Tables,
    public archetypes: Archetypes,
    public queryState: QueryState<D, F>,
    public cursor: QueryIterationCursor<D, F>,
  ) {}

  static new<D extends QueryData, F extends QueryFilter>(
    world: World,
    queryState: QueryState<D, F>,
    lastRun: Tick,
    thisRun: Tick,
  ): QueryIter<D, F> {
    return new QueryIter(
      world,
      world.storages.tables,
      world.archetypes,
      queryState,
      QueryIterationCursor.init(world, queryState, lastRun, thisRun),
    );
  }

  [Symbol.iterator](): IterableIterator<D['ITEM']> {
    const self = this;
    return {
      next(): IteratorResult<D['ITEM']> {
        const op = self.next();
        if (op.isNone()) {
          return { value: undefined, done: true };
        }
        const item = op.unwrap();
        return { value: item, done: false };
      },
      [Symbol.iterator](): IterableIterator<D['ITEM']> {
        return this;
      },
    };
  }

  next(): Option<D['ITEM']> {
    return this.cursor.next(this.tables, this.archetypes, this.queryState);
  }

  iter(): RustIter<D['ITEM']> {
    return iter(this);
  }

  sizeHint(): [number, number?] {
    const maxSize = this.cursor.maxRemaining(this.tables, this.archetypes);
    const archetypeQuery = this.queryState.filter.isArchetypal();
    const minSize = archetypeQuery ? maxSize : 0;
    return [minSize, maxSize];
  }

  fold(init: D['ITEM'], func: (accum: D['ITEM'], item: D['ITEM']) => D['ITEM']): D['ITEM'] {
    let accum = init;
    while (this.cursor.currentRow < this.cursor.currentLen) {
      const op = this.cursor.next(this.tables, this.archetypes, this.queryState);
      if (op.isNone()) break;
      const item = op.unwrap();
      accum = func(accum, item);
    }
    for (const id of deepClone(this.cursor.storageIdIter)) {
      accum = this.foldOverStorageRange(accum, func, id);
    }
    return accum;
  }

  remaining(): QueryIter<D, F> {
    return new QueryIter(
      this.world,
      this.tables,
      this.archetypes,
      this.queryState,
      this.cursor.clone(),
    );
  }

  remainingMut(): QueryIter<D, F> {
    return new QueryIter(
      this.world,
      this.tables,
      this.archetypes,
      this.queryState,
      this.cursor.reborrow(),
    );
  }

  foldOverStorageRange<B>(
    accum: B,
    func: (accum: B, item: D['ITEM']) => B,
    storage: StorageId,
    range?: [number, number],
  ): B {
    if (this.cursor.isDense) {
      const tableId = storage.tableId;
      const table = this.tables.get(tableId).unwrap();
      const [start, end] = range ?? [0, table.entityCount()];
      return this.foldOverTableRange(accum, func, table, [start, end]);
    } else {
      const archetypeId = storage.archetypeId;
      const archetype = this.archetypes.get(archetypeId).unwrap();
      const table = this.tables.get(archetype.tableId).unwrap();
      const [start, end] = range ?? [0, archetype.len()];
      if (table.entityCount() === archetype.len()) {
        return this.foldOverDenseArchetypeRange(accum, func, archetype, [start, end]);
      } else {
        return this.foldOverArchetypeRange(accum, func, archetype, [start, end]);
      }
    }
  }

  foldOverTableRange<B>(
    accum: B,
    func: (accum: B, item: D['ITEM']) => B,
    table: Table,
    range: [number, number],
  ): B {
    if (table.isEmpty()) {
      return accum;
    }

    const [start, end] = range;
    this.queryState.data.setTable(this.cursor.fetch, this.queryState.fetchState, table);
    this.queryState.filter.setTable(this.cursor.filter, this.queryState.filterState, table);

    const entities = table.entities;
    for (let row = start; row < end; row++) {
      const entity = entities.get(row).unwrap();
      const tableRow = row;
      if (!this.queryState.filter.filterFetch(this.cursor.filter, entity, tableRow)) {
        continue;
      }
      const item = this.queryState.data.fetch(this.cursor.fetch, entity, tableRow);
      accum = func(accum, item);
    }

    return accum;
  }

  foldOverArchetypeRange<B>(
    accum: B,
    func: (accum: B, item: D['ITEM']) => B,
    archetype: Archetype,
    range: [number, number],
  ): B {
    if (archetype.isEmpty()) {
      return accum;
    }

    const [start, end] = range;
    const table = this.tables.get(archetype.tableId).unwrap();
    this.queryState.data.setArchetype(
      this.cursor.fetch,
      this.queryState.fetchState,
      archetype,
      table,
    );
    this.queryState.filter.setArchetype(
      this.cursor.filter,
      this.queryState.filterState,
      archetype,
      table,
    );

    const entities = archetype.entities;
    for (let index = start; index < end; index++) {
      const archetypeEntity = entities.get(index).unwrap();
      if (
        !this.queryState.filter.filterFetch(
          this.cursor.filter,
          archetypeEntity.id,
          archetypeEntity.tableRow,
        )
      ) {
        continue;
      }
      const item = this.queryState.data.fetch(
        this.cursor.fetch,
        archetypeEntity.id,
        archetypeEntity.tableRow,
      );
      accum = func(accum, item);
    }

    return accum;
  }

  foldOverDenseArchetypeRange<B>(
    accum: B,
    func: (accum: B, item: D['ITEM']) => B,
    archetype: Archetype,
    range: [number, number],
  ): B {
    if (archetype.isEmpty()) {
      return accum;
    }

    const [start, end] = range;
    const table = this.tables.get(archetype.tableId).unwrap();
    this.queryState.data.setArchetype(
      this.cursor.fetch,
      this.queryState.fetchState,
      archetype,
      table,
    );
    this.queryState.filter.setArchetype(
      this.cursor.filter,
      this.queryState.filterState,
      archetype,
      table,
    );

    const entities = table.entities;
    for (let row = start; row < end; row++) {
      const entity = entities.get(row).unwrap();
      if (!this.queryState.filter.filterFetch(this.cursor.filter, entity, row)) {
        continue;
      }
      const item = this.queryState.data.fetch(this.cursor.fetch, entity, row);
      accum = func(accum, item);
    }

    return accum;
  }

  //   sort(): QuerySortedIter<D, F, RustIter<Entity> & ExactSizeIterator & DoubleEndedIterator & FusedIterator> {
  // if (!this.cursor.archetypeEntities.isEmpty() || !this.cursor.tableEntities.isEmpty()) {
  //   throw new Error('it is not valid to call sort() after next()');
  // }
  // const world = this.world;
  // const queryLensState = this.queryState.transmuteFiltered<[L, typeof Entity], F>([L, Entity], this.queryState.queryFilter, world);
  // const queryLens = queryLensState.iterUncheckedManual(world, world.lastChangeTick, world.changeTick);
  // const keyedQuery = queryLens.map(([key, entity]) => [key, new NeutralOrd(entity)]).collect();
  // keyedQuery.sort();
  // const entityIter = iter(keyedQuery).map(([, entity]) => entity.value);
  // return QuerySortedIter.new(world, this.queryState, entityIter, world.lastChangeTick(), world.changeTick());
  //   }
}

class QueryIterationCursor<D extends QueryData = any, F extends QueryFilter = any> {
  constructor(
    public queryData: D,
    public queryFilter: F,
    public isDense: boolean,
    public storageIdIter: RustIter<StorageId>,
    public tableEntities: Vec<Entity>,
    public archetypeEntities: Vec<ArchetypeEntity>,
    public fetch: D['FETCH'],
    public filter: F['FETCH'],
    public currentLen: number,
    public currentRow: number,
  ) {}

  clone(): QueryIterationCursor<D, F> {
    return new QueryIterationCursor(
      this.queryData,
      this.queryFilter,
      this.isDense,
      deepClone(this.storageIdIter),
      this.tableEntities,
      this.archetypeEntities,
      this.fetch.clone(),
      this.filter.clone(),
      this.currentLen,
      this.currentRow,
    );
  }

  static initEmpty(
    world: World,
    queryState: QueryState,
    lastRun: Tick,
    thisRun: Tick,
  ): QueryIterationCursor {
    const fetch = queryState.data.initFetch(world, queryState.fetchState, lastRun, thisRun);
    const filter = queryState.filter.initFetch(
      world,
      queryState.filterState,
      lastRun,
      thisRun,
    );
    return new QueryIterationCursor(
      queryState.data,
      queryState.filter,
      queryState.isDense,
      iter([]),
      Vec.new(),
      Vec.new(),
      fetch,
      filter,
      0,
      0,
    );
  }

  static init<D extends QueryData, F extends QueryFilter>(
    world: World,
    queryState: QueryState<D, F>,
    lastRun: Tick,
    thisRun: Tick,
  ): QueryIterationCursor<D, F> {
    const fetch = queryState.data.initFetch(world, queryState.fetchState, lastRun, thisRun);
    const filter = queryState.filter.initFetch(
      world,
      queryState.filterState,
      lastRun,
      thisRun,
    );

    return new QueryIterationCursor(
      queryState.data,
      queryState.filter,
      queryState.isDense,
      queryState.matchedStorageIds.iter(),
      Vec.new(),
      Vec.new(),
      fetch,
      filter,
      0,
      0,
    );
  }

  reborrow(): QueryIterationCursor<D, F> {
    return new QueryIterationCursor(
      this.queryData,
      this.queryFilter,
      this.isDense,
      deepClone(this.storageIdIter),
      this.tableEntities,
      this.archetypeEntities,
      this.queryData.shrinkFetch(this.fetch.clone()),
      this.queryFilter.shrinkFetch(this.filter.clone()),
      this.currentLen,
      this.currentRow,
    );
  }

  peekLast(): Option<D['ITEM']> {
    if (this.currentRow > 0) {
      const index = this.currentRow - 1;
      if (this.isDense) {
        const entity = this.tableEntities.getUnchecked(index);
        return Some(this.queryData.fetch(this.fetch, entity, index));
      } else {
        const archetypeEntity = this.archetypeEntities.getUnchecked(index);
        return Some(this.queryData.fetch(this.fetch, archetypeEntity.id, archetypeEntity.tableRow));
      }
    } else {
      return None;
    }
  }

  maxRemaining(tables: Tables, archetypes: Archetypes): number {
    const ids = this.storageIdIter.collect();
    const remainingMatched = this.isDense
      ? ids.reduce((sum, id) => sum + tables.get(id.tableId).unwrap().entityCount(), 0)
      : ids.reduce((sum, id) => sum + archetypes.get(id.archetypeId).unwrap().len(), 0);
    return remainingMatched + this.currentLen - this.currentRow;
  }

  next(tables: Tables, archetypes: Archetypes, queryState: QueryState<D, F>): Option<D['ITEM']> {
    if (this.isDense) {
      while (true) {
        if (this.currentRow === this.currentLen) {
          const nextIdOp = this.storageIdIter.next();
          if (nextIdOp.isNone()) return None;
          const nextId = nextIdOp.unwrap();
          const table = tables.get(nextId.tableId).unwrap();
          if (table.isEmpty()) continue;
          this.queryData.setTable(this.fetch, queryState.fetchState, table);
          this.queryFilter.setTable(this.filter, queryState.filterState, table);
          this.tableEntities = table.entities;
          this.currentLen = table.entityCount();
          this.currentRow = 0;
        }
        const entity = this.tableEntities.getUnchecked(this.currentRow);
        const row = this.currentRow;
        if (!this.queryFilter.filterFetch(this.filter, entity, row)) {
          this.currentRow++;
          continue;
        }
        const item = this.queryData.fetch(this.fetch, entity, row);
        this.currentRow++;
        return Some(item);
      }
    } else {
      while (true) {
        if (this.currentRow === this.currentLen) {
          const nextIdOp = this.storageIdIter.next();
          if (nextIdOp.isNone()) return None;
          const nextId = nextIdOp.unwrap();
          const archetype = archetypes.get(nextId.archetypeId).unwrap();
          if (archetype.isEmpty()) continue;
          const table = tables.get(archetype.tableId).unwrap();
          this.queryData.setArchetype(this.fetch, queryState.fetchState, archetype, table);
          this.queryFilter.setArchetype(this.filter, queryState.filterState, archetype, table);
          this.archetypeEntities = archetype.entities;
          this.currentLen = archetype.len();
          this.currentRow = 0;
        }
        const archetypeEntity = this.archetypeEntities.getUnchecked(this.currentRow);
        if (
          !this.queryFilter.filterFetch(this.filter, archetypeEntity.id, archetypeEntity.tableRow)
        ) {
          this.currentRow++;
          continue;
        }
        const item = this.queryData.fetch(this.fetch, archetypeEntity.id, archetypeEntity.tableRow);
        this.currentRow++;
        return Some(item);
      }
    }
  }
}
