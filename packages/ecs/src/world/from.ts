import { NOT_IMPLEMENTED } from '@sciurus/utils';
import { Constructor, Default, hasTrait, implTrait, trait, useTrait } from 'rustable';
import { type World } from './base';

@trait
export class FromWorld {
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

export function fromWorld<T extends object>(world: World, target: Constructor<T>): T {
  if (hasTrait(target, FromWorld)) {
    return useTrait(target, FromWorld).fromWorld(world);
  }
  if (hasTrait(target, Default)) {
    return useTrait(target, Default).default();
  }
  return new target();
}
