import { Constructor, Err, Iter, Ok, Result, typeId, TypeId } from 'rustable';
import { Entity } from '../entity';
import { World } from './base';
import { EntityCell } from './entity_ref/cell';
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
  abstract fetchRef(cell: World): Result<R, EntityFetchError>;
  abstract fetchMut(cell: World): Result<M, EntityFetchError>;
  abstract fetchDeferredMut(cell: World): Result<D, EntityFetchError>;
}

@registerEntityFetch(Entity)
export class EntityWorldEntityFetch extends WorldEntityFetch<EntityCell, EntityWorld, EntityCell> {
  constructor(public id: Entity) {
    super();
  }

  fetchRef(cell: World): Result<EntityCell, EntityFetchError> {
    const ecell = cell.getEntity(this.id);
    if (ecell.isNone()) {
      return Err(EntityFetchError.NoSuchEntity(this.id, cell));
    }
    return Ok(ecell.unwrap());
  }

  fetchMut(cell: World): Result<EntityWorld, EntityFetchError> {
    const location = cell.entities.get(this.id);
    if (location.isNone()) {
      return Err(EntityFetchError.NoSuchEntity(this.id, cell));
    }
    // SAFETY: caller ensures that the world cell has mutable access to the entity.
    // SAFETY: location was fetched from the same world's `Entities`.
    return Ok(new EntityWorld(cell, this.id, location.unwrap()));
  }

  fetchDeferredMut(cell: World): Result<EntityCell, EntityFetchError> {
    const ecell = cell.getEntity(this.id);
    if (ecell.isNone()) {
      return Err(EntityFetchError.NoSuchEntity(this.id, cell));
    }
    return Ok(ecell.unwrap());
  }
}

export class EntityIterable {
  constructor(public ids: Iterable<Entity>) {}
}

@registerEntityFetch(Entity, Iter)
export class EntitiesWorldEntityFetch extends WorldEntityFetch<
  Iterable<EntityCell>,
  Iterable<EntityCell>,
  Iterable<EntityCell>
> {
  public ids: Iterable<Entity>;
  constructor(ids: EntityIterable) {
    super();
    this.ids = ids.ids;
  }
  fetchRef(cell: World): Result<Iterable<EntityCell>, EntityFetchError> {
    const refs: EntityCell[] = [];
    for (const id of this.ids) {
      const ecell = cell.getEntity(id);
      if (ecell.isNone()) {
        return Err(EntityFetchError.NoSuchEntity(id, cell));
      }
      refs.push(ecell.unwrap());
    }

    return Ok(refs);
  }

  fetchMut(cell: World): Result<Iterable<EntityCell>, EntityFetchError> {
    const uniqueIds = new Set(this.ids);
    const idsArray = [...this.ids];
    if (uniqueIds.size !== idsArray.length) {
      return Err(EntityFetchError.AliasedMutability(idsArray[0]));
    }

    const refs: EntityCell[] = [];
    for (const id of uniqueIds) {
      const ecell = cell.getEntity(id);
      if (ecell.isNone()) {
        return Err(EntityFetchError.NoSuchEntity(id, cell));
      }
      refs.push(ecell.unwrap());
    }

    return Ok(refs);
  }

  fetchDeferredMut(cell: World): Result<Iterable<EntityCell>, EntityFetchError> {
    return this.fetchMut(cell);
  }
}

export class EntityFetchError extends Error {
  static NoSuchEntity(id: Entity, world: World): EntityFetchError {
    return new EntityFetchError(`Entity {${id}} does not exist in the world {${world.id}}`);
  }

  static AliasedMutability(id: Entity): EntityFetchError {
    return new EntityFetchError(`Entity {${id}} was requested mutably more than once`);
  }

  constructor(message: string) {
    super(message);
  }
}
