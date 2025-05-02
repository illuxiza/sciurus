import { OptionRes, condition } from '@sciurus/ecs';
import { Constructor } from 'rustable';
import { State } from './state/resources';
import { States } from './state/states';

/**
 * Condition that checks if a state exists
 * @param type The state type to check for
 * @returns A condition that returns true if the state exists
 */
export const stateExists = <S extends States>(type: Constructor<S>) => {
  return condition(
    [OptionRes(State(type))],
    (currentState: OptionRes<State<S>>): boolean => {
      return currentState.isSome();
    },
  );
};

/**
 * Condition that checks if the current state equals the provided state
 * @param state The state value to check against
 * @returns A condition that returns true if the current state equals the provided state
 */
export const inState = <S extends States>(state: S) => {
  return condition(
    [OptionRes(State(state.constructor as Constructor<S>))],
    (currentState: OptionRes<State<S>>): boolean => {
      return currentState.match({
        Some: (current) => current.val.eq(state),
        None: () => false,
      });
    },
  );
};

/**
 * Condition that checks if the state has changed since the last system run
 * @param type The state type to check for changes
 * @returns A condition that returns true if the state has changed
 */
export const stateChanged = <S extends States>(type: Constructor<S>) => {
  return condition(
    [OptionRes(State(type))],
    (currentState: OptionRes<State<S>>): boolean => {
      return currentState.match({
        Some: (current) => current.isChanged(),
        None: () => false,
      });
    },
  );
};
