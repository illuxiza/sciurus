import { Trait } from 'rustable';

export class States extends Trait {
  static dependDepth(): number {
    return 1;
  }
  static scopedEntitiesEnabled(): boolean {
    return false;
  }
}