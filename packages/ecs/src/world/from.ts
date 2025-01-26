import { NOT_IMPLEMENTED, TraitValid } from '@sciurus/utils';
import { Default, implTrait, trait } from 'rustable';
import { type World } from './base';

@trait
export class FromWorld extends TraitValid {
  static fromWorld<T extends object>(_world: World): T {
    throw NOT_IMPLEMENTED;
  }
}

implTrait(Default, FromWorld, {
  static: {
    fromWorld() {
      return this.default();
    },
  },
});
