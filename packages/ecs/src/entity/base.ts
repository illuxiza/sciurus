import { derive, Eq } from 'rustable';
import { type EntityIndex } from './types';

@derive([Eq])
export class Entity {
  static PH = Entity.fromRaw(Number.MAX_SAFE_INTEGER);

  constructor(
    public idx: EntityIndex = 0,
    public gen: number = 1,
  ) {}

  static fromRawAndGen(index: EntityIndex, generation: number) {
    return new Entity(index, generation);
  }

  static fromRaw(index: EntityIndex) {
    return new Entity(index);
  }

  toBits() {
    return this.gen.toString() + '/' + this.idx.toString();
  }

  static fromBits(bits: string) {
    const [gen, index] = bits.split('/');
    return Entity.fromRawAndGen(parseInt(index), parseInt(gen));
  }
}
