import { Trait } from 'rustable';

export class States extends Trait {
  dependDepth(): number {
    return 1;
  }
  scopedEntitiesEnabled(): boolean {
    return false;
  }
}
