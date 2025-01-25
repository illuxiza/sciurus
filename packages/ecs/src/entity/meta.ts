import { Clone, derive } from 'rustable';
import { EntityLocation } from './location';

@derive([Clone])
export class EntityMeta {
  static EMPTY = new EntityMeta(EntityLocation.INVALID, 1);
  location: EntityLocation;
  generation: number;
  spawnedOrDespawnedBy?: string;

  constructor(location: EntityLocation, generation: number) {
    this.location = location;
    this.generation = generation;
  }
}

export interface EntityMeta extends Clone {}
