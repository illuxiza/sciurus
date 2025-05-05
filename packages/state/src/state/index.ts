import { createFactory } from 'rustable';
import { FreelyMutableState } from './freely_mutable_state';
import './inner_state_set';
import { States as StatesTrait } from './states';
export { ComputedStates } from './computed_states';
export { NextState, State } from './resources';
export { StateSet } from './state_set';
export { states, SubStates } from './sub_states';
export {
  EnterSchedules,
  ExitSchedules,
  lastTransition,
  OnEnter,
  OnExit,
  OnTransition,
  setupStateTransitionsInWorld,
  StateTransition,
  StateTransitionEvent,
  StateTransitionSteps,
  TransitionSchedules
} from './transitions';
export { FreelyMutableState };
export const States = createFactory(StatesTrait, (target: any) => {
  StatesTrait.tryImplFor(target);
  FreelyMutableState.tryImplFor(target);
  return target;
});
export interface States extends StatesTrait {}

