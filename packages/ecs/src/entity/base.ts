import { derive, Eq } from 'rustable';
import { type EntityIndex } from './types';

@derive([Eq])
export class Entity {
  static PLACEHOLDER = Entity.fromRaw(Number.MAX_SAFE_INTEGER);

  constructor(
    public index: EntityIndex = 0,
    public generation: number = 1,
  ) {}

  static fromRawAndGeneration(index: EntityIndex, generation: number) {
    return new Entity(index, generation);
  }

  static fromRaw(index: EntityIndex) {
    return new Entity(index);
  }

  toBits() {
    return this.generation.toString() + '/' + this.index.toString();
  }

  static fromBits(bits: string) {
    const [generation, index] = bits.split('/');
    return Entity.fromRawAndGeneration(parseInt(index), parseInt(generation));
  }

  static tryFromBits(bits: string) {
    try {
      const [index, generation] = bits.split('/');
      return Entity.fromRawAndGeneration(parseInt(index), parseInt(generation));
    } catch (_e) {
      return undefined;
    }
  }
}
