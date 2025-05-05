import { named, Trait } from 'rustable';

@named('States')
export class States extends Trait {
  static dependDepth(): number {
    return 1;
  }
  static scopedEntitiesEnabled(): boolean {
    return false;
  }
}
