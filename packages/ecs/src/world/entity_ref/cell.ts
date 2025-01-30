import { Constructor, Err, None, Ok, Option, Ptr, Result, TypeId, typeId } from 'rustable';
import { Archetype } from '../../archetype';
import { ComponentTicks, Mut, MutUntyped, Ref, Tick, Ticks } from '../../change_detection';
import { Component, ComponentId } from '../../component';
import { Entity, EntityLocation } from '../../entity';
import { ReadonlyQueryData } from '../../query/fetch';
import { StorageType } from '../../storage';
import { World } from '../base';
import { GetEntityMutByIdError, QUERY_MISMATCH_ERROR } from './types';
import { EntityWorld } from './world';

type DynamicComponentFetch = (
  cell: EntityCell,
  iter: Iterable<ComponentId>,
) => Result<any[], Error>;

const defaultFetch = (cell: EntityCell, iter: Iterable<ComponentId>): Result<any[], Error> => {
  const ptrs = [];
  for (const id of iter) {
    const ptr = cell.getById(id);
    if (ptr.isNone()) return Err(new Error(`Component ${id} not found`));
    ptrs.push(ptr);
  }
  return Ok(ptrs);
};

type DynamicComponentMutFetch = (
  cell: EntityCell,
  iter: Iterable<ComponentId>,
) => Result<MutUntyped[], Error>;

const defaultMutFetch = (
  cell: EntityCell,
  iter: Iterable<ComponentId>,
): Result<MutUntyped[], Error> => {
  const ptrs = [];
  for (const id of iter) {
    const ret = cell.getMutById(id);
    if (ret.isErr()) return ret as unknown as Result<MutUntyped[], Error>;
    ptrs.push(ret.unwrap());
  }
  return Ok(ptrs);
};

export class EntityCell {
  world: World;
  entity: Entity;
  location: EntityLocation;

  constructor(world: World, entity: Entity, location: EntityLocation) {
    this.world = world;
    this.entity = entity;
    this.location = location;
  }

  static fromWorld(world: EntityWorld) {
    return world.asEntityCell();
  }

  get id(): Entity {
    return this.entity;
  }

  get archetype(): Archetype {
    return this.world.archetypes.getUnchecked(this.location.archetypeId);
  }

  contains<T extends object>(component: Constructor<T>): boolean {
    return this.containsTypeId(typeId(component));
  }

  containsId(componentId: ComponentId): boolean {
    return this.archetype.contains(componentId);
  }

  containsTypeId(typeId: TypeId): boolean {
    const id = this.world.components.getId(typeId);
    return id.isSomeAnd((id) => this.containsId(id));
  }

  get<T extends object>(component: Constructor<T>): Option<T> {
    return this.world.components
      .getId(typeId(component))
      .andThen((componentId) =>
        getComponent(
          this.world,
          componentId,
          Component.wrap(component).storageType(),
          this.entity,
          this.location,
        ),
      );
  }

  getRef<T extends object>(component: Constructor<T>): Option<Ref<T>> {
    const lastChangeTick = this.world.lastChangeTick;
    const changeTick = this.world.changeTick;
    return this.world.components
      .getId(typeId(component))
      .andThen((componentId) =>
        getComponentAndTicks(
          this.world,
          componentId,
          Component.wrap(component).storageType(),
          this.entity,
          this.location,
        ).map(
          ([value, cells, caller]) =>
            new Ref<T>(
              value as T,
              Ticks.fromTickCells(cells, lastChangeTick, changeTick),
              caller[Ptr.ptr],
            ),
        ),
      );
  }

  getChangeTicks<T extends object>(component: Constructor<T>): Option<ComponentTicks> {
    return this.world.components
      .getId(typeId(component))
      .andThen((componentId) =>
        getTicks(
          this.world,
          componentId,
          Component.wrap(component).storageType(),
          this.entity,
          this.location,
        ),
      );
  }

  getChangeTicksById(componentId: ComponentId): Option<ComponentTicks> {
    return this.world.components
      .getInfo(componentId)
      .andThen((info) =>
        getTicks(this.world, componentId, info.storageType, this.entity, this.location),
      );
  }

  getMut<T extends object>(component: Constructor<T>): Option<Mut<T>> {
    return this.getMutAssumeMutable(component);
  }

  getMutAssumeMutable<T extends object>(component: Constructor<T>): Option<Mut<T>> {
    return this.getMutUsingTicksAssumeMutable(
      component,
      this.world.lastChangeTick,
      this.world.changeTick,
    );
  }

  getMutUsingTicksAssumeMutable<T extends object>(
    component: Constructor<T>,
    lastChangeTick: Tick,
    changeTick: Tick,
  ): Option<Mut<T>> {
    const componentId = this.world.components.getId(typeId(component));
    return componentId.match({
      None: () => None,
      Some: (componentId) =>
        getComponentAndTicks(
          this.world,
          componentId,
          Component.wrap(component).storageType(),
          this.entity,
          this.location,
        ).map(([value, cells, caller]) =>
          Mut.new(value, Ticks.fromTickCells(cells, lastChangeTick, changeTick), caller),
        ),
    });
  }

  components<T extends object, Q>(query: T): Q {
    return this.getComponents<T, Q>(query).expect(QUERY_MISMATCH_ERROR);
  }

  getComponents<T extends object, Q>(query: T): Option<Q> {
    const state = (query as ReadonlyQueryData).getState(this.world.components);
    return state.match({
      None: () => None,
      Some: (state) =>
        this.world.archetypes.get(this.location.archetypeId).andThen((archetype) => {
          if (
            (query as ReadonlyQueryData).matchesComponentSet(state, (id) => archetype.contains(id))
          ) {
            const fetch = (query as ReadonlyQueryData).initFetch(
              this.world,
              state,
              this.world.lastChangeTick,
              this.world.changeTick,
            );
            return this.world.storages.tables.get(this.location.tableId).map((table) => {
              (query as ReadonlyQueryData).setArchetype(fetch, state, archetype, table);
              return (query as ReadonlyQueryData).fetch(fetch, this.entity, this.location.tableRow);
            });
          }
          return None;
        }),
    });
  }

  fetchById(
    componentIds: Iterable<ComponentId>,
    fetch: DynamicComponentFetch = defaultFetch,
  ): Result<any[], Error> {
    return fetch(this, componentIds);
  }

  fetchMutById(
    componentIds: Iterable<ComponentId>,
    fetch: DynamicComponentMutFetch = defaultMutFetch,
  ): Result<MutUntyped[], Error> {
    return fetch(this, componentIds);
  }

  getById(componentId: ComponentId): Option<any> {
    return this.world.components
      .getInfo(componentId)
      .andThen((info) =>
        getComponent(this.world, componentId, info.storageType, this.entity, this.location),
      );
  }

  getMutById(componentId: ComponentId): Result<MutUntyped, Error> {
    return this.world.components.getInfo(componentId).match({
      None: () => Err(new Error(GetEntityMutByIdError.InfoNotFound)),
      Some: (info) => {
        if (!info.mutable) return Err(new Error(GetEntityMutByIdError.ComponentIsImmutable));
        return getComponentAndTicks(
          this.world,
          componentId,
          info.storageType,
          this.entity,
          this.location,
        ).match({
          None: () => Err(new Error(GetEntityMutByIdError.ComponentNotFound)),
          Some: ([value, cells, caller]) =>
            Ok(
              new MutUntyped(
                value,
                Ticks.fromTickCells(cells, this.world.lastChangeTick, this.world.changeTick),
                caller,
              ),
            ),
        });
      },
    });
  }

  spawnedBy(): string | undefined {
    return this.world.entities.entityGetSpawnedOrDespawnedBy(this.entity).unwrapOr(undefined);
  }
}

function getComponent<T>(
  world: World,
  componentId: ComponentId,
  storageType: StorageType,
  entity: Entity,
  location: EntityLocation,
): Option<T> {
  if (storageType === StorageType.Table) {
    const table = world.fetchTable(location);
    return table.andThen((t) => t.getComponent(componentId, location.tableRow).map((c) => c as T));
  } else {
    return world.fetchSparseSet(componentId).andThen((s) => s.get(entity));
  }
}

function getComponentAndTicks(
  world: World,
  componentId: ComponentId,
  storageType: StorageType,
  entity: Entity,
  location: EntityLocation,
): Option<[Ptr<any>, ComponentTicks, Ptr<string>]> {
  if (storageType === StorageType.Table) {
    const table = world.fetchTable(location);
    return table.andThen((t) => {
      const component = t.getComponent(componentId, location.tableRow);
      return component.map((c) => [
        c,
        ComponentTicks.new(
          t.getAddedTick(componentId, location.tableRow).unwrap(),
          t.getChangedTick(componentId, location.tableRow).unwrap(),
        ),
        t.getChangedByMut(componentId, location.tableRow).unwrap(),
      ]);
    });
  } else {
    return world.fetchSparseSet(componentId).andThen((s) => s.getWithTicks(entity));
  }
}

function getTicks(
  world: World,
  componentId: ComponentId,
  storageType: StorageType,
  entity: Entity,
  location: EntityLocation,
): Option<ComponentTicks> {
  if (storageType === StorageType.Table) {
    const table = world.fetchTable(location);
    return table.andThen((t) => t.getTicksUnchecked(componentId, location.tableRow));
  } else {
    return world.fetchSparseSet(componentId).andThen((s) => s.getTicks(entity));
  }
}
