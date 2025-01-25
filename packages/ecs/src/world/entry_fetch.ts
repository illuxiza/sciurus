import { Constructor, Err, Iter, Ok, Result, typeId, TypeId } from 'rustable';
import { Entity } from '../entity/base';
import { WorldCell } from './cell';
import { EntityMut } from './entity_ref/mut';
import { EntityRef } from './entity_ref/ref';
import { EntityWorld } from './entity_ref/world';

const Registry = new Map<TypeId, Constructor<WorldEntityFetch<any, any, any>>>();

export function registerEntityFetch<E>(source: Constructor<E>, ...generics: any[]) {
  return function <R, M, D>(target: Constructor<WorldEntityFetch<R, M, D>>) {
    Registry.set(typeId(source, generics), target);
  };
}

export function intoEntityFetch<E>(entity: E): WorldEntityFetch<any, any, any> {
  let tid = typeId(entity);
  if (Symbol.iterator in Object(entity)) {
    tid = typeId(entity, [Iter]);
  }
  if (!Registry.has(tid)) {
    throw new Error(`No fetch registered for entity type ${typeId(entity)}`);
  }
  const type = Registry.get(tid);
  return new type!(entity);
}

export abstract class WorldEntityFetch<R, M, D> {
  abstract fetchRef(cell: WorldCell): Result<R, EntityFetchError>;
  abstract fetchMut(cell: WorldCell): Result<M, EntityFetchError>;
  abstract fetchDeferredMut(cell: WorldCell): Result<D, EntityFetchError>;
}

@registerEntityFetch(Entity)
export class EntityWorldEntityFetch extends WorldEntityFetch<EntityRef, EntityWorld, EntityMut> {
  constructor(public id: Entity) {
    super();
  }

  fetchRef(cell: WorldCell): Result<EntityRef, EntityFetchError> {
    const ecell = cell.getEntity(this.id);
    if (ecell.isNone()) {
      return Err(EntityFetchError.NoSuchEntity(this.id, cell));
    }
    return Ok(EntityRef.new(ecell.unwrap()));
  }

  fetchMut(cell: WorldCell): Result<EntityWorld, EntityFetchError> {
    const location = cell.entities.get(this.id);
    if (location.isNone()) {
      return Err(EntityFetchError.NoSuchEntity(this.id, cell));
    }
    // SAFETY: caller ensures that the world cell has mutable access to the entity.
    // SAFETY: location was fetched from the same world's `Entities`.
    return Ok(new EntityWorld(cell.world, this.id, location.unwrap()));
  }

  fetchDeferredMut(cell: WorldCell): Result<EntityMut, EntityFetchError> {
    const ecell = cell.getEntity(this.id);
    if (ecell.isNone()) {
      return Err(EntityFetchError.NoSuchEntity(this.id, cell));
    }
    return Ok(EntityMut.new(ecell.unwrap()));
  }
}

export class EntityIterable {
  constructor(public ids: Iterable<Entity>) {}
}

@registerEntityFetch(Entity, Iter)
export class EntitiesWorldEntityFetch extends WorldEntityFetch<
  Iterable<EntityRef>,
  Iterable<EntityMut>,
  Iterable<EntityMut>
> {
  public ids: Iterable<Entity>;
  constructor(ids: EntityIterable) {
    super();
    this.ids = ids.ids;
  }
  fetchRef(cell: WorldCell): Result<Iterable<EntityRef>, EntityFetchError> {
    const refs: EntityRef[] = [];
    for (const id of this.ids) {
      const ecell = cell.getEntity(id);
      if (ecell.isNone()) {
        return Err(EntityFetchError.NoSuchEntity(id, cell));
      }
      refs.push(EntityRef.new(ecell.unwrap()));
    }

    return Ok(refs);
  }

  fetchMut(cell: WorldCell): Result<Iterable<EntityMut>, EntityFetchError> {
    const uniqueIds = new Set(this.ids);
    const idsArray = [...this.ids];
    if (uniqueIds.size !== idsArray.length) {
      return Err(EntityFetchError.AliasedMutability(idsArray[0]));
    }

    const refs: EntityMut[] = [];
    for (const id of uniqueIds) {
      const ecell = cell.getEntity(id);
      if (ecell.isNone()) {
        return Err(EntityFetchError.NoSuchEntity(id, cell));
      }
      refs.push(EntityMut.new(ecell.unwrap()));
    }

    return Ok(refs);
  }

  fetchDeferredMut(cell: WorldCell): Result<Iterable<EntityMut>, EntityFetchError> {
    return this.fetchMut(cell);
  }
}

export class EntityFetchError extends Error {
  static NoSuchEntity(id: Entity, world: WorldCell): EntityFetchError {
    return new EntityFetchError(`Entity {${id}} does not exist in the world {${world.world.id}}`);
  }

  static AliasedMutability(id: Entity): EntityFetchError {
    return new EntityFetchError(`Entity {${id}} was requested mutably more than once`);
  }

  constructor(message: string) {
    super(message);
  }
}
