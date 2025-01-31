import { INVALID_VALUE, logger } from '@sciurus/utils';
import { None, Option, Ptr, range, Some, Vec } from 'rustable';
import { Entity } from './base';
import {
  AllocAtWithoutReplacement,
  type EntityIndex,
  type EntityLocation,
  EntityMeta,
} from './types';

export class Entities {
  meta: Vec<EntityMeta>;
  pending: Vec<EntityIndex>;
  freeCursor: number = 0;
  length: number = 0;

  constructor() {
    this.meta = Vec.new();
    this.pending = Vec.new();
  }

  static new() {
    return new Entities();
  }

  reserveEntity() {
    const n = this.freeCursor--;
    if (n > 0) {
      const index = this.pending.getUnchecked(n - 1);
      return Entity.fromRawAndGeneration(index, this.meta.getUnchecked(index).generation);
    } else {
      return Entity.fromRaw(this.meta.len() - n);
    }
  }

  verifyFlushed() {
    if (this.needsFlush()) {
      throw new Error('flush() needs to be called before this operation is legal');
    }
  }

  alloc(): Entity {
    this.verifyFlushed();
    this.length += 1;
    const index = this.pending.pop();
    if (index.isSome()) {
      this.freeCursor = this.pending.len();
      return Entity.fromRawAndGeneration(
        index.unwrap(),
        this.meta.getUnchecked(index.unwrap()).generation,
      );
    } else {
      const index = this.meta.len();
      this.meta.push(EntityMeta.EMPTY.clone());
      return Entity.fromRaw(index);
    }
  }

  allocAt(entity: Entity): Option<EntityLocation> {
    this.verifyFlushed();
    const locFn = () => {
      if (entity.index > this.meta.len()) {
        this.pending.extend(range(this.meta.len(), entity.index));
        this.freeCursor = this.pending.len();
        this.meta.resize(entity.index + 1, EntityMeta.EMPTY.clone());
        this.length += 1;
        return None;
      }
      const index = this.pending.iter().position((i) => i === entity.index);
      if (index.isSome()) {
        this.pending.swapRemove(index.unwrap());
        this.freeCursor = this.pending.len();
        this.length += 1;
        return None;
      } else {
        const value = this.meta.getUnchecked(entity.index).location;
        this.meta.getUnchecked(entity.index).generation = EntityMeta.EMPTY.generation;
        return Some(value);
      }
    };
    const loc = locFn();
    this.meta.getUnchecked(entity.index).generation = entity.generation;
    return loc;
  }

  allocAtWithoutReplacement(entity: Entity): AllocAtWithoutReplacement {
    this.verifyFlushed();
    const resultFn = () => {
      if (entity.index > this.meta.len()) {
        this.pending.extend(range(this.meta.len(), entity.index));
        this.freeCursor = this.pending.len();
        this.meta.resize(entity.index + 1, EntityMeta.EMPTY.clone());
        this.length += 1;
        return AllocAtWithoutReplacement.DidNotExist();
      }
      const index = this.pending.iter().position((i) => i === entity.index);
      if (index.isSome()) {
        this.pending.swapRemove(index.unwrap());
        this.freeCursor = this.pending.len();
        this.length += 1;
        return AllocAtWithoutReplacement.DidNotExist();
      } else {
        const currentMeta = this.meta.getUnchecked(entity.index);
        if (currentMeta.location.archetypeId === INVALID_VALUE) {
          return AllocAtWithoutReplacement.DidNotExist();
        } else if (currentMeta.generation === entity.generation) {
          return AllocAtWithoutReplacement.Exists(currentMeta.location);
        } else {
          return AllocAtWithoutReplacement.ExistsWithWrongGeneration();
        }
      }
    };
    const result = resultFn();
    this.meta.getUnchecked(entity.index).generation = entity.generation;
    return result;
  }

  free(entity: Entity) {
    this.verifyFlushed();
    const meta = this.meta.getUnchecked(entity.index);
    if (meta.generation !== entity.generation) {
      return None;
    }
    meta.generation += 1;
    if (meta.generation === 1) {
      logger.warn(
        'Entity(' + entity.index + ') generation wrapped on Entities::free, aliasing may occur',
      );
    }
    const loc = meta.location;
    meta.location = EntityMeta.EMPTY.clone().location;
    this.pending.push(entity.index);
    this.freeCursor = this.pending.len();
    this.length -= 1;
    return Some(loc);
  }

  contains(entity: Entity) {
    return this.resolveFromId(entity.index).mapOr(false, (v) => v.generation === entity.generation);
  }

  clear() {
    this.meta.clear();
    this.pending.clear();
    this.freeCursor = 0;
    this.length = 0;
  }

  get(entity: Entity): Option<EntityLocation> {
    return this.meta.get(entity.index).match({
      None: () => None,
      Some: (meta) => {
        if (meta.generation !== entity.generation || meta.location.archetypeId === INVALID_VALUE) {
          return None;
        } else {
          return Some(meta.location);
        }
      },
    });
  }

  len() {
    return this.length;
  }

  set(index: EntityIndex, entityLocation: EntityLocation) {
    this.meta.getUnchecked(index).location = entityLocation;
  }

  reserveGenerations(index: number, generations: number) {
    if (index >= this.meta.len()) {
      return false;
    }
    const meta = this.meta.getUnchecked(index);
    if (meta.location.archetypeId === INVALID_VALUE) {
      meta.generation = meta.generation + generations;
      return true;
    } else {
      return false;
    }
  }

  resolveFromId(index: number): Option<Entity> {
    return this.meta.get(index).match({
      Some: (meta) => {
        return Some(Entity.fromRawAndGeneration(index, meta.generation));
      },
      None: () => {
        const freeCursor = this.freeCursor;
        const numPending = -freeCursor;
        if (numPending < 0) {
          return None;
        }
        if (index < this.meta.len() + numPending) {
          return Some(Entity.fromRaw(index));
        } else {
          return None;
        }
      },
    });
  }

  needsFlush() {
    return this.freeCursor !== this.pending.len();
  }

  flush(init: (entity: Entity, location: Ptr<EntityLocation>) => void) {
    let freeCursor = this.freeCursor;
    let currentFreeCursor = freeCursor;
    let newFreeCursor =
      currentFreeCursor >= 0
        ? currentFreeCursor
        : (() => {
            const oldMetaLen = this.meta.len();
            const newMetaLen = oldMetaLen + -currentFreeCursor;
            this.meta.resize(newMetaLen, EntityMeta.EMPTY.clone());
            this.length += -currentFreeCursor;
            for (let i = oldMetaLen; i < newMetaLen; i++) {
              const meta = this.meta.getUnchecked(i);
              init(
                Entity.fromRawAndGeneration(i, meta.generation),
                Ptr({
                  get: () => meta.location,
                  set: (location) => {
                    meta.location = location;
                  },
                }),
              );
            }
            this.freeCursor = 0;
            return 0;
          })();
    this.length += this.pending.len() - newFreeCursor;
    for (const index of this.pending.iter().skip(newFreeCursor)) {
      const meta = this.meta.getUnchecked(index);
      init(
        Entity.fromRawAndGeneration(index, meta.generation),
        Ptr({
          get: () => meta.location,
          set: (location) => {
            meta.location = location;
          },
        }),
      );
    }
  }

  flushAsInvalid() {
    this.flush((_entity, location) => {
      location.archetypeId = INVALID_VALUE;
    });
  }

  totalCount() {
    return this.meta.len();
  }

  isEmpty() {
    return this.length === 0;
  }

  setSpawnedOrDespawnedBy(index: number, caller: string): void {
    const meta = this.meta.getUnchecked(index);
    if (!meta) {
      throw new Error('Entity index invalid');
    }
    meta.spawnedOrDespawnedBy = caller;
  }

  entityGetSpawnedOrDespawnedBy(entity: Entity): Option<string> {
    return this.meta.get(entity.index).andThen((meta) => {
      if (!meta.spawnedOrDespawnedBy) return None;
      return Some(meta.spawnedOrDespawnedBy);
    });
  }
}
