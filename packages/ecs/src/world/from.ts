import { Default, NotImplementedError, Trait } from 'rustable';
import { type World } from './base';

export class FromWorld extends Trait {
  static fromWorld<T extends object>(_world: World): T {
    throw new NotImplementedError();
  }
}

FromWorld.implFor(Default, {
  static: {
    fromWorld<T extends object>(this: typeof Default): T {
      return this.default();
    },
  },
});
