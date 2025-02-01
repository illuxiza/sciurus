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
      return Entity.fromRawAndGen(index, this.meta.getUnchecked(index).gen);
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
      return Entity.fromRawAndGen(
        index.unwrap(),
        this.meta.getUnchecked(index.unwrap()).gen,
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
      if (entity.idx > this.meta.len()) {
        this.pending.extend(range(this.meta.len(), entity.idx));
        this.freeCursor = this.pending.len();
        this.meta.resize(entity.idx + 1, EntityMeta.EMPTY.clone());
        this.length += 1;
        return None;
      }
      const index = this.pending.iter().position((i) => i === entity.idx);
      if (index.isSome()) {
        this.pending.swapRemove(index.unwrap());
        this.freeCursor = this.pending.len();
        this.length += 1;
        return None;
      } else {
        const value = this.meta.getUnchecked(entity.idx).loc;
        this.meta.getUnchecked(entity.idx).gen = EntityMeta.EMPTY.gen;
        return Some(value);
      }
    };
    const loc = locFn();
    this.meta.getUnchecked(entity.idx).gen = entity.gen;
    return loc;
  }

  allocAtWithoutReplacement(entity: Entity): AllocAtWithoutReplacement {
    this.verifyFlushed();
    const resultFn = () => {
      if (entity.idx > this.meta.len()) {
        this.pending.extend(range(this.meta.len(), entity.idx));
        this.freeCursor = this.pending.len();
        this.meta.resize(entity.idx + 1, EntityMeta.EMPTY.clone());
        this.length += 1;
        return AllocAtWithoutReplacement.DidNotExist();
      }
      const index = this.pending.iter().position((i) => i === entity.idx);
      if (index.isSome()) {
        this.pending.swapRemove(index.unwrap());
        this.freeCursor = this.pending.len();
        this.length += 1;
        return AllocAtWithoutReplacement.DidNotExist();
      } else {
        const currentMeta = this.meta.getUnchecked(entity.idx);
        if (currentMeta.loc.archetypeId === INVALID_VALUE) {
          return AllocAtWithoutReplacement.DidNotExist();
        } else if (currentMeta.gen === entity.gen) {
          return AllocAtWithoutReplacement.Exists(currentMeta.loc);
        } else {
          return AllocAtWithoutReplacement.ExistsWithWrongGen();
        }
      }
    };
    const result = resultFn();
    this.meta.getUnchecked(entity.idx).gen = entity.gen;
    return result;
  }

  free(entity: Entity) {
    this.verifyFlushed();
    const meta = this.meta.getUnchecked(entity.idx);
    if (meta.gen !== entity.gen) {
      return None;
    }
    meta.gen += 1;
    if (meta.gen === 1) {
      logger.warn(
        'Entity(' + entity.idx + ') generation wrapped on Entities::free, aliasing may occur',
      );
    }
    const loc = meta.loc;
    meta.loc = EntityMeta.EMPTY.clone().loc;
    this.pending.push(entity.idx);
    this.freeCursor = this.pending.len();
    this.length -= 1;
    return Some(loc);
  }

  contains(entity: Entity) {
    return this.resolveFromId(entity.idx).mapOr(false, (v) => v.gen === entity.gen);
  }

  clear() {
    this.meta.clear();
    this.pending.clear();
    this.freeCursor = 0;
    this.length = 0;
  }

  get(entity: Entity): Option<EntityLocation> {
    return this.meta.get(entity.idx).match({
      None: () => None,
      Some: (meta) => {
        if (meta.gen !== entity.gen || meta.loc.archetypeId === INVALID_VALUE) {
          return None;
        } else {
          return Some(meta.loc);
        }
      },
    });
  }

  len() {
    return this.length;
  }

  set(index: EntityIndex, entityLocation: EntityLocation) {
    this.meta.getUnchecked(index).loc = entityLocation;
  }

  reserveGenerations(index: number, generations: number) {
    if (index >= this.meta.len()) {
      return false;
    }
    const meta = this.meta.getUnchecked(index);
    if (meta.loc.archetypeId === INVALID_VALUE) {
      meta.gen = meta.gen + generations;
      return true;
    } else {
      return false;
    }
  }

  resolveFromId(index: number): Option<Entity> {
    return this.meta.get(index).match({
      Some: (meta) => {
        return Some(Entity.fromRawAndGen(index, meta.gen));
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
                Entity.fromRawAndGen(i, meta.gen),
                Ptr({
                  get: () => meta.loc,
                  set: (location) => {
                    meta.loc = location;
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
        Entity.fromRawAndGen(index, meta.gen),
        Ptr({
          get: () => meta.loc,
          set: (location) => {
            meta.loc = location;
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
    meta.changedBy = caller;
  }

  entityGetSpawnedOrDespawnedBy(entity: Entity): Option<string> {
    return this.meta.get(entity.idx).andThen((meta) => {
      if (!meta.changedBy) return None;
      return Some(meta.changedBy);
    });
  }
}
