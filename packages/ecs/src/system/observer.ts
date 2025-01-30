import { NotImplementedError, Trait, Type } from 'rustable';
import { Trigger } from '../observer/types';
import { System } from './base';
import { IntoSystem } from './into';

/**
 * Implemented for Systems that have a Trigger as the first argument.
 */
export class ObserverSystem<
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  E extends object = any,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  B extends object = any,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Out = void,
> extends Trait {
  // This is a marker trait in TypeScript
  // The actual implementation is done through the System trait
}

export interface ObserverSystem<E extends object = any, B extends object = any, Out = void>
  extends System<Trigger<E, B>, Out> {}

/**
 * Implemented for systems that convert into ObserverSystem.
 *
 * Usage notes:
 * This trait should only be used as a bound for trait implementations or as an
 * argument to a function. If an observer system needs to be returned from a
 * function or stored somewhere, use ObserverSystem instead of this trait.
 */
export class IntoObserverSystem<
  E extends object = any,
  B extends object = any,
  Out = void,
> extends Trait {
  intoSystem(): System<Trigger<E, B>, Out> {
    throw new NotImplementedError();
  }
}

// Implementation for any System that has Trigger as input
ObserverSystem.implFor(Type(System, [Trigger]))

// Implementation for any IntoSystem that can convert to an ObserverSystem
IntoObserverSystem.implFor(Type(IntoSystem, [Trigger]), {
  intoSystem(this: IntoSystem): System {
    return IntoSystem.wrap(this).intoSystem();
  },
});
