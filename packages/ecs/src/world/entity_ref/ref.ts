import { Constructor, Err, Ok, Option, Result, typeId, TypeId } from 'rustable';
import { Archetype } from '../../archetype/base';
import { ComponentTicks } from '../../change_detection/tick';
import { ComponentId } from '../../component/types';

import { Ref } from '../../change_detection/ref';
import { Entity } from '../../entity/base';
import { EntityCell } from './cell';
import { QUERY_MISMATCH_ERROR } from './types';
import { EntityWorld } from './world';
import { EntityLocation } from '../../entity/location';

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

export class EntityRef {
  constructor(public cell: EntityCell) {}

  static fromWorld(world: EntityWorld) {
    return new EntityRef(world.asEntityCell());
  }

  static new(cell: EntityCell) {
    return new EntityRef(cell);
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

  contains<T extends Constructor>(component: T): boolean {
    return this.containsTypeId(typeId(component));
  }

  containsId(componentId: ComponentId): boolean {
    return this.cell.containsId(componentId);
  }

  containsTypeId(typeId: TypeId): boolean {
    return this.cell.containsTypeId(typeId);
  }

  get<T extends Constructor>(component: T): Option<InstanceType<T>> {
    return this.cell.get(component);
  }

  getRef<T extends Constructor>(component: T): Option<Ref<InstanceType<T>>> {
    return this.cell.getRef(component);
  }

  getChangeTicks<T extends Constructor>(component: T): Option<ComponentTicks> {
    return this.cell.getChangeTicks(component);
  }

  getChangeTicksById(componentId: ComponentId): Option<ComponentTicks> {
    return this.cell.getChangeTicksById(componentId);
  }

  getById(
    componentIds: Iterable<ComponentId>,
    fetch: DynamicComponentFetch = defaultFetch,
  ): Result<any[], Error> {
    return fetch(this.cell, componentIds);
  }

  components<T extends object, Q>(query: T): Q {
    return this.getComponents<T, Q>(query).expect(QUERY_MISMATCH_ERROR);
  }

  getComponents<T extends object, Q>(query: T): Option<Q> {
    return this.cell.getComponents<T, Q>(query);
  }

  spawnedBy(): string | undefined {
    return this.cell.spawnedBy();
  }
}
