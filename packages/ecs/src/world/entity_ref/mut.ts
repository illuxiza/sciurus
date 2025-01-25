import { Constructor, Ok, Option, Result, typeId, TypeId } from 'rustable';
import { Archetype } from '../../archetype/base';
import { ComponentTicks } from '../../change_detection/tick';
import { ComponentId } from '../../component/types';

import { Mut, MutUntyped } from '../../change_detection/mut';
import { Ref } from '../../change_detection/ref';
import { Component } from '../../component/base';
import { Entity } from '../../entity/base';
import { EntityLocation } from '../../entity/location';
import { EntityCell } from './cell';
import { EntityRef } from './ref';
import { QUERY_MISMATCH_ERROR } from './types';
import { EntityWorld } from './world';

type DynamicComponentFetch = (
  cell: EntityCell,
  iter: Iterable<ComponentId>,
) => Result<MutUntyped[], Error>;

const defaultFetch = (
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
export class EntityMut {
  static fromWorld(world: EntityWorld) {
    return new EntityMut(world.asEntityCell());
  }
  constructor(public cell: EntityCell) {}

  static new(cell: EntityCell) {
    return new EntityMut(cell);
  }

  reborrow(): EntityMut {
    return new EntityMut(this.cell);
  }

  asReadonly(): EntityRef {
    return new EntityRef(this.cell);
  }

  get id(): Entity {
    return this.cell.id;
  }

  get archetype(): Archetype {
    return this.cell.archetype;
  }

  get location(): EntityLocation {
    return this.cell.location;
  }

  contains<T extends Component>(component: Constructor<T>): boolean {
    return this.containsTypeId(typeId(component));
  }

  containsId(componentId: ComponentId): boolean {
    return this.cell.containsId(componentId);
  }

  containsTypeId(typeId: TypeId): boolean {
    return this.cell.containsTypeId(typeId);
  }

  get<T extends Component>(component: Constructor<T>): Option<T> {
    return this.asReadonly().get(component);
  }

  components<T extends object, Q>(query: T): Q {
    return this.getComponents<T, Q>(query).expect(QUERY_MISMATCH_ERROR);
  }

  getComponents<T extends object, Q>(query: T): Option<Q> {
    return this.cell.getComponents<T, Q>(query);
  }

  getRef<T extends Constructor>(component: T): Option<Ref<InstanceType<T>>> {
    return this.asReadonly().getRef(component);
  }

  getMut<T extends Constructor>(component: T): Option<Mut<InstanceType<T>>> {
    return this.cell.getMut(component);
  }

  getChangeTicks<T extends Constructor>(component: T): Option<ComponentTicks> {
    return this.cell.getChangeTicks(component);
  }

  getChangeTicksById(componentId: ComponentId): Option<ComponentTicks> {
    return this.asReadonly().getChangeTicksById(componentId);
  }

  getById(componentIds: Iterable<ComponentId>): Result<any, Error> {
    return this.asReadonly().getById(componentIds);
  }

  getMutById(componentIds: ComponentId): Result<MutUntyped, Error> {
    return this.cell.getMutById(componentIds);
  }

  getMutByIdUnchecked(
    componentIds: Iterable<ComponentId>,
    fetch: DynamicComponentFetch = defaultFetch,
  ): Result<MutUntyped[], Error> {
    return fetch(this.cell, componentIds);
  }

  intoMutById(
    componentIds: Iterable<ComponentId>,
    fetch: DynamicComponentFetch = defaultFetch,
  ): Result<MutUntyped[], Error> {
    return fetch(this.cell, componentIds);
  }

  spawnedBy(): string | undefined {
    return this.cell.spawnedBy();
  }
}
